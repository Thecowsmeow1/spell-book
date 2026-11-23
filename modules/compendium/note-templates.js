/*
 * Note presets: "New from Note Preset" in the Compendium. (In the UI,
 * "Templates" are the record sections of note-blocks.js; these whole-note
 * starters are "Note Presets". The code still says template: the stored
 * `template` flag, ids and function names are kept so saved data loads.)
 *
 * A note preset is any node marked "Use as Note Preset" (right-click in
 * the tree), in any tome. New from Note Preset copies it, with its subnodes,
 * after (or inside) the selected node: headings, text, cards and template
 * sections come along as they are, so a new note starts with the note
 * template's layout and empty sections to fill in. The copy is an ordinary
 * note: not a note preset, not sealed. Links between notes inside it point
 * at their copies.
 *
 * The starter "MCA Hunt" preset follows spell-book-hk's hunt page: the
 * overview headings, a Systems section and a Log section. Loaded after
 * notes.js (window.NotesEditor) and note-blocks.js (window.NoteBlocks).
 * Styles: note-templates.css.
 */
;(() => {
  const api = window.NotesEditor
  if (!api || !api.insertBranch) return
  const $ = (id) => document.getElementById(id)
  const STARTER_NAME = 'MCA Hunt'

  // ─── Dialog ─────────────────────────────────────────────────────────
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'template-modal'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'template-modal-title')
  overlay.innerHTML = `
    <div class="modal template-dialog">
      <h2 id="template-modal-title">New from Note Preset</h2>
      <div class="template-has">
        <div class="form-group">
          <label for="template-pick">Note preset</label>
          <select id="template-pick"></select>
          <div class="form-hint" id="template-where"></div>
        </div>
      </div>
      <div class="template-none" id="template-none">
        <p>No note presets yet.</p>
        <p class="form-hint">Write a note the way every new one should start: headings, text, and template sections (<strong>Insert Template</strong>, the table button on the toolbar) such as Systems or a Log. Then right-click it in the tree and choose <strong>Use as Note Preset</strong>. Its subnodes are copied too.</p>
      </div>
      <button class="link-btn template-starter" id="template-starter" type="button">Add the starter MCA Hunt note preset</button>
      <div class="modal-actions">
        <button class="btn secondary" id="template-cancel" type="button">Cancel</button>
        <button class="btn" id="template-create" type="button">Create</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  const pick = $('template-pick')
  const createBtn = $('template-create')
  const starterBtn = $('template-starter')

  let templates = []
  let asChild = false
  let lastTemplateId = null
  let opener = null

  function where() {
    const node = api.selectedNode()
    if (!node) return 'Added to this tome.'
    return asChild ? `Added inside “${node.name}”.` : `Added after “${node.name}”.`
  }

  function refresh(selectId) {
    templates = api.listTemplates()
    const has = templates.length > 0
    overlay.querySelector('.template-has').hidden = !has
    $('template-none').hidden = has
    createBtn.disabled = !has
    starterBtn.hidden = templates.some((t) => t.name === STARTER_NAME)
    pick.replaceChildren(
      ...templates.map((t) => {
        const option = document.createElement('option')
        option.value = t.id
        // Where it is: its tome, then the nodes above it.
        const above = t.path.split(' › ').slice(0, -1)
        option.textContent = `${t.name} (${[t.tomeName, ...above].join(' › ')})`
        return option
      }),
    )
    const wanted = [selectId, lastTemplateId].find((id) => id && templates.some((t) => t.id === id))
    if (wanted) pick.value = wanted
    $('template-where').textContent = where()
  }

  function open(child = false) {
    if (api.addLocked(child)) return
    api.flush()
    asChild = child
    opener = document.activeElement
    refresh()
    overlay.classList.add('open')
    ;(templates.length ? pick : starterBtn).focus()
  }

  function close() {
    overlay.classList.remove('open')
    if (opener && opener.isConnected) opener.focus()
  }

  // ─── Copying ────────────────────────────────────────────────────────
  function copyBranch(template) {
    const renames = new Map()
    const mapIds = (n) => {
      renames.set(n.id, api.newId())
      n.children.forEach(mapIds)
    }
    mapIds(template)
    const copy = (n) => {
      let html = api.sanitize(n.html)
      // Links between notes of the template point at their copies.
      renames.forEach((to, from) => {
        if (html.includes(from)) html = html.split(from).join(to)
      })
      return { id: renames.get(n.id), name: n.name, html, children: n.children.map(copy), collapsed: false, sealed: false, ...(n.tags && n.tags.length ? { tags: [...n.tags] } : {}) }
    }
    return copy(template)
  }

  function create() {
    const template = templates.find((t) => t.id === pick.value)
    if (!template) return
    lastTemplateId = template.id
    overlay.classList.remove('open')
    if (api.insertBranch(copyBranch(template.node), asChild)) api.startRename()
  }

  // ─── Starter preset ───────────────────────────────────────────────
  // Malicious Cyber Activity hunt, after spell-book-hk's hunt page.
  function starterTemplate() {
    const section = (typeId) => (window.NoteBlocks ? window.NoteBlocks.starterSectionHtml(typeId) : '')
    const blank = '<p><br></p>'
    return {
      id: api.newId(),
      name: STARTER_NAME,
      template: true,
      collapsed: false,
      sealed: false,
      children: [],
      html: [
        '<h2>Overview</h2>',
        '<p><b>Status:</b> active</p>',
        '<p><b>Tags:</b> </p>',
        '<p><b>References:</b> </p>',
        '<h2>Objectives</h2>',
        '<ol><li><br></li></ol>',
        '<h2>Lines of Effort</h2>',
        '<ol><li><br></li></ol>',
        '<h2>Limit of Advance</h2>',
        blank,
        '<h2>Break Contact Criteria</h2>',
        blank,
        '<h2>Systems</h2>',
        section('bt-system'),
        '<h2>Log</h2>',
        section('bt-log'),
        '<h2>Assessment</h2>',
        blank,
        '<h2>Research Required</h2>',
        '<ul><li><br></li></ul>',
        '<h2>Notes</h2>',
        blank,
      ].join(''),
    }
  }

  // ─── Events ─────────────────────────────────────────────────────────
  $('notes-add-template').addEventListener('click', () => open(false))
  createBtn.addEventListener('click', create)
  $('template-cancel').addEventListener('click', close)
  starterBtn.addEventListener('click', () => {
    const branch = starterTemplate()
    const tome = api.addToTemplatesTome(branch)
    refresh(branch.id)
    $('template-where').textContent = `${where()} The note preset itself is in the “${tome.name}” tab, where you can change it.`
    pick.focus()
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter' && e.target !== $('template-cancel') && e.target !== starterBtn) {
      e.preventDefault()
      create()
    }
  })

  window.NoteTemplates = { open }
})()
