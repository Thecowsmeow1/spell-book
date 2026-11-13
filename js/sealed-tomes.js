/*
 * Sealed Tomes: sealed Compendium nodes shown as read-only, on a
 * "Sealed Tomes" tab in the Compendium's tab row (after the tomes).
 *
 * Loaded after notes.js (window.NotesEditor), whose sanitizer and card drawing
 * it reuses so it looks like the note. Listed are the outermost sealed
 * node of a branch, or a top-level node of a sealed tome. Sealing is the only
 * read-only mechanism: there is no separate flag, and no separate page.
 *
 * Two halves:
 *   1. Compendium side: an "Environment" panel under the node name. Each row
 *      is a variable: Component (what it is), Variable (the text in the note
 *      that gets replaced, such as <dc.ip>), Default value, Ghost text (the
 *      faded hint for what to type) and Description. It stays editable on a
 *      sealed node because it is not part of the note's text.
 *   2. Sealed Tomes tab: lists them. An open note starts with an Environment
 *      table (Component | Value | Description) whose Value cells are inputs
 *      showing the ghost text. What you type replaces the variable everywhere
 *      in the note below, as you type (plain text, one pass, longest name
 *      first, case sensitive). An empty value leaves the variable as written.
 *      Command and script cards are left as they are. The note is never
 *      changed, so the editor always shows the variable names.
 *
 * Storage (spellbook_ prefix, so data-file snapshots include both):
 *   spellbook_sealed_env_v1        { [nodeId]: { vars: [{ label, name, value, hint, description }] } }
 *   spellbook_sealed_env_values_v1  { [nodeId]: { [variable name]: typed value } }
 * Only nodes with variables have entries; entries for deleted nodes are
 * ignored. A typed value wins over the default value. Styles: css/sealed-tomes.css.
 */
