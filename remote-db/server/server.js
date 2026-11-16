// Spell Book database server.
//
// Serves the Spell Book web app and keeps its data in a PostgreSQL or MySQL
// database instead of the browser.
//
//   DATABASE_URL=postgres://user:pass@localhost:5432/spellbook node server.js
//   DATABASE_URL=mysql://user:pass@localhost:3306/spellbook node server.js
//   DATABASE_URL=memory: node server.js        (nothing is kept; for trying it)
//
// Optional: PORT (default 8787) and HOST (default 127.0.0.1, this computer
// only). Open http://localhost:8787 once it is running.
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createDatabase } = require('./db')

// remote-db/server/ sits two levels below the Spell Book folder
const APP_ROOT = path.join(__dirname, '..', '..')
const FORMAT = 'spellbook-data'
// Bookkeeping rows in the settings table (never part of the browser's data)
const SAVED_AT_KEY = '__saved_at'
const REVS_KEY = '__revs'
const INTERNAL_KEYS = new Set([SAVED_AT_KEY, REVS_KEY])
// Only Spell Book's own storage keys are accepted
const isDataKey = (key) =>
  typeof key === 'string' && /^(spellbook_|cmdref_)/.test(key)
const MAX_BODY = 64 * 1024 * 1024

// Only the app itself is served, never the server folder or the repository.
const STATIC_FILES = new Set([
  'index.html',
  'styles.css',
  'favicon.png',
  'remote-db/client.js',
])
const STATIC_DIRS = new Set(['js', 'css', 'data', 'icons'])
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// ── turning the browser's saved data into rows and back ──────────────────
// A saved list of objects that have ids (commands, scripts, terms ...) becomes
// one row per object. Everything else is one setting per key.
function splitStorage(storage) {
  const items = []
  const settings = {}
  for (const [key, value] of Object.entries(storage || {})) {
    if (typeof value !== 'string' || INTERNAL_KEYS.has(key)) continue
    let list = null
    try {
      const parsed = JSON.parse(value)
      const ids = Array.isArray(parsed)
        ? parsed.map((o) => (o && typeof o === 'object' ? o.id : undefined))
        : []
      if (
        Array.isArray(parsed) &&
        parsed.length &&
        ids.every((id) => typeof id === 'string' || typeof id === 'number') &&
        new Set(ids.map(String)).size === ids.length
      ) {
        list = parsed
      }
    } catch {}
    if (list) {
      list.forEach((data, position) =>
        items.push({ store: key, id: String(data.id), position, data }),
      )
    } else {
      settings[key] = value
    }
  }
  return { items, settings }
}

function joinStorage({ items, settings }) {
  const storage = {}
  const lists = new Map()
  items
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((row) => {
      if (!lists.has(row.store)) lists.set(row.store, [])
      lists.get(row.store).push(row.data)
    })
  lists.forEach((list, key) => (storage[key] = JSON.stringify(list)))
  for (const [key, value] of Object.entries(settings)) {
    if (!INTERNAL_KEYS.has(key)) storage[key] = value
  }
  return storage
}

