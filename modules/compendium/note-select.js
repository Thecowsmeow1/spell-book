/*
 * Select & Export (Compendium): an export list beside the tree (or beside the
 * Sealed Notes list) that you fill from any search, tome or Sealed Notes, put
 * in order, preview, and export as Markdown.
 *
 *   - The wide Select & Export button at the bottom of the tree (and of the
 *     Sealed Notes list) opens the list; × or the button closes it. It keeps
 *     its notes while closed, and the button shows how many.
 *   - While it's open, each note in the tree and in Sealed Notes has a ＋ at
 *     the end of its row: click it to add the note (it turns to ✓; click
 *     again to take it out). Right-click also has Add to Export List, Remove
 *     from Export List and Add Branch to Export List. Add shown adds what the
 *     current search matches.
 *   - Drag the notes in the list to set their order (or Alt+↑/↓ on one).
 *     × on a note takes it out; clicking a note opens it.
 *   - The Branch View button at the top of the list previews the export: every
 *     note, in the list's order, as the one Markdown file would have it,
 *     shown where the note normally is. Clicking a note in the list then
 *     jumps to it in the preview. Rendered shows the notes; Markdown shows
 *     the file's text.
 *
 * Export… writes the notes in the list's order:
 *   - One Markdown file (.md): each note as a "# Name" section ("# ★ Name"
 *     when starred) with a line giving its tome and path, tags and seal, then the
 *     note; sections are divided by "---". Images stay in the file.
 *   - Markdown files and images (.zip): a "Selected notes" folder with a file
 *     per note (front matter as in Import / Export's Markdown export, its
 *     order: the list's) and images in assets/.
 * A note's subnotes come along only when they're in the list too.
 *
 * The list is a working set, not a setting: it lives in this page until it's
 * cleared or the page is closed, and is never saved. Stars (notes.js) are the
 * lasting favorites. Uses notes.js (window.NotesEditor), sealed-tomes.js
 * (window.NoteRender, window.SealedNotes) and notes-markdown.js
 * (window.NotesMarkdown). Styles: notes.css.
 */
