/*
 * Remote database client (optional).
 *
 * Everything the browser needs to keep Spell Book's data in the PostgreSQL or
 * MySQL database behind remote-db/server/. index.html loads this file only when
 * Spell Book is opened over http(s); delete the remote-db folder and Spell Book
 * works exactly as before.
 *
 * It plugs into js/datafile.js (window.DataFile.useRemote), which owns the
 * change tracking, the unsaved flag and the banners, and adds its own section
 * to Settings → Data. The server API is documented in remote-db/README.md.
 *
 * How two browsers share one database: the data is saved in parts, one per
 * browser storage key (commands, scripts, terms, Compendium notes, each group
 * of settings ...). The database numbers every part. A browser remembers the
 * number and a fingerprint of each part as of its last sync, so it can tell
 * which parts IT changed and which parts SOMEONE ELSE changed. Parts changed
 * on only one side merge on their own; only a part changed in both browsers
 * is a conflict, and then the user chooses.
 */
;(() => {
  if (!window.DataFile || typeof window.DataFile.useRemote !== 'function') return

  // 'spellbook_remote_db_v1' is '0' when the user turned the database off for
  // this browser. 'spellbook_remote_base_v1' holds, per key, [version, hash]
  // as of the last sync (hash null = the key did not exist).
  const USE_KEY = 'spellbook_remote_db_v1'
  const BASE_KEY = 'spellbook_remote_base_v1'
  const SAVE_DELAY = 800
  const POLL_EVERY = 15000

  const DB_NAMES = {
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    memory: 'in-memory test',
  }
  const LABELS = {
    spellbook_commands_v1: 'Commands',
    spellbook_scripts_v1: 'Scripts',
    spellbook_terms_v1: 'Terms',
    spellbook_notes_v1: 'Compendium notes',
  }
  const labelOf = (key) => LABELS[key] || 'Settings'
  const labelsOf = (keys) => [...new Set(keys.map(labelOf))].join(', ')

  // A short fingerprint of a string (cyrb53), enough to notice a change.
  function hash(text) {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      h1 = Math.imul(h1 ^ code, 2654435761)
      h2 = Math.imul(h2 ^ code, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
  }
  const fingerprint = (value) => (typeof value === 'string' ? hash(value) : null)

  window.DataFile.useRemote((host) => {
    const server = { available: false, active: false, db: '' }
    let conflicts = [] // keys changed in both browsers, waiting for a choice
    let announced = '' // the "changed elsewhere" notice already shown
    let pollTimer = null

    const enabled = () => {
      try {
        return localStorage.getItem(USE_KEY) !== '0'
      } catch {
        return true
      }
    }

    // ── what this browser last synced
    function loadBase() {
      try {
        const base = JSON.parse(localStorage.getItem(BASE_KEY) || '{}')
        return base && typeof base === 'object' ? base : {}
      } catch {
        return {}
      }
    }
    const saveBase = (base) => host.setLocal(BASE_KEY, JSON.stringify(base))
    const baseVersions = (base) =>
      Object.fromEntries(Object.entries(base).map(([key, entry]) => [key, entry[0]]))

    // Keys this browser changed since its last sync, and keys it removed.
    function localChanges(storage, base) {
      const changes = {}
      const removed = []
      for (const [key, value] of Object.entries(storage)) {
        const entry = base[key]
        if (!entry || entry[1] !== fingerprint(value)) changes[key] = value
      }
      for (const [key, entry] of Object.entries(base)) {
        if (entry[1] !== null && !(key in storage)) removed.push(key)
      }
      return { changes, removed }
    }

    // ── talking to the server
    async function request(url, options = {}, timeout = 8000) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        return await fetch(url, {
          cache: 'no-store',
          ...options,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    }

    async function status(timeout) {
      if (!/^https?:$/.test(location.protocol)) return null
      try {
        const response = await request('/api/status', {}, timeout)
        if (!response.ok) return null
        const body = await response.json()
        return body && body.app === 'spellbook-server' ? body : null
      } catch {
        return null
      }
    }

    async function getSnapshot() {
      const response = await request('/api/snapshot')
      if (!response.ok) throw new Error('The database server did not answer.')
      return response.json()
    }

    async function put(body) {
      const text = JSON.stringify(body)
      const response = await request('/api/snapshot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Lets a save started while the page closes still finish (the browser
        // only allows this for small requests).
        keepalive: text.length < 60000,
        body: text,
      })
      if (!response.ok) {
        let message = 'The database server could not save.'
        try {
          message = (await response.json()).error || message
        } catch {}
        throw new Error(message)
      }
      return response.json()
    }

    // Records that these keys now match the database.
    function markSynced(keys, revs, storage) {
      const base = loadBase()
      keys.forEach((key) => {
        base[key] = [revs[key] || 0, fingerprint(storage[key])]
      })
      saveBase(base)
    }

    const errorText = (err) => err.message || String(err)

    // ── whole-data operations (Settings buttons)
    async function push() {
      const storage = host.snapshot().storage
      const result = await put({ snapshot: { storage } })
      const base = {}
      for (const key of Object.keys(result.revs)) {
        base[key] = [result.revs[key], fingerprint(storage[key])]
      }
      saveBase(base)
      conflicts = []
      host.markSaved()
    }

    async function pull() {
      const data = await getSnapshot()
      host.applyToStorage(data)
      const base = {}
      for (const key of Object.keys(data.revs)) {
        base[key] = [data.revs[key], fingerprint(data.storage[key])]
      }
      saveBase(base)
      conflicts = []
      host.markSaved()
      return data
    }

    // ── resolving a part that was changed in both browsers
    async function useMine(keys) {
      const current = await status()
      const storage = host.snapshot().storage
      const changes = {}
      const removed = []
      keys.forEach((key) => {
        if (key in storage) changes[key] = storage[key]
        else removed.push(key)
      })
      const result = await put({ changes, removed, base: current.revs })
      markSynced(keys, result.revs, storage)
      conflicts = conflicts.filter((key) => !keys.includes(key))
      if (!conflicts.length) host.markSaved()
    }

    async function useTheirs(keys) {
      const data = await getSnapshot()
      const base = loadBase()
      keys.forEach((key) => {
        host.setData(key, key in data.storage ? data.storage[key] : null)
        base[key] = [data.revs[key] || 0, fingerprint(data.storage[key])]
      })
      saveBase(base)
      conflicts = conflicts.filter((key) => !keys.includes(key))
      host.markSaved()
      location.reload()
    }

    function showConflict(keys) {
      host.showBanner(
        `${labelsOf(keys)} ${keys.length > 1 ? 'were' : 'was'} also changed in another browser, so your changes to ${keys.length > 1 ? 'them were' : 'it was'} not saved.`,
        [
          {
            label: 'Keep mine (overwrite theirs)',
            primary: true,
            run: async (banner) => {
              await useMine(keys)
              host.closeBanner(banner)
              host.notify()
            },
          },
          { label: 'Use theirs (reload)', run: () => useTheirs(keys) },
          { label: 'Not now', run: host.closeBanner },
        ],
      )
    }

    // ── start up (before the app reads its data)
    async function connect() {
      const found = await status(1500)
      if (!found) return null
      server.available = true
      server.db = found.db
      if (!enabled()) return { status: 'remote-off', db: found.db }
      server.active = true
      const done = (name, extra = {}) => ({
        status: name,
        db: found.db,
        authoritative: name !== 'remote-empty',
        ...extra,
      })
      try {
        const local = host.snapshot().storage
        if (found.empty) {
          // First time: the database starts with what this browser has.
          if (!Object.keys(local).length) return done('remote-empty')
          await push()
          return done('remote-seeded')
        }
        const remote = await getSnapshot()
        const base = loadBase()
        const behind = [] // changed elsewhere only: take the database's value
        let ahead = 0 // changed here only: saved after startup
        const clash = []
        const keys = new Set([
          ...Object.keys(local),
          ...Object.keys(remote.storage),
          ...Object.keys(remote.revs),
        ])
        keys.forEach((key) => {
          const mine = local[key]
          const theirs = remote.storage[key]
          const version = remote.revs[key] || 0
          if (mine === theirs) {
            base[key] = [version, fingerprint(theirs)]
            return
          }
          const entry = base[key]
          const localChanged = entry ? entry[1] !== fingerprint(mine) : mine !== undefined
          const remoteChanged = entry ? entry[0] !== version : version > 0
          if (remoteChanged && localChanged) clash.push(key)
          else if (localChanged) ahead += 1
          else behind.push(key) // remote changed, or nothing recorded at all
        })
        behind.forEach((key) => {
          host.setData(key, key in remote.storage ? remote.storage[key] : null)
          base[key] = [remote.revs[key] || 0, fingerprint(remote.storage[key])]
        })
        saveBase(base)
        conflicts = clash
        if (clash.length) return done('remote-conflict', { keys: clash })
        if (ahead) return done('remote-ahead')
        return done(behind.length ? 'remote-loaded' : 'remote-same')
      } catch (err) {
        host.setError(errorText(err))
        return done('remote-error', { error: errorText(err) })
      }
    }

    // ── saving while the app runs
    async function save() {
      try {
        const storage = host.snapshot().storage
        const base = loadBase()
        const { changes, removed } = localChanges(storage, base)
        if (!Object.keys(changes).length && !removed.length) {
          if (!conflicts.length) host.markSaved()
          return !conflicts.length
        }
        const result = await put({ changes, removed, base: baseVersions(base) })
        const clash = result.conflicts || []
        const synced = [...Object.keys(changes), ...removed].filter((key) => !clash.includes(key))
        markSynced(synced, result.revs, storage)
        conflicts = [...new Set([...conflicts.filter((key) => clash.includes(key)), ...clash])]
        if (clash.length) {
          host.setError(`${labelsOf(clash)} changed in another browser; waiting for your choice.`)
          showConflict(clash)
          return false
        }
        if (!conflicts.length) host.markSaved()
        return true
      } catch (err) {
        host.setError(errorText(err))
        return false
      }
    }

    // ── noticing changes made in another browser while this page is open
    async function poll() {
      if (!server.active || document.visibilityState !== 'visible') return
      const found = await status(3000)
      if (!found || !found.revs) return
      const base = loadBase()
      const storage = host.snapshot().storage
      const { changes, removed } = localChanges(storage, base)
      const mine = new Set([...Object.keys(changes), ...removed])
      const elsewhere = Object.keys(found.revs).filter(
        (key) => found.revs[key] !== ((base[key] && base[key][0]) || 0) && !mine.has(key),
      )
      const signature = elsewhere.map((key) => `${key}:${found.revs[key]}`).sort().join('|')
      if (!elsewhere.length || signature === announced) return
      announced = signature
      host.showBanner(
        `${labelsOf(elsewhere)} changed in another browser. Reload to see the changes.`,
        [
          { label: 'Reload', primary: true, run: () => useTheirs(elsewhere) },
          { label: 'Not now', run: host.closeBanner },
        ],
      )
    }

    function startPolling() {
      clearInterval(pollTimer)
      pollTimer = setInterval(() => poll().catch(() => {}), POLL_EVERY)
    }

    const adapter = {
      localKeys: [USE_KEY, BASE_KEY],
      delay: SAVE_DELAY,
      active: () => server.active,

      // Runs before the app starts; the Settings section refreshes afterwards.
      async autoload() {
        try {
          return await connect()
        } finally {
          host.notify()
        }
      },

      save,

      state: () => ({
        available: server.available,
        active: server.active,
        enabled: enabled(),
        db: server.db,
        waiting: labelsOf(conflicts),
      }),

      // Returns true when it dealt with the startup result.
      handleStartup(result) {
        if (server.active) startPolling()
        if (result.status === 'remote-conflict') {
          showConflict(result.keys)
          return true
        }
        if (result.status === 'remote-error') {
          host.showBanner(`Could not use the database: ${result.error}`, [
            { label: 'Dismiss', run: host.closeBanner },
          ])
          return true
        }
        // Changes made here before this start, or the starting data of a new
        // database (loaded from the data folder after this check), are saved now.
        if (result.status === 'remote-ahead' || result.status === 'remote-empty') {
          host.schedule()
        }
        return false
      },

      push,
      pull,
      setEnabled(on) {
        host.setLocal(USE_KEY, on ? null : '0')
        server.active = on && server.available
        if (!server.active) clearInterval(pollTimer)
        host.notify()
      },
    }

    addSettingsSection(adapter, host)
    return adapter
  })

  // ── Settings → Data section ────────────────────────────────────────────
  function addSettingsSection(adapter, host) {
    const build = () => {
      const panel = document.querySelector('.settings-panel[data-panel="data"]')
      if (!panel || document.getElementById('remote-db-section')) return
      const el = (tag, props = {}, ...children) => {
        const node = Object.assign(document.createElement(tag), props)
        node.append(...children)
        return node
      }
      const section = el('div', {
        className: 'settings-data-section',
        id: 'remote-db-section',
      })
      const status = el('p', {
        className: 'datafile-status',
        id: 'remote-db-status',
      })
      const toggle = el('input', { type: 'checkbox', id: 'remote-db-enabled' })
      const push = el(
        'button',
        {
          type: 'button',
          className: 'btn secondary',
          id: 'btn-remote-db-push',
        },
        'Overwrite Database With This Browser',
      )
      const pull = el(
        'button',
        {
          type: 'button',
          className: 'btn secondary',
          id: 'btn-remote-db-pull',
        },
        'Replace This Browser With Database',
      )
      section.append(
        el('h3', {}, 'Database Server'),
        el(
          'p',
          { className: 'form-hint' },
          'Keep all your data in a PostgreSQL or MySQL database instead of this browser. Start the Spell Book server (see remote-db/README.md), then open Spell Book from its address, such as http://localhost:8787. While the server is running it is used automatically; without it Spell Book works from the browser and data files as before. Several browsers can share the database: parts they change separately (for example Commands in one and the Compendium in the other) merge on their own.',
        ),
        status,
        el(
          'label',
          { className: 'datafile-autosave-row' },
          toggle,
          ' Use the database when the server is running',
        ),
        el('div', { className: 'settings-data-actions' }, push, pull),
      )
      const before = document.getElementById('datafile-section')
      if (before) before.before(section)
      else panel.prepend(section)

      const render = () => {
        const state = adapter.state()
        const name = DB_NAMES[state.db] || state.db
        let text
        if (!state.available) {
          text = /^https?:$/.test(location.protocol)
            ? 'No Spell Book server found at this address.'
            : 'Not connected. Open Spell Book from the Spell Book server (for example http://localhost:8787) to use a database.'
        } else if (!state.enabled) {
          text = `A ${name} server is running, but it is turned off for this browser.`
        } else {
          text = `Connected to the ${name} database.`
          const info = host.info()
          if (info.lastSaved) {
            text += ` Last saved ${info.lastSaved.toLocaleTimeString()}.`
          }
          if (state.waiting) text += ` Waiting for your choice about: ${state.waiting}.`
          else if (info.lastError) text += ` ${info.lastError}`
        }
        status.textContent = text
        toggle.disabled = !state.available
        toggle.checked = state.enabled
        push.disabled = pull.disabled = !state.active
      }

      toggle.addEventListener('change', () => {
        adapter.setEnabled(toggle.checked)
        // Turning it on loads the database's data on the next start
        if (toggle.checked) location.reload()
        render()
      })
      push.addEventListener('click', async () => {
        if (!confirm('Replace everything in the database with the data in this browser?')) return
        try {
          await adapter.push()
        } catch (err) {
          alert('Could not save to the database: ' + (err.message || err))
        }
        render()
      })
      pull.addEventListener('click', async () => {
        if (!confirm("Replace the data in this browser with the database's data?")) return
        try {
          await adapter.pull()
          location.reload()
        } catch (err) {
          alert('Could not load from the database: ' + (err.message || err))
        }
      })
      window.DataFile.onChange(render)
      render()
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build)
    } else {
      build()
    }
  }
})()
