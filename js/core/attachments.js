/*
 * Attachments: files kept with notes (window.Attachments).
 *
 * A note holds only a link to a file: its SHA-256 (the file's id), name,
 * size and type (notes.js fileShell). The file itself is kept apart from the
 * data file, which stays small:
 *
 *   - in this browser's IndexedDB ("spellbook_files"), always;
 *   - in the attachments folder: "attachments" beside the data file (so
 *     data/attachments for Spell Book's own data folder), one file per
 *     attachment, named <id>.<ext>. A browser may only use a folder the user
 *     picked, so after a data file is linked a banner offers it: one click,
 *     then Select Folder in the picker, which opens in the data file's
 *     folder. Copy the data file and the folder together to move or back up;
 *   - on the database server, which keeps them in data/attachments too, when
 *     the database is in use (remote-db/client.js calls useRemote).
 *
 * The same file attached twice is stored once. sync() copies files between
 * the three places: files this browser has go to the folder and the server,
 * and files the notes link to but this browser lacks come from them.
 *
 * Files no note links to (Trash included) are deleted when Spell Book starts,
 * from this browser and from the folder (pruneFolder: only when the notes
 * here are the data file's, and never most of the folder at once). Not
 * during a session, so a chip brought back with Ctrl+Z still has its file.
 * The server's are removed only by Clean Up in Settings, which asks first:
 * other browsers share the server and may have notes that link to them.
 *
 * The folder's permission is per browser (like the data file's), so it's kept
 * in IndexedDB ("spellbook_handles"), not in the data file.
 *
 * Opening: only PDFs, PNG / JPEG / GIF / WebP images and plain text open in a
 * tab, and only when the file's first bytes say it is one (its name and
 * claimed type are not trusted). Everything else is downloaded, never shown
 * inside Spell Book, so an HTML or SVG file can't run in the app.
 */
