// Password sign-in for the Spell Book server (optional, but needed before
// the server can be reached from the internet).
//
// Turned on by SPELLBOOK_PASSWORD. Then every page, file and API request
// needs a session cookie, which the sign-in page (/login) hands out for the
// right password. The cookie is signed with a key made from the password, so
// sessions survive a server restart, and changing the password signs every
// browser out. Nothing about the password is written anywhere.
//
// Guessing is slowed three ways: each check runs scrypt (deliberately slow),
// a wrong password waits a second before the answer, and too many wrong
// passwords lock sign-in for a while, per address and for everyone (sessions
// already signed in keep working).
const crypto = require('crypto')

const COOKIE = 'spellbook_session'
const SESSION_DAYS = 30
const SALT = 'spellbook-login-v1'
// Wrong passwords: per address, and in total, within WINDOW.
const WINDOW = 15 * 60 * 1000
const PER_CLIENT = 10
const IN_TOTAL = 50
const FAIL_DELAY = 1000

const scrypt = (text) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(String(text), SALT, 32, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )

function createAuth({ password, secureCookies = false, trustProxy = false } = {}) {
  if (!password) return null
  const expected = crypto.scryptSync(String(password), SALT, 32, { N: 16384, r: 8, p: 1 })
  // The key that signs sessions: from the password, so a new password ends
  // every old session.
  const signKey = crypto.createHmac('sha256', expected).update('session').digest()
  const sign = (text) => crypto.createHmac('sha256', signKey).update(text).digest('base64url')

  // ── sessions: "<expiry ms>.<random>.<signature>"
  function issue() {
    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    const body = `${expires}.${crypto.randomBytes(16).toString('base64url')}`
    return { value: `${body}.${sign(body)}`, expires }
  }
  function valid(value) {
    if (typeof value !== 'string') return false
    const parts = value.split('.')
    if (parts.length !== 3) return false
    const body = `${parts[0]}.${parts[1]}`
    const given = Buffer.from(parts[2])
    const wanted = Buffer.from(sign(body))
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return false
    return Number(parts[0]) > Date.now()
  }
  function cookieOf(req) {
    const header = req.headers.cookie || ''
    for (const piece of header.split(';')) {
      const at = piece.indexOf('=')
      if (at > 0 && piece.slice(0, at).trim() === COOKIE) return piece.slice(at + 1).trim()
    }
    return null
  }
  const signedIn = (req) => valid(cookieOf(req))

  // Secure (HTTPS only) when told to, or when the proxy says the browser used
  // HTTPS. Without it a browser could also send the cookie to plain http on
  // the same host name, where it can be read on the way.
  const secure = (req) =>
    secureCookies || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
  function setCookie(req, res) {
    const { value, expires } = issue()
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${value}; Path=/; Expires=${new Date(expires).toUTCString()}; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}`,
    )
  }
  function clearCookie(req, res) {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}`,
    )
  }

  // ── wrong-password limits
  // Behind a proxy (TRUST_PROXY=1) every request comes from the proxy, so
  // the address is the last one it added to X-Forwarded-For.
  function clientOf(req) {
    if (trustProxy) {
      const list = String(req.headers['x-forwarded-for'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (list.length) return list[list.length - 1]
    }
    return req.socket.remoteAddress || 'unknown'
  }
  const failures = new Map() // client -> [times]
  let allFailures = []
  const recent = (times) => times.filter((t) => t > Date.now() - WINDOW)
  function locked(client) {
    allFailures = recent(allFailures)
    const mine = recent(failures.get(client) || [])
    if (mine.length) failures.set(client, mine)
    else failures.delete(client)
    return mine.length >= PER_CLIENT || allFailures.length >= IN_TOTAL
  }
  function fail(client) {
    const now = Date.now()
    failures.set(client, [...(failures.get(client) || []), now])
    allFailures.push(now)
  }

  async function check(text) {
    const key = await scrypt(text)
    return crypto.timingSafeEqual(key, expected)
  }

  // Returns 'ok', 'wrong' or 'locked'.
  async function attempt(req, text) {
    const client = clientOf(req)
    if (locked(client)) {
      console.warn(`Sign-in locked for ${client} (too many wrong passwords).`)
      return 'locked'
    }
    if (typeof text === 'string' && text && (await check(text))) {
      failures.delete(client)
      return 'ok'
    }
    fail(client)
    console.warn(`Wrong password from ${client}.`)
    await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY))
    return 'wrong'
  }

  return { signedIn, setCookie, clearCookie, attempt }
}

// ── the sign-in page
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function loginPage({ next = '/', message = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in – Spell Book</title>
<link rel="icon" href="/icons/bookSB256BW.png">
<style>
  :root { color-scheme: dark; --bg: #0f1419; --card: #1a2029; --border: #2d3748; --text: #e2e8f0; --muted: #94a3b8; --accent: #6366f1; --accent-hover: #4f46e5; --warn: #f59e0b; }
  @media (prefers-color-scheme: light) {
    :root { color-scheme: light; --bg: #f1f5f9; --card: #ffffff; --border: #cbd5e1; --text: #0f172a; --muted: #475569; --warn: #b45309; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  form { width: 100%; max-width: 340px; padding: 1.75rem; background: var(--card);
    border: 1px solid var(--border); border-radius: 10px; }
  .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; }
  .brand img { width: 32px; height: 32px; }
  h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
  label { display: block; margin-bottom: 0.35rem; color: var(--muted); font-size: 0.85rem; }
  input[type=password] { width: 100%; padding: 0.6rem 0.7rem; font: inherit; color: var(--text);
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
  input[type=password]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button { width: 100%; margin-top: 1rem; padding: 0.6rem; font: inherit; font-weight: 600; color: #fff;
    background: var(--accent); border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: var(--accent-hover); }
  .message { margin: 0.75rem 0 0; color: var(--warn); font-size: 0.875rem; }
  .user { position: absolute; left: -9999px; }
</style>
</head>
<body>
<form method="post" action="/login">
  <div class="brand"><img src="/icons/bookSB256BW.png" alt=""><h1>Spell Book</h1></div>
  <input class="user" type="text" name="username" value="spellbook" autocomplete="username" tabindex="-1" aria-hidden="true">
  <label for="password">Password</label>
  <input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  ${message ? `<p class="message" role="alert">${escapeHtml(message)}</p>` : ''}
  <button type="submit">Sign in</button>
</form>
<script>
  // The tab Spell Book was on (#/compendium …) isn't sent to the server: keep it.
  if (location.hash) {
    const next = document.querySelector('input[name=next]')
    if (next.value === '/' ) next.value = '/' + location.hash
  }
</script>
</body>
</html>`
}

// Where to go after signing in: only a path on this server.
function safeNext(value) {
  const text = typeof value === 'string' ? value : ''
  return /^\/(?![/\\])/.test(text) && !/[\r\n]/.test(text) ? text : '/'
}

module.exports = { createAuth, loginPage, safeNext }