;(function () {
  const api = window.NotesEditor
  const treeButtonHost = document.getElementById('notes-select-bar')
  if (!api || !treeButtonHost) return

  const list = [] // note ids, in export order
  let active = false // the list is open
  let previewing = false
  let previewAs = 'rendered' // or 'markdown'
  let current = null // the note picked in the list
  const hosts = {} // 'tree' | 'sealed' -> { button, after, covers, shown }
  let where = 'tree'

  const info = (id) => api.infoAnywhere(id)
  const host = () => hosts[where] || hosts.tree

  // ─── The pane ───────────────────────────────────────────────────────
  const pane = document.createElement('aside')
  pane.className = 'select-pane'
  pane.setAttribute('aria-label', 'Export list')
  pane.hidden = true
  pane.innerHTML = `
    <div class="select-pane-head">
      <h3>Export list</h3>
      <button aria-pressed="false" class="notes-tool notes-branch-toggle select-preview-toggle" type="button"><span aria-hidden="true" class="nav-icon nav-icon-branch"></span></button>
      <button aria-label="Close the export list" class="notes-tool select-pane-close" title="Close the export list (it keeps its notes)" type="button">×</button>
    </div>
    <div class="select-pane-tools">
      <button class="btn secondary sm select-add-shown" type="button" title="Add the notes the current search matches (every note shown, without a search)">Add shown</button>
    </div>
    <ol aria-label="Notes to export, in order" class="select-list" role="listbox"></ol>
    <p class="select-empty">Click <b>＋</b> beside a note to add it here, then drag the notes into the order you want.</p>
    <div class="select-pane-foot">
      <span class="select-count" aria-live="polite"></span>
      <button class="btn sm select-export" type="button" title="Export the notes in this list, in this order, as Markdown">Export…</button>
      <button class="btn secondary sm select-clear" type="button" title="Empty the list">Clear</button>
    </div>`
  const listEl = pane.querySelector('.select-list')
  const previewToggle = pane.querySelector('.select-preview-toggle')

  // ─── The preview ────────────────────────────────────────────────────
  const preview = document.createElement('section')
  preview.className = 'select-preview'
  preview.setAttribute('aria-label', 'Export preview')
  preview.hidden = true
  preview.innerHTML = `
    <div class="select-preview-head">
      <span class="select-preview-title"></span>
      <div aria-label="Show the export as" class="notes-scope select-preview-as" role="group">
        <button aria-pressed="true" class="notes-scope-btn active" data-as="rendered" type="button" title="The notes as they look in Spell Book">Rendered</button>
        <button aria-pressed="false" class="notes-scope-btn" data-as="markdown" type="button" title="The text of the one Markdown file">Markdown</button>
      </div>
      <button class="btn sm select-export" type="button" title="Export the notes in the list, in this order, as Markdown">Export…</button>
      <button aria-label="Close the preview" class="notes-tool select-preview-close" title="Close the preview" type="button">×</button>
    </div>
    <div class="select-preview-body"></div>`
  const previewBody = preview.querySelector('.select-preview-body')

  // ─── State ──────────────────────────────────────────────────────────
  const has = (id) => list.includes(id)
  function changed() {
    drawButtons()
    if (active) drawList()
    if (previewing) drawPreview()
    api.renderTree()
    document.dispatchEvent(new CustomEvent('notes:selection'))
  }
  function set(ids, on) {
    ids.forEach((id) => {
      const at = list.indexOf(id)
      if (on && at < 0) list.push(id)
      if (!on && at >= 0) list.splice(at, 1)
    })
    if (current && !has(current)) current = null
    if (!list.length) setPreview(false)
    changed()
  }
  function clear() {
    list.length = 0
    current = null
    setPreview(false)
    changed()
  }
  function setActive(on) {
    active = Boolean(on)
    if (!active) setPreview(false)
    place()
    pane.hidden = !active
    changed()
  }
  function move(id, toIndex) {
    const from = list.indexOf(id)
    if (from < 0) return
    list.splice(from, 1)
    list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, id)
    changed()
  }

  // Deleted notes leave the list; renamed ones are redrawn.
  function treeChanged() {
    let dropped = false
    for (let i = list.length - 1; i >= 0; i--) {
      if (!api.existsAnywhere(list[i])) {
        list.splice(i, 1)
        dropped = true
      }
    }
    if (dropped) {
      drawButtons()
      document.dispatchEvent(new CustomEvent('notes:selection'))
    }
    if (active) drawList()
  }

  // ─── Placing: beside the tree, or beside the Sealed Notes list ──────
  let paneHandle = null
  function place() {
    Object.values(hosts).forEach((h) => h.covers && h.covers.classList.remove('select-covered'))
    const h = host()
    h.after.after(pane)
    // A drag handle on the list's right edge (notes.js); it moves with it.
    if (!paneHandle && window.NotesSplitter) {
      paneHandle = window.NotesSplitter.attach(pane, { key: 'spellbook_select_pane_width_v1', label: 'Resize the export list' })
    }
    if (paneHandle) paneHandle.follow()
    h.covers.after(preview)
    h.covers.classList.toggle('select-covered', previewing)
  }
  document.addEventListener('notes:sealed-open', (e) => {
    where = e.detail && e.detail.open && hosts.sealed ? 'sealed' : 'tree'
    place()
  })

  // ─── The wide button under each list ────────────────────────────────
  function attach(name, options) {
    hosts[name] = options
    options.button.classList.add('note-select-bar')
    options.button.innerHTML =
      '<button aria-pressed="false" class="btn secondary note-select-open" type="button" title="Gather notes from any search, tome or Archive into an export list, put them in order, preview and export them as Markdown"></button>'
    options.button.querySelector('button').addEventListener('click', () => setActive(!active))
    drawButtons()
  }
  function drawButtons() {
    Object.values(hosts).forEach((h) => {
      const button = h.button.querySelector('button')
      button.textContent = `${active ? 'Close Select & Export' : 'Select & Export'}${list.length ? ` · ${list.length}` : ''}`
      button.setAttribute('aria-pressed', String(active))
      button.classList.toggle('active', active)
    })
  }

  // ─── The list ───────────────────────────────────────────────────────
  function drawList() {
    const items = list.map((id) => ({ id, about: info(id) })).filter((item) => item.about)
    listEl.replaceChildren(
      ...items.map(({ id, about }, index) => {
        const li = document.createElement('li')
        li.className = `select-item${id === current ? ' current' : ''}`
        li.dataset.id = id
        li.draggable = true
        li.tabIndex = 0
        li.setAttribute('role', 'option')
        li.setAttribute('aria-selected', String(id === current))
        li.title = 'Drag to change the order (or Alt+↑/↓). Click to open it.'
        const grip = document.createElement('span')
        grip.className = 'select-grip'
        grip.setAttribute('aria-hidden', 'true')
        grip.textContent = '⋮⋮'
        const number = document.createElement('span')
        number.className = 'select-number'
        number.textContent = `${index + 1}.`
        const text = document.createElement('span')
        text.className = 'select-text'
        const name = document.createElement('span')
        name.className = 'select-name'
        name.textContent = `${about.node.starred ? '★ ' : ''}${about.node.name || 'Untitled'}`
        const place = document.createElement('span')
        place.className = 'select-where'
        place.textContent = [about.tome.name, ...about.path].filter(Boolean).join(' › ') + (about.sealed ? ' · sealed' : '')
        text.append(name, place)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'select-remove'
        remove.textContent = '×'
        remove.title = 'Take it out of the list'
        remove.setAttribute('aria-label', `Take “${about.node.name}” out of the list`)
        li.append(grip, number, text, remove)
        return li
      }),
    )
    const count = items.length
    pane.querySelector('.select-empty').hidden = count > 0
    pane.querySelector('.select-count').textContent = `${count} note${count === 1 ? '' : 's'}`
    pane.querySelectorAll('.select-export').forEach((b) => (b.disabled = !count))
    pane.querySelector('.select-clear').disabled = !count
    previewToggle.disabled = !count
    previewToggle.setAttribute('aria-pressed', String(previewing))
    previewToggle.title = previewing
      ? 'Previewing the export: click to go back to the note'
      : 'Preview the export: every note in this list, in this order, as the one Markdown file'
  }

  function pick(id) {
    current = id
    if (previewing) {
      drawList()
      const section = previewBody.querySelector(`[data-id="${CSS.escape(id)}"]`)
      if (section) section.scrollIntoView({ block: 'start' })
      return
    }
    drawList()
    const about = info(id)
    if (!about) return
    // A sealed note stays in Sealed Notes while that's open.
    if (where === 'sealed' && about.sealed && window.SealedNotes && window.SealedNotes.show(id)) return
    api.openAnywhere(id)
  }

  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.select-item')
    if (!li) return
    if (e.target.closest('.select-remove')) {
      set([li.dataset.id], false)
      return
    }
    pick(li.dataset.id)
  })
  listEl.addEventListener('keydown', (e) => {
    const li = e.target.closest('.select-item')
    if (!li) return
    const id = li.dataset.id
    const at = list.indexOf(id)
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      move(id, at + (e.key === 'ArrowUp' ? -1 : 1))
      const again = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`)
      if (again) again.focus()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling
      if (next) next.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const next = li.nextElementSibling || li.previousElementSibling
      set([id], false)
      const focus = next && listEl.querySelector(`[data-id="${CSS.escape(next.dataset.id)}"]`)
      if (focus) focus.focus()
    }
  })

  // Dragging to reorder.
  let dragId = null
  const clearMarks = () =>
    listEl.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'))
  listEl.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.select-item')
    if (!li) return
    dragId = li.dataset.id
    li.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', li.querySelector('.select-name').textContent)
  })
  listEl.addEventListener('dragover', (e) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const li = e.target.closest('.select-item')
    listEl.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'))
    if (!li || li.dataset.id === dragId) return
    const box = li.getBoundingClientRect()
    li.classList.add(e.clientY < box.top + box.height / 2 ? 'drop-before' : 'drop-after')
  })
  listEl.addEventListener('drop', (e) => {
    if (!dragId) return
    e.preventDefault()
    const target = listEl.querySelector('.drop-before, .drop-after')
    if (target) {
      const after = target.classList.contains('drop-after')
      const id = dragId
      const without = list.filter((x) => x !== id)
      const at = without.indexOf(target.dataset.id) + (after ? 1 : 0)
      move(id, at)
    }
    dragId = null
    clearMarks()
  })
  listEl.addEventListener('dragend', () => {
    dragId = null
    clearMarks()
  })

  pane.querySelector('.select-pane-close').addEventListener('click', () => setActive(false))
  pane.querySelector('.select-clear').addEventListener('click', clear)
  pane.querySelector('.select-add-shown').addEventListener('click', () => set(host().shown(), true))
  previewToggle.addEventListener('click', () => setPreview(!previewing))
  pane.querySelectorAll('.select-export').forEach((b) => b.addEventListener('click', (e) => openExportMenu(e.currentTarget)))
  preview.querySelector('.select-export').addEventListener('click', (e) => openExportMenu(e.currentTarget))
  preview.querySelector('.select-preview-close').addEventListener('click', () => setPreview(false))
  preview.querySelectorAll('[data-as]').forEach((button) =>
    button.addEventListener('click', () => {
      previewAs = button.dataset.as
      preview.querySelectorAll('[data-as]').forEach((b) => {
        b.classList.toggle('active', b === button)
        b.setAttribute('aria-pressed', String(b === button))
      })
      drawPreview()
    }),
  )

  // ─── The export, as one Markdown file ───────────────────────────────
  const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim()
  const headingText = (text) => oneLine(text).replace(/^#+/, (m) => `\\${m}`) || 'Untitled'
  const listed = () => list.map(info).filter(Boolean)

  function aboutLine(about) {
    const parts = [`*${oneLine([about.tome.name, ...about.path].filter(Boolean).join(' › '))}*`]
    const tags = about.node.tags || []
    if (tags.length) parts.push(`Tags: ${tags.map((tag) => `\`${tag}\``).join(', ')}`)
    if (about.sealed) parts.push('Archived')
    return parts.join(' · ')
  }

  function markdownText() {
    const md = window.NotesMarkdown
    if (!md) return ''
    return `${listed()
      .map((about) => {
        const out = [`# ${about.node.starred ? '★ ' : ''}${headingText(about.node.name)}`, '', aboutLine(about)]
        const body = md.noteToMarkdown(about.node.html, about.node.id, { inline: true }).trim()
        if (body) out.push('', body)
        return out.join('\n')
      })
      .join('\n\n---\n\n')}\n`
  }

  // ─── Preview ────────────────────────────────────────────────────────
  function setPreview(on) {
    previewing = Boolean(on) && list.length > 0 && active
    preview.hidden = !previewing
    host().covers.classList.toggle('select-covered', previewing)
    if (previewing) {
      api.flush()
      drawPreview()
      const section = current && previewBody.querySelector(`[data-id="${CSS.escape(current)}"]`)
      if (section) section.scrollIntoView({ block: 'start' })
      else previewBody.scrollTop = 0
    }
    if (active) drawList()
  }

  function drawPreview() {
    if (!previewing) return
    const items = listed()
    preview.querySelector('.select-preview-title').textContent = `Export preview · ${items.length} note${items.length === 1 ? '' : 's'}`
    const top = previewBody.scrollTop
    if (previewAs === 'markdown') {
      const pre = document.createElement('pre')
      pre.className = 'select-preview-markdown'
      // Images are in the file as data; shown here shortened.
      pre.textContent = markdownText().replace(/\(<?data:image\/[a-z0-9.+-]+;base64,[^)>\s]+>?\)/gi, '(data:image… an image, kept in the file)')
      previewBody.replaceChildren(pre)
    } else {
      previewBody.replaceChildren(
        ...items.map((about, index) => {
          const section = document.createElement('article')
          section.className = `select-preview-note${about.node.id === current ? ' current' : ''}`
          section.dataset.id = about.node.id
          const title = document.createElement('h1')
          title.textContent = `${about.node.starred ? '★ ' : ''}${about.node.name || 'Untitled'}`
          const line = document.createElement('p')
          line.className = 'select-preview-about'
          line.textContent = aboutLine(about).replace(/\*/g, '').replace(/`/g, '')
          section.append(title, line)
          if (window.NoteRender) section.append(window.NoteRender.buildBody({ node: about.node }))
          if (index < items.length - 1) section.append(document.createElement('hr'))
          return section
        }),
      )
    }
    previewBody.scrollTop = top
  }

  // Going to a note (the tree, a tome, Sealed Notes) ends the preview.
  document.addEventListener('notes:shown', () => {
    if (previewing) setPreview(false)
  })
  document.addEventListener('notes:starred', () => {
    if (active) drawList()
    if (previewing) drawPreview()
  })

  // ─── Export ─────────────────────────────────────────────────────────
  let menu = null
  const closeMenu = () => {
    if (menu) menu.remove()
    menu = null
  }
  function openExportMenu(anchor) {
    closeMenu()
    menu = document.createElement('div')
    menu.className = 'notes-menu note-select-menu'
    menu.setAttribute('role', 'menu')
    ;[
      ['One Markdown file (.md)', exportOne],
      ['Markdown files, images and attachments (.zip)', exportZip],
    ].forEach(([label, action]) => {
      const item = document.createElement('button')
      item.type = 'button'
      item.setAttribute('role', 'menuitem')
      item.textContent = label
      item.addEventListener('click', () => {
        closeMenu()
        action()
      })
      menu.append(item)
    })
    document.body.append(menu)
    const box = anchor.getBoundingClientRect()
    const own = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - own.width - 8))}px`
    menu.style.top = `${box.bottom + 4 + own.height < innerHeight ? box.bottom + 4 : Math.max(8, box.top - own.height - 4)}px`
    menu.querySelector('button').focus()
  }
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target)) closeMenu()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu) closeMenu()
  })

  function exportOne() {
    api.flush()
    downloadFile(window.DataFile.backupName('spellbook-selected-notes', 'md'), markdownText(), 'text/markdown')
  }

  async function exportZip() {
    const md = window.NotesMarkdown
    if (!md) return
    api.flush()
    // One folder, the notes in the list's order (their front matter's
    // "order"), without subnotes that aren't in the list. Attachments go in
    // attachments/.
    const notes = listed().map((about) => ({ ...JSON.parse(JSON.stringify(about.node)), children: [] }))
    const files = await md.withAttachments(md.buildFiles([{ id: 'selected', name: 'Selected notes', nodes: notes }]))
    downloadFile(window.DataFile.backupName('spellbook-selected-notes', 'zip'), md.zip(files), 'application/zip')
  }

  // ─── The tree's button ──────────────────────────────────────────────
  attach('tree', {
    button: treeButtonHost,
    after: document.getElementById('notes-splitter'),
    covers: document.getElementById('notes-editor-pane'),
    // While searching or filtering, only the matches (not the notes shown
    // because a match is inside them).
    shown: () => {
      const matched = [...document.querySelectorAll('#notes-tree .notes-tree-row.filter-match')]
      const rows = matched.length ? matched : [...document.querySelectorAll('#notes-tree .notes-tree-row')]
      return rows.map((row) => row.parentElement.dataset.id)
    },
  })
  place()

  window.NoteSelect = {
    active: () => active,
    setActive,
    has,
    toggle: (id) => set([id], !has(id)),
    set,
    clear,
    count: () => list.length,
    order: () => [...list],
    attach,
    treeChanged,
    preview: setPreview,
  }
  // Sealed Notes (loaded first) attaches its button once this is here.
  document.dispatchEvent(new CustomEvent('notes:select-ready'))
})()
