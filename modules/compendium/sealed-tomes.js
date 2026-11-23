/*
 * Sealed Notes: sealed Compendium nodes shown as read-only, on a
 * "Sealed Notes" tab in the Compendium's tab row (after the tomes).
 *
 * Loaded after notes.js (window.NotesEditor), whose sanitizer and card drawing
 * it reuses so it looks like the note. Listed are each sealed branch (or
 * each top-level node of a sealed tome) with every note inside it, indented.
 * A note's page shows it, then the notes inside it under their names, so
 * opening a branch shows the whole branch. Sealing is the only
 * read-only mechanism: there is no separate flag, and no separate page.
 *
 * Two halves:
 *   1. Compendium side: an "Environment variables" panel under the node name.
 *      Each row is a variable: its Name and its Value. "Advanced" also shows
 *      Component (what it is), Default value (used while Value is empty),
 *      Ghost text (the faded hint in an empty Value box) and Description. It
 *      stays editable on a sealed node because it is not part of the note's
 *      text. Variables go into the note as chips (Insert Variable or Alt+V,
 *      note-vars.js) that show the value, or the name while there is none.
 *      The note stores which variable each chip is, never a name to search
 *      for, so no notation in a note can be mistaken for a variable.
 *   2. Sealed Notes tab: lists them. An open note starts with an Environment
 *      table (Component | Value | Description) whose Value cells are inputs
 *      showing the ghost text; they change the same values as the panel.
 *      The note is never changed by a value.
 *
 * Storage (spellbook_ prefix, so data-file snapshots include both):
 *   spellbook_sealed_env_v1        { [nodeId]: { vars: [{ id, label, name, value, hint, description }] } }
 *                                  (value is the Default value)
 *   spellbook_sealed_env_values_v1  { [nodeId]: { [variable id]: typed value } }
 *                                  (older ones are keyed by the variable's name)
 *   spellbook_env_removed_v1        { [nodeId]: { [variable id]: variable } } removed from
 *                                  the panel, so a chip left in the note can bring it back
 *   spellbook_env_advanced_v1       '1' while the panel shows the Advanced columns
 *   spellbook_sealed_tab_v1         (no longer read: the Archive tab always shows)
 *   spellbook_sealed_tags_v1        'hidden' when Settings → Compendium hides tags in the Archive
 *   spellbook_sealed_branch_v1      'off' when the Whole branch button shows a note without the notes inside it
 * Only nodes with variables have entries; entries for deleted nodes are
 * ignored. Variables saved before ids existed get one the first time they
 * load. Styles: sealed-tomes.css, note-vars.css.
 */