;(() => {
  const api = window.NotesEditor
  const NOTES_KEY = 'spellbook_notes_v1'
  const ENV_KEY = 'spellbook_sealed_env_v1'
  const VALUES_KEY = 'spellbook_sealed_env_values_v1'
  const notesPage = document.getElementById('page-notes')
  const tabsEl = document.getElementById('notes-tabs')
  const notesBody = document.getElementById('notes-body')
  const title = document.getElementById('notes-title')
  if (!api || !notesPage || !tabsEl || !notesBody || !title) return
  // The Sealed Tomes view sits beside the tree and editor in the Compendium page
  // and replaces them while its tab is open.
  const page = document.createElement('div')
  page.className = 'sealed-pane'
  page.hidden = true
  notesBody.after(page)

  // ─── Storage ────────────────────────────────────────────────────────
  // The keys were renamed during development; carry over anything saved under
  // the old names once.
  try {
    ;[
      ['spellbook_guides_v1', ENV_KEY],
      ['spellbook_guide_values_v1', VALUES_KEY],
    ].forEach(([old, current]) => {
      const value = localStorage.getItem(old)
      if (value === null) return
      if (localStorage.getItem(current) === null) localStorage.setItem(current, value)
      localStorage.removeItem(old)
    })
  } catch {}
  const text = (value) => (typeof value === 'string' ? value : '')

  function readJson(key) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      return stored && typeof stored === 'object' ? stored : {}
    } catch {
      return {}
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }

  function loadEnv() {
    const clean = {}
    Object.entries(readJson(ENV_KEY)).forEach(([id, entry]) => {
      const vars = Array.isArray(entry && entry.vars) ? entry.vars : []
      clean[id] = {
        vars: vars
          .filter((v) => v && typeof v === 'object')
          .map((v) => ({
            label: text(v.label),
            name: text(v.name),
            value: text(v.value),
            hint: text(v.hint),
            description: text(v.description),
          })),
      }
    })
    return clean
  }

  const saveEnv = (envs) => writeJson(ENV_KEY, envs)
  const loadValues = () => readJson(VALUES_KEY)

  // What a variable is replaced with: the typed value, else the default.
  function effectiveVars(id, vars) {
    const typed = loadValues()[id] || {}
    return vars.map((v) => ({
      ...v,
      current: typeof typed[v.name] === 'string' ? typed[v.name] : v.value,
    }))
  }

  // ─── Compendium side: variables for the open node ───────────────────
  const panel = document.createElement('details')
  panel.className = 'env-panel'
  panel.innerHTML = `
    <summary class="env-summary"></summary>
    <div class="env-vars">
      <div class="env-status"></div>
      <div class="env-vars-help">On the Sealed Tomes tab these become an Environment table. Whatever is typed in a Value box replaces the Variable text everywhere in the note. Use names you won't type by accident, such as <code>&lt;dc.ip&gt;</code> or <code>{{DOMAIN}}</code>. Ghost text is the faded hint shown in an empty Value box.</div>
      <div class="env-var-rows">
        <div class="env-var-row env-var-header"><span>Component</span><span>Variable</span><span>Default value</span><span>Ghost text</span><span>Description</span><span></span></div>
      </div>
      <div class="env-var-list"></div>
      <button class="btn secondary sm" id="env-add-var" type="button">+ Variable</button>
    </div>`
  title.after(panel)
  const summary = panel.querySelector('.env-summary')
  const status = panel.querySelector('.env-status')
  const rowsBox = panel.querySelector('.env-var-list')
  let shownId = null

  const setSummary = (count) => {
    summary.textContent = count ? `Environment variables (${count})` : 'Environment variables'
  }

  const FIELDS = [
    ['label', 'Component', 'Domain'],
    ['name', 'Variable name', '<dc.domain>'],
    ['value', 'Default value', 'optional'],
    ['hint', 'Ghost text', 'replace with your domain'],
    ['description', 'Description', ''],
  ]

  function drawRows(vars) {
    setSummary(vars.length)
    rowsBox.replaceChildren(
      ...vars.map((variable, index) => {
        const row = document.createElement('div')
        row.className = 'env-var-row'
        FIELDS.forEach(([key, label, placeholder]) => {
          const input = document.createElement('input')
          input.type = 'text'
          input.placeholder = placeholder
          input.value = variable[key]
          input.setAttribute('aria-label', label)
          if (key === 'name') input.classList.add('env-var-name')
          input.addEventListener('input', () => update((v) => (v[index][key] = input.value)))
          row.append(input)
        })
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'env-var-remove'
        remove.textContent = '×'
        remove.title = 'Remove this variable'
        remove.setAttribute('aria-label', 'Remove this variable')
        remove.addEventListener('click', () => {
          update((v) => v.splice(index, 1))
          drawRows(varsOf(shownId))
        })
        row.append(remove)
        return row
      }),
    )
  }

  const varsOf = (id) => (loadEnv()[id] || { vars: [] }).vars

  // Changes the open node's variables and saves; no variables, no entry.
  function update(change) {
    if (!shownId) return
    const envs = loadEnv()
    const vars = (envs[shownId] || { vars: [] }).vars
    change(vars)
    if (vars.length) envs[shownId] = { vars }
    else delete envs[shownId]
    saveEnv(envs)
    setSummary(vars.length)
  }

  function syncPanel() {
    const node = api.selectedNode()
    shownId = node ? node.id : null
    status.textContent = !node
      ? ''
      : api.isSealed(node.id)
        ? 'This node is sealed, so it is listed under Sealed Tomes.'
        : 'Seal this node (right-click it in the tree, then Seal Branch) to list it under Sealed Tomes.'
    drawRows(varsOf(shownId))
  }

  panel.querySelector('#env-add-var').addEventListener('click', () => {
    update((v) => v.push({ label: '', name: '', value: '', hint: '', description: '' }))
    drawRows(varsOf(shownId))
    const last = rowsBox.querySelector('.env-var-row:last-child input')
    if (last) last.focus()
  })
  document.addEventListener('notes:shown', syncPanel)
  syncPanel()

  // ─── Sealed Tomes view ────────────────────────────────────────────────────
  page.innerHTML = `
    <aside aria-label="Sealed tomes" class="sealed-list-pane"><ul class="sealed-list" role="listbox"></ul></aside>
    <div class="sealed-view">
      <div class="sealed-empty">
        <p>Nothing sealed yet.</p>
        <p>Right-click a node in the tree and choose <strong>Seal Branch</strong> (or seal a whole tome). Sealed nodes appear here, read-only.</p>
      </div>
      <header class="sealed-head">
        <div class="sealed-title-row"><h2 class="sealed-title"></h2><a class="btn secondary sm sealed-edit">Open in Compendium</a></div>
        <div class="sealed-path"></div>
      </header>
      <div class="sealed-body-wrap">
        <section class="sealed-env" hidden>
          <h3>Environment</h3>
          <table class="sealed-env-table">
            <thead><tr><th>Component</th><th>Value</th><th>Description</th></tr></thead>
            <tbody></tbody>
          </table>
        </section>
        <div class="sealed-body-slot"></div>
      </div>
    </div>`
  const listEl = page.querySelector('.sealed-list')
  const view = page.querySelector('.sealed-view')
  const bodyWrap = page.querySelector('.sealed-body-wrap')
  const bodySlot = page.querySelector('.sealed-body-slot')
  const envBox = page.querySelector('.sealed-env')
  const envRows = envBox.querySelector('tbody')
  const editLink = page.querySelector('.sealed-edit')
  let selected = null
  let current = null // the entry on show: { node, path, vars }

  // The outermost sealed nodes, in tree order, with "Tome › parents" paths.
  function sealedNodes() {
    const stored = readJson(NOTES_KEY)
    const tomes = Array.isArray(stored.tomes)
      ? stored.tomes
      : [{ name: '', nodes: stored.nodes }]
    const envs = loadEnv()
    const found = []
    const walk = (list, parents, inherited) => {
      ;(Array.isArray(list) ? list : []).forEach((node) => {
        if (!node || typeof node.id !== 'string') return
        if (node.sealed || inherited) {
          const entry = envs[node.id]
          found.push({ node, path: parents.join(' › '), vars: entry ? entry.vars : [] })
          return
        }
        walk(node.children, [...parents, node.name], false)
      })
    }
    tomes.forEach((tome) => {
      if (tome && typeof tome === 'object') {
        walk(tome.nodes, tome.name ? [tome.name] : [], Boolean(tome.sealed))
      }
    })
    return found
  }

  // One pass over the text so a value that contains another name is not
  // replaced again. A variable with no value is left as written.
  function substituter(vars) {
    const map = new Map(vars.filter((v) => v.name && v.current).map((v) => [v.name, v.current]))
    if (!map.size) return null
    const names = [...map.keys()]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(names.join('|'), 'g')
    return (value) => value.replace(regex, (hit) => map.get(hit))
  }

  function applyVariables(root, vars) {
    const replace = substituter(vars)
    if (!replace) return
    const texts = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest('.note-command')) {
        texts.push(walker.currentNode)
      }
    }
    texts.forEach((node) => {
      node.nodeValue = replace(node.nodeValue)
    })
    root.querySelectorAll('a[href]:not(.note-term)').forEach((link) => {
      if (!link.closest('.note-command')) {
        link.setAttribute('href', replace(link.getAttribute('href')))
      }
    })
  }

  // Stored code blocks are <pre data-lang="bash">text</pre>: draw them colored
  // and still, with a Copy button, instead of as the editor's code boxes.
  function drawCodeBlocks(root) {
    if (typeof highlightCode !== 'function') return
    root.querySelectorAll(':scope > pre').forEach((pre) => {
      pre.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
      const code_text = pre.textContent
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'copy-btn'
      copy.textContent = 'Copy'
      const code = document.createElement('code')
      code.innerHTML = highlightCode(
        code_text,
        window.NoteCodeLang
          ? window.NoteCodeLang.resolve(pre.dataset.lang || 'auto', code_text)
          : pre.dataset.lang || 'generic',
      )
      pre.className = 'cmd sealed-code'
      pre.replaceChildren(copy, code)
    })
  }

  function buildBody(entry) {
    const body = document.createElement('div')
    body.className = 'notes-editor sealed-body'
    body.innerHTML = api.sanitize(entry.node.html || '')
    api.cardsIn(body).forEach(api.drawCard)
    api.termLinksIn(body).forEach(api.drawTermLink)
    // drawCard locks fields to the seal of the note open in the Compendium; the
    // cards in a sealed note are tools, so they always work.
    body.querySelectorAll('.note-command [data-var]').forEach((control) => {
      control.disabled = false
    })
    applyVariables(body, effectiveVars(entry.node.id, entry.vars))
    drawCodeBlocks(body)
    body.querySelectorAll('a[href^="http"], a[href^="mailto:"]').forEach((link) => {
      link.target = '_blank'
      link.rel = 'noopener'
    })
    return body
  }

  // Redraws only the note text, so typing in the table keeps its focus and
  // the page keeps its place.
  function renderBody() {
    if (!current) return
    const top = bodyWrap.scrollTop
    bodySlot.replaceChildren(buildBody(current))
    bodyWrap.scrollTop = top
  }

  function renderEnvironment(entry) {
    const vars = effectiveVars(entry.node.id, entry.vars).filter((v) => v.name)
    envBox.hidden = !vars.length
    envRows.replaceChildren(
      ...vars.map((variable) => {
        const row = document.createElement('tr')
        const label = document.createElement('td')
        label.textContent = variable.label || variable.name
        const valueCell = document.createElement('td')
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'sealed-env-input'
        input.value = variable.current
        input.placeholder = variable.hint || variable.name
        input.title = variable.name
        input.setAttribute('aria-label', variable.label || variable.name)
        input.spellcheck = false
        input.addEventListener('input', () => {
          const all = loadValues()
          all[entry.node.id] = { ...(all[entry.node.id] || {}), [variable.name]: input.value }
          writeJson(VALUES_KEY, all)
          renderBody()
        })
        valueCell.append(input)
        const description = document.createElement('td')
        description.textContent = variable.description
        row.append(label, valueCell, description)
        return row
      }),
    )
  }

  function render() {
    api.flush()
    const entries = sealedNodes()
    page.classList.toggle('is-empty', !entries.length)
    if (!entries.some((e) => e.node.id === selected)) {
      selected = entries[0] ? entries[0].node.id : null
    }
    listEl.replaceChildren(
      ...entries.map((entry) => {
        const li = document.createElement('li')
        li.setAttribute('role', 'option')
        li.tabIndex = 0
        li.dataset.id = entry.node.id
        li.setAttribute('aria-selected', String(entry.node.id === selected))
        li.className = `sealed-item${entry.node.id === selected ? ' selected' : ''}`
        const name = document.createElement('span')
        name.className = 'sealed-item-name'
        name.textContent = entry.node.name || 'Untitled'
        li.append(name)
        if (entry.path) {
          const path = document.createElement('span')
          path.className = 'sealed-item-path'
          path.textContent = entry.path
          li.append(path)
        }
        return li
      }),
    )
    current = entries.find((e) => e.node.id === selected) || null
    if (!current) {
      bodySlot.replaceChildren()
      envBox.hidden = true
      return
    }
    view.querySelector('.sealed-title').textContent = current.node.name || 'Untitled'
    view.querySelector('.sealed-path').textContent = current.path
    editLink.href = `#/compendium/${encodeURIComponent(current.node.id)}`
    renderEnvironment(current)
    bodySlot.replaceChildren(buildBody(current))
    bodyWrap.scrollTop = 0
  }

  const choose = (li) => {
    if (!li || li.dataset.id === selected) return
    selected = li.dataset.id
    render()
  }
  listEl.addEventListener('click', (e) => choose(e.target.closest('li[data-id]')))
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(e.target.closest('li[data-id]'))
    }
  })

  // Command card inputs and Copy buttons still work in a read-only sealed note.
  bodySlot.addEventListener('input', (e) => {
    const card = e.target.closest('.note-command')
    if (card) api.updateGeneratedCommand(card)
  })
  bodySlot.addEventListener('click', (e) => {
    const copy = e.target.closest('.copy-btn')
    if (!copy) return
    navigator.clipboard.writeText(copy.parentElement.querySelector('code').textContent).then(() => {
      copy.textContent = 'Copied!'
      setTimeout(() => {
        copy.textContent = 'Copy'
      }, 1200)
    })
  })

  // ─── The tab ────────────────────────────────────────────────────────
  // Drawn each time it opens, so seals and edits made in the Compendium show up.
  const tab = document.createElement('button')
  tab.type = 'button'
  tab.className = 'notes-tab notes-tab-sealed'
  tab.setAttribute('role', 'tab')
  tab.setAttribute('aria-selected', 'false')
  tab.title = 'Every sealed branch and tome, read-only'
  tab.innerHTML = '<span>Sealed Tomes</span>'
  tabsEl.after(tab)

  function setOpen(open) {
    if (open === !page.hidden) return
    if (open) render()
    page.hidden = !open
    notesPage.classList.toggle('sealed-open', open)
    tab.setAttribute('aria-selected', String(open))
  }
  tab.addEventListener('click', () => setOpen(true))
  // Any tome tab, and any move to a note, goes back to the tree and editor.
  tabsEl.addEventListener('click', () => setOpen(false))
  document.addEventListener('notes:shown', () => setOpen(false))
  editLink.addEventListener('click', () => setOpen(false))
})()