window.Attachments = (() => {
  const DB_NAME = 'spellbook_files'
  const STORE = 'files'
  const HANDLE_DB = 'spellbook_handles'
  const HANDLE_STORE = 'handles'
  const FOLDER_KEY = 'attachmentsFolder'
  const MAX_SIZE = 100 * 1024 * 1024
  const ID = /^[0-9a-f]{64}$/
  // A link in a note, as saved (the notes are JSON, so its quote may be escaped).
  const LINK = /data-attachment=\\?"([0-9a-f]{64})/g

  const listeners = new Set()
  const notify = () =>
    listeners.forEach((listener) => {
      try {
        listener()
      } catch {}
    })
  let lastError = ''
  let syncing = null
  let remote = null // { active(), list(), get(id), put(id, blob), del(id) }

  // ── this browser's copies (IndexedDB)
  let dbPromise = null
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('The browser database is busy in another tab.'))
      })
      dbPromise.catch(() => {
        dbPromise = null
      })
    }
    return dbPromise
  }
  async function tx(mode, action) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const request = action(t.objectStore(STORE))
      t.oncomplete = () => resolve(request && request.result)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error || new Error('The browser refused to store the file.'))
    })
  }
  const localGet = (id) => tx('readonly', (s) => s.get(id))
  const localPut = (id, record) => tx('readwrite', (s) => s.put(record, id))
  const localDel = (id) => tx('readwrite', (s) => s.delete(id))
  const localIds = async () => ((await tx('readonly', (s) => s.getAllKeys())) || []).filter((id) => ID.test(id))

  // ── the folder's permission (kept like the data file's)
  function handleTx(mode, action) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const t = db.transaction(HANDLE_STORE, mode)
        const inner = action(t.objectStore(HANDLE_STORE))
        t.oncomplete = () => {
          db.close()
          resolve(inner && inner.result)
        }
        t.onerror = () => {
          db.close()
          reject(t.error)
        }
      }
    })
  }
  let folder = undefined // undefined: not looked up yet
  async function folderHandle() {
    if (folder === undefined) {
      try {
        folder = (await handleTx('readonly', (s) => s.get(FOLDER_KEY))) || null
      } catch {
        folder = null
      }
    }
    return folder
  }
  const folderSupported = () => typeof window.showDirectoryPicker === 'function'
  async function permission(handle, ask = false) {
    const options = { mode: 'readwrite' }
    try {
      if ((await handle.queryPermission(options)) === 'granted') return 'granted'
      if (ask) return await handle.requestPermission(options)
    } catch {}
    return 'prompt'
  }
  // The folder, if this browser may use it now (ask: may show the browser's prompt).
  async function usableFolder(ask = false) {
    const handle = await folderHandle()
    if (!handle) return null
    return (await permission(handle, ask)) === 'granted' ? handle : null
  }

  // The folder's files: id → file name. Names are <id>.<ext> (or just <id>).
  async function folderFiles(handle) {
    const found = new Map()
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== 'file') continue
      const id = name.slice(0, 64).toLowerCase()
      if (ID.test(id) && (name.length === 64 || name[64] === '.')) found.set(id, name)
    }
    return found
  }
  const extOf = (name) => {
    const m = String(name || '').match(/\.([a-z0-9]{1,10})$/i)
    return m ? `.${m[1].toLowerCase()}` : ''
  }
  async function writeToFolder(handle, id, record) {
    const file = await handle.getFileHandle(`${id}${extOf(record.name)}`, { create: true })
    const stream = await file.createWritable()
    await stream.write(record.blob)
    await stream.close()
  }

  // ── which files the notes link to (Trash and note presets included)
  // (collect: include the open note's last keystrokes, for Clean Up.)
  function linked({ collect = false } = {}) {
    const ids = new Set()
    let data = {}
    try {
      data = window.DataFile.currentData({ collect })
    } catch {
      return null
    }
    for (const value of Object.values(data)) {
      if (typeof value !== 'string' || !value.includes('data-attachment')) continue
      for (const m of value.matchAll(LINK)) ids.add(m[1])
    }
    return ids
  }

  async function sha256(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const cleanName = (name) =>
    String(name || 'file')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u2062\u2063]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || 'file'
  const cleanType = (type) => (/^[\w.+-]{1,60}\/[\w.+-]{1,80}$/.test(String(type || '')) ? String(type).toLowerCase() : '')

  // Stores a file (a File from a drop, a paste or the file picker). Resolves
  // { id, name, size, type }. The folder and the server get it in the background.
  async function add(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('That isn’t a file.')
    if (file.size > MAX_SIZE) throw new Error(`“${cleanName(file.name)}” is larger than ${formatSize(MAX_SIZE)}.`)
    const buffer = await file.arrayBuffer()
    const id = await sha256(buffer)
    const meta = { id, name: cleanName(file.name), size: buffer.byteLength, type: cleanType(file.type) }
    const record = { blob: new Blob([buffer], { type: 'application/octet-stream' }), name: meta.name, type: meta.type, size: meta.size, added: Date.now() }
    if (!(await localGet(id))) await localPut(id, record)
    // Right after a drop, paste or click, the browser may ask about the folder.
    usableFolder(true)
      .then(async (handle) => {
        if (handle && !(await folderFiles(handle)).has(id)) await writeToFolder(handle, id, record)
      })
      .catch((err) => setError(err))
      .finally(notify)
    if (remoteOn()) remote.put(id, record.blob).catch((err) => setError(err))
    notify()
    return meta
  }

  // The file's bytes (a Blob), from this browser, the folder or the server.
  async function get(id) {
    if (!ID.test(String(id))) return null
    const record = await localGet(id).catch(() => null)
    if (record && record.blob) return record.blob
    const fetched = (await fromFolder(id)) || (await fromRemote(id))
    return fetched
  }
  async function fromFolder(id) {
    try {
      const handle = await usableFolder()
      if (!handle) return null
      const name = (await folderFiles(handle)).get(id)
      if (!name) return null
      const file = await (await handle.getFileHandle(name)).getFile()
      return await keepIfRight(id, file)
    } catch (err) {
      setError(err)
      return null
    }
  }
  async function fromRemote(id) {
    if (!remoteOn()) return null
    try {
      const blob = await remote.get(id)
      return blob ? await keepIfRight(id, blob) : null
    } catch (err) {
      setError(err)
      return null
    }
  }
  // Keeps a copy from the folder or the server, if its bytes are the file.
  // (Its name and type are in the notes that link to it.)
  async function keepIfRight(id, blob) {
    const buffer = await blob.arrayBuffer()
    if ((await sha256(buffer)) !== id) return null
    const copy = new Blob([buffer], { type: 'application/octet-stream' })
    await localPut(id, { blob: copy, name: '', type: '', size: buffer.byteLength, added: Date.now() }).catch(() => {})
    notify()
    return copy
  }
  const has = async (id) => Boolean(await localGet(id).catch(() => null))

  // ── copying between this browser, the folder and the server
  // Whether the folder's file is the attachment: same size, and the same
  // SHA-256. Hashing is skipped while the file's size and time are the ones
  // last checked (kept with this browser's copy), so a sync doesn't read
  // every file again.
  async function folderCopyRight(handle, name, id, record) {
    try {
      const file = await (await handle.getFileHandle(name)).getFile()
      if (file.size !== record.blob.size) return false
      const stamp = `${file.size}:${file.lastModified}`
      if (record.folderStamp === stamp) return true
      if ((await sha256(await file.arrayBuffer())) !== id) return false
      await localPut(id, { ...record, folderStamp: stamp }).catch(() => {})
      return true
    } catch {
      return false
    }
  }
  // After writing a file to the folder: remember its size and time as checked.
  async function noteChecked(id, record, handle) {
    try {
      const file = await (await handle.getFileHandle(`${id}${extOf(record.name)}`)).getFile()
      await localPut(id, { ...record, folderStamp: `${file.size}:${file.lastModified}` })
    } catch {}
  }
  // The server's files: { ids: Set, sizes: { id: bytes } }.
  async function remoteList() {
    const listed = await remote.list()
    if (Array.isArray(listed)) return { ids: new Set(listed), sizes: {} }
    return { ids: new Set((listed && listed.ids) || []), sizes: (listed && listed.sizes) || {} }
  }
  function sync({ ask = false } = {}) {
    if (syncing) return syncing
    syncing = (async () => {
      const wanted = linked()
      const mine = new Set(await localIds().catch(() => []))
      const handle = await usableFolder(ask).catch(() => null)
      if (handle) {
        try {
          const there = await folderFiles(handle)
          for (const id of mine) {
            const record = await localGet(id)
            if (!record || !record.blob) continue
            if (there.has(id) && (await folderCopyRight(handle, there.get(id), id, record))) continue
            // Missing, or changed in the folder (edited, or another file
            // saved under its name): this browser's copy goes back.
            if (there.has(id) && there.get(id) !== `${id}${extOf(record.name)}`) await handle.removeEntry(there.get(id)).catch(() => {})
            await writeToFolder(handle, id, record)
            await noteChecked(id, record, handle)
          }
          if (wanted) for (const id of wanted) if (!mine.has(id) && there.has(id) && (await fromFolder(id))) mine.add(id)
        } catch (err) {
          setError(err)
        }
      }
      if (remoteOn()) {
        try {
          const listed = await remoteList()
          const there = listed.ids
          for (const id of mine) {
            const record = await localGet(id)
            if (!record || !record.blob) continue
            // On the server with the right size: the server checked its
            // bytes when it took it. A different size means it was changed there.
            if (there.has(id) && (listed.sizes[id] === undefined || listed.sizes[id] === record.blob.size)) continue
            await remote.put(id, record.blob)
            there.add(id)
          }
          if (wanted) for (const id of wanted) if (!mine.has(id) && there.has(id) && (await fromRemote(id))) mine.add(id)
        } catch (err) {
          setError(err)
        }
      }
    })().finally(() => {
      syncing = null
      notify()
    })
    return syncing
  }

  // Drops this browser's copies of files no note links to.
  async function pruneLocal() {
    const wanted = linked()
    // Nothing loaded (or no notes at all): leave everything as it is.
    if (!wanted || !window.DataFile.getItem('spellbook_notes_v1')) return 0
    let dropped = 0
    for (const id of await localIds().catch(() => [])) {
      if (wanted.has(id)) continue
      await localDel(id).catch(() => {})
      dropped++
    }
    if (dropped) notify()
    return dropped
  }

  // On start: deletes the folder's files that no note links to. Skipped
  // unless the notes here are the data file's (it loaded, or no data file is
  // linked), and when it would delete more than half of a folder of over
  // five files (Settings then shows them for Clean Up).
  let skippedPrune = 0
  async function pruneFolder() {
    const wanted = linked()
    if (!wanted || !window.DataFile.getItem('spellbook_notes_v1')) return 0
    const data = await window.DataFile.getState().catch(() => null)
    if (!data || (data.name && data.permission !== 'granted')) return 0
    const handle = await usableFolder().catch(() => null)
    if (!handle) return 0
    const there = await folderFiles(handle)
    const unused = [...there].filter(([id]) => !wanted.has(id))
    if (unused.length > 5 && unused.length > there.size / 2) {
      skippedPrune = unused.length
      notify()
      return 0
    }
    let removed = 0
    for (const [, name] of unused) {
      try {
        await handle.removeEntry(name)
        removed++
      } catch (err) {
        setError(err)
      }
    }
    if (removed) notify()
    return removed
  }

  // Files in the folder and on the server that no note here links to.
  // (ask: from a click, so the browser may ask about the folder.)
  async function unlinkedElsewhere({ ask = false } = {}) {
    const wanted = linked({ collect: true })
    const out = { folder: [], remote: [], checked: Boolean(wanted) }
    if (!wanted) return out
    const handle = await usableFolder(ask).catch(() => null)
    if (handle) for (const [id, name] of await folderFiles(handle)) if (!wanted.has(id)) out.folder.push(name)
    if (remoteOn()) for (const id of (await remoteList().catch(() => ({ ids: new Set() }))).ids) if (!wanted.has(id)) out.remote.push(id)
    return out
  }
  // Removes them for good (Settings asks first). This browser's own copies
  // stay until the next start, so a chip brought back with Ctrl+Z still
  // works, and the next sync puts its file back in the folder.
  async function cleanUp() {
    const found = await unlinkedElsewhere({ ask: true })
    const handle = await usableFolder(true)
    if (handle) for (const name of found.folder) await handle.removeEntry(name).catch((err) => setError(err))
    if (remoteOn()) for (const id of found.remote) await remote.del(id).catch((err) => setError(err))
    notify()
    return found.folder.length + found.remote.length
  }

  // ── the folder
  // The picker opens in the data file's folder. The chosen folder's
  // "attachments" folder is used (made if needed), or the chosen folder
  // itself when it is called attachments.
  async function chooseFolder() {
    const options = { mode: 'readwrite' }
    const dataFile = window.DataFile && window.DataFile.fileHandle ? await window.DataFile.fileHandle() : null
    if (dataFile) options.startIn = dataFile
    const picked = await window.showDirectoryPicker(options)
    if ((await permission(picked, true)) !== 'granted') throw new Error('Permission to use that folder was not granted.')
    const handle = picked.name.toLowerCase() === 'attachments' ? picked : await picked.getDirectoryHandle('attachments', { create: true })
    document.getElementById('attachments-banner')?.remove()
    await handleTx('readwrite', (s) => s.put(handle, FOLDER_KEY))
    folder = handle
    lastError = ''
    notify()
    await sync()
    return handle.name
  }
  async function reconnectFolder() {
    const handle = await folderHandle()
    if (!handle) return false
    const ok = (await permission(handle, true)) === 'granted'
    if (ok) await sync()
    notify()
    return ok
  }
  async function forgetFolder() {
    await handleTx('readwrite', (s) => s.delete(FOLDER_KEY)).catch(() => {})
    folder = null
    notify()
  }

  // For Settings → Data.
  async function state() {
    const ids = await localIds().catch(() => [])
    let bytes = 0
    for (const id of ids) {
      const record = await localGet(id).catch(() => null)
      if (record) bytes += record.size || 0
    }
    const wanted = linked() || new Set()
    const missing = [...wanted].filter((id) => !ids.includes(id)).length
    const handle = await folderHandle()
    let folderState = null
    if (handle) {
      const access = await permission(handle)
      let notInFolder = null
      let unlinkedInFolder = 0
      if (access === 'granted') {
        try {
          const there = await folderFiles(handle)
          notInFolder = ids.filter((id) => !there.has(id)).length
          if (linked()) unlinkedInFolder = [...there.keys()].filter((id) => !wanted.has(id)).length
        } catch {}
      }
      folderState = { name: handle.name, permission: access, notInFolder, unlinked: unlinkedInFolder }
    }
    return {
      supported: folderSupported(),
      count: ids.length,
      bytes,
      missing,
      folder: folderState,
      remote: remoteOn(),
      busy: Boolean(syncing),
      skippedPrune,
      error: lastError,
    }
  }

  function setError(err) {
    lastError = (err && err.message) || String(err || '')
    if (lastError) console.warn('Spell Book attachments:', lastError)
    notify()
  }
  const remoteOn = () => Boolean(remote && remote.active())

  // ── opening and downloading
  function formatSize(bytes) {
    const n = Number(bytes) || 0
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10485760 ? 1 : 0)} MB`
    return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  }
  const TEXT_EXT = /\.(txt|log|md|csv|tsv|json|ya?ml|xml|ini|conf|cfg|toml|ps1|psm1|sh|bash|py|rb|pl|go|rs|c|h|cpp|cs|java|js|ts|sql|nmap|gnmap)$/i
  // What a file may be shown as in a tab, from its first bytes; '' = download it.
  async function viewType(blob, name) {
    const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer())
    const starts = (...bytes) => bytes.every((b, i) => head[i] === b)
    const ascii = (at, text) => [...text].every((c, i) => head[at + i] === c.charCodeAt(0))
    if (ascii(0, '%PDF-')) return 'application/pdf'
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
    if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
    if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
    if (TEXT_EXT.test(name) && !head.includes(0)) return 'text/plain; charset=utf-8'
    return ''
  }
  const later = (url) => setTimeout(() => URL.revokeObjectURL(url), 60000)
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = cleanName(name)
    document.body.append(a)
    a.click()
    a.remove()
    later(url)
  }
  // Resolves 'opened', 'downloaded' or 'missing'. A file that can't be
  // shown (by its name and type) is downloaded straight away.
  async function open(id, name, claimedType = '') {
    if (!canOpen(name, claimedType)) return (await download(id, name)) ? 'downloaded' : 'missing'
    // Opened before anything is awaited, so the browser allows the tab.
    const tab = window.open('', '_blank')
    const blob = await get(id)
    if (!blob) {
      if (tab) tab.close()
      return 'missing'
    }
    const type = await viewType(blob, name)
    if (!type || !tab) {
      if (tab) tab.close()
      saveBlob(blob, name)
      return 'downloaded'
    }
    const url = URL.createObjectURL(new Blob([blob], { type }))
    tab.opener = null
    tab.location.href = url
    later(url)
    return 'opened'
  }
  async function download(id, name) {
    const blob = await get(id)
    if (!blob) return false
    saveBlob(blob, name)
    return true
  }
  const canOpen = (name, type) =>
    /\.(pdf|png|jpe?g|gif|webp)$/i.test(name) || TEXT_EXT.test(name) || /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(type || '')

  // Startup: drop unlinked copies, then fill in from the folder / server.
  // (After the app's own startup, so the notes are loaded.)
  setTimeout(() => {
    pruneLocal()
      .catch(() => {})
      .then(() => pruneFolder())
      .catch(() => {})
      .then(() => sync())
      .then(offerFolder)
    // A data file linked later (or another one): offer the folder then.
    if (window.DataFile && window.DataFile.onChange) {
      let timer = null
      window.DataFile.onChange(() => {
        clearTimeout(timer)
        timer = setTimeout(offerFolder, 500)
      })
    }
  }, 3000)
  // After each save to the data file or the database, the files follow.
  if (window.DataFile && window.DataFile.onSaved) {
    window.DataFile.onSaved((how) => {
      if (how === 'file' || how === 'database') sync()
    })
  }

  // ── The offer after a data file is linked
  // A banner: Choose Folder (the picker opens in the data file's folder, so
  // it's just Select Folder) or Not now (not asked again for that file in
  // this browser; Settings still has the button). Not shown with the database
  // server, which keeps the files itself.
  const OFFERED_KEY = 'spellbook_attachments_offered_v1' // per browser: the file asked about
  try {
    window.DataFile.setLocal(OFFERED_KEY, localStorage.getItem(OFFERED_KEY))
  } catch {}
  let offering = false
  async function offerFolder() {
    if (offering || document.getElementById('attachments-banner')) return
    offering = true
    try {
      if (!folderSupported() || remoteOn() || (await folderHandle())) return
      const data = await window.DataFile.getState()
      if (!data.name || localStorage.getItem(OFFERED_KEY) === data.name) return
      const banner = document.createElement('div')
      banner.id = 'attachments-banner'
      banner.className = 'data-banner'
      const text = document.createElement('span')
      text.textContent = `Keep attachments in an “attachments” folder next to your data file “${data.name}”? Click Choose Folder, then Select Folder: the window opens in the data file’s folder.`
      const choose = document.createElement('button')
      choose.type = 'button'
      choose.className = 'btn sm'
      choose.textContent = 'Choose Folder'
      const later = document.createElement('button')
      later.type = 'button'
      later.className = 'btn secondary sm'
      later.textContent = 'Not now'
      choose.addEventListener('click', async () => {
        try {
          await chooseFolder()
        } catch (err) {
          if (!err || err.name !== 'AbortError') text.textContent = (err && err.message) || String(err)
        }
      })
      later.addEventListener('click', () => {
        window.DataFile.setLocal(OFFERED_KEY, data.name)
        banner.remove()
      })
      banner.append(text, choose, later)
      document.body.prepend(banner)
    } catch {
    } finally {
      offering = false
    }
  }

  // ── Settings → Data: Attachments
  function buildSettings() {
    const panel = document.querySelector('.settings-panel[data-panel="data"]')
    if (!panel || document.getElementById('attachments-section')) return
    const el = (tag, props = {}, ...children) => {
      const node = Object.assign(document.createElement(tag), props)
      node.append(...children)
      return node
    }
    const button = (id, text, primary = false) => el('button', { type: 'button', id, className: primary ? 'btn' : 'btn secondary' }, text)
    const status = el('p', { className: 'datafile-status', id: 'attachments-status' })
    const choose = button('btn-attachments-folder', 'Choose Folder…')
    const reconnect = button('btn-attachments-reconnect', 'Reconnect', true)
    const syncNow = button('btn-attachments-sync', 'Sync Now')
    const forget = button('btn-attachments-forget', 'Forget Folder')
    const clean = button('btn-attachments-clean', 'Clean Up…')
    const section = el(
      'div',
      { className: 'settings-data-section', id: 'attachments-section' },
      el('h3', {}, 'Attachments'),
      el(
        'p',
        { className: 'form-hint' },
        'Files attached to Compendium notes are kept out of the data file, so it stays small. Files no note uses any more (a removed attachment, or a note deleted from Trash) are deleted from the folder when Spell Book next starts. This browser keeps a copy of each, and saves each one in an “attachments” folder next to your data file once you allow it: click Choose Folder and then Select Folder (the window opens in the data file’s folder; the attachments folder is made if needed). Copy the data file and that folder together to back up or move everything. The database server keeps attachments in its data/attachments folder. Download Backup doesn’t include attachments.',
      ),
      status,
      el('div', { className: 'settings-data-actions' }, choose, reconnect, syncNow, forget, clean),
    )
    const after = document.getElementById('datafile-section')
    if (after) after.after(section)
    else panel.append(section)

    const render = async () => {
      const st = await state()
      const parts = [st.count ? `${st.count} attachment${st.count === 1 ? '' : 's'} (${formatSize(st.bytes)}) in this browser.` : 'No attachments in this browser.']
      if (st.missing) parts.push(`${st.missing} linked in notes but not here yet${st.folder || st.remote ? '' : ': choose the folder that holds them'}.`)
      if (!st.supported) parts.push('This browser can’t use a folder (Chrome and Edge can).')
      else if (!st.folder) parts.push('No folder chosen.')
      else if (st.folder.permission !== 'granted') parts.push(`Folder “${st.folder.name}” needs permission again: click Reconnect.`)
      else {
        parts.push(`Folder: “${st.folder.name}”${st.folder.notInFolder ? `, ${st.folder.notInFolder} not saved there yet` : ', up to date'}.`)
        if (st.folder.unlinked)
          parts.push(
            st.skippedPrune
              ? `${st.folder.unlinked} files there no note links to: that’s most of the folder, so they weren’t deleted on start. Check your notes are all here, then Clean Up… removes them.`
              : `${st.folder.unlinked} file${st.folder.unlinked === 1 ? '' : 's'} there no note links to (removed, for example). ${st.folder.unlinked === 1 ? 'It goes' : 'They go'} when Spell Book next starts, or now with Clean Up….`,
          )
      }
      if (st.remote) parts.push('Also kept on the database server.')
      if (st.busy) parts.push('Syncing…')
      if (st.error) parts.push(st.error)
      status.textContent = parts.join(' ')
      choose.disabled = !st.supported
      choose.textContent = st.folder ? 'Change Folder…' : 'Choose Folder…'
      reconnect.hidden = !(st.folder && st.folder.permission !== 'granted')
      forget.hidden = !st.folder
      syncNow.disabled = !(st.folder || st.remote)
      clean.disabled = !(st.folder || st.remote)
    }
    const run = (action) => async () => {
      try {
        await action()
      } catch (err) {
        if (err && err.name === 'AbortError') return
        alert(err.message || String(err))
      }
      render()
    }
    choose.addEventListener('click', run(chooseFolder))
    reconnect.addEventListener('click', run(reconnectFolder))
    syncNow.addEventListener('click', run(() => sync({ ask: true })))
    forget.addEventListener(
      'click',
      run(async () => {
        if (!confirm('Stop saving attachments to this folder in this browser? The folder and its files stay as they are.')) return
        await forgetFolder()
      }),
    )
    clean.addEventListener(
      'click',
      run(async () => {
        const found = await unlinkedElsewhere({ ask: true })
        const total = found.folder.length + found.remote.length
        if (!found.checked) {
          alert('The notes aren’t loaded yet, so nothing can be checked. Try again in a moment.')
          return
        }
        if (!total) {
          alert('Every attachment in the folder and on the server is linked from a note (or a note in Trash).')
          return
        }
        const where = [found.folder.length && `${found.folder.length} in the folder`, found.remote.length && `${found.remote.length} on the database server`].filter(Boolean).join(' and ')
        if (!confirm(`Delete ${where} for good? No note links to them, not even in Trash. If another browser's notes still link to them, they'll be missing there. This can't be undone (a chip you bring back with Ctrl+Z before closing Spell Book still works, and its file is saved again).`)) return
        await cleanUp()
      }),
    )
    // Saves notify often; the status is redrawn once they settle.
    let timer = null
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(render, 300)
    }
    listeners.add(soon)
    if (window.DataFile && window.DataFile.onChange) window.DataFile.onChange(soon)
    render()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSettings)
  else buildSettings()

  return {
    MAX_SIZE,
    isId: (id) => ID.test(String(id || '')),
    add,
    get,
    has,
    open,
    download,
    canOpen,
    formatSize,
    sync,
    cleanUp,
    unlinkedElsewhere,
    chooseFolder,
    // Shows the "attachments folder next to your data file" banner if it applies.
    offerFolder,
    reconnectFolder,
    forgetFolder,
    folderSupported,
    state,
    onChange: (listener) => listeners.add(listener),
    // remote-db/client.js: { active(), list(), get(id), put(id, blob), del(id) }.
    useRemote(adapter) {
      remote = adapter
      sync()
    },
  }
})()
