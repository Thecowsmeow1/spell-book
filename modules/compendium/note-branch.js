/*
 * The note page (Compendium): the open note is a section under the note
 * toolbar, with its name, tags and Environment variables above its text (as in
 * Sealed Notes). Whole branch (the branch button at the right end of a note's
 * name) adds every note inside it, each in its own section below, all
 * editable unless sealed. The title row above the toolbar stays hidden.
 *
 * There is still one editor (#notes-editor). It sits in the section of the
 * note being edited; the other sections show their notes drawn read-only,
 * the way the Sealed Notes tab does. Clicking a section moves the editor
 * there, loaded with that note, with the caret where you clicked. The title
 * box, the tags row and the Environment variables panel move into that
 * section with it (the title row above hides), so its name, tags and
 * variables are edited in place; saving works as it always does.
 *
 * The branch is the note selected when the view was turned on (or opened with
 * the tree's Open as Whole Branch). Selecting a note inside it moves to that
 * section; selecting one outside it shows that note's branch instead.
 *
 * Saved in the data file (spellbook_note_branch_v1): whether Whole branch is on.
 */
;(function () {
  const KEY = 'spellbook_note_branch_v1'
  const api = window.NotesEditor
  const pane = document.getElementById('notes-editor-pane')
  const editor = document.getElementById('notes-editor')
  const titleInput = document.getElementById('notes-title')
  if (!api || !pane || !editor || !titleInput) return

  let on = false
  try {
    on = Boolean((JSON.parse(localStorage.getItem(KEY) || '{}') || {}).on)
  } catch {}
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ on }))
    } catch {}
  }

  // Where the editor lives when the view is off.
  const home = document.createComment(' the note editor goes back here ')
  editor.before(home)
  // The title box, tags row and Environment panel move into the section
  // being edited, and back here when the view is off.
  const titleHome = document.createComment(' the title box goes back here ')
  titleInput.before(titleHome)
  const tagsEl = () => document.getElementById('notes-tags')
  const envEl = () => pane.querySelector('.env-panel')
  const tagsHome = document.createComment(' the tags row goes back here ')
  const envHome = document.createComment(' the Environment panel goes back here ')
  function markHomes() {
    if (!tagsHome.parentNode && tagsEl()) tagsEl().before(tagsHome)
    if (!envHome.parentNode && envEl()) envEl().before(envHome)
  }
  function moveHeaderTo(section) {
    markHomes()
    section.querySelector('.notes-branch-name').after(titleInput)
    const lock = section.querySelector('.notes-branch-seal')
    if (lock) titleInput.after(lock)
    const rule = section.querySelector('.notes-branch-rule')
    if (tagsEl()) rule.before(tagsEl())
    if (envEl()) rule.before(envEl())
  }
  function moveHeaderHome() {
    titleHome.after(titleInput)
    if (tagsHome.parentNode && tagsEl()) tagsHome.after(tagsEl())
    if (envHome.parentNode && envEl()) envHome.after(envEl())
  }

  const page = document.createElement('div')
  page.className = 'notes-branch'
  page.id = 'notes-branch'
  page.setAttribute('role', 'region')
  page.setAttribute('aria-label', 'Note')
  page.hidden = true
  home.before(page)

  let rootId = null
  let tomeId = null
  let shape = '' // the ids and depths drawn, to know when to redraw
  let activeId = null
  let fromPage = false // the last move to a note was a click on this page
  const sections = new Map() // note id -> section element

  // ─── Drawing ────────────────────────────────────────────────────────
  // The root first, then (in Whole branch) every note inside it, depth first,
  // as in the tree.
  function branchOf(root, whole = on) {
    const list = []
    const walk = (node, depth) => {
      list.push({ node, depth })
      // Archived notes inside it only while the tree shows them.
      if (whole)
        node.children.forEach((child) => {
          if (child.sealed && api.showArchived && !api.showArchived()) return
          walk(child, depth + 1)
        })
    }
    walk(root, 0)
    return list
  }


  // ─── Note bars ──────────────────────────────────────────────────────
  // The bar down the left of each note: the colors of the tree's level dots,
  // the accent color, or plain grey. Click a bar to go to the next; Settings →
  // Compendium has the same choice, and whether notes inside others are
  // indented. Saved in the data file (spellbook_note_bars_v1).
  const BARS_KEY = 'spellbook_note_bars_v1'
  const BAR_COLORS = ['level', 'accent', 'plain']
  const BAR_NAMES = { level: 'level colors', accent: 'the accent color', plain: 'plain grey' }
  function loadBars() {
    try {
      const saved = JSON.parse(localStorage.getItem(BARS_KEY) || '{}') || {}
      return { color: BAR_COLORS.includes(saved.color) ? saved.color : 'level', indent: saved.indent !== false }
    } catch {
      return { color: 'level', indent: true }
    }
  }
  let bars = loadBars()
  const nextColor = () => BAR_COLORS[(BAR_COLORS.indexOf(bars.color) + 1) % BAR_COLORS.length]
  const barTitle = () =>
    `Note bars: ${BAR_NAMES[bars.color]}. Click for ${BAR_NAMES[nextColor()]} (more in Settings → Compendium)`
  function applyBars() {
    document.documentElement.dataset.noteBars = bars.color
    document.documentElement.dataset.noteIndent = bars.indent ? 'on' : 'off'
    const title = barTitle()
    document.querySelectorAll('.notes-branch-bar').forEach((bar) => {
      bar.title = title
    })
    document.querySelectorAll("input[name='note-bars']").forEach((radio) => {
      radio.checked = radio.value === bars.color
    })
    const indentBox = document.getElementById('note-indent')
    if (indentBox) indentBox.checked = bars.indent
  }
  function setBars(change) {
    bars = { ...bars, ...change }
    try {
      localStorage.setItem(BARS_KEY, JSON.stringify(bars))
    } catch {}
    applyBars()
  }
  function barButton() {
    const bar = document.createElement('button')
    bar.type = 'button'
    bar.tabIndex = -1
    bar.className = 'notes-branch-bar'
    bar.title = barTitle()
    bar.setAttribute('aria-label', 'Change the color of the note bars')
    return bar
  }
  // For Sealed Notes, which draws its notes the same way.
  window.NoteBars = { button: barButton, cycle: () => setBars({ color: nextColor() }) }

  window.SpellBook.settingsSection({
    id: 'compendium-note-bars',
    tab: 'compendium',
    label: 'Compendium',
    order: 42,
    render(section) {
      section.innerHTML = `
        <div class="settings-data-section">
          <h3>Note bars</h3>
          <fieldset class="layout-options">
            <legend>The bar down the left of each note</legend>
            <label><input name="note-bars" type="radio" value="level"/> Level colors (as the tree's dots)</label>
            <label><input name="note-bars" type="radio" value="accent"/> Accent color</label>
            <label><input name="note-bars" type="radio" value="plain"/> Plain grey</label>
          </fieldset>
          <label class="check-row"><input id="note-indent" type="checkbox"/> Indent the notes inside others (Whole branch)</label>
          <span class="form-hint">Clicking a note's bar also switches its color.</span>
        </div>
        <div class="settings-data-section">
          <h3>Note titles</h3>
          <fieldset class="layout-options">
            <legend>The size of notes' names</legend>
            <label><input name="note-titles" type="radio" value="small"/> Small</label>
            <label><input name="note-titles" type="radio" value="medium"/> Medium</label>
            <label><input name="note-titles" type="radio" value="large"/> Large</label>
          </fieldset>
          <span class="form-hint">A note's name is its heading: the note on its own, or the top note of a
            Whole branch, is largest, and the notes inside it are a step smaller for each level.</span>
        </div>`
    },
  })
  document.querySelectorAll("input[name='note-bars']").forEach((radio) =>
    radio.addEventListener('change', () => radio.checked && setBars({ color: radio.value })),
  )
  const indentBox = document.getElementById('note-indent')
  if (indentBox) indentBox.addEventListener('change', () => setBars({ indent: indentBox.checked }))
  applyBars()

  // ─── Note titles ────────────────────────────────────────────────────
  // Names are headings: the note on its own (or a branch's top note) largest,
  // the notes inside it a step smaller per level, like H1, H2 and H3. Settings →
  // Compendium sets them all small, medium or large. Saved in the data file
  // (spellbook_note_titles_v1).
  const TITLES_KEY = 'spellbook_note_titles_v1'
  const TITLE_SIZES = ['small', 'medium', 'large']
  function loadTitles() {
    try {
      const saved = localStorage.getItem(TITLES_KEY)
      return TITLE_SIZES.includes(saved) ? saved : 'medium'
    } catch {
      return 'medium'
    }
  }
  function applyTitles(size) {
    document.documentElement.dataset.noteTitles = size
    document.querySelectorAll("input[name='note-titles']").forEach((radio) => {
      radio.checked = radio.value === size
    })
  }
  document.querySelectorAll("input[name='note-titles']").forEach((radio) =>
    radio.addEventListener('change', () => {
      if (!radio.checked) return
      try {
        if (radio.value === 'medium') localStorage.removeItem(TITLES_KEY)
        else localStorage.setItem(TITLES_KEY, radio.value)
      } catch {}
      applyTitles(radio.value)
    }),
  )
  applyTitles(loadTitles())

  // ─── The name box fits its name, so the lock follows the name ───────
  const fieldSizing = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  function fitTitle() {
    if (!fieldSizing) titleInput.size = Math.max(4, (titleInput.value || titleInput.placeholder || '').length + 1)
  }
  titleInput.addEventListener('input', fitTitle)

  // ─── Locks ──────────────────────────────────────────────────────────
  // A sealed note's lock, just after its name: click it to unseal (the
  // seal that covers it, which may be a note above it or the tome).
  function lockTitle(node) {
    const seal = api.sealOf ? api.sealOf(node.id) : null
    if (!seal || seal === node) return 'Archived: read-only. Click to unarchive it.'
    const tome = Array.isArray(seal.nodes)
    return `Archived by ${tome ? `the “${seal.name}” tome` : `“${seal.name}”`}: read-only. Click to unarchive ${tome ? 'the tome' : 'it'}.`
  }

  const sealMark = () => {
    const mark = document.createElement('button')
    mark.type = 'button'
    mark.tabIndex = -1
    mark.className = 'notes-branch-seal'
    mark.setAttribute('aria-label', 'Archived: unarchive')
    mark.innerHTML =
      '<svg aria-hidden="true" fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="13"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg>'
    return mark
  }

  function drawHead(section, node) {
    const head = section.querySelector('.notes-branch-head')
    head.querySelector('.notes-branch-name').textContent = node.name || 'Untitled'
    const star = head.querySelector('.notes-branch-star')
    star.classList.toggle('on', Boolean(node.starred))
    star.textContent = node.starred ? '★' : '☆'
    star.title = node.starred ? 'Starred: click to unstar' : 'Star this note (a favorite)'
    star.setAttribute('aria-label', node.starred ? `Unstar “${node.name}”` : `Star “${node.name}”`)
    // The note's tags under its name, as in Sealed Notes; click one to
    // filter the tree by it.
    const tags = Array.isArray(node.tags) ? node.tags : []
    const tagBox = section.querySelector('.notes-branch-tags')
    const editable = !api.isSealed(node.id)
    const tagsKey = JSON.stringify([tags, editable])
    if (tagBox.dataset.tags !== tagsKey) {
      tagBox.dataset.tags = tagsKey
      // A note you can edit shows "+ add tag" too, as the open note's row
      // does, so the rows don't move when you select another note.
      const add = document.createElement('span')
      add.className = 'tag-add-wrap'
      add.innerHTML = '<input class="tag-add-input" placeholder="+ add tag" readonly tabindex="-1" aria-hidden="true">'
      tagBox.replaceChildren(
        // The same chips the selected note's tag row draws (notes.js
        // drawNoteTags): with an × on a note you can edit.
        ...tags.map((tag) => {
          const chip = document.createElement('span')
          chip.className = editable ? 'tag-chip editable' : 'tag-chip'
          chip.dataset.tag = tag
          chip.textContent = tag
          chip.title = `Show the notes tagged "${tag}"`
          if (editable) {
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.tabIndex = -1
            remove.className = 'tag-x'
            remove.textContent = '×'
            remove.title = `Remove the tag "${tag}"`
            remove.setAttribute('aria-label', `Remove the tag ${tag}`)
            chip.append(remove)
          }
          return chip
        }),
        ...(editable ? [add] : []),
      )
    }
    tagBox.hidden = !tags.length && !editable
    // Its Environment variables, as a line like the panel's (the panel itself
    // moves in when the note is clicked).
    const vars = window.NoteEnv ? window.NoteEnv.varsOf(node.id).filter((v) => v.name) : []
    const envLine = section.querySelector('.notes-branch-env')
    envLine.textContent = `Variables (${vars.length})`
    envLine.title = vars.map((v) => v.label || v.name).join(', ')
    // Always there (as the open note's panel is), so selecting another note
    // doesn't move things around; only a sealed note without any hides it,
    // as its panel does.
    envLine.hidden = !vars.length && api.isSealed(node.id)
    drawBranchButton(head.querySelector('.notes-branch-btn'), node, on && node.id === rootId)
    const sealed = api.isSealed(node.id)
    let mark = head.querySelector('.notes-branch-seal')
    if (sealed && !mark) {
      mark = sealMark()
      // Right after the name (the name box, in the note being edited).
      ;(head.contains(titleInput) ? titleInput : head.querySelector('.notes-branch-name')).after(mark)
    }
    if (!sealed && mark) mark.remove()
    if (sealed) mark.title = lockTitle(node)
    section.classList.toggle('is-sealed', sealed)
  }


  // The branch button at the right end of a note's name line: on for the
  // note whose whole branch is shown (click to show it alone); off, it shows
  // that note with every note inside it. A note with none inside it has
  // nothing more to show.
  function drawBranchButton(button, node, pressed) {
    const kids = Array.isArray(node.children) && node.children.length > 0
    button.setAttribute('aria-pressed', String(pressed))
    button.disabled = !pressed && !kids
    button.title = pressed
      ? 'Whole branch is on: click to show this note alone'
      : kids
        ? 'Whole branch: show this note with every note inside it, on one page'
        : 'Whole branch: no notes inside this one'
    button.setAttribute('aria-label', pressed ? 'Show this note alone' : 'Show this note with every note inside it')
  }

  function newSection({ node, depth }, absoluteDepth) {
    const section = document.createElement('section')
    section.className = 'notes-branch-note'
    section.dataset.id = node.id
    section.style.setProperty('--depth', depth)
    // Its name's heading size (notes.css): 0 for the top note, up to 3.
    section.dataset.depth = String(Math.min(depth, 3))
    section.dataset.level = String(absoluteDepth % 5)
    const head = document.createElement('div')
    head.className = 'notes-branch-head'
    const name = document.createElement('span')
    name.className = 'notes-branch-name'
    const star = document.createElement('button')
    star.type = 'button'
    star.tabIndex = -1
    star.className = 'notes-star notes-branch-star'
    const branchButton = document.createElement('button')
    branchButton.type = 'button'
    branchButton.tabIndex = -1
    branchButton.className = 'notes-tool notes-branch-toggle notes-branch-btn'
    branchButton.innerHTML = '<span aria-hidden="true" class="nav-icon nav-icon-branch"></span>'
    head.append(star, name, branchButton)
    const tagBox = document.createElement('div')
    tagBox.className = 'entry-tags notes-branch-tags'
    tagBox.setAttribute('aria-label', 'Tags')
    const envLine = document.createElement('div')
    envLine.className = 'notes-branch-env'
    // A line between the note's name, tags and variables and its text (the
    // moved tags row and Environment panel go before it).
    const rule = document.createElement('div')
    rule.className = 'notes-branch-rule'
    const slot = document.createElement('div')
    slot.className = 'notes-branch-slot'
    section.append(barButton(), head, tagBox, envLine, rule, slot)
    drawHead(section, node)
    return section
  }

  // A note not being edited: drawn read-only when it scrolls near the screen.
  const lazy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        lazy.unobserve(entry.target)
        fillPreview(entry.target.closest('.notes-branch-note'))
      })
    },
    { root: page, rootMargin: '800px 0px' },
  )

  function fillPreview(section) {
    if (!section || section.dataset.id === activeId) return
    const node = api.findNode(section.dataset.id)
    const slot = section.querySelector('.notes-branch-slot')
    if (!node || !window.NoteRender) return
    // A note you can edit looks just as it does when selected (code boxes,
    // template controls); it's inert, so a click selects the note and then
    // lands on the same spot in the editor (activate).
    const editable = !api.isSealed(node.id)
    const body = window.NoteRender.buildBody({ node, editable })
    body.classList.add('notes-branch-preview')
    if (editable) {
      body.inert = true
      body.classList.add('looks-editable')
    }
    if (!body.textContent.trim() && !body.querySelector('img, table, .note-command, .note-block-section')) {
      body.classList.add('is-blank')
      body.dataset.placeholder = api.isSealed(node.id) ? 'Empty' : 'Empty: click to write'
    }
    slot.replaceChildren(body)
    section.classList.add('drawn')
    // Drawn locked or editable: sync redraws it when that changes.
    section.dataset.locked = String(!editable)
  }

  function emptySlot(section) {
    const slot = section.querySelector('.notes-branch-slot')
    slot.replaceChildren()
    section.classList.remove('drawn')
    lazy.observe(slot)
  }

  // Redraws every section, keeping the editor (and what's typed in it).
  function rebuild(root) {
    const rootDepth = api.depthOf(root.id)
    sections.clear()
    lazy.disconnect()
    const fragment = document.createDocumentFragment()
    branchOf(root).forEach((item) => {
      const section = newSection(item, rootDepth + item.depth)
      sections.set(item.node.id, section)
      fragment.appendChild(section)
    })
    // Moved out first, so replacing the sections doesn't drop them.
    home.before(editor)
    moveHeaderHome()
    page.replaceChildren(fragment)
    activeId = null
    sections.forEach((section) => emptySlot(section))
  }

  // ─── Keeping up with the Compendium ─────────────────────────────────
  // Called by notes.js after the tree redraws and after a note is shown.
  function sync() {
    const selected = api.selectedNode()
    if (!selected) {
      leave()
      return
    }
    // Whole branch keeps its root while you move around inside it; a note on
    // its own is its own root.
    let root = on && rootId && api.tomeId() === tomeId ? api.findNode(rootId) : null
    if (!root || (root.id !== selected.id && !api.isInside(selected.id, root))) root = selected
    rootId = root.id
    tomeId = api.tomeId()
    const nextShape = `${on ? 'branch' : 'note'}|${branchOf(root)
      .map(({ node, depth }) => `${node.id}:${depth}`)
      .join(',')}`
    if (page.hidden) {
      page.hidden = false
      pane.classList.add('branch-view')
    }
    if (nextShape !== shape) {
      shape = nextShape
      rebuild(root)
    }
    sections.forEach((section, id) => {
      const node = api.findNode(id)
      if (!node) return
      drawHead(section, node)
      // Archived or unarchived since it was drawn (its templates and code
      // look different): drawn again at once, not only when selected.
      if (id !== activeId && section.classList.contains('drawn') && section.dataset.locked !== String(api.isSealed(id))) fillPreview(section)
    })
    placeEditor(selected.id)
    fitTitle()
  }

  function placeEditor(id) {
    const section = sections.get(id)
    if (!section) return
    if (activeId !== id) {
      const before = activeId && sections.get(activeId)
      activeId = id
      if (before) {
        before.classList.remove('active')
        emptySlot(before)
        // Drawn from what was just saved, at once, so the page doesn't jump.
        fillPreview(before)
        lazy.unobserve(before.querySelector('.notes-branch-slot'))
      }
      const slot = section.querySelector('.notes-branch-slot')
      lazy.unobserve(slot)
      slot.replaceChildren(editor)
      moveHeaderTo(section)
      section.classList.add('active', 'drawn')
      if (!fromPage) section.scrollIntoView({ block: 'start' })
    }
    fromPage = false
  }

  function leave() {
    if (page.hidden) return
    lazy.disconnect()
    home.before(editor)
    moveHeaderHome()
    page.replaceChildren()
    page.hidden = true
    pane.classList.remove('branch-view')
    sections.clear()
    shape = ''
    activeId = null
    rootId = null
    editor.scrollTop = 0
  }

  // ─── Moving between notes on the page ───────────────────────────────
  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
    if (document.caretPositionFromPoint) {
      const at = document.caretPositionFromPoint(x, y)
      if (!at) return null
      const range = document.createRange()
      range.setStart(at.offsetNode, at.offset)
      return range
    }
    return null
  }

  function activate(section, x, y) {
    const id = section.dataset.id
    if (id === activeId) return
    // Keep the clicked note where it is on screen while the one above it
    // changes from editor to drawing.
    const top = section.getBoundingClientRect().top
    fromPage = true
    api.selectNode(id)
    page.scrollTop += section.getBoundingClientRect().top - top
    if (api.isSealed(id)) return
    editor.focus({ preventScroll: true })
    const range = x == null ? null : caretAt(x, y)
    const selection = getSelection()
    selection.removeAllRanges()
    if (range && editor.contains(range.startContainer)) {
      selection.addRange(range)
    } else {
      const start = document.createRange()
      start.selectNodeContents(editor)
      start.collapse(true)
      selection.addRange(start)
    }
    // The note was drawn as the editor draws it, so the same control is now
    // under the pointer: a field gets the cursor, a Copy button copies.
    if (x == null) return
    const hit = document.elementFromPoint(x, y)
    if (!hit || !section.contains(hit) || !(editor.contains(hit) || hit.closest('#notes-tags'))) return
    const field = hit.closest('input, textarea, select')
    if (field && !field.disabled) field.focus({ preventScroll: true })
    else {
      const copy = hit.closest('.note-code-copy, .nb-export, .sealed-copy, #notes-tags .tag-x')
      if (copy) copy.click()
    }
  }

  page.addEventListener('click', (e) => {
    // The space below the last note: write at the end of the open note.
    if (e.target === page && activeId && !api.isSealed(activeId)) {
      editor.focus()
      // After a card, template or code block that ends the note, a new line.
      const last = editor.lastElementChild
      if (last && last.matches('.note-command, pre.note-code')) {
        const line = document.createElement('p')
        line.appendChild(document.createElement('br'))
        last.after(line)
        if (api.afterEdit) api.afterEdit()
      }
      const end = document.createRange()
      end.selectNodeContents(editor.lastElementChild || editor)
      end.collapse(false)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(end)
      return
    }
    const section = e.target.closest('.notes-branch-note')
    if (!section) return
    if (e.target.closest('.notes-branch-bar')) {
      window.NoteBars.cycle()
      return
    }
    if (e.target.closest('.notes-branch-seal')) {
      if (section.dataset.id !== api.selectedId()) api.selectNode(section.dataset.id)
      const unseal = document.getElementById('notes-unseal')
      if (unseal) unseal.click()
      return
    }
    // The moved title box, tags row and Environment panel handle their own clicks.
    if (e.target.closest('#notes-title, #notes-tags, .env-panel')) return
    // (Its × selects the note first, then removes the tag: see activate.)
    const chip = !e.target.closest('.tag-x') && e.target.closest('.notes-branch-tags .tag-chip')
    if (chip) {
      if (api.addTagFilter) api.addTagFilter(chip.dataset.tag)
      return
    }
    if (e.target.closest('.notes-branch-star')) {
      const node = api.findNode(section.dataset.id)
      if (node && api.setStar) api.setStar(node.id, !node.starred)
      return
    }
    const branchButton = e.target.closest('.notes-branch-btn')
    if (branchButton) {
      if (branchButton.getAttribute('aria-pressed') === 'true') window.NoteBranch.close(section.dataset.id)
      else window.NoteBranch.open(section.dataset.id)
      return
    }
    if (section.dataset.id === activeId) {
      // The name heads the editor's own note: put the caret at its start.
      if (e.target.closest('.notes-branch-head') && !api.isSealed(activeId)) editor.focus()
      return
    }
    // Copy buttons in drawn code still copy.
    const copy = e.target.closest('.notes-branch-preview .sealed-copy')
    if (copy) {
      const code = copy.parentElement.querySelector('code')
      if (code && navigator.clipboard) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          copy.textContent = 'Copied!'
          setTimeout(() => (copy.textContent = 'Copy'), 1200)
        })
      }
      return
    }
    if (e.target.closest('.notes-branch-preview a')) e.preventDefault()
    const varsLine = e.target.closest('.notes-branch-env')
    const addTag = e.target.closest('.notes-branch-tags .tag-add-input')
    activate(section, e.target.closest('.notes-branch-head') || varsLine || addTag ? null : e.clientX, e.clientY)
    // Its Variables line opens the panel that takes its place; its
    // "+ add tag" goes to the real tag box.
    const panel = varsLine && section.querySelector('.env-panel')
    if (panel) panel.open = true
    const tagInput = addTag && section.querySelector('#notes-tags .tag-add-input')
    if (tagInput) tagInput.focus()
  })

  // The floating table and image tools follow the note as the page scrolls.
  page.addEventListener('scroll', () => editor.dispatchEvent(new Event('scroll')))

  // The name in the section heading follows the title box as you type.
  titleInput.addEventListener('input', () => {
    const section = activeId && sections.get(activeId)
    if (section) section.querySelector('.notes-branch-name').textContent = titleInput.value || 'Untitled'
  })

  // ─── Whole branch on and off (the branch buttons) ───────────────────
  function setOn(value) {
    on = Boolean(value)
    save()
    sync()
  }

  // A variable added, renamed or removed changes the sections' lines.
  if (window.NoteEnv) {
    window.NoteEnv.onChange(() => {
      sections.forEach((section, id) => {
        const node = api.findNode(id)
        if (node) drawHead(section, node)
      })
    })
  }

  window.NoteBranch = {
    sync,
    isOn: () => on,
    // A pressed branch button: this note on its own.
    close(id) {
      setOn(false)
      if (id && id !== api.selectedId()) api.selectNode(id)
    },
    // The tree's Open as Whole Branch: this note, with all inside it.
    open(id) {
      rootId = id
      tomeId = api.tomeId()
      if (id !== api.selectedId()) api.selectNode(id)
      setOn(true)
      const section = sections.get(id)
      if (section) section.scrollIntoView({ block: 'start' })
    },
  }

  setOn(on)
})()
