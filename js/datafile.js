/*
 * Linked data-file adapter.
 *
 * This module is deliberately independent from the app's record model. It
 * serializes selected localStorage keys, so adding a new persisted feature
 * requires checking isDataKey(), reset behavior in app/settings, and the
 * snapshot import/export format together. app.js/settings.js call window.DataFile.
 */
// ─── Linked data file ─────────────────────────────────────────────────
// Lets Spell Book keep everything (commands, scripts, terms, theme and every
// other setting) in one JSON file you choose. Uses the File System Access API
// (Chrome / Edge). On open the file is loaded automatically; with autosave on,
// changes are written back shortly after they happen and again when you leave.
//
// The file holds a copy of this browser's saved data ("spellbook_*" and
// "cmdref_*" keys), so it also works as a full backup / restore.
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
  // Per-browser switches that stay out of the file.
  const LOCAL_ONLY = new Set([
    AUTOSAVE_KEY,
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
  const listeners = new Set()

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

  function setAutosave(on) {
    setFlag(AUTOSAVE_KEY, on)
    if (on) schedule()
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
      // rather than a merge that leaves deleted preferences behind.
      existing.forEach((key) => localStorage.removeItem(key))
      Object.entries(data.storage).forEach(([key, value]) => {
        if (isDataKey(key) && typeof value === 'string') {
          localStorage.setItem(key, value)
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
    // Always close the writable stream, including when serialization or the
    // browser's write operation throws.
    const writable = await handle.createWritable()
    try {
      await writable.write(JSON.stringify(snapshot(), null, 2) + '\n')
    } finally {
      await writable.close()
    }
  }

  // Runs before the app starts: loads the linked file (when it can be read
  // without asking) into this browser's storage.
  async function autoload() {
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
  function save() {
    // Chain saves so rapid edits cannot open competing writable streams or
    // reorder snapshots. Returning the shared promise lets the UI await it.
    clearTimeout(timer)
    timer = null
    saving = saving.then(async () => {
      const handle = await currentHandle()
      if (!handle) return false
      try {
        if ((await permission(handle)) !== 'granted') {
          lastError =
            'The browser needs permission to edit the data file again. Use Reconnect in Settings → Data.'
          notify()
          return false
        }
        await writeHandle(handle)
        dirty = false
        setFlag(UNSAVED_KEY, false)
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
    if (!autosaveOn()) return
    dirty = true
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY)
  }

  // Saves right away if there are unsaved changes (also used before leaving).
  function flush() {
    return dirty && autosaveOn() ? save() : saving
  }

  // Any change to Spell Book's saved data is remembered as unsaved and
  // schedules an autosave.
  const noteChange = (storage, key) => {
    // The wrapper sees every localStorage write in the page, so filter out
    // startup/internal writes and keys that do not belong in the data file.
    if (!tracking || storage !== window.localStorage) return
    if (applying || !isDataKey(key)) return
    if (getFlag(LINKED_KEY) || getFlag(FILEMODE_KEY)) setFlag(UNSAVED_KEY, true)
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
  }

  async function unlink() {
    clearTimeout(timer)
    timer = null
    dirty = false
    await store.del()
    setFlag(LINKED_KEY, false)
    setFlag(UNSAVED_KEY, false)
    setAutosave(false)
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
              if (data) location.reload()
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
                'spellbook-data.json',
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
              location.reload()
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
              if (data) location.reload()
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
    return JSON.stringify(snapshot(), null, 2) + '\n'
  }

  // The data as data/spellbook-data.js. Save it in Spell Book's data folder,
  // replacing the old one, and it loads automatically when Spell Book opens.
  function exportScript() {
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

  return {
    supported,
    exportText,
    exportScript,
    importText,
    autoload,
    save,
    flush,
    getState,
    linkExisting,
    linkNew,
    reconnect,
    loadNow,
    apply,
    unlink,
    setAutosave,
    handleStartup,
    onChange: (listener) => listeners.add(listener),
    // Test hooks
    _setStore: (replacement) => {
      store = replacement
    },
  }
})()