// ── the HTTP side ────────────────────────────────────────────────────────
function createServer(db) {
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('Too much data.'), { status: 413 }))
          req.destroy()
        } else {
          chunks.push(chunk)
        }
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

  const sendJson = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  // What is stored: the browser's data as `storage`, and `revs`, a version
  // number for each key. A key's version goes up every time it is saved or
  // removed (a removed key keeps its number, so a stale copy can be noticed).
  async function stored() {
    const data = await db.load()
    let revs = {}
    try {
      revs = JSON.parse(data.settings[REVS_KEY] || '{}')
    } catch {}
    const storage = joinStorage(data)
    return {
      storage,
      revs,
      savedAt: data.settings[SAVED_AT_KEY] || '',
      empty: !Object.keys(storage).length,
    }
  }

  async function write(storage, revs) {
    const parts = splitStorage(storage)
    const savedAt = new Date().toISOString()
    await db.replace({
      items: parts.items,
      settings: {
        ...parts.settings,
        [REVS_KEY]: JSON.stringify(revs),
        [SAVED_AT_KEY]: savedAt,
      },
    })
    return savedAt
  }

  // Saves run one at a time so two requests cannot interleave their reads and
  // writes.
  let queue = Promise.resolve()
  const serial = (task) => {
    const run = queue.then(task, task)
    queue = run.catch(() => {})
    return run
  }

  // Applies a browser's changes. `changes` are keys it set, `removed` keys it
  // deleted, and `base` is the version of each key it last saw. A key is only
  // changed when its version still matches; the others are returned as
  // conflicts and left alone. With `snapshot` (an overwrite) everything is
  // replaced and no conflicts are possible.
  async function applyChanges(body) {
    const current = await stored()
    const storage = { ...current.storage }
    const revs = { ...current.revs }
    const applied = []
    const conflicts = []
    if (body.snapshot) {
      const next = body.snapshot.storage
      for (const key of new Set([...Object.keys(storage), ...Object.keys(next)])) {
        if (!isDataKey(key)) continue
        if (typeof next[key] === 'string') {
          if (storage[key] !== next[key]) {
            storage[key] = next[key]
            revs[key] = (revs[key] || 0) + 1
            applied.push(key)
          }
        } else if (key in storage) {
          delete storage[key]
          revs[key] = (revs[key] || 0) + 1
          applied.push(key)
        }
      }
    } else {
      const base = body.base && typeof body.base === 'object' ? body.base : {}
      const touch = (key, value) => {
        if (!isDataKey(key)) return
        if ((revs[key] || 0) !== (base[key] || 0)) {
          // Someone else changed it. Saving the identical value is not a clash.
          if (value === undefined ? !(key in storage) : storage[key] === value) {
            return
          }
          conflicts.push(key)
          return
        }
        if (value === undefined) delete storage[key]
        else storage[key] = value
        revs[key] = (revs[key] || 0) + 1
        applied.push(key)
      }
      for (const [key, value] of Object.entries(body.changes || {})) {
        if (typeof value === 'string') touch(key, value)
      }
      for (const key of body.removed || []) {
        if (key in storage) touch(key, undefined)
      }
    }
    let savedAt = current.savedAt
    if (applied.length) savedAt = await write(storage, revs)
    return { ok: true, savedAt, revs, applied, conflicts }
  }

  // Another web page must not be able to read or change the data just because
  // this server is on localhost: a request from a different origin is refused.
  const sameOrigin = (req) => {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      return new URL(origin).host === req.headers.host
    } catch {
      return false
    }
  }

  async function api(req, res, pathname) {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Wrong origin.' })
    if (pathname === '/api/status' && req.method === 'GET') {
      const data = await stored()
      return sendJson(res, 200, {
        app: 'spellbook-server',
        ok: true,
        db: db.type,
        empty: data.empty,
        savedAt: data.savedAt,
        revs: data.revs,
      })
    }
    if (pathname === '/api/snapshot' && req.method === 'GET') {
      const data = await stored()
      return sendJson(res, 200, {
        app: FORMAT,
        version: 1,
        savedAt: data.savedAt,
        revs: data.revs,
        storage: data.storage,
      })
    }
    if (pathname === '/api/snapshot' && req.method === 'PUT') {
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch (err) {
        if (err.status) throw err
        return sendJson(res, 400, { error: 'The body is not valid JSON.' })
      }
      const valid =
        body &&
        typeof body === 'object' &&
        ((body.snapshot && body.snapshot.storage && typeof body.snapshot.storage === 'object') ||
          (body.changes && typeof body.changes === 'object') ||
          Array.isArray(body.removed))
      if (!valid) return sendJson(res, 400, { error: 'No data to save.' })
      return sendJson(res, 200, await serial(() => applyChanges(body)))
    }
    return sendJson(res, 404, { error: 'Not found.' })
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      return res.end()
    }
    let relative
    try {
      relative =
        decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
    } catch {
      res.writeHead(400)
      return res.end()
    }
    const parts = relative.split('/')
    const allowed =
      STATIC_FILES.has(relative) ||
      (parts.length > 1 && STATIC_DIRS.has(parts[0]) && !parts.includes('..'))
    const file = path.join(APP_ROOT, ...parts)
    if (!allowed || !file.startsWith(APP_ROOT + path.sep)) {
      res.writeHead(404)
      return res.end('Not found')
    }
    fs.readFile(file, (err, content) => {
      if (err) {
        res.writeHead(404)
        return res.end('Not found')
      }
      res.writeHead(200, {
        'Content-Type':
          TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })
      res.end(req.method === 'HEAD' ? undefined : content)
    })
  }

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    try {
      if (pathname.startsWith('/api/')) await api(req, res, pathname)
      else serveStatic(req, res, pathname)
    } catch (err) {
      console.error(err)
      if (!res.headersSent) {
        sendJson(res, err.status || 500, {
          error: err.status ? err.message : 'The database could not be used.',
        })
      } else {
        res.end()
      }
    }
  })
}

async function main() {
  const db = createDatabase(process.env.DATABASE_URL)
  await db.init()
  const port = Number(process.env.PORT) || 8787
  const host = process.env.HOST || '127.0.0.1'
  const server = createServer(db)
  server.listen(port, host, () => {
    console.log(
      `Spell Book is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
    )
    console.log(`Database: ${db.type}`)
  })
  const stop = () =>
    server.close(() => db.close().finally(() => process.exit(0)))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Could not start: ${err.message}`)
    process.exit(1)
  })
}

module.exports = { createServer, splitStorage, joinStorage }