;(() => {
  const api = window.NotesEditor
  const NOTES_KEY = 'spellbook_notes_v1'
  const ENV_KEY = 'spellbook_sealed_env_v1'
  const VALUES_KEY = 'spellbook_sealed_env_values_v1'
  const REMOVED_KEY = 'spellbook_env_removed_v1'
  const notesPage = document.getElementById('page-notes')
  const tabsEl = document.getElementById('notes-tabs')
  const notesBody = document.getElementById('notes-body')
  const title = document.getElementById('notes-title')
  if (!api || !notesPage || !tabsEl || !notesBody || !title) return
  // The Sealed Notes view sits beside the tree and editor in the Compendium page
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
      // The notes live in IndexedDB through js/core/datafile.js.
      const read = window.DataFile && window.DataFile.getItem ? window.DataFile.getItem(key) : localStorage.getItem(key)
      const stored = JSON.parse(read || '{}')
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

  const VAR_ID = /^[\w-]{1,60}$/
  const newVarId = () => `var-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

  function loadEnv() {
    const clean = {}
    let missingIds = false
    Object.entries(readJson(ENV_KEY)).forEach(([id, entry]) => {
      const vars = Array.isArray(entry && entry.vars) ? entry.vars : []
      clean[id] = {
        vars: vars
          .filter((v) => v && typeof v === 'object')
          .map((v) => {
            let varId = typeof v.id === 'string' && VAR_ID.test(v.id) ? v.id : ''
            if (!varId) {
              varId = newVarId()
              missingIds = true
            }
            return {
              id: varId,
              label: text(v.label),
              name: text(v.name),
              value: text(v.value),
              hint: text(v.hint),
              description: text(v.description),
            }
          }),
      }
    })
    if (missingIds) saveEnv(clean)
    return clean
  }

  function saveEnv(envs) {
    writeJson(ENV_KEY, envs)
  }
  const loadValues = () => readJson(VALUES_KEY)

  // The value typed for a variable ('' for none). Older values are keyed by
  // the variable's name.
  function typedValue(typed, v) {
    if (typeof typed[v.id] === 'string') return typed[v.id]
    return typeof typed[v.name] === 'string' ? typed[v.name] : ''
  }

  // Each variable with what it stands for now: the typed value, else the
  // default value ('' when neither is set).
  function effectiveVars(id, vars) {
    const typed = loadValues()[id] || {}
    return vars.map((v) => ({ ...v, typed: typedValue(typed, v), current: typedValue(typed, v) || v.value }))
  }

  function setValue(nodeId, varId, value) {
    const all = loadValues()
    all[nodeId] = { ...(all[nodeId] || {}), [varId]: value }
    writeJson(VALUES_KEY, all)
    changed()
  }

  // Chips (note-vars.js) redraw when a name or value changes.
  const changeListeners = new Set()
  const changed = (info) => changeListeners.forEach((listener) => listener(info))

  // ─── Compendium side: variables for the open node ───────────────────
  const ADVANCED_KEY = 'spellbook_env_advanced_v1'
  const panel = document.createElement('details')
  panel.className = 'env-panel'
  panel.innerHTML = `
    <summary class="env-summary"></summary>
    <div class="env-vars">
      <button aria-pressed="false" class="btn secondary sm env-advanced" id="env-advanced" title="Show more columns: Component, Default value, Ghost text and Description" type="button">Advanced</button>
      <div class="env-tools">
        <button class="btn secondary sm env-convert" type="button" hidden></button>
      </div>
      <div class="env-var-row env-var-header"></div>
      <div class="env-var-list"></div>
      <button class="btn secondary sm" id="env-add-var" title="Add a variable. Alt+V in the note adds one too: type a new name and press Enter to make it and put it at the cursor." type="button">+ <svg aria-hidden="true" class="btn-icon" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3"></path><path d="M16 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3"></path><path d="m10 10 4 4M14 10l-4 4"></path></svg>Variable</button>
    </div>`
  // Under the tags row (or the title, if there's no tags row).
  ;(document.getElementById('notes-tags') || title).after(panel)
  const summary = panel.querySelector('.env-summary')
  const header = panel.querySelector('.env-var-header')
  const rowsBox = panel.querySelector('.env-var-list')
  const advancedBox = panel.querySelector('#env-advanced')
  const convertButton = panel.querySelector('.env-convert')
  const addButton = panel.querySelector('#env-add-var')
  let shownId = null

  const setSummary = (count) => {
    summary.textContent = `Variables (${count})`
  }

  // [key, heading, placeholder, shown only in Advanced]. 'typed' is the Value.
  const FIELDS = [
    ['name', 'Name', 'dc.ip', false],
    ['typed', 'Value', 'value', false],
    ['label', 'Component', 'Domain controller', true],
    ['value', 'Default value', 'used while Value is empty', true],
    ['hint', 'Ghost text', 'hint shown in an empty Value box', true],
    ['description', 'Description', '', true],
  ]
  const isAdvanced = () => {
    try {
      return localStorage.getItem(ADVANCED_KEY) === '1'
    } catch {
      return false
    }
  }
  const shownFields = () => FIELDS.filter((field) => !field[3] || isAdvanced())

  // The column headings and a row per variable, for the open note's panel
  // and for Sealed Notes' panels. locked (a sealed note): only the Values
  // can be typed in; no removing or renaming. onValue: after a Value changes.
  function variableRows(nodeId, vars, { locked, onValue } = {}) {
    const headings = [
      ...shownFields().map(([, heading]) => Object.assign(document.createElement('span'), { textContent: heading })),
      document.createElement('span'),
    ]
    const rows = effectiveVars(nodeId, vars).map((variable, index) => {
      const row = document.createElement('div')
      row.className = 'env-var-row'
      shownFields().forEach(([key, label, placeholder]) => {
        const input = document.createElement('input')
        input.type = 'text'
        input.spellcheck = false
        input.placeholder = key === 'typed' ? variable.hint || variable.value || placeholder : placeholder
        input.value = variable[key]
        input.setAttribute('aria-label', label)
        if (key === 'name' || key === 'typed' || key === 'value') input.classList.add('env-var-mono')
        if (locked && key !== 'typed') {
          input.readOnly = true
          input.tabIndex = -1
        }
        input.addEventListener('input', () => {
          if (key === 'typed') {
            setValue(nodeId, variable.id, input.value)
            if (onValue) onValue()
          } else if (!locked) {
            let before = ''
            update((v) => {
              before = v[index][key]
              v[index][key] = input.value
            })
            // Code blocks name their variables, so they follow a rename.
            changed(key === 'name' ? { rename: [before, input.value] } : undefined)
            if (key === 'name') showConvert()
          }
        })
        row.append(input)
      })
      if (locked) {
        row.append(document.createElement('span'))
        return row
      }
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'env-var-remove'
      remove.textContent = '×'
      remove.title = 'Remove this variable (its chips in the note show the name, dashed)'
      remove.setAttribute('aria-label', 'Remove this variable')
      remove.addEventListener('click', () => {
        update((v) => {
          // Kept, so a chip of it left in the note can restore it.
          const [gone] = v.splice(index, 1)
          if (gone) {
            const removed = readJson(REMOVED_KEY)
            removed[shownId] = { ...(removed[shownId] || {}), [gone.id]: gone }
            writeJson(REMOVED_KEY, removed)
          }
        })
        drawRows(varsOf(shownId))
        changed()
        showConvert()
      })
      row.append(remove)
      return row
    })
    return { headings, rows }
  }

  function drawRows(vars) {
    setSummary(vars.length)
    advancedBox.setAttribute('aria-pressed', String(isAdvanced()))
    advancedBox.classList.toggle('active', isAdvanced())
    panel.classList.toggle('advanced', isAdvanced())
    // A sealed note's variables are read-only but for their Values.
    const locked = Boolean(shownId && api.isSealed(shownId))
    const { headings, rows } = variableRows(shownId, vars, { locked })
    header.replaceChildren(...headings)
    rowsBox.replaceChildren(...rows)
    addButton.hidden = locked
    showConvert()
  }

  advancedBox.addEventListener('click', () => {
    try {
      localStorage.setItem(ADVANCED_KEY, isAdvanced() ? '0' : '1')
    } catch {}
    drawRows(varsOf(shownId))
    // Sealed Notes' panels follow it too.
    if (current) renderBody()
  })

  // ─── Older notes: names written as text ─────────────────────────────
  // Variables used to be found by searching the note for their names. Notes
  // written that way show a button that turns those names into chips; only
  // the note's own text, not code blocks, cards or links.
  function textMatches() {
    const node = api.selectedNode()
    const vars = varsOf(shownId).filter((v) => v.name.trim())
    if (!node || node.id !== shownId || !vars.length || api.isSealed(node.id)) return null
    const byName = new Map(vars.map((v) => [v.name, v]))
    const pattern = new RegExp(
      [...byName.keys()]
        .sort((a, b) => b.length - a.length)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|'),
      'g',
    )
    const found = []
    // Code blocks: names outside the variables already in them.
    const codes = []
    const marks = window.NoteVars ? window.NoteVars.CODE_MARKS : null
    if (marks) {
      api.codeBlocksIn(api.editor).forEach((block) => {
        const input = block.querySelector('.note-code-input')
        if (input.readOnly) return
        let hits = 0
        input.value.split(marks.split).forEach((part, i) => {
          if (i % 2 === 0) hits += [...part.matchAll(pattern)].length
        })
        if (hits) codes.push({ block, input, hits })
      })
    }
    const walker = document.createTreeWalker(api.editor, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode
      if (textNode.parentElement.closest('[contenteditable="false"], .note-var, a, code, pre, .nb-rich')) continue
      const hits = [...textNode.nodeValue.matchAll(pattern)]
      if (hits.length) found.push({ textNode, hits })
    }
    return {
      byName,
      pattern,
      found,
      codes,
      count: found.reduce((sum, f) => sum + f.hits.length, 0) + codes.reduce((sum, c) => sum + c.hits, 0),
    }
  }

  function showConvert() {
    const matches = textMatches()
    const count = matches ? matches.count : 0
    convertButton.hidden = !count
    convertButton.textContent = `Make chips of ${count} name${count === 1 ? '' : 's'} written in the note`
  }

  convertButton.addEventListener('click', () => {
    const matches = textMatches()
    if (!matches || !matches.count) return
    matches.found.forEach(({ textNode, hits }) => {
      const parts = []
      let at = 0
      hits.forEach((hit) => {
        if (hit.index > at) parts.push(document.createTextNode(textNode.nodeValue.slice(at, hit.index)))
        const v = matches.byName.get(hit[0])
        const chip = document.createElement('span')
        chip.className = 'note-var'
        chip.dataset.varId = v.id
        chip.dataset.varName = v.name
        chip.textContent = v.name
        parts.push(chip)
        at = hit.index + hit[0].length
      })
      if (at < textNode.nodeValue.length) parts.push(document.createTextNode(textNode.nodeValue.slice(at)))
      textNode.replaceWith(...parts)
    })
    const marks = window.NoteVars ? window.NoteVars.CODE_MARKS : null
    matches.codes.forEach(({ block, input }) => {
      input.value = input.value
        .split(marks.split)
        .map((part, i) => (i % 2 === 0 ? part.replace(matches.pattern, (hit) => marks.open + hit + marks.close) : part))
        .join('')
      api.renderCodeView(block)
    })
    if (window.NoteVars) window.NoteVars.draw(api.editor)
    api.afterEdit()
    showConvert()
  })
  api.editor.addEventListener('input', () => {
    if (panel.open) showConvert()
  })
  panel.addEventListener('toggle', showConvert)

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
    drawRows(varsOf(shownId))
    // A sealed note's variables can't change, so with none there's nothing to show.
    panel.hidden = Boolean(node && api.isSealed(node.id) && !varsOf(node.id).length)
  }

  window.NoteEnv = {
    // For duplicating and note presets: a copy keeps its variables (with
    // their ids, so the copied chips still match).
    varsOf: (id) => varsOf(id).map((v) => ({ ...v })),
    setVars(id, vars) {
      const envs = loadEnv()
      if (vars.length) envs[id] = { vars }
      else delete envs[id]
      saveEnv(envs)
      if (id === shownId) drawRows(varsOf(id))
      changed()
    },
    // For note-vars.js: the node's variables with their current values.
    variables: (id) => (id ? effectiveVars(id, varsOf(id)) : []),
    // Adds a variable named `name` to the node; returns it.
    add(id, name) {
      const envs = loadEnv()
      const vars = (envs[id] || { vars: [] }).vars
      const variable = { id: newVarId(), label: '', name, value: '', hint: '', description: '' }
      vars.push(variable)
      envs[id] = { vars }
      saveEnv(envs)
      if (id === shownId) {
        drawRows(varsOf(id))
        panel.open = true
      }
      changed()
      return { ...variable, typed: '', current: '' }
    },
    onChange: (listener) => changeListeners.add(listener),
    // A removed variable as it was (its last value too), from its id and
    // the name saved with its chip; null when there's nothing to go on.
    removed(id, varId, name) {
      if (!id || !varId) return null
      const kept = (readJson(REMOVED_KEY)[id] || {})[varId]
      const variable = kept
        ? { id: varId, label: text(kept.label), name: text(kept.name) || name, value: text(kept.value), hint: text(kept.hint), description: text(kept.description) }
        : { id: varId, label: '', name: name || '', value: '', hint: '', description: '' }
      return effectiveVars(id, [variable])[0]
    },
    // Puts a removed variable back in the node, with the same id, so its
    // chips show it again.
    restore(id, varId, name) {
      const variable = window.NoteEnv.removed(id, varId, name)
      if (!variable) return
      const envs = loadEnv()
      const vars = (envs[id] || { vars: [] }).vars
      if (!vars.some((v) => v.id === varId)) {
        const { typed, current, ...fields } = variable
        vars.push(fields)
        envs[id] = { vars }
        saveEnv(envs)
      }
      const removed = readJson(REMOVED_KEY)
      if (removed[id]) {
        delete removed[id][varId]
        if (!Object.keys(removed[id]).length) delete removed[id]
        if (Object.keys(removed).length) writeJson(REMOVED_KEY, removed)
        else
          try {
            localStorage.removeItem(REMOVED_KEY)
          } catch {}
      }
      if (id === shownId) drawRows(varsOf(id))
      changed()
    },
  }

  panel.querySelector('#env-add-var').addEventListener('click', () => {
    update((v) => v.push({ id: newVarId(), label: '', name: '', value: '', hint: '', description: '' }))
    drawRows(varsOf(shownId))
    const last = rowsBox.querySelector('.env-var-row:last-child input')
    if (last) last.focus()
  })
  document.addEventListener('notes:shown', syncPanel)
  syncPanel()

  // ─── Sealed Notes view ────────────────────────────────────────────────────
  page.innerHTML = `
    <aside aria-label="Archived notes" class="sealed-list-pane">
      <div class="notes-search-row">
      <input aria-label="Search archived notes" class="notes-tree-search sealed-search" placeholder="Search archived notes…" title="Searches the notes' names, tags and text, and their tome's name" type="search"/>
      <button aria-pressed="false" class="notes-star-filter sealed-star-filter" title="Show only starred notes" type="button">☆</button>
      </div>
      <div class="notes-tag-box sealed-tag-box">
        <div class="tag-filter-wrap">
          <label for="sealed-tag-filter">Tag</label>
          <input autocomplete="off" id="sealed-tag-filter" placeholder="Show notes with these tags…" title="Show only the archived notes carrying every chosen tag" type="text"/>
        </div>
        <div class="active-tags sealed-active-tags" hidden></div>
        <div class="tag-suggestions notes-tag-suggestions sealed-tag-suggestions" hidden></div>
      </div>
      <div aria-label="Search scope" class="notes-scope sealed-scope" role="group">
        <button aria-pressed="false" class="notes-scope-btn" data-scope="tomename" title="Search only the names of the tomes: shows every archived note in the tomes whose name matches" type="button">Tome name</button>
        <button aria-pressed="true" class="notes-scope-btn active" data-scope="all" title="Search and show the archived notes of every tome" type="button">All tomes</button>
        <button aria-pressed="false" class="notes-scope-btn" data-scope="tome" title="Search and show only the open note's tome" type="button">This tome</button>
        <button aria-pressed="false" class="notes-scope-btn" data-scope="branch" title="Search and show only the open note and the notes inside it" type="button">This branch</button>
      </div>
      <ul aria-label="Archived notes" class="sealed-list" role="listbox"></ul>
      <p class="sealed-none" hidden>No archived notes match</p>
      <div class="sealed-select-bar"></div>
    </aside>
    <div class="sealed-view">
      <div class="sealed-empty">
        <p>Nothing archived yet.</p>
        <p>Right-click a node in the tree and choose <strong>Archive Branch</strong> (or archive a whole tome). Archived nodes appear here, read-only.</p>
      </div>
      <header class="sealed-head">
        <div class="sealed-title-row"><button class="notes-star sealed-star" type="button"></button><h2 class="sealed-title"></h2><a class="btn secondary sm sealed-edit sealed-source"></a></div>
        <div aria-label="Tags" class="entry-tags sealed-tags sealed-head-tags" hidden></div>
        <div class="sealed-path" hidden></div>
      </header>
      <div class="sealed-body-wrap">
        <section class="sealed-env" hidden>
          <h3>Variables</h3>
          <table class="sealed-env-table">
            <thead><tr><th>Component</th><th>Value</th><th>Description</th></tr></thead>
            <tbody></tbody>
          </table>
        </section>
        <div class="sealed-body-slot"></div>
      </div>
    </div>`
  const listEl = page.querySelector('.sealed-list')
  // A drag handle on the list's right edge (notes.js), like the tree's.
  const listHandle =
    window.NotesSplitter &&
    window.NotesSplitter.attach(page.querySelector('.sealed-list-pane'), {
      key: 'spellbook_sealed_list_width_v1',
      label: 'Resize the Archive list',
    })
  const view = page.querySelector('.sealed-view')
  const bodyWrap = page.querySelector('.sealed-body-wrap')
  const bodySlot = page.querySelector('.sealed-body-slot')
  const envBox = page.querySelector('.sealed-env')
  const envRows = envBox.querySelector('tbody')
  const editLink = page.querySelector('.sealed-edit')
  let selected = null
  let current = null // the entry on show: { node, path, vars }

  // Sealed notes in tree order: each outermost sealed node with a
  // "Tome › parents" path (depth 0), then the notes inside it (depth 1 and on).
  function sealedNodes() {
    const stored = readJson(NOTES_KEY)
    const tomes = Array.isArray(stored.tomes)
      ? stored.tomes
      : [{ name: '', nodes: stored.nodes }]
    const envs = loadEnv()
    const found = []
    const walk = (list, parents, inherited, tome) => {
      ;(Array.isArray(list) ? list : []).forEach((node) => {
        if (!node || typeof node.id !== 'string') return
        if (node.sealed || inherited) {
          const add = (item, path, depth) => {
            const entry = envs[item.id]
            // inside: the path within the tome (the list's tome box names the tome).
            const inside = tome.name && path.startsWith(tome.name) ? path.slice(tome.name.length).replace(/^ › /, '') : path
            found.push({ node: item, path, inside, depth, tome, vars: entry ? entry.vars : [] })
            ;(Array.isArray(item.children) ? item.children : []).forEach((child) => {
              if (child && typeof child.id === 'string') add(child, `${path ? `${path} › ` : ''}${item.name}`, depth + 1)
            })
          }
          add(node, parents.join(' › '), 0)
          return
        }
        walk(node.children, [...parents, node.name], false, tome)
      })
    }
    tomes.forEach((tome, index) => {
      if (tome && typeof tome === 'object') {
        const info = { id: tome.id || `tome-${index}`, name: tome.name || '', sealed: Boolean(tome.sealed) }
        walk(tome.nodes, tome.name ? [tome.name] : [], Boolean(tome.sealed), info)
      }
    })
    return found
  }

  // Stored code blocks are <pre data-lang="bash">text</pre>: draw them colored
  // and still, with a Copy button, instead of as the editor's code boxes.
  function drawCodeBlocks(root, nodeId) {
    if (typeof highlightCode !== 'function') return
    root.querySelectorAll(':scope > pre').forEach((pre) => {
      pre.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
      const code_text = pre.textContent
      // Copy as the editor's code box has it (a sealed note's, which shows
      // only Copy at the top right).
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'btn secondary sm sealed-copy'
      copy.textContent = 'Copy'
      const code = document.createElement('code')
      const lang = window.NoteCodeLang
        ? window.NoteCodeLang.resolve(pre.dataset.lang || 'auto', code_text)
        : pre.dataset.lang || 'generic'
      // Variables show their values; Copy copies what is shown.
      code.innerHTML = window.NoteVars
        ? window.NoteVars.codeHtml(code_text, lang, true, nodeId)
        : highlightCode(code_text, lang)
      pre.className = 'cmd sealed-code'
      pre.replaceChildren(copy, code)
    })
  }

  // entry.editable: drawn as the editor draws it (Branch view's notes that
  // aren't sealed), with the code boxes and template controls; otherwise
  // read-only, as in Sealed Notes.
  function buildBody(entry) {
    const editable = Boolean(entry.editable)
    const body = document.createElement('div')
    body.className = 'notes-editor sealed-body'
    body.innerHTML = api.sanitize(entry.node.html || '')
    api.cardsIn(body).forEach(api.drawCard)
    api.termLinksIn(body).forEach(api.drawTermLink)
    // Block sections (note-blocks.js) are shown, not edited, here; cards in
    // their Rich text fields are drawn with them.
    if (window.NoteBlocks) {
      body.querySelectorAll('.note-block-section').forEach((section) => window.NoteBlocks.draw(section, { readOnly: !editable }))
    }
    // An archived note is locked everywhere (the Archive tab and Branch view):
    // its cards' fields can't be changed; only its Variables' Values can.
    body.querySelectorAll('.note-command [data-var]').forEach((control) => {
      control.disabled = !editable
    })
    // Variable chips show this note's values (note-vars.js).
    if (window.NoteVars) window.NoteVars.draw(body, entry.node.id)
    if (editable && api.drawCodeBlock) {
      body.querySelectorAll(':scope > pre').forEach((pre) => {
        api.drawCodeBlock(pre, { sealed: false, nodeId: entry.node.id })
        if (window.NoteCodeSave) window.NoteCodeSave.addMenu(pre.querySelector('.note-code-head'))
      })
    } else drawCodeBlocks(body, entry.node.id)
    // For the chips' tooltip (note-vars.js).
    body.dataset.envNode = entry.node.id
    body.querySelectorAll('a[href^="http"], a[href^="mailto:"]').forEach((link) => {
      link.target = '_blank'
      link.rel = 'noopener'
    })
    return body
  }

  // Branch view (note-branch.js) draws the notes it isn't editing this way.
  window.NoteRender = { buildBody }

  // Whole branch (the branch button on each note in the list): on, a note's
  // page shows every note inside it, like the Compendium's Branch view, with
  // no page header; off, just the note under its header. On unless turned off.
  const BRANCH_KEY = 'spellbook_sealed_branch_v1'
  const wholeBranch = () => {
    try {
      return localStorage.getItem(BRANCH_KEY) !== 'off'
    } catch {
      return true
    }
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

  function setWholeBranch(on) {
    try {
      if (on) localStorage.removeItem(BRANCH_KEY)
      else localStorage.setItem(BRANCH_KEY, 'off')
    } catch {}
  }

  // "Open in <tome>": the note in its tome, to edit or unseal it.
  function sourceLink(node, tomeName) {
    const link = document.createElement('a')
    link.className = 'btn secondary sm sealed-source'
    fillSourceLink(link, node, tomeName)
    return link
  }
  function fillSourceLink(link, node, tomeName) {
    link.href = `#/compendium/${encodeURIComponent(node.id)}`
    link.textContent = tomeName ? `Open in ${tomeName}` : 'Open in tome'
    link.title = `Open “${node.name || 'Untitled'}” in ${tomeName ? `the “${tomeName}” tome` : 'its tome'}, to edit or unarchive it`
  }

  // Whole branch: the note, then every note inside it, drawn like the
  // Compendium's Branch view (note-branch.js): a section per note, indented
  // with a bar in its level's color, its name (with its star), its tags and
  // its text. "open ›" shows that note on its own page.
  function branchSection(node, depth, level, active, tomeName) {
    const section = document.createElement('section')
    // Never 'active': nothing is selected here, so no note is highlighted
    // (active: the top note, whose branch button shows Whole branch).
    section.className = 'notes-branch-note drawn'
    section.dataset.id = node.id
    section.dataset.level = String(level % 5)
    section.style.setProperty('--depth', depth)
    section.dataset.depth = String(Math.min(depth, 3))
    if (window.NoteBars) section.append(window.NoteBars.button())
    const head = document.createElement('div')
    head.className = 'notes-branch-head'
    const star = starOf(node)
    star.classList.add('notes-branch-star')
    const name = document.createElement('span')
    name.className = 'notes-branch-name'
    name.textContent = node.name || 'Untitled'
    const branchButton = document.createElement('button')
    branchButton.type = 'button'
    branchButton.tabIndex = -1
    branchButton.className = 'notes-tool notes-branch-toggle notes-branch-btn'
    branchButton.dataset.id = node.id
    branchButton.innerHTML = '<span aria-hidden="true" class="nav-icon nav-icon-branch"></span>'
    drawBranchButton(branchButton, node, active && wholeBranch())
    // No lock after the name: everything here is archived (the lock is how a
    // tome shows an archived note among the others).
    head.append(star, name, sourceLink(node, tomeName))
    // On the note that holds the archive (an archived branch's top note):
    // Unarchive, which opens it in its tome and unarchives it there. (A
    // whole tome is unarchived with the lock on its box in the list.)
    if (node.sealed) {
      const unarchive = document.createElement('button')
      unarchive.type = 'button'
      unarchive.className = 'btn secondary sm sealed-unarchive'
      unarchive.textContent = 'Unarchive'
      const count = Array.isArray(node.children) && node.children.length
      unarchive.title = `Unarchive “${node.name || 'Untitled'}”${count ? ' and the notes inside it' : ''} and open it in ${tomeName ? `the “${tomeName}” tome` : 'its tome'}`
      head.append(unarchive)
    }
    head.append(branchButton)
    section.append(head)
    const chips = tagChips(node)
    if (chips) section.append(chips)
    const drawBody = () => {
      const body = buildBody({ node })
      body.classList.add('notes-branch-preview')
      if (!body.textContent.trim() && !body.querySelector('img, table, .note-command, .note-block-section')) {
        body.classList.add('is-blank')
        body.dataset.placeholder = 'Empty'
      }
      return body
    }
    let body = drawBody()
    // Its Variables, as the panel in a tome draws them (none, no panel).
    // Typing a Value redraws only this note's text, so the box keeps its focus.
    const env = variablesPanel(node.id, () => {
      const fresh = drawBody()
      body.replaceWith(fresh)
      body = fresh
    })
    if (env) section.append(env)
    const rule = document.createElement('div')
    rule.className = 'notes-branch-rule'
    section.append(rule, body)
    return section
  }

  // A note on its own is drawn the same way, as a branch of one.
  function buildPage(entry) {
    const fragment = document.createDocumentFragment()
    const branch = document.createElement('div')
    branch.className = 'sealed-branch'
    // The level colors follow the note's depth in its tome, as in the tree.
    const rootLevel = entry.inside ? entry.inside.split(' › ').length : 0
    const walk = (node, depth) => {
      branch.append(branchSection(node, depth, rootLevel + depth, depth === 0, entry.tome && entry.tome.name))
      if (!wholeBranch()) return
      ;(Array.isArray(node.children) ? node.children : []).forEach((child) => {
        if (child && typeof child.id === 'string') walk(child, depth + 1)
      })
    }
    walk(entry.node, 0)
    fragment.append(branch)
    return fragment
  }

  // Redraws only the note text, so typing in the table keeps its focus and
  // the page keeps its place.
  function renderBody() {
    if (!current) return
    const top = bodyWrap.scrollTop
    bodySlot.replaceChildren(buildPage(current))
    bodyWrap.scrollTop = top
  }

  // In Whole branch, each note shows its own variables in its section.
  // (Each note shows its own variables in its section.)
  function renderEnvironment() {
    envBox.hidden = true
    envRows.replaceChildren()
  }

  // A note's Variables panel in Sealed Notes, drawn as the open note's is in
  // a tome (sealed: only the Values can be typed in); null without variables.
  const openPanels = new Set()
  function variablesPanel(nodeId, onValue) {
    const vars = varsOf(nodeId)
    if (!vars.length) return null
    const box = document.createElement('details')
    box.className = 'env-panel'
    box.classList.toggle('advanced', isAdvanced())
    box.open = openPanels.has(nodeId)
    box.innerHTML = `
      <summary class="env-summary"></summary>
      <div class="env-vars">
        <button class="btn secondary sm env-advanced" title="Show more columns: Component, Default value, Ghost text and Description" type="button">Advanced</button>
        <div class="env-var-row env-var-header"></div>
        <div class="env-var-list"></div>
      </div>`
    box.querySelector('.env-summary').textContent = `Variables (${vars.length})`
    const advanced = box.querySelector('.env-advanced')
    advanced.setAttribute('aria-pressed', String(isAdvanced()))
    advanced.classList.toggle('active', isAdvanced())
    advanced.addEventListener('click', () => advancedBox.click())
    const { headings, rows } = variableRows(nodeId, vars, { locked: true, onValue })
    box.querySelector('.env-var-header').replaceChildren(...headings)
    box.querySelector('.env-var-list').replaceChildren(...rows)
    box.addEventListener('toggle', () => (box.open ? openPanels.add(nodeId) : openPanels.delete(nodeId)))
    return box
  }

  let entries = []
  // Every archived tome, also those with no notes (so they can be unarchived).
  let archivedTomes = []
  const searchBox = page.querySelector('.sealed-search')
  const noneEl = page.querySelector('.sealed-none')

  // A note's searchable words: its name, tags and text (parsed inertly, so
  // images in it don't load). The search also matches the tome's name.
  const textCache = new Map()
  function wordsOf(node) {
    const key = `${node.id}\u0000${node.name}\u0000${node.html || ''}`
    if (!textCache.has(key)) {
      const doc = new DOMParser().parseFromString(node.html || '', 'text/html')
      const tags = Array.isArray(node.tags) ? node.tags.join(' ') : ''
      textCache.set(key, `${node.name || ''} ${tags} ${doc.body.textContent}`.toLowerCase())
    }
    return textCache.get(key)
  }

  function itemFor(entry, context) {
    const li = document.createElement('li')
    li.setAttribute('role', 'option')
    li.tabIndex = 0
    li.dataset.id = entry.node.id
    li.setAttribute('aria-selected', String(entry.node.id === selected))
    li.className = `sealed-item${entry.node.id === selected ? ' selected' : ''}${entry.depth ? ' sealed-item-sub' : ''}${context ? ' sealed-item-context' : ''}`
    li.style.setProperty('--depth', entry.depth)
    const name = document.createElement('span')
    name.className = 'sealed-item-name'
    name.textContent = entry.node.name || 'Untitled'
    const line = document.createElement('span')
    line.className = 'sealed-item-line'
    line.append(starOf(entry.node), name)
    li.append(line)
    // Select & Export's ＋ (note-select.js), while its list is open.
    if (window.NoteSelect && window.NoteSelect.active()) {
      const picked = window.NoteSelect.has(entry.node.id)
      const add = document.createElement('button')
      add.type = 'button'
      add.tabIndex = -1
      add.className = `note-select-add${picked ? ' on' : ''}`
      add.textContent = picked ? '✓' : '＋'
      add.title = picked ? 'In the export list: click to take it out' : 'Add to the export list'
      add.setAttribute('aria-label', picked ? 'Take it out of the export list' : 'Add to the export list')
      li.classList.add('has-select-add')
      li.append(add)
    }
    if (entry.inside && !entry.depth) {
      const path = document.createElement('span')
      path.className = 'sealed-item-path'
      path.textContent = entry.inside
      li.append(path)
    }
    return li
  }

  // A note's star, before its name (☆ only on hover): click to star it.
  function starOf(node) {
    const star = document.createElement('button')
    star.type = 'button'
    star.tabIndex = -1
    star.className = `notes-star${node.starred ? ' on' : ''}`
    star.dataset.starId = node.id
    star.textContent = node.starred ? '★' : '☆'
    star.title = node.starred ? 'Starred: click to unstar' : 'Star this note (a favorite)'
    star.setAttribute('aria-label', node.starred ? `Unstar “${node.name}”` : `Star “${node.name}”`)
    star.setAttribute('aria-pressed', String(Boolean(node.starred)))
    return star
  }
  page.addEventListener(
    'click',
    (e) => {
      const star = e.target.closest('.notes-star[data-star-id]')
      if (!star || !api.setStar) return
      e.stopPropagation()
      api.setStar(star.dataset.starId, !star.classList.contains('on'))
    },
    true,
  )

  // ─── Tags and scope ─────────────────────────────────────────────────
  // Like the tree's: a Tag filter (notes carrying every chosen tag) and
  // All tomes / This tome / This branch, plus Tome name (the search box
  // matches only tome names). This tome and This branch hold to the
  // note open when they were chosen.
  const tagsOf = (node) => (Array.isArray(node.tags) ? node.tags : [])
  let tagFilter = []
  // ★ by the search box: only starred notes (stars are kept by notes.js).
  let starOnly = false
  const starFilter = page.querySelector('.sealed-star-filter')
  starFilter.addEventListener('click', () => {
    starOnly = !starOnly
    starFilter.setAttribute('aria-pressed', String(starOnly))
    starFilter.textContent = starOnly ? '★' : '☆'
    starFilter.title = starOnly ? 'Showing only starred notes: click to show all' : 'Show only starred notes'
    drawList()
  })
  // The open note's star, beside its name.
  const headStar = page.querySelector('.sealed-star')
  headStar.addEventListener('click', () => {
    if (current && api.setStar) api.setStar(current.node.id, !current.node.starred)
  })
  function drawHeadStar() {
    const on = Boolean(current && current.node.starred)
    headStar.textContent = on ? '★' : '☆'
    headStar.classList.toggle('on', on)
    headStar.setAttribute('aria-pressed', String(on))
    headStar.title = on ? 'Starred: click to unstar' : 'Star this note (a favorite)'
    headStar.setAttribute('aria-label', on ? 'Unstar this note' : 'Star this note')
  }
  // Select & Export (note-select.js, loaded after this file) puts its button
  // at the bottom of the list, and its list beside this one.
  document.addEventListener('notes:select-ready', () =>
    window.NoteSelect.attach('sealed', {
      button: page.querySelector('.sealed-select-bar'),
      // After the list's drag handle, so the export list sits beside it.
      after: listHandle ? listHandle.splitter : page.querySelector('.sealed-list-pane'),
      covers: page.querySelector('.sealed-view'),
      shown: () => [...listEl.querySelectorAll('.sealed-item:not(.sealed-item-context)')].map((li) => li.dataset.id),
    }),
  )
  document.addEventListener('notes:selection', () => {
    if (!page.hidden) drawList()
  })
  document.addEventListener('notes:starred', () => {
    if (!page.hidden) render({ keepScroll: true })
  })
  let scope = { kind: 'all' }
  const tagInput = page.querySelector('#sealed-tag-filter')
  const activeTagsEl = page.querySelector('.sealed-active-tags')
  const picksEl = page.querySelector('.sealed-tag-suggestions')
  const scopeButtons = [...page.querySelectorAll('.sealed-scope .notes-scope-btn')]
  let picksShown = false
  let picks = []
  let pickIndex = -1

  // Whether each entry is in the chosen scope.
  function inScope() {
    if (scope.kind === 'tome') return entries.map((entry) => entry.tome.id === scope.tome)
    if (scope.kind === 'branch') {
      const at = entries.findIndex((entry) => entry.node.id === scope.node)
      if (at < 0) return entries.map(() => true)
      return entries.map(
        (entry, i) =>
          i === at ||
          (i > at &&
            entry.tome === entries[at].tome &&
            entries.slice(at + 1, i + 1).every((between) => between.depth > entries[at].depth)),
      )
    }
    return entries.map(() => true)
  }

  function setScope(kind) {
    const open = entries.find((entry) => entry.node.id === selected)
    scope = kind === 'tomename' ? { kind } : !open || kind === 'all' ? { kind: 'all' } : kind === 'tome' ? { kind, tome: open.tome.id } : { kind, node: open.node.id }
    drawScope()
    drawList()
  }
  function drawScope() {
    // A scope whose note or tome is no longer sealed goes back to all.
    if (scope.kind === 'branch' && !entries.some((entry) => entry.node.id === scope.node)) scope = { kind: 'all' }
    if (scope.kind === 'tome' && !entries.some((entry) => entry.tome.id === scope.tome)) scope = { kind: 'all' }
    scopeButtons.forEach((button) => {
      const on = button.dataset.scope === scope.kind
      button.classList.toggle('active', on)
      button.setAttribute('aria-pressed', String(on))
    })
    const branch = scope.kind === 'branch' && entries.find((entry) => entry.node.id === scope.node)
    const tome = scope.kind === 'tome' && entries.find((entry) => entry.tome.id === scope.tome)
    const button = (kind) => scopeButtons.find((b) => b.dataset.scope === kind)
    searchBox.placeholder = scope.kind === 'tomename' ? 'Search tome names…' : 'Search archived notes…'
    button('branch').title = branch
      ? `Showing “${branch.node.name || 'Untitled'}” and the notes inside it. Click another note, then here, to change it.`
      : 'Search and show only the open note and the notes inside it'
    button('tome').title = tome
      ? `Showing the “${tome.tome.name || 'Notes'}” tome`
      : "Search and show only the open note's tome"
  }
  scopeButtons.forEach((button) => button.addEventListener('click', () => setScope(button.dataset.scope)))

  // Tags on sealed notes in the scope, for the Tag box's suggestions.
  function knownTags() {
    const within = inScope()
    const all = new Set()
    entries.forEach((entry, i) => within[i] && tagsOf(entry.node).forEach((tag) => all.add(tag)))
    return [...all]
  }
  function setTagFilter(list) {
    tagFilter = [...new Set(list)]
    drawTagFilter()
    drawList()
  }
  function drawTagFilter() {
    const sealedTags = new Set(entries.flatMap((entry) => tagsOf(entry.node)))
    tagFilter = tagFilter.filter((tag) => sealedTags.has(tag))
    activeTagsEl.replaceChildren(
      ...tagFilter.map((tag) => {
        const chip = document.createElement('span')
        chip.className = 'active-tag'
        chip.textContent = tag
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.textContent = '×'
        remove.title = `Stop filtering by "${tag}"`
        remove.setAttribute('aria-label', `Stop filtering by the tag ${tag}`)
        remove.addEventListener('click', () => setTagFilter(tagFilter.filter((t) => t !== tag)))
        chip.append(remove)
        return chip
      }),
    )
    activeTagsEl.hidden = !tagFilter.length
    drawPicks()
  }
  function drawPicks() {
    picksEl.hidden = !picksShown
    if (!picksShown) return
    const typed = tagInput.value.trim().toLowerCase()
    picks = knownTags()
      .filter((tag) => !tagFilter.includes(tag) && tag.includes(typed))
      .sort((a, b) => Number(b.startsWith(typed)) - Number(a.startsWith(typed)) || a.localeCompare(b))
    if (pickIndex >= picks.length) pickIndex = -1
    picksEl.replaceChildren(
      ...picks.map((tag, i) => {
        const pick = document.createElement('button')
        pick.type = 'button'
        pick.className = `tag-chip tag-pick${i === pickIndex ? ' active' : ''}`
        pick.textContent = tag
        pick.addEventListener('click', () => pickTag(tag))
        return pick
      }),
    )
    if (!picks.length) {
      const none = document.createElement('span')
      none.className = 'tag-suggestions-empty'
      none.textContent = typed ? 'No tags on archived notes match' : knownTags().length ? 'No more tags to add' : 'No archived notes here have tags.'
      picksEl.append(none)
    }
  }
  function pickTag(tag) {
    tagInput.value = ''
    pickIndex = -1
    setTagFilter([...tagFilter, tag])
  }
  tagInput.addEventListener('focus', () => {
    picksShown = true
    drawPicks()
  })
  tagInput.addEventListener('blur', () => {
    picksShown = false
    pickIndex = -1
    drawPicks()
  })
  tagInput.addEventListener('input', () => {
    pickIndex = -1
    drawPicks()
  })
  picksEl.addEventListener('mousedown', (e) => e.preventDefault())
  tagInput.addEventListener('keydown', (e) => {
    const typed = tagInput.value.trim().toLowerCase()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!picks.length) return
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      pickIndex = (pickIndex + step + picks.length + 1) % (picks.length + 1)
      if (pickIndex === picks.length) pickIndex = -1
      drawPicks()
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const tag = picks[pickIndex] || picks.find((t) => t === typed) || (typed && picks.length === 1 ? picks[0] : null)
      if (tag) pickTag(tag)
    } else if (e.key === 'Backspace' && !tagInput.value && tagFilter.length) {
      setTagFilter(tagFilter.slice(0, -1))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      tagInput.value = ''
      tagInput.blur()
    }
  })

  // A note's tags as chips; clicking one filters the list by it.
  function tagChips(node) {
    const tags = tagsOf(node)
    if (!tags.length) return null
    const box = document.createElement('div')
    box.className = 'entry-tags sealed-tags'
    box.setAttribute('aria-label', 'Tags')
    // The chips a sealed note's tag row has in a tome.
    tags.forEach((tag) => {
      const chip = document.createElement('span')
      chip.className = 'tag-chip'
      chip.dataset.tag = tag
      chip.textContent = tag
      chip.title = `Show the archived notes tagged "${tag}"`
      box.append(chip)
    })
    return box
  }
  view.addEventListener('click', (e) => {
    const chip = e.target.closest('.sealed-tags .tag-chip')
    if (chip && !tagFilter.includes(chip.dataset.tag)) setTagFilter([...tagFilter, chip.dataset.tag])
  })

  // The list: a box per tome, its sealed notes inside. While searching, only
  // matching notes show, with the notes they're inside (dimmed) for context.
  function drawList() {
    const terms = searchBox.value.toLowerCase().split(/\s+/).filter(Boolean)
    const within = inScope()
    const matches = entries.map(
      (entry, i) =>
        within[i] &&
        terms.every((term) =>
          scope.kind === 'tomename'
            ? entry.tome.name.toLowerCase().includes(term)
            : wordsOf(entry.node).includes(term) || entry.tome.name.toLowerCase().includes(term),
        ) &&
        tagFilter.every((tag) => tagsOf(entry.node).includes(tag)) &&
        (!starOnly || Boolean(entry.node.starred)),
    )
    const filtering = terms.length > 0 || tagFilter.length > 0 || starOnly
    const shown = entries.map((entry, i) => {
      if (!within[i]) return false
      if (matches[i]) return true
      for (let j = i + 1; j < entries.length && entries[j].depth > entry.depth && entries[j].tome === entry.tome; j++) {
        if (matches[j]) return true
      }
      return false
    })
    const groups = []
    entries.forEach((entry, i) => {
      if (!shown[i]) return
      let group = groups[groups.length - 1]
      if (!group || group.tome !== entry.tome) {
        group = { tome: entry.tome, items: [] }
        groups.push(group)
      }
      group.items.push(itemFor(entry, filtering && !matches[i]))
    })
    // An archived tome with no notes still gets its box (with its lock).
    if (!filtering && (scope.kind === 'all' || scope.kind === 'tomename'))
      archivedTomes.forEach((tome) => {
        if (!entries.some((entry) => entry.tome.id === tome.id)) groups.push({ tome, items: [] })
      })
    listEl.replaceChildren(
      ...groups.map(({ tome, items }) => {
        const box = document.createElement('li')
        box.className = 'sealed-tome'
        box.setAttribute('role', 'presentation')
        const heading = document.createElement('div')
        heading.className = 'sealed-tome-name'
        heading.id = `sealed-tome-${tome.id}`
        heading.textContent = tome.name || 'Notes'
        if (tome.sealed) {
          const mark = document.createElement('span')
          mark.className = 'sealed-tome-mark'
          mark.textContent = items.length ? 'whole tome archived' : 'whole tome archived (no notes)'
          // The lock: unarchive the tome, which puts its tab back.
          const lock = document.createElement('button')
          lock.type = 'button'
          lock.className = 'sealed-tome-unarchive'
          lock.dataset.tome = tome.id
          lock.title = `Archived tome: click to unarchive “${tome.name || 'Notes'}” and show its tab again`
          lock.setAttribute('aria-label', `Unarchive the “${tome.name || 'Notes'}” tome`)
          lock.innerHTML = '<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg>'
          heading.append(lock, mark)
        }
        const group = document.createElement('ul')
        group.setAttribute('role', 'group')
        group.setAttribute('aria-labelledby', heading.id)
        group.append(...items)
        box.append(heading, group)
        return box
      }),
    )
    noneEl.hidden = groups.length > 0
  }
  searchBox.addEventListener('input', drawList)
  // Enter opens the first match.
  searchBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const first = listEl.querySelector('.sealed-item:not(.sealed-item-context)')
    if (first) choose(first)
  })

  function render({ keepScroll = false } = {}) {
    const top = bodyWrap.scrollTop
    api.flush()
    entries = sealedNodes()
    const stored = readJson(NOTES_KEY)
    archivedTomes = (Array.isArray(stored.tomes) ? stored.tomes : [])
      .filter((tome) => tome && tome.sealed && typeof tome.id === 'string')
      .map((tome) => ({ id: tome.id, name: tome.name || '', sealed: true }))
    page.classList.toggle('is-empty', !entries.length && !archivedTomes.length)
    if (!entries.some((e) => e.node.id === selected)) {
      selected = entries[0] ? entries[0].node.id : null
    }
    drawScope()
    drawTagFilter()
    drawList()
    current = entries.find((e) => e.node.id === selected) || null
    if (!current) {
      bodySlot.replaceChildren()
      envBox.hidden = true
      return
    }
    view.querySelector('.sealed-title').textContent = current.node.name || 'Untitled'
    // The notes above this one in its tome (the list's tome box names the tome).
    const pathEl = view.querySelector('.sealed-path')
    pathEl.textContent = current.inside
    pathEl.hidden = !current.inside
    const headTags = view.querySelector('.sealed-head .sealed-tags')
    const chips = tagChips(current.node)
    headTags.replaceChildren(...(chips ? chips.childNodes : []))
    headTags.hidden = !chips
    fillSourceLink(editLink, current.node, current.tome && current.tome.name)
    // The note's section has its name, tags and link (the header stays hidden).
    view.querySelector('.sealed-head').hidden = true
    renderEnvironment(current)
    bodySlot.replaceChildren(buildPage(current))
    bodyWrap.scrollTop = keepScroll ? top : 0
    drawHeadStar()
    const row = listEl.querySelector('.sealed-item.selected')
    if (row) row.scrollIntoView({ block: 'nearest' })
  }

  const choose = (li) => {
    if (!li || li.dataset.id === selected) return
    selected = li.dataset.id
    render()
  }
  listEl.addEventListener('click', (e) => {
    const unarchive = e.target.closest('.sealed-tome-unarchive')
    if (unarchive) {
      if (!api.unarchiveTome) return
      setOpen(false)
      api.unarchiveTome(unarchive.dataset.tome)
      return
    }
    const add = e.target.closest('.note-select-add')
    if (add && window.NoteSelect) {
      window.NoteSelect.toggle(add.closest('li[data-id]').dataset.id)
      return
    }
    choose(e.target.closest('li[data-id]'))
  })
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(e.target.closest('li[data-id]'))
    }
  })

  // Command card inputs and Copy buttons still work in a read-only sealed note.
  bodySlot.addEventListener('input', (e) => {
    // Only command cards: a template section's filter box is also inside a card frame.
    const card = e.target.closest('.note-command[data-command-id]')
    if (card) api.updateGeneratedCommand(card)
  })
  bodySlot.addEventListener('click', (e) => {
    if (e.target.closest('.sealed-source')) {
      setOpen(false)
      return
    }
    const unarchive = e.target.closest('.sealed-unarchive')
    if (unarchive) {
      const section = unarchive.closest('.notes-branch-note')
      const link = section && section.querySelector('.sealed-source')
      if (!link) return
      const id = section.dataset.id
      // Once the note shows in its tome, its own lock's Unarchive.
      const unseal = () => {
        if (api.selectedId() !== id) return
        document.removeEventListener('notes:shown', unseal)
        setTimeout(() => {
          const button = document.getElementById('notes-unseal')
          if (button && api.selectedId() === id && api.isSealed(id)) button.click()
        })
      }
      document.addEventListener('notes:shown', unseal)
      setTimeout(() => document.removeEventListener('notes:shown', unseal), 2000)
      link.click()
      // (Already the note open there: nothing new is shown.)
      setTimeout(unseal, 50)
      return
    }
    if (e.target.closest('.notes-branch-bar')) {
      if (window.NoteBars) window.NoteBars.cycle()
      return
    }
    const branchButton = e.target.closest('.notes-branch-btn')
    if (branchButton) {
      setWholeBranch(branchButton.getAttribute('aria-pressed') !== 'true')
      selected = branchButton.dataset.id
      render()
      return
    }
    const copy = e.target.closest('.sealed-copy')
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
  tab.title = 'Every archived branch and tome, read-only'
  // At the right end of the bar, apart from the tomes and + Tome (sealed-tomes.css).
  tab.innerHTML =
    '<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg><span>Archive</span>'
  tabsEl.parentElement.append(tab)

  function setOpen(open) {
    if (open === !page.hidden) return
    if (open) render()
    page.hidden = !open
    notesPage.classList.toggle('sealed-open', open)
    tab.setAttribute('aria-selected', String(open))
    // Select & Export moves its list here, or back beside the tree.
    document.dispatchEvent(new CustomEvent('notes:sealed-open', { detail: { open } }))
  }
  // For Select & Export: show a sealed note here.
  window.SealedNotes = {
    isOpen: () => !page.hidden,
    show(id) {
      if (!sealedNodes().some((entry) => entry.node.id === id)) return false
      selected = id
      render()
      return true
    },
  }
  tab.addEventListener('click', () => setOpen(true))

  // The tab always shows (spellbook_sealed_tab_v1, which could hide it, is
  // no longer read).
  window.SpellBook.settingsSection({
    id: 'compendium-sealed-tab',
    tab: 'compendium',
    label: 'Compendium',
    order: 45,
    render(section) {
      section.innerHTML = `
        <div class="settings-data-section">
          <h3>Archive</h3>
          <label class="check-row"><input id="sealed-tags-shown" type="checkbox"/> Show tags in the Archive</label>
          <span class="form-hint">The tag chips under each note's name in the Archive tab. The Tag filter above
            its list still works.</span>
        </div>`
    },
  })
  // Settings → Compendium can hide the notes' tags in the Archive. Shown by
  // default; stored as 'hidden' only when turned off.
  const TAGS_KEY = 'spellbook_sealed_tags_v1'
  const tagsBox = document.getElementById('sealed-tags-shown')
  function applyTags() {
    let shown = true
    try {
      shown = localStorage.getItem(TAGS_KEY) !== 'hidden'
    } catch {}
    page.classList.toggle('hide-tags', !shown)
    if (tagsBox) tagsBox.checked = shown
  }
  if (tagsBox)
    tagsBox.addEventListener('change', () => {
      try {
        if (tagsBox.checked) localStorage.removeItem(TAGS_KEY)
        else localStorage.setItem(TAGS_KEY, 'hidden')
      } catch {}
      applyTags()
    })
  applyTags()
  // Any tome tab, and any move to a note, goes back to the tree and editor.
  tabsEl.addEventListener('click', () => setOpen(false))
  document.addEventListener('notes:shown', () => setOpen(false))
  editLink.addEventListener('click', () => setOpen(false))
})()
