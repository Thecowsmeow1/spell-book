/*
 * Trash: one dialog, with a section for each module.
 *
 * Any module can send things to Trash. It registers a section and keeps the
 * trashed items itself, under its own spellbook_ key, so they are saved in
 * the data file like everything else:
 *
 *   SpellBook.trash.section({
 *     id: 'scripts', label: 'Scripts', order: 20,
 *     items: () => [{ id, title, info?, detail?, trashedAt? }],
 *     restore: (id) => …,   // put it back; may return a message to show
 *     purge: (id) => …,     // delete it for good
 *     empty: () => …,       // optional: delete the whole section for good
 *   })
 *
 * `info` is HTML the module built (badges); `detail` is plain text.
 *
 * Most modules only need a list of items under one key:
 *   const bin = SpellBook.trash.bin('spellbook_trash_scripts_v1')
 *   bin.add(item) · bin.all() · bin.take(id) · bin.remove(id) · bin.clear()
 * Each item stored there gets a trashedAt time. Reads and writes go through
 * js/core/datafile.js, so a large key (the Compendium's) lives in IndexedDB.
 *
 * The number on the Trash button is the total of every section. The dialog
 * is #trash-modal in index.html.
 */
;(() => {
  const sections = new Map()
  const $ = (id) => document.getElementById(id)
  const esc = (text) =>
    String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  const store = () => window.DataFile || {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value)
        return Promise.resolve(true)
      } catch {
        return Promise.resolve(false)
      }
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
      return Promise.resolve(true)
    },
  }

  // A list of trashed items under one key.
  function bin(key) {
    const all = () => {
      try {
        const list = JSON.parse(store().getItem(key) || '[]')
        return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []
      } catch {
        return []
      }
    }
    // An empty bin removes its key, so it isn't written to the data file.
    const write = (list) => (list.length ? store().setItem(key, JSON.stringify(list)) : store().removeItem(key))
    return {
      key,
      all,
      add(item) {
        const list = all()
        list.push({ ...item, trashedAt: item.trashedAt || new Date().toISOString() })
        const done = write(list)
        schedule()
        return done
      },
      take(id) {
        const list = all()
        const index = list.findIndex((item) => String(item.id) === String(id))
        if (index < 0) return null
        const [item] = list.splice(index, 1)
        write(list)
        schedule()
        return item
      },
      remove(id) {
        const list = all()
        const kept = list.filter((item) => String(item.id) !== String(id))
        if (kept.length !== list.length) write(kept)
        schedule()
      },
      clear() {
        write([])
        schedule()
      },
    }
  }

  const itemsOf = (def) => {
    try {
      const items = def.items()
      return Array.isArray(items) ? items : []
    } catch (error) {
      console.error(error)
      return []
    }
  }
  const ordered = () => [...sections.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label))
  const total = () => ordered().reduce((sum, def) => sum + itemsOf(def).length, 0)

  function when(iso) {
    if (!iso) return ''
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '' : `Deleted ${date.toLocaleString()}`
  }

  function render() {
    timer = null
    const n = total()
    const count = $('trash-count')
    if (count) {
      count.textContent = n > 999 ? '999+' : String(n)
      count.hidden = !n
    }
    const button = $('btn-trash')
    if (button) {
      button.title = n ? `Trash: ${n} deleted item${n === 1 ? '' : 's'}` : 'Trash: nothing deleted'
      button.setAttribute('aria-label', n ? `Trash (${n})` : 'Trash')
    }
    const empty = $('btn-empty-trash')
    if (empty) empty.disabled = !n
    const list = $('trash-list')
    if (!list || !$('trash-modal').classList.contains('open')) return
    if (!n) {
      list.innerHTML = '<div class="empty-state">Trash is empty.</div>'
      return
    }
    list.innerHTML = ordered()
      .map((def) => {
        const items = itemsOf(def)
        if (!items.length) return ''
        return `
          <section class="trash-section" data-section="${esc(def.id)}">
            <div class="trash-section-head">
              <h3>${esc(def.label)} <span class="trash-section-count">${items.length}</span></h3>
              <button type="button" class="btn secondary sm" data-empty-section>Empty</button>
            </div>
            ${items
              .map(
                (item) => `
              <div class="trash-item" data-id="${esc(item.id)}">
                <div class="trash-item-info">
                  <strong>${esc(item.title || 'Untitled')}</strong>
                  ${item.info || ''}
                  ${item.detail || item.trashedAt ? `<span class="trash-item-detail">${esc([item.detail, when(item.trashedAt)].filter(Boolean).join(' · '))}</span>` : ''}
                </div>
                <div class="trash-item-actions">
                  <button type="button" class="btn secondary sm" data-restore>Restore</button>
                  <button type="button" class="btn danger sm" data-purge>Delete forever</button>
                </div>
              </div>`,
              )
              .join('')}
          </section>`
      })
      .join('')
  }
  let timer = null
  function schedule() {
    if (!timer) timer = setTimeout(render, 0)
  }

  async function run(action) {
    try {
      const message = await action()
      if (typeof message === 'string' && message) alert(message)
    } catch (error) {
      console.error(error)
      alert(`Could not do that: ${(error && error.message) || error}`)
    }
    render()
  }
  function emptySection(def) {
    if (def.empty) return def.empty()
    itemsOf(def).forEach((item) => def.purge(item.id))
  }

  function open() {
    $('trash-modal').classList.add('open')
    render()
  }
  function close() {
    const modal = $('trash-modal')
    if (modal) modal.classList.remove('open')
  }

  // ─── Wiring ─────────────────────────────────────────────────────────
  $('btn-trash').addEventListener('click', open)
  $('btn-trash-close').addEventListener('click', close)
  $('trash-modal').addEventListener('click', (e) => {
    if (e.target === $('trash-modal')) close()
  })
  $('btn-empty-trash').addEventListener('click', () => {
    const n = total()
    if (!n || !confirm(`Permanently delete everything in Trash (${n} item${n === 1 ? '' : 's'})?`)) return
    run(() => ordered().forEach(emptySection))
  })
  $('trash-list').addEventListener('click', (e) => {
    const sectionEl = e.target.closest('[data-section]')
    const def = sectionEl && sections.get(sectionEl.dataset.section)
    if (!def) return
    if (e.target.closest('[data-empty-section]')) {
      const n = itemsOf(def).length
      if (n && confirm(`Permanently delete the ${n} trashed item${n === 1 ? '' : 's'} in ${def.label}?`)) run(() => emptySection(def))
      return
    }
    const row = e.target.closest('.trash-item')
    if (!row) return
    const item = itemsOf(def).find((it) => String(it.id) === row.dataset.id)
    if (!item) return
    if (e.target.closest('[data-restore]')) run(() => def.restore(item.id))
    else if (e.target.closest('[data-purge]') && confirm(`Permanently delete "${item.title || 'Untitled'}"?`)) run(() => def.purge(item.id))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })
  // A data file loaded in, or another tab's change, can change any bin.
  if (window.DataFile && window.DataFile.onDataChange) window.DataFile.onDataChange(schedule)
  schedule() // draw the count and its tooltip once at startup

  window.SpellBook = window.SpellBook || {}
  window.SpellBook.trash = {
    section(def) {
      if (!def || !def.id || typeof def.items !== 'function') return
      sections.set(def.id, { label: def.id, ...def })
      schedule()
    },
    bin,
    refresh: render,
    count: total,
    open,
    close,
  }
  render()
})()
