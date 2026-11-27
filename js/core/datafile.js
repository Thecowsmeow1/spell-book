/*
 * Linked data-file adapter.
 *
 * This module is deliberately independent from the app's record model. It
 * serializes selected localStorage keys, so adding a new persisted feature
 * requires checking isDataKey(), reset behavior in app/settings, and the
 * snapshot import/export format together. settings.js and the modules call window.DataFile.
 */
// ─── Linked data file ─────────────────────────────────────────────────
// Lets Spell Book keep everything (commands, scripts, terms, theme and every
// other setting) in one JSON file you choose. Uses the File System Access API
// (Chrome / Edge). On open the file is loaded automatically; with autosave on,
// changes are written back shortly after they happen and again when you leave.
//
// The file holds a copy of this browser's saved data ("spellbook_*" and
// "cmdref_*" keys), so it also works as a full backup / restore.
//
// Most values are kept in localStorage. Large ones (the Compendium's notes,
// which can hold images) are kept in IndexedDB instead, which has room for
// hundreds of megabytes where localStorage has a few. They are still saved
// under their usual keys in the data file, backups and the database server, so
// files work the same either way. Read and write them with
// DataFile.getItem / setItem / removeItem; ready() loads them (and moves any
// still in localStorage) before the app starts.
window.DataFile = (() => {
  const DB_NAME = 'spellbook_handles'
  const STORE_NAME = 'handles'
  const HANDLE_KEY = 'dataFile'
  const AUTOSAVE_KEY = 'spellbook_autosave_v1'
  // 'spellbook_linked_v1' is '1' while a file is linked; 'spellbook_unsaved_v1'
  // is '1' while this browser holds changes the file does not have yet.
  const LINKED_KEY = 'spellbook_linked_v1'
  const UNSAVED_KEY = 'spellbook_unsaved_v1'
  // Legacy script-file flags are retained for backward-compatible restores.
  // 'spellbook_filemode_v1' is '1' once such a file is in use, and
  // 'spellbook_filestamp_v1' is the savedAt of the file last loaded / saved.
  const FILEMODE_KEY = 'spellbook_filemode_v1'
  const STAMP_KEY = 'spellbook_filestamp_v1'
  const FORMAT = 'spellbook-data'
  const PREFIXES = ['spellbook_', 'cmdref_']
  // Per-browser switches that stay out of the file. Autosave is not one of
  // them: it is a setting like any other, saved in the file as '1' or '0'.
  const LOCAL_ONLY = new Set([
    LINKED_KEY,
    UNSAVED_KEY,
    FILEMODE_KEY,
    STAMP_KEY,
  ])
  const PICKER_TYPES = [
    {
      description: 'Spell Book data',
      accept: { 'application/json': ['.json'] },
    },
  ]
  const SAVE_DELAY = 1500
  const nativeSet = Storage.prototype.setItem
  const nativeRemove = Storage.prototype.removeItem

  let lastSaved = null
  let lastError = ''
  let dirty = false
  let timer = null
  let applying = false // true while the file is being copied into storage
  let tracking = false // changes only count once the app has started
  let saving = Promise.resolve()
  let writing = 0 // file writes under way, shown as "Saving…" in the top bar
  // Optional database adapter (remote-db/client.js); see useRemote() below
  let remote = null
  const remoteActive = () => Boolean(remote && remote.active())
  const listeners = new Set()
  const dataListeners = new Set()
  // Told when this browser's data matches a saved copy: a save to the linked
  // file or the database, a downloaded backup, or a file loaded in
  // (js/core/unsaved.js counts changes since then).
  const savedListeners = new Set()
  const emitSaved = (how) =>
    savedListeners.forEach((listener) => {
      try {
        listener(how)
      } catch {}
    })
  // Edits other parts of the app still hold in memory (the open note's last
  // keystrokes, a record being typed): handed over to storage before any save
  // or export, so the file never misses them. See beforeSave() below.
  const collectors = new Set()
  // Counts data changes, so a save only marks things saved when nothing
  // changed while the file was being written.
  let changes = 0
  function collect() {
    collectors.forEach((collector) => {
      try {
        collector()
      } catch (err) {
        console.warn('Spell Book: could not hand over unsaved edits:', err)
      }
    })
  }

  // ── Large values (IndexedDB)
  // Kept in memory once loaded, so reading is instant; each write is copied
  // to IndexedDB in the background, in order.
  // The Compendium's trash holds whole notes, images and all, so it goes there
  // too, and so do the Bash tab's imported manuals.
  const isBig = (key) =>
    typeof key === 'string' &&
    (key.startsWith('spellbook_notes_v1') || key === 'spellbook_trash_notes_v1' || key === 'spellbook_bash_v1')
  const BIG_DB = 'spellbook_data'
  const BIG_STORE = 'values'
  const big = new Map()
  let bigDb = null // null: IndexedDB is not available, so localStorage is used
  let bigWrites = Promise.resolve(true)
  let bigError = ''
  const bigListeners = new Set()

  function openBig() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BIG_DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(BIG_STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('The browser database is busy in another tab.'))
    })
  }

  function bigTx(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = bigDb.transaction(BIG_STORE, mode)
      const request = action(tx.objectStore(BIG_STORE))
      tx.oncomplete = () => resolve(request && request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('The browser database refused the change.'))
    })
  }

  // Loads the large values into memory, moving any still in localStorage.
  let readyPromise = null
  function ready() {
    if (readyPromise) return readyPromise
    readyPromise = (async () => {
      try {
        bigDb = await openBig()
        const keys = await bigTx('readonly', (store) => store.getAllKeys())
        for (const key of keys) {
          if (!isBig(key)) continue
          const value = await bigTx('readonly', (store) => store.get(key))
          if (typeof value === 'string') big.set(key, value)
        }
        const legacy = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (isBig(key)) legacy.push(key)
        }
        for (const key of legacy) {
          const value = localStorage.getItem(key)
          if (!big.has(key) && value !== null) {
            await bigTx('readwrite', (store) => store.put(value, key))
            big.set(key, value)
          }
          nativeRemove.call(localStorage, key)
        }
        // Ask the browser not to clear this data when space runs low.
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {})
      } catch (err) {
        console.warn('Spell Book: using localStorage for notes:', err)
        bigDb = null
        big.clear()
      }
    })()
    return readyPromise
  }

  // Reloads the page once every large-value write has finished, so a restore
  // that replaced the notes is not cut off.
  async function reloadPage() {
    try {
      await bigWrites
    } catch {}
    location.reload()
  }

  // Writes one large value (null removes it). Resolves true once stored.
  let pendingBig = 0
  function writeBig(key, value) {
    if (value === null) big.delete(key)
    else big.set(key, value)
    if (!bigDb) {
      try {
        if (value === null) nativeRemove.call(localStorage, key)
        else nativeSet.call(localStorage, key, value)
        return Promise.resolve(true)
      } catch (err) {
        return Promise.resolve(failBig(err))
      }
    }
    pendingBig++
    const settle = (ok) => {
      pendingBig--
      return ok
    }
    bigWrites = bigWrites.then(() =>
      bigTx('readwrite', (store) => (value === null ? store.delete(key) : store.put(value, key))).then(
        () => {
          if (bigError) {
            bigError = ''
            bigListeners.forEach((listener) => listener(''))
          }
          return true
        },
        failBig,
      ).then(settle),
    )
    return bigWrites
  }
  function failBig(err) {
    bigError = (err && err.message) || String(err)
    bigListeners.forEach((listener) => {
      try {
        listener(bigError)
      } catch {}
    })
    return false
  }

  const getItem = (key) => {
    if (isBig(key) && (bigDb || big.has(key))) return big.has(key) ? big.get(key) : null
    return localStorage.getItem(key)
  }
  // Returns a promise that resolves true once the value is stored.
  function setItem(key, value) {
    if (!isBig(key)) {
      try {
        localStorage.setItem(key, value)
        return Promise.resolve(true)
      } catch (err) {
        return Promise.resolve(false)
      }
    }
    const done = writeBig(key, String(value))
    markChanged(key)
    return done
  }
  function removeItem(key) {
    if (!isBig(key)) {
      localStorage.removeItem(key)
      return Promise.resolve(true)
    }
    const done = writeBig(key, null)
    markChanged(key)
    return done
  }

  // ── handle storage (IndexedDB); replaceable for tests
  // The browser stores only the permission handle here. Actual application
  // values remain in localStorage and are copied by snapshot()/applyToStorage().
  const idbStore = {
    open() {
      // IndexedDB persists the FileSystemFileHandle because localStorage
      // cannot serialize that browser-owned permission object.
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () =>
          request.result.createObjectStore(STORE_NAME)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    },
    async run(mode, action) {
      // All handle operations share one transaction wrapper so callers only
      // choose read-only/read-write mode and the object-store operation.
      const db = await this.open()
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, mode)
          const request = action(tx.objectStore(STORE_NAME))
          tx.oncomplete = () => resolve(request && request.result)
          tx.onerror = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
    },
    get: () => idbStore.run('readonly', (s) => s.get(HANDLE_KEY)),
    put: (handle) =>
      idbStore.run('readwrite', (s) => s.put(handle, HANDLE_KEY)),
    del: () => idbStore.run('readwrite', (s) => s.delete(HANDLE_KEY)),
  }
  let store = idbStore

  const supported = () =>
    // Both pickers are required because this feature must create and reopen
    // files, not merely read a user-selected file once.
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function'

  const isDataKey = (key) =>
    typeof key === 'string' &&
    PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    !LOCAL_ONLY.has(key)

  const autosaveOn = () => {
    try {
      return localStorage.getItem(AUTOSAVE_KEY) === '1'
    } catch {
      return false
    }
  }

  function setFlag(key, on) {
    // Link/autosave flags are intentionally written with the native method so
    // this module does not mistake its own bookkeeping for user data changes.
    try {
      if (on) nativeSet.call(localStorage, key, '1')
      else nativeRemove.call(localStorage, key)
    } catch {}
  }

  const getFlag = (key) => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  }

  // Autosave is in the data file ('1' on, '0' off, so a file from before it
  // was saved there, without the key, can be told apart). Turning it off
  // writes the file once, so the file says so too.
  function setAutosave(on) {
    try {
      localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0')
    } catch {}
    if (on) schedule()
    else if (tracking && !applying && getFlag(LINKED_KEY)) save()
    notify()
  }

  function notify() {
    // Settings subscribes to this signal to refresh status text and button
    // enabled states after a link, save, error, or unlink operation.
    listeners.forEach((listener) => {
      try {
        listener()
      } catch {}
    })
  }

  function snapshot() {
    // Only app data is exported. Handle metadata and dirty-state flags stay
    // local to this browser and are reconstructed when the file is linked.
    const storage = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (isDataKey(key)) storage[key] = localStorage.getItem(key)
    }
    big.forEach((value, key) => {
      if (isDataKey(key)) storage[key] = value
    })
    return {
      app: FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      storage,
    }
  }

  function parse(text) {
    // Validate the envelope before touching localStorage. This prevents an
    // arbitrary JSON file from silently replacing Spell Book preferences.
    if (!text.trim()) return null // an empty file is fine: nothing to load yet
    const data = JSON.parse(text)
    if (
      !data ||
      data.app !== FORMAT ||
      !data.storage ||
      typeof data.storage !== 'object'
    ) {
      throw new Error('This file is not a Spell Book data file.')
    }
    return data
  }

  // Replaces this browser's saved data with the file's.
  function applyToStorage(data) {
    // Set `applying` first: the Storage.prototype hooks below should not mark
    // a restore as a new unsaved edit while this replacement is in progress.
    applying = true
    try {
      const existing = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (isDataKey(key)) existing.push(key)
      }
      // Remove stale keys so loading an older/smaller file is a true replace,
      // rather than a merge that leaves deleted preferences behind. A file
      // from before autosave was saved in it leaves this browser's switch as is.
      existing.forEach((key) => {
        if (key === AUTOSAVE_KEY && !(key in data.storage)) return
        localStorage.removeItem(key)
      })
      ;[...big.keys()].forEach((key) => {
        if (isDataKey(key) && !(key in data.storage)) writeBig(key, null)
      })
      Object.entries(data.storage).forEach(([key, value]) => {
        if (isDataKey(key) && typeof value === 'string') {
          if (isBig(key)) writeBig(key, value)
          else localStorage.setItem(key, value)
        }
      })
    } finally {
      applying = false
    }
  }

  async function permission(handle, request = false) {
    // Reading permission is silent; requesting it is reserved for a user
    // gesture such as clicking Reconnect, Open, or Create in Settings.
    const options = { mode: 'readwrite' }
    if ((await handle.queryPermission(options)) === 'granted') return 'granted'
    if (request) return handle.requestPermission(options)
    return 'prompt'
  }

  async function readHandle(handle) {
    const file = await handle.getFile()
    return parse(await file.text())
  }

  async function writeHandle(handle) {
    // A failed write is abandoned (abort), so the file keeps its old
    // contents instead of being cut short. Returns what was written.
    const data = snapshot()
    const writable = await handle.createWritable()
    try {
      await writable.write(JSON.stringify(data, null, 2) + '\n')
      await writable.close()
    } catch (err) {
      try {
        await writable.abort()
      } catch {}
      throw err
    }
    return data
  }

  // Reads the file back and checks it holds exactly what was written.
  async function checkWritten(handle, data) {
    const back = await readHandle(handle)
    const want = data.storage
    const got = (back && back.storage) || {}
    const same =
      back &&
      back.savedAt === data.savedAt &&
      Object.keys(got).length === Object.keys(want).length &&
      Object.keys(want).every((key) => got[key] === want[key])
    if (!same) {
      throw new Error(
        'The data file was written but did not read back the same. Try Save again; if it keeps happening, use Download Backup.',
      )
    }
  }

  // Runs before the app starts: loads the linked file (when it can be read
  // without asking) into this browser's storage.
  async function autoload() {
    // A running Spell Book database server takes priority over files.
    if (remote) {
      const fromRemote = await remote.autoload()
      if (fromRemote && fromRemote.status !== 'remote-off') return fromRemote
    }
    // A generated data script takes priority when the app is opened directly
    // from disk. The picker-backed link is the HTTP/secure-context path.
    // JSON snapshots are loaded through the linked-file picker or HTTP startup loader.
    if (!supported()) return { status: 'unsupported' }
    let handle
    try {
      handle = await store.get()
    } catch {
      return { status: 'none' }
    }
    if (!handle) return { status: 'none' }
    try {
      if ((await permission(handle)) !== 'granted') {
        return { status: 'needs-permission', name: handle.name }
      }
      if (getFlag(UNSAVED_KEY)) {
        // This browser has newer changes than the file: keep them and offer a
        // later save instead of overwriting local work during startup.
        if (autosaveOn()) schedule()
        return { status: 'local-newer', name: handle.name }
      }
      const data = await readHandle(handle)
      if (!data) return { status: 'empty', name: handle.name }
      applyToStorage(data)
      return { status: 'loaded', name: handle.name, savedAt: data.savedAt }
    } catch (err) {
      lastError = err.message || String(err)
      return { status: 'error', name: handle.name, error: lastError }
    }
  }

  // data/spellbook-data.js sets window.SPELLBOOK_DATA before the app starts.
  function autoloadScriptFile() {
    const data = window.SPELLBOOK_DATA
    if (
      !data ||
      data.app !== FORMAT ||
      !data.storage ||
      typeof data.storage !== 'object'
    ) {
      return {
        status: 'error',
        name: 'spellbook-data.js',
        error: 'Not a Spell Book data file.',
      }
    }
    if (localStorage.getItem(STAMP_KEY) === String(data.savedAt)) {
      return { status: 'same', source: 'file' } // already up to date
    }
    if (getFlag(UNSAVED_KEY)) {
      return {
        status: 'local-newer',
        source: 'file',
        name: 'spellbook-data.js',
      }
    }
    apply(data)
    markFile(data.savedAt)
    return { status: 'loaded', source: 'file', savedAt: data.savedAt }
  }

  function markFile(savedAt) {
    // The timestamp lets the script-file loader skip applying the same backup
    // repeatedly, while FILEMODE_KEY records which source is authoritative.
    try {
      nativeSet.call(localStorage, STAMP_KEY, String(savedAt))
    } catch {}
    setFlag(FILEMODE_KEY, true)
    setFlag(UNSAVED_KEY, false)
  }

  async function currentHandle() {
    try {
      return (await store.get()) || null
    } catch {
      return null
    }
  }

  // Writes the snapshot now. Resolves true when it was written.
  // ask: may ask for permission to the file (only from a click, such as Save).
  // verify: reads the file back to check it (Save; autosave skips this).
  function save({ ask = false, verify = false } = {}) {
    collect()
    // Chain saves so rapid edits cannot open competing writable streams or
    // reorder snapshots. Returning the shared promise lets the UI await it.
    clearTimeout(timer)
    timer = null
    saving = saving.then(async () => {
      await bigWrites
      if (remoteActive()) return remote.save()
      const handle = await currentHandle()
      if (!handle) return false
      try {
        if ((await permission(handle, ask)) !== 'granted') {
          lastError =
            'The browser needs permission to edit the data file again. Click Save (or Reconnect in Settings → Data) and allow it.'
          notify()
          return false
        }
        const seen = changes
        writing++
        notify()
        let written
        try {
          written = await writeHandle(handle)
        } finally {
          writing--
        }
        if (verify) await checkWritten(handle, written)
        if (changes === seen) {
          dirty = false
          setFlag(UNSAVED_KEY, false)
          emitSaved('file')
        }
        lastSaved = new Date()
        lastError = ''
        notify()
        return true
      } catch (err) {
        lastError = err.message || String(err)
        notify()
        return false
      }
    })
    return saving
  }

  function schedule() {
    // Debounce writes: typing in a form may produce many storage events, but
    // the file should be written once after the user pauses.
    if (!autosaveOn() && !remoteActive()) return
    dirty = true
    const wasIdle = !timer
    clearTimeout(timer)
    timer = setTimeout(() => save(), remoteActive() ? remote.delay : SAVE_DELAY)
    if (wasIdle) notify() // the top bar shows a write is coming
  }

  // Saves right away if there are unsaved changes (also used before leaving).
  function flush() {
    collect()
    return dirty && (remoteActive() || autosaveOn()) ? save() : saving
  }

  // Any change to Spell Book's saved data is remembered as unsaved and
  // schedules an autosave.
  const noteChange = (storage, key) => {
    // The wrapper sees every localStorage write in the page, so filter out
    // startup/internal writes and keys that do not belong in the data file.
    if (storage !== window.localStorage) return
    markChanged(key)
  }
  function markChanged(key) {
    // Pages that follow saved data as it changes (the Compendium's Markdown
    // folder) hear every data key, before the autosave bookkeeping below.
    if (isDataKey(key)) {
      dataListeners.forEach((listener) => {
        try {
          listener(key)
        } catch {}
      })
    }
    if (!tracking) return
    if (applying || !isDataKey(key)) return
    if (remoteActive() || getFlag(LINKED_KEY) || getFlag(FILEMODE_KEY)) {
      setFlag(UNSAVED_KEY, true)
    }
    changes++
    schedule()
  }
  Storage.prototype.setItem = function (key, value) {
    nativeSet.call(this, key, value)
    noteChange(this, key)
  }
  Storage.prototype.removeItem = function (key) {
    nativeRemove.call(this, key)
    noteChange(this, key)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)

  async function getState() {
    const handle = await currentHandle()
    let state = 'none'
    if (handle) {
      try {
        state = await permission(handle)
      } catch {
        state = 'prompt'
      }
    }
    return {
      supported: supported(),
      name: handle ? handle.name : '',
      permission: state,
      autosave: autosaveOn(),
      lastSaved,
      lastError,
      saving: writing > 0,
      pending: Boolean(timer),
      remote: remote ? remote.state() : null,
    }
  }

  // Picks an existing file and links it. Returns its data (or null if empty).
  async function linkExisting() {
    const [handle] = await window.showOpenFilePicker({
      types: PICKER_TYPES,
      multiple: false,
    })
    if ((await permission(handle, true)) !== 'granted') {
      throw new Error('Permission to edit that file was not granted.')
    }
    const data = await readHandle(handle)
    await store.put(handle)
    setFlag(LINKED_KEY, true)
    notify()
    return { name: handle.name, data }
  }

  // Backup file names carry the time they were made: DDMMMYYYY_HH-MM-SS,
  // for example spellbook-data_11Nov2026_12-40-05.json (colons are not allowed in file names)
  function backupName(base, extension, when = new Date()) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const two = (n) => String(n).padStart(2, '0')
    const stamp = `${two(when.getDate())}${months[when.getMonth()]}${when.getFullYear()}_${two(when.getHours())}-${two(when.getMinutes())}-${two(when.getSeconds())}`
    return `${base}_${stamp}.${extension}`
  }

  // Creates a new file, links it and writes the current data into it.
  async function linkNew() {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'spellbook-data.json',
      types: PICKER_TYPES,
    })
    await store.put(handle)
    setFlag(LINKED_KEY, true)
    await writeHandle(handle)
    setFlag(UNSAVED_KEY, false)
    lastSaved = new Date()
    notify()
    return { name: handle.name }
  }

  // Asks the browser for access to the already-linked file (needs a click).
  async function reconnect() {
    const handle = await currentHandle()
    if (!handle) throw new Error('No data file is linked.')
    return (await permission(handle, true)) === 'granted'
  }

  // Replaces this browser's data with the linked file's.
  async function loadNow() {
    const handle = await currentHandle()
    if (!handle) throw new Error('No data file is linked.')
    if ((await permission(handle, true)) !== 'granted') {
      throw new Error('Permission to read that file was not granted.')
    }
    const data = await readHandle(handle)
    if (!data) throw new Error('The linked file is empty.')
    apply(data)
    return data
  }

  // Makes the file's data this browser's data.
  function apply(data) {
    applyToStorage(data)
    setFlag(UNSAVED_KEY, false)
    emitSaved('loaded')
  }

  async function unlink() {
    clearTimeout(timer)
    timer = null
    dirty = false
    await store.del()
    setFlag(LINKED_KEY, false)
    setFlag(UNSAVED_KEY, false)
    // Autosave stays as set: it is a setting in the data file now, and comes
    // back into play when a file is linked again.
    notify()
  }

  function showBanner(text, actions) {
    document.getElementById('datafile-banner')?.remove()
    const banner = document.createElement('div')
    banner.id = 'datafile-banner'
    banner.className = 'data-banner'
    const message = document.createElement('span')
    message.textContent = text
    banner.append(message)
    actions.forEach(({ label, primary, run }) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = primary ? 'btn sm' : 'btn secondary sm'
      button.textContent = label
      button.addEventListener('click', async () => {
        try {
          await run(banner, message)
        } catch (err) {
          message.textContent = err.message || String(err)
        }
      })
      banner.append(button)
    })
    document.body.prepend(banner)
  }

  const closeBanner = (banner) => banner.remove()

  // Called once the app is running: starts tracking changes and, if the load
  // needs the user's attention, shows a banner.
  // settings.js calls this after the startup loader reports its result.
  function handleStartup(result) {
    tracking = true
    if (!result) return
    if (remote && remote.handleStartup(result)) return
    if (result.status === 'needs-permission') {
      showBanner(
        `Your data file "${result.name}" needs permission before it can load.`,
        [
          {
            label: 'Load it now',
            primary: true,
            run: async () => {
              if (!(await reconnect())) return
              const data = await loadNow()
              if (data) reloadPage()
            },
          },
          { label: 'Not now', run: closeBanner },
        ],
      )
    } else if (result.status === 'local-newer' && result.source === 'file') {
      showBanner(
        'A newer data file is in the data folder, but this browser also has changes that are not in a data file yet.',
        [
          {
            label: 'Download my changes',
            primary: true,
            run: async (banner) => {
              downloadFile(
                backupName('spellbook-data', 'json'),
                exportText(),
                'application/json;charset=utf-8',
              )
              closeBanner(banner)
            },
          },
          {
            label: 'Use the data file instead',
            run: () => {
              apply(window.SPELLBOOK_DATA)
              markFile(window.SPELLBOOK_DATA.savedAt)
              reloadPage()
            },
          },
          { label: 'Not now', run: closeBanner },
        ],
      )
    } else if (result.status === 'local-newer' && !autosaveOn()) {
      showBanner(
        `This browser has changes that are not in "${result.name}" yet.`,
        [
          {
            label: 'Save to file',
            primary: true,
            run: async (banner, message) => {
              if (await save()) closeBanner(banner)
              else message.textContent = lastError || 'Could not save the file.'
            },
          },
          {
            label: 'Use the file instead',
            run: async () => {
              const data = await loadNow()
              if (data) reloadPage()
            },
          },
          { label: 'Not now', run: closeBanner },
        ],
      )
    } else if (result.status === 'error') {
      showBanner(`Could not load "${result.name}": ${result.error}`, [
        { label: 'Dismiss', run: closeBanner },
      ])
    }
  }

  // Works in any browser: the data as text, and loading it back from text.
  function exportText() {
    collect()
    return JSON.stringify(snapshot(), null, 2) + '\n'
  }

  // The data as data/spellbook-data.js. Save it in Spell Book's data folder,
  // replacing the old one, and it loads automatically when Spell Book opens.
  function exportScript() {
    collect()
    const data = snapshot()
    markFile(data.savedAt)
    notify()
    return (
      '// Spell Book data. Keep this file in the data folder; it loads on open.\n' +
      'window.SPELLBOOK_DATA = ' +
      JSON.stringify(data, null, 2) +
      ';\n'
    )
  }

  // Accepts the JSON form or the spellbook-data.js form.
  function importText(text) {
    const scripted = text.match(
      /window\.SPELLBOOK_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/,
    )
    const data = parse(scripted ? scripted[1] : text)
    if (!data) throw new Error('That file is empty.')
    apply(data)
    markFile(data.savedAt)
    return data
  }

  // Lets remote-db/client.js store the data in a database. The adapter gets
  // these helpers so change tracking and banners stay in this file.
  function useRemote(factory) {
    remote = factory({
      UNSAVED_KEY,
      snapshot,
      applyToStorage,
      getFlag,
      setFlag,
      showBanner,
      closeBanner,
      notify,
      // Writes a per-browser setting without counting it as a data change
      // (null removes it). Its key is kept out of the data file.
      setLocal(key, value) {
        LOCAL_ONLY.add(key)
        try {
          if (value === null) nativeRemove.call(localStorage, key)
          else nativeSet.call(localStorage, key, value)
        } catch {}
      },
      // Sets or removes (null) one saved value without counting it as a change.
      setData(key, value) {
        applying = true
        try {
          if (isBig(key)) writeBig(key, value === null ? null : String(value))
          else if (value === null) localStorage.removeItem(key)
          else localStorage.setItem(key, value)
        } finally {
          applying = false
        }
      },
      schedule,
      markSaved() {
        dirty = false
        setFlag(UNSAVED_KEY, false)
        emitSaved('database')
        lastSaved = new Date()
        lastError = ''
        notify()
      },
      setError(message) {
        lastError = message
        notify()
      },
      info: () => ({ lastSaved, lastError }),
    })
    ;(remote.localKeys || []).forEach((key) => LOCAL_ONLY.add(key))
    return remote
  }

  return {
    // Saved values, large ones included (see "Large values" above).
    ready,
    getItem,
    setItem,
    removeItem,
    // Resolves once every large-value write so far is stored.
    whenWritten: () => bigWrites,
    reload: reloadPage,
    // Whether a large-value write is still running.
    writing: () => pendingBig > 0,
    // listener(message): a large value could not be stored ('' once one is).
    onStoreError: (listener) => bigListeners.add(listener),
    storeError: () => bigError,
    supported,
    useRemote,
    backupName,
    exportText,
    exportScript,
    importText,
    autoload,
    save,
    flush,
    // collector(): writes edits still held in memory into storage. Runs
    // before every save, export and the save on leaving the page.
    beforeSave: (collector) => collectors.add(collector),
    getState,
    // The linked file's handle, or null (attachments.js opens its folder picker there).
    fileHandle: currentHandle,
    linkExisting,
    linkNew,
    reconnect,
    loadNow,
    apply,
    unlink,
    setAutosave,
    autosaveOn,
    handleStartup,
    onChange: (listener) => listeners.add(listener),
    // Called with the key whenever a saved value changes.
    onDataChange: (listener) => dataListeners.add(listener),
    // Called when the data matches a saved copy ('file', 'database',
    // 'backup', 'loaded'); markBackedUp() reports a downloaded backup.
    onSaved: (listener) => savedListeners.add(listener),
    markBackedUp: () => emitSaved('backup'),
    // Every saved value as it would go in the data file: { key: text }.
    // collect: first hand over edits still held in memory (the open note).
    currentData: (options = {}) => {
      if (options.collect) collect()
      return snapshot().storage
    },
    // Whether this browser has changes the linked file or database lacks.
    hasUnsaved: () => getFlag(UNSAVED_KEY),
    // A per-browser value kept out of the data file and not counted as a change.
    setLocal(key, value) {
      LOCAL_ONLY.add(key)
      try {
        if (value === null) nativeRemove.call(localStorage, key)
        else nativeSet.call(localStorage, key, value)
      } catch {}
    },
    // Test hooks
    _setStore: (replacement) => {
      store = replacement
    },
  }
})()
