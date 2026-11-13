/*
 * Compendium page (called Notes in the code): tabs of tomes, each a CherryTree
 * style node tree beside a rich text editor. Nodes and tomes can be sealed,
 * which makes them read-only until unsealed.
 *
 * Loaded after app.js and settings.js, and uses their shared globals: commands,
 * scripts, terms, escapeHtml, renderBadge, highlightCode, codeLanguageFor,
 * getCommandFields, commandFieldsHtml, buildGeneratedCommand, and
 * openEntryModalWithHooks. index.html owns the markup (#page-notes, #notes-cmd-modal
 * and #notes-ask). Storage: spellbook_notes_v1 ({ version: 2, tomes, tomeId };
 * version 1 was a single { nodes, selectedId } tree) and spellbook_notes_pane_v1;
 * js/datafile.js picks both up through the spellbook_ prefix. It exposes
 * window.NoteLinks for the "Linked in n notes" section in app.js.
 *
 * Note HTML can arrive from a shared data file, so everything entering the
 * editor from storage, the clipboard or a drop passes through sanitize().
 */
;(() => {
  const NOTES_KEY = 'spellbook_notes_v1'
  const PANE_KEY = 'spellbook_notes_pane_v1'
  const SAVE_DELAY = 400

  const $ = (id) => document.getElementById(id)
  const pane = $('notes-editor-pane')
  const treeEl = $('notes-tree')
  const editor = $('notes-editor')
  const titleInput = $('notes-title')
  const formatSelect = $('notes-format')
  const savedEl = $('notes-saved')

  // ─── Sanitizer ──────────────────────────────────────────────────────
  // Rebuilds the HTML from an allowlist instead of removing known bad parts.
  const ALLOWED_TAGS = new Set(
    'P DIV BR B STRONG I EM U S STRIKE DEL SUB SUP CODE PRE H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE HR A SPAN TABLE THEAD TBODY TR TH TD'.split(
      ' ',
    ),
  )
  // Removed along with their contents; any other unknown tag keeps its text.
  const DROPPED_TAGS = new Set(
    'SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE NOSCRIPT LINK META HEAD TITLE BASE FORM INPUT BUTTON SELECT TEXTAREA IMG VIDEO AUDIO SOURCE CANVAS APPLET FRAME FRAMESET'.split(
      ' ',
    ),
  )
  const ALLOWED_STYLES = [
    'color',
    'background-color',
    'text-align',
    'font-weight',
    'font-style',
    'text-decoration-line',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
  ]
  const CARD_FIELDS = ['commandId', 'scriptId', 'title', 'platform', 'template', 'values']

  const safeHref = (value) => {
    const href = String(value || '').trim()
    return /^(https?:|mailto:)/i.test(href) ? href : ''
  }

  function sanitize(html, { keepStyles = true } = {}) {
    const source = new DOMParser().parseFromString(String(html || ''), 'text/html')
    const target = document.implementation.createHTMLDocument('')
    const copyChildren = (from, to) => {
      from.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          to.appendChild(target.createTextNode(child.nodeValue))
          return
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return
        const tag = child.tagName.toUpperCase()
        if (DROPPED_TAGS.has(tag)) return
        if (
          tag === 'DIV' &&
          (child.hasAttribute('data-command-id') ||
            child.hasAttribute('data-script-id'))
        ) {
          to.appendChild(cardShell(child.dataset, target))
          return
        }
        // Callout boxes (js/notes-callouts.js): only the known kinds survive.
        if (tag === 'DIV' && /^(info)$/.test(child.getAttribute('data-callout') || '')) {
          const box = target.createElement('div')
          box.className = 'note-callout'
          box.setAttribute('data-callout', child.getAttribute('data-callout'))
          copyChildren(child, box)
          to.appendChild(box)
          return
        }
        if (tag === 'A' && child.hasAttribute('data-term-id')) {
          to.appendChild(termLink(child.dataset, target))
          return
        }
        if (!ALLOWED_TAGS.has(tag)) {
          copyChildren(child, to)
          return
        }
        const copy = target.createElement(tag)
        if (tag === 'PRE' && /^[a-z]+$/.test(child.dataset.lang || '')) {
          copy.dataset.lang = child.dataset.lang
        }
        if (tag === 'A') {
          const href = safeHref(child.getAttribute('href'))
          if (href) copy.setAttribute('href', href)
        }
        if (keepStyles && child.style) {
          ALLOWED_STYLES.forEach((prop) => {
            const value = child.style.getPropertyValue(prop)
            if (value && !/url|expression|javascript|[<>]/i.test(value)) {
              copy.style.setProperty(prop, value)
            }
          })
        }
        copyChildren(child, copy)
        to.appendChild(copy)
      })
    }
    const root = target.createElement('div')
    copyChildren(source.body, root)
    return root.innerHTML
  }

  // ─── Command cards, script cards and term links ─────────────────────
  // A saved card is only a shell: the entry's id and a text snapshot. drawCard
  // fills it from the live entry, or from the snapshot if the entry is gone. A
  // command card also keeps its own field values in data-values, which is how
  // they stay private to that card in that note.
  function cardShell(fields, doc = document) {
    const shell = doc.createElement('div')
    shell.className = 'note-command'
    shell.setAttribute('contenteditable', 'false')
    CARD_FIELDS.forEach((field) => {
      if (fields[field] !== undefined) shell.dataset[field] = String(fields[field])
    })
    shell.textContent = String(fields.title || '')
    return shell
  }

  function termLink(fields, doc = document) {
    const link = doc.createElement('a')
    link.className = 'note-term'
    link.setAttribute('href', `#/term/${encodeURIComponent(fields.termId || '')}`)
    link.dataset.termId = String(fields.termId || '')
    link.dataset.title = String(fields.title || '')
    link.textContent = String(fields.title || '')
    return link
  }

  const commandSnapshot = (cmd) => ({
    commandId: cmd.id,
    title: cmd.title || '',
    platform: cmd.platform || '',
    template: cmd.command || '',
  })
  const scriptSnapshot = (script) => ({
    scriptId: script.id,
    title: script.name || '',
    platform: script.language || '',
    template: script.body || '',
  })

  function cardHead(live, badgeKind, title, platform, href) {
    return `
      <div class="note-command-head">
        ${
          live
            ? `<a class="note-command-title" href="${href}">${escapeHtml(title)}</a>`
            : `<span class="note-command-title">${escapeHtml(title)}</span>`
        }
        ${platform ? renderBadge(badgeKind, platform) : ''}
        <span class="note-command-spacer"></span>
        ${
          live
            ? `<button class="btn secondary sm note-command-edit" title="Edit this ${badgeKind === 'scripts' ? 'script' : 'command'} in the Spell Book without leaving the note" type="button">Edit</button>`
            : ''
        }
        ${
          live
            ? `<a class="btn secondary sm note-command-open" href="${href}">View in Spell Book</a>`
            : `<span class="note-command-gone">No longer in the Spell Book</span>`
        }
        <button aria-label="Remove from this note" class="note-command-remove" title="Remove from note" type="button">×</button>
      </div>`
  }

  function savedValues(card) {
    try {
      const values = JSON.parse(card.dataset.values || '{}')
      return values && typeof values === 'object' ? values : {}
    } catch {
      return {}
    }
  }

  let cardCount = 0
  function drawCommandCard(card) {
    const live = commands.find((c) => c.id === card.dataset.commandId)
    if (live) Object.assign(card.dataset, commandSnapshot(live))
    const { commandId, title, platform, template } = card.dataset
    const cmd = live || { id: commandId, title, platform, command: template }
    const fields = getCommandFields(cmd)
    cardCount += 1
    card.classList.toggle('missing', !live)
    card.innerHTML = `
      ${cardHead(live, 'commands', title, platform, `#/command/${encodeURIComponent(commandId)}`)}
      ${
        fields.length
          ? `<div class="note-command-label">Variables</div>
             <div class="vars-grid">${commandFieldsHtml(cmd, fields, `note-var-${cardCount}-`)}</div>`
          : ''
      }
      <div class="note-command-label">Generated command</div>
      <pre class="cmd"><button class="copy-btn" type="button">Copy</button><code></code></pre>`
    const values = savedValues(card)
    card.querySelectorAll('[data-var]').forEach((control) => {
      const value = values[control.dataset.var]
      if (control.type === 'checkbox') control.checked = value === '1'
      else if (typeof value === 'string') control.value = value
      // Cards are redrawn after edits in the Spell Book; keep a sealed note locked.
      control.disabled = isSealed(selectedId)
    })
    updateGeneratedCommand(card)
  }

  function updateGeneratedCommand(card) {
    const values = readCommandFieldValues(card.querySelectorAll('[data-var]'))
    card.querySelector('pre.cmd code').innerHTML = highlightCode(
      buildGeneratedCommand(card.dataset.template, values),
      codeLanguageFor(card.dataset.platform),
      { template: true },
    )
  }

  function drawScriptCard(card) {
    const live = scripts.find((s) => s.id === card.dataset.scriptId)
    if (live) Object.assign(card.dataset, scriptSnapshot(live))
    const { scriptId, title, platform, template } = card.dataset
    card.classList.toggle('missing', !live)
    card.innerHTML = `
      ${cardHead(live, 'scripts', title, platform, `#/script/${encodeURIComponent(scriptId)}`)}
      <pre class="cmd note-script-body"><button class="copy-btn" type="button">Copy</button><code>${highlightCode(template, platform)}</code></pre>`
  }

  function drawCard(card) {
    card.setAttribute('contenteditable', 'false')
    if (card.dataset.scriptId !== undefined) drawScriptCard(card)
    else drawCommandCard(card)
  }

  // contenteditable=false is set here, after insertion: Chrome moves a
  // non-editable inline out of its paragraph if insertHTML is given one directly.
  function drawTermLink(link) {
    link.setAttribute('contenteditable', 'false')
    const live = terms.find((t) => t.id === link.dataset.termId)
    if (live) link.dataset.title = live.term || ''
    link.textContent = link.dataset.title
    link.classList.toggle('missing', !live)
    link.title = live
      ? live.definition || ''
      : 'No longer in the Spell Book'
  }

  const cardsIn = (root) =>
    root.querySelectorAll('.note-command[data-command-id], .note-command[data-script-id]')
  const termLinksIn = (root) => root.querySelectorAll('a.note-term[data-term-id]')

  function drawReferences() {
    cardsIn(editor).forEach(drawCard)
    termLinksIn(editor).forEach(drawTermLink)
    drawCodeBlocks()
  }

  // ─── Code blocks ────────────────────────────────────────────────────
  // Stored as <pre data-lang="bash">plain text</pre>. On screen the same <pre>
  // becomes a small editor: a highlighted copy of the code with a transparent
  // textarea laid exactly over it, so typing is plain text with the textarea's
  // own undo, and the colors come from highlightCode() like everywhere else.
  // Older notes' plain code blocks are read the same way, as "Other".
  const CODE_LANGS = [
    ['auto', 'Auto'],
    ['bash', 'Bash'],
    ['powershell', 'PowerShell'],
    ['batch', 'CMD / Batch'],
    ['python', 'Python'],
    ['sql', 'SQL'],
    ['generic', 'Other'],
  ]
  const isCodeLang = (value) => CODE_LANGS.some(([key]) => key === value)
  // "auto" guesses the language from the text (js/notes-codelang.js).
  const resolveCodeLang = (lang, text) =>
    window.NoteCodeLang ? window.NoteCodeLang.resolve(lang, text) : lang === 'auto' ? 'generic' : lang

  const codeBlocksIn = (root) => root.querySelectorAll(':scope > pre.note-code')

  // The text of a stored or pasted <pre>, with <br> line breaks as newlines.
  function preText(pre) {
    const copy = pre.cloneNode(true)
    copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
    return copy.textContent
  }

  function renderCodeView(block) {
    const text = block.querySelector('.note-code-input').value
    // A trailing newline needs something after it, or the last line collapses
    // and the textarea and the colored copy stop lining up.
    block.querySelector('.note-code-view code').innerHTML =
      highlightCode(text, resolveCodeLang(block.dataset.lang, text)) + (text === '' || text.endsWith('\n') ? ' ' : '')
  }

  function drawCodeBlock(pre) {
    const text = preText(pre)
    const lang = isCodeLang(pre.dataset.lang) ? pre.dataset.lang : 'auto'
    pre.className = 'note-code'
    pre.dataset.lang = lang
    pre.setAttribute('contenteditable', 'false')
    pre.innerHTML = `
      <div class="note-code-head">
        <select aria-label="Code language" class="note-code-lang" title="Language for syntax colors">
          ${CODE_LANGS.map(
            ([key, label]) =>
              `<option value="${key}"${key === lang ? ' selected' : ''}>${label}</option>`,
          ).join('')}
        </select>
        <span class="note-command-spacer"></span>
        <button class="btn secondary sm note-code-copy" type="button">Copy</button>
        <button aria-label="Remove this code block" class="note-command-remove note-code-remove" title="Remove code block" type="button">×</button>
      </div>
      <div class="note-code-body">
        <pre aria-hidden="true" class="cmd note-code-view"><code></code></pre>
        <textarea aria-label="Code" class="note-code-input" rows="1" placeholder="Type or paste code…" spellcheck="false"></textarea>
      </div>`
    const input = pre.querySelector('.note-code-input')
    input.value = text
    const sealed = isSealed(selectedId)
    input.readOnly = sealed
    pre.querySelector('.note-code-lang').disabled = sealed
    renderCodeView(pre)
  }

  // Turns every top-level <pre> that isn't drawn yet into a code block.
  function drawCodeBlocks() {
    const drawn = []
    editor.querySelectorAll(':scope > pre').forEach((pre) => {
      if (pre.querySelector(':scope > .note-code-head')) return
      drawCodeBlock(pre)
      drawn.push(pre)
    })
    return drawn
  }

  function focusCode(block, atEnd = true) {
    const input = block.querySelector('.note-code-input')
    input.focus()
    const at = atEnd ? input.value.length : 0
    input.setSelectionRange(at, at)
    block.scrollIntoView({ block: 'nearest' })
  }

  // Code block button and the "Code block" paragraph style: the selected text,
  // or the current paragraph's text, becomes a code block. Undo removes it.
  function insertCodeBlock() {
    if (isSealed(selectedId)) return
    restoreSelection()
    const selection = selectionInEditor()
    let text = ''
    if (selection && !selection.isCollapsed) {
      text = selection.toString()
      document.execCommand('delete')
      rememberSelection()
    } else if (selection) {
      let block = selection.anchorNode
      while (block && block.parentNode !== editor) block = block.parentNode
      if (
        block &&
        block.nodeType === Node.ELEMENT_NODE &&
        block.matches('p, h1, h2, h3, h4, h5, h6, blockquote, div:not(.note-command)') &&
        block.textContent.trim()
      ) {
        text = block.innerText.replace(/\n$/, '')
        // Empty that paragraph (with execCommand, so Undo brings it back) and
        // put the block in its place rather than after it.
        const range = document.createRange()
        range.selectNodeContents(block)
        selection.removeAllRanges()
        selection.addRange(range)
        document.execCommand('delete')
        document.execCommand('formatBlock', false, '<p>')
        rememberSelection()
      }
    }
    const pre = document.createElement('pre')
    pre.dataset.lang = 'auto'
    pre.textContent = text
    // keepEdgesEditable() adds a paragraph after it only if nothing follows.
    replaceCaretBlock(pre.outerHTML)
    const [added] = drawCodeBlocks()
    keepEdgesEditable()
    afterEdit()
    if (added) focusCode(added)
  }

  function codeBlockInput(e) {
    const block = e.target.closest('pre.note-code')
    if (e.target.matches('.note-code-lang')) {
      block.dataset.lang = e.target.value
    }
    renderCodeView(block)
    markDirty()
    refreshMatches()
  }

  // Keys inside a code block: Tab indents, and the arrow keys leave the block
  // from its first or last line, so it never traps the caret.
  function codeBlockKeydown(e) {
    const input = e.target
    const block = input.closest('pre.note-code')
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault()
      flush()
    } else if (e.key === 'Tab' && !e.shiftKey && !input.readOnly) {
      e.preventDefault()
      document.execCommand('insertText', false, '    ')
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const up = e.key === 'ArrowUp'
      const before = input.value.slice(0, input.selectionStart)
      const after = input.value.slice(input.selectionEnd)
      if (up ? before.includes('\n') : after.includes('\n')) return
      const next = up ? block.previousElementSibling : block.nextElementSibling
      if (!next) return
      e.preventDefault()
      if (next.matches('pre.note-code')) {
        focusCode(next, up)
        return
      }
      editor.focus()
      const range = document.createRange()
      range.selectNodeContents(next)
      range.collapse(up ? false : true)
      setRange(range)
    }
  }

  // ─── Dialog ─────────────────────────────────────────────────────────
  // Resolves to true (or the typed text with `input`), or null when cancelled.
  function ask({ title, message = '', confirmText = 'OK', danger = false, input, extra, validate, alertOnly = false }) {
    const overlay = $('notes-ask')
    const field = $('notes-ask-input')
    const ok = $('notes-ask-ok')
    const cancel = $('notes-ask-cancel')
    const error = $('notes-ask-error')
    const opener = document.activeElement
    $('notes-ask-title').textContent = title
    $('notes-ask-message').textContent = message
    $('notes-ask-extra').replaceChildren(...(extra ? [extra] : []))
    error.textContent = ''
    field.hidden = input === undefined
    field.value = input === undefined ? '' : input
    ok.textContent = confirmText
    ok.classList.toggle('danger', danger)
    cancel.style.display = alertOnly ? 'none' : ''
    overlay.classList.add('open')
    const firstInput = extra ? extra.querySelector('input') : field.hidden ? null : field
    if (firstInput) {
      firstInput.focus()
      firstInput.select()
    } else {
      ok.focus()
    }
    return new Promise((resolve) => {
      const finish = (result) => {
        overlay.classList.remove('open')
        ok.removeEventListener('click', accept)
        cancel.removeEventListener('click', decline)
        overlay.removeEventListener('keydown', onKey)
        overlay.removeEventListener('click', onOverlay)
        if (opener && opener.isConnected) opener.focus()
        resolve(result)
      }
      const accept = () => {
        const problem = validate && validate(field.value)
        if (problem) {
          error.textContent = problem
          return
        }
        finish(field.hidden ? true : field.value)
      }
      const decline = () => finish(null)
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          decline()
        } else if (e.key === 'Enter' && e.target !== cancel) {
          e.preventDefault()
          accept()
        }
      }
      const onOverlay = (e) => {
        if (e.target === overlay) decline()
      }
      ok.addEventListener('click', accept)
      cancel.addEventListener('click', decline)
      overlay.addEventListener('keydown', onKey)
      overlay.addEventListener('click', onOverlay)
    })
  }

  // ─── Tree data ──────────────────────────────────────────────────────
  // The Compendium holds tomes, each its own tree. `nodes` and `selectedId`
  // always belong to the open tome; useTome() points them at another.
  let tomes = []
  let tomeId = null
  let nodes = []
  let selectedId = null
  let treeQuery = ''
  let searchScopeId = null
  // "All tomes": the tree shows and searches every tome, grouped by tome.
  let searchAllTomes = false
  let dirty = false
  let saveTimer = null

  const newNode = (name) => ({
    id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    html: '',
    children: [],
    collapsed: false,
  })

  const newTome = (name) => ({
    id: `tome-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    sealed: false,
    nodes: [],
    selectedId: null,
  })

  function cleanNodes(list) {
    if (!Array.isArray(list)) return []
    return list
      .filter((n) => n && typeof n === 'object' && typeof n.id === 'string')
      .map((n) => ({
        id: n.id,
        name: typeof n.name === 'string' ? n.name : 'Untitled',
        html: typeof n.html === 'string' ? n.html : '',
        children: cleanNodes(n.children),
        collapsed: Boolean(n.collapsed),
        sealed: Boolean(n.sealed),
      }))
  }

  function cleanTomes(list) {
    if (!Array.isArray(list)) return []
    return list
      .filter((t) => t && typeof t === 'object' && typeof t.id === 'string')
      .map((t) => ({
        id: t.id,
        name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Untitled',
        sealed: Boolean(t.sealed),
        nodes: cleanNodes(t.nodes),
        selectedId: typeof t.selectedId === 'string' ? t.selectedId : null,
      }))
  }

  const activeTome = () => tomes.find((t) => t.id === tomeId) || null

  function useTome(tome) {
    tomeId = tome.id
    nodes = tome.nodes
    selectedId = locate(tome.selectedId) ? tome.selectedId : nodes[0] ? nodes[0].id : null
  }

  function loadNotes() {
    const raw = localStorage.getItem(NOTES_KEY)
    let wanted = null
    if (raw) {
      try {
        const stored = JSON.parse(raw)
        if (Array.isArray(stored.tomes)) {
          tomes = cleanTomes(stored.tomes)
          wanted = stored.tomeId
        } else {
          // Before tomes, the notes were a single tree: { nodes, selectedId }.
          const tome = newTome('Notes')
          tome.nodes = cleanNodes(stored.nodes)
          tome.selectedId = stored.selectedId
          tomes = [tome]
        }
      } catch {
        // Keep unreadable notes instead of overwriting them on the next save.
        localStorage.setItem(`${NOTES_KEY}_unreadable`, raw)
      }
    }
    if (!tomes.length) {
      const tome = newTome('Notes')
      tome.nodes = [newNode('My Notes')]
      tomes = [tome]
    }
    useTome(tomes.find((t) => t.id === wanted) || tomes[0])
  }

  function persist() {
    const tome = activeTome()
    if (tome) tome.selectedId = selectedId
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify({ version: 2, tomes, tomeId }))
      savedEl.textContent = 'Saved'
      savedEl.classList.remove('error')
      return true
    } catch {
      savedEl.textContent = 'Could not save: browser storage is full'
      savedEl.classList.add('error')
      return false
    }
  }

  // Finds a node with the array that holds it and its parent node.
  function locate(id, list = nodes, parent = null) {
    for (let index = 0; index < list.length; index++) {
      const node = list[index]
      if (node.id === id) return { node, list, index, parent }
      const found = locate(id, node.children, node)
      if (found) return found
    }
    return null
  }

  function locateAnywhere(id) {
    for (const tome of tomes) {
      const found = locate(id, tome.nodes)
      if (found) return { ...found, tome }
    }
    return null
  }

  const selectedNode = () => {
    const found = locate(selectedId)
    return found ? found.node : null
  }

  function pathTo(id) {
    const names = []
    let found = locate(id)
    while (found) {
      names.unshift(found.node.name)
      found = found.parent ? locate(found.parent.id) : null
    }
    return names.join(' › ')
  }

  const isInside = (id, ancestor) =>
    ancestor.children.some((c) => c.id === id || isInside(id, c))

  // ─── Seals ──────────────────────────────────────────────────────────
  // A sealed node and everything inside it is read-only, and a sealed tome is
  // read-only throughout. Seals are a guard against accidental edits, not
  // security: anyone can unseal. sealOf() returns whatever holds the seal on a
  // node (the node itself, an ancestor, or the tome), or null.
  function sealOf(id) {
    let found = id ? locate(id) : null
    while (found) {
      if (found.node.sealed) return found.node
      found = found.parent ? locate(found.parent.id) : null
    }
    const tome = activeTome()
    return tome && tome.sealed ? tome : null
  }
  const isSealed = (id) => Boolean(id && sealOf(id))
  // Whether nodes can be added to, removed from or reordered in a node's
  // children, or in the tome's top level when parentId is null.
  const listLocked = (parentId) =>
    parentId ? isSealed(parentId) : Boolean(activeTome() && activeTome().sealed)
  const parentIdOf = (at) => (at && at.parent ? at.parent.id : null)
  const hasSeal = (node) => node.sealed || node.children.some(hasSeal)
  const sealName = (seal) =>
    seal === activeTome() ? `the “${seal.name}” tome` : `“${seal.name}”`

  function sealIcon(label) {
    const icon = document.createElement('span')
    icon.className = 'notes-seal'
    icon.title = label
    icon.setAttribute('aria-label', label)
    icon.setAttribute('role', 'img')
    icon.innerHTML = '<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><rect height="11" rx="2" width="16" x="4" y="11"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>'
    return icon
  }

  // Makes the open note read-only, or editable again, to match its seal.
  function applySealState() {
    const node = selectedNode()
    const seal = node ? sealOf(node.id) : null
    pane.classList.toggle('is-sealed', Boolean(seal))
    editor.contentEditable = seal ? 'false' : 'true'
    editor.setAttribute('aria-readonly', String(Boolean(seal)))
    titleInput.readOnly = Boolean(seal)
    // A command's variable fields are part of the note, so they lock too.
    editor.querySelectorAll('.note-command [data-var]').forEach((control) => {
      control.disabled = Boolean(seal)
    })
    codeBlocksIn(editor).forEach((block) => {
      block.querySelector('.note-code-input').readOnly = Boolean(seal)
      block.querySelector('.note-code-lang').disabled = Boolean(seal)
    })
    $('notes-sealed-bar').hidden = !seal
    if (seal) {
      $('notes-table-tools').hidden = true
      const by = seal === node ? 'This branch is sealed' : `Sealed by ${sealName(seal)}`
      $('notes-sealed-text').textContent = `${by}, so it is read-only.`
      $('notes-unseal').textContent = seal === activeTome() ? 'Unseal Tome' : 'Unseal'
    }
    syncTreeTools()
    // js/sealed-tomes.js redraws its panel for the node and seal now shown.
    document.dispatchEvent(new CustomEvent('notes:shown'))
  }

  function syncTreeTools() {
    const at = locate(selectedId)
    const siblingLocked = listLocked(parentIdOf(at))
    const childLocked = at ? isSealed(at.node.id) : siblingLocked
    const why = (locked) => (locked ? ' (sealed)' : '')
    const add = $('notes-add-node')
    add.disabled = siblingLocked
    add.title = `Add a node after the selected one${why(siblingLocked)}`
    const child = $('notes-add-child')
    child.disabled = childLocked
    child.title = `Add a node inside the selected one${why(childLocked)}`
    $('notes-empty-add').disabled = listLocked(null)
  }

  function setSeal(target, sealed) {
    if (!target) return
    if (dirty) flush()
    const scroll = editor.scrollTop
    target.sealed = sealed
    persist()
    renderTabs()
    renderTree()
    // Redraw the note so its editing state matches the seal.
    showSelected()
    editor.scrollTop = scroll
  }

  // A notice with only an OK button.
  const tell = (title, message) => ask({ title, message, alertOnly: true })

  // ─── Editor contents ────────────────────────────────────────────────
  // Text you can't otherwise reach: keep a paragraph before and after cards,
  // and after code blocks, so the caret can always get past them.
  function keepEdgesEditable() {
    const needsGap = (el) =>
      el && (el.matches('.note-command') || el.matches('pre, hr, table'))
    const BLOCK = '.note-command, pre.note-code, table'
    const paragraph = () => {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      return p
    }
    // The browser's list commands leave <p><ul>…</ul></p>, which is not valid
    // HTML and comes back with extra blank lines after a reload.
    editor.querySelectorAll('p > ul, p > ol').forEach((list) => {
      const wrapper = list.parentElement
      if (wrapper.childNodes.length !== 1) return
      const selection = getSelection()
      const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
      wrapper.replaceWith(list)
      if (anchorNode && editor.contains(anchorNode)) {
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
      }
    })
    if (!editor.firstChild) editor.appendChild(paragraph())
    const first = editor.firstElementChild
    if (first && first.matches(BLOCK)) first.before(paragraph())
    if (needsGap(editor.lastElementChild)) editor.appendChild(paragraph())
    editor.querySelectorAll(':scope > .note-command, :scope > pre.note-code, :scope > table').forEach((block) => {
      const next = block.nextElementSibling
      if (next && next.matches(BLOCK)) block.after(paragraph())
    })
  }

  function serializeEditor() {
    const copy = editor.cloneNode(true)
    cardsIn(copy).forEach((card) => {
      const shell = cardShell(card.dataset)
      shell.removeAttribute('contenteditable')
      card.replaceWith(shell)
    })
    termLinksIn(copy).forEach((link) => link.replaceWith(termLink(link.dataset)))
    // A textarea's typed text isn't copied by cloneNode, so read the live one.
    const live = [...codeBlocksIn(editor)]
    codeBlocksIn(copy).forEach((block, index) => {
      const pre = document.createElement('pre')
      pre.dataset.lang = block.dataset.lang
      pre.textContent = live[index].querySelector('.note-code-input').value
      block.replaceWith(pre)
    })
    return copy.innerHTML
  }

  function captureEditor() {
    const node = selectedNode()
    if (node) node.html = serializeEditor()
  }

  function flush() {
    clearTimeout(saveTimer)
    if (!dirty) return
    captureEditor()
    if (persist()) dirty = false
    updateWordCount()
  }

  function markDirty() {
    if (isSealed(selectedId)) return
    dirty = true
    savedEl.textContent = 'Saving…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, SAVE_DELAY)
  }

  function updateWordCount() {
    // Only what you wrote: a card's labels and code are not your words.
    const words = [...editor.children]
      .filter((el) => !el.matches('.note-command, pre.note-code'))
      .map((el) => el.innerText)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
    $('notes-words').textContent =
      `${words.length} word${words.length === 1 ? '' : 's'}`
  }

  // Loads the selected node into the title box and editor.
  function showSelected() {
    const node = selectedNode()
    pane.classList.toggle('is-empty', !node)
    savedRange = null
    $('notes-table-tools').hidden = true
    scheduleLocationCheck()
    if (!node) {
      editor.innerHTML = ''
      applySealState()
      refreshMatches()
      return
    }
    titleInput.value = node.name
    editor.innerHTML = sanitize(node.html)
    drawReferences()
    keepEdgesEditable()
    editor.scrollTop = 0
    $('notes-path').textContent = pathTo(node.id)
    applySealState()
    updateWordCount()
    updateToolbarState()
    refreshMatches({ jump: true })
  }

  // Entries may have changed while another page was open.
  function refreshCards() {
    if (!selectedNode()) return
    const before = serializeEditor()
    drawReferences()
    if (serializeEditor() !== before) markDirty()
    refreshMatches()
  }

  // ─── Tree rendering ─────────────────────────────────────────────────
  function plainTextOf(node) {
    const doc = new DOMParser().parseFromString(node.html, 'text/html')
    const cards = [
      ...doc.querySelectorAll('[data-command-id], [data-script-id]'),
    ].map((card) => `${card.dataset.template || ''} ${card.dataset.values || ''}`)
    return `${node.name} ${doc.body.textContent} ${cards.join(' ')}`.toLowerCase()
  }

  // ─── Matches in the open note ───────────────────────────────────────
  // Uses the CSS Custom Highlight API, which paints text ranges without changing
  // the DOM, so highlights can never reach the saved note or the undo history.
  // Field values can't be painted that way, so a matching field gets a class,
  // which serializeEditor drops along with the rest of the card's markup.
  const MATCH_SKIP =
    'button, select, input, .note-command-label, .note-command-open, .note-command-gone'
  const MATCH_BLOCK = 'p, div, li, td, th, pre, blockquote, h1, h2, h3, h4, h5, h6'
  let matches = []
  let matchIndex = 0

  const searchTerms = () => treeQuery.toLowerCase().split(/\s+/).filter(Boolean)

  function matchPattern(terms) {
    // Longest first, so "alpha alp" marks the whole of "alpha".
    const parts = [...terms]
      .sort((a, b) => b.length - a.length)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return parts.join('|')
  }

  function findMatches(terms) {
    const pattern = matchPattern(terms)
    const found = []
    // Join the note's text so a match can cross formatting or code colors, with
    // a line break at block edges so it can't cross from one block to the next.
    const segments = []
    let text = ''
    let lastBlock = null
    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
          if (node.matches(MATCH_SKIP)) return NodeFilter.FILTER_REJECT
          return node.tagName === 'BR'
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP
        },
      },
    )
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeType !== Node.TEXT_NODE) {
        text += '\n'
        continue
      }
      const block = node.parentElement.closest(MATCH_BLOCK)
      if (block !== lastBlock) {
        text += '\n'
        lastBlock = block
      }
      segments.push({ node, start: text.length })
      text += node.nodeValue
    }
    const segmentAt = (offset) => {
      let low = 0
      let high = segments.length - 1
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (segments[middle].start <= offset) low = middle
        else high = middle - 1
      }
      return segments[low]
    }
    const regex = new RegExp(pattern, 'gi')
    let match
    while ((match = regex.exec(text))) {
      const first = segmentAt(match.index)
      const last = segmentAt(match.index + match[0].length - 1)
      const range = document.createRange()
      range.setStart(first.node, match.index - first.start)
      range.setEnd(last.node, match.index + match[0].length - last.start)
      found.push({ range })
    }
    const inField = new RegExp(pattern, 'i')
    editor
      .querySelectorAll(
        '.note-command input[data-var]:not([type="checkbox"]), .note-command select[data-var]',
      )
      .forEach((field) => {
        if (!inField.test(field.value)) return
        const range = document.createRange()
        range.selectNode(field)
        found.push({ range, field })
      })
    return found.sort((a, b) =>
      a.range.compareBoundaryPoints(Range.START_TO_START, b.range),
    )
  }

  function paintMatches() {
    editor.querySelectorAll('.note-match-field').forEach((field) => {
      field.classList.remove('note-match-field', 'current')
    })
    const current = matches[matchIndex]
    matches.forEach((match) => {
      if (match.field) {
        match.field.classList.add('note-match-field')
        match.field.classList.toggle('current', match === current)
      }
    })
    if (!window.Highlight || !CSS.highlights) return
    const ranges = (list) => list.filter((m) => !m.field).map((m) => m.range)
    CSS.highlights.set(
      'notes-match',
      new Highlight(...ranges(matches.filter((m) => m !== current))),
    )
    CSS.highlights.set(
      'notes-match-current',
      new Highlight(...ranges(current ? [current] : [])),
    )
  }

  function scrollToCurrentMatch() {
    const current = matches[matchIndex]
    if (!current) return
    const { range } = current
    const center = (box) => {
      const target = range.getBoundingClientRect()
      const view = box.getBoundingClientRect()
      if (target.top < view.top || target.bottom > view.bottom) {
        box.scrollTop += target.top - view.top - box.clientHeight / 2
      }
    }
    const start = range.startContainer
    const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement
    const script = element.closest('.note-script-body')
    if (script) center(script)
    center(editor)
  }

  function updateFindStatus(terms) {
    const node = selectedNode()
    const bar = $('notes-find-bar')
    bar.hidden = !terms.length || !node
    if (bar.hidden) return
    const name = node.name.toLowerCase()
    $('notes-find-status').textContent = matches.length
      ? `Match ${matchIndex + 1} of ${matches.length}`
      : terms.some((term) => name.includes(term))
        ? 'Matched in the node name'
        : 'No matches in this note'
    $('notes-find-prev').disabled = matches.length < 2
    $('notes-find-next').disabled = matches.length < 2
  }

  // Run after anything that changes the note's text or the search terms.
  function refreshMatches({ jump = false } = {}) {
    const terms = searchTerms()
    matches = terms.length && selectedNode() ? findMatches(terms) : []
    matchIndex = jump ? 0 : Math.min(matchIndex, Math.max(matches.length - 1, 0))
    paintMatches()
    updateFindStatus(terms)
    if (jump) scrollToCurrentMatch()
  }

  function stepMatch(delta) {
    if (!matches.length) return
    matchIndex = (matchIndex + delta + matches.length) % matches.length
    paintMatches()
    updateFindStatus(searchTerms())
    scrollToCurrentMatch()
  }

  // The first note in the tree (or the pinned branch) that contains the search.
  function firstMatchingNode() {
    const terms = searchTerms()
    const scope = searchScopeId && locate(searchScopeId)
    const search = (list) => {
      for (const node of list) {
        const text = plainTextOf(node)
        if (terms.every((term) => text.includes(term))) return node
        const below = search(node.children)
        if (below) return below
      }
      return null
    }
    if (!terms.length) return null
    const lists = searchAllTomes
      ? tomes.map((tome) => [tome, tome.nodes])
      : [[activeTome(), scope ? [scope.node] : nodes]]
    for (const [tome, list] of lists) {
      const node = search(list)
      if (node) return { tome, node }
    }
    return null
  }

  $('notes-find-bar').addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault()
  })
  $('notes-find-prev').addEventListener('click', () => stepMatch(-1))
  $('notes-find-next').addEventListener('click', () => stepMatch(1))
  $('notes-tree-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (matches.length) {
      stepMatch(e.shiftKey ? -1 : 1)
      return
    }
    if (dirty) flush()
    const found = firstMatchingNode()
    if (found) openNode(found.tome.id, found.node.id)
  })

  // ─── Search scope ───────────────────────────────────────────────────
  // "This branch" pins the node selected when it was turned on, so opening a
  // result does not move the scope. It lasts until cleared, and is not saved: a
  // filter you forgot about after a reload would look like missing notes.
  const inScope = (id) => {
    const scope = searchScopeId && locate(searchScopeId)
    return !scope || id === searchScopeId || isInside(id, scope.node)
  }

  // A node that just left the visible branch must not silently disappear.
  function leaveScopeIfOutside(id) {
    if (!inScope(id)) searchScopeId = null
  }

  function setSearchScope(id, allTomes = false) {
    if (dirty) flush()
    searchScopeId = id
    searchAllTomes = allTomes
    renderTree()
    focusSelectedRow()
    $('notes-tree-search').focus()
  }

  function syncScope() {
    const scoped = Boolean(searchScopeId)
    const states = [
      ['notes-scope-all', !scoped && !searchAllTomes],
      ['notes-scope-branch', scoped],
      ['notes-scope-tomes', searchAllTomes],
    ]
    states.forEach(([id, on]) => {
      $(id).classList.toggle('active', on)
      $(id).setAttribute('aria-pressed', String(on))
    })
    $('notes-scope-branch').disabled = !selectedNode()
    $('notes-scope-label').hidden = !scoped
    const path = scoped ? pathTo(searchScopeId) : ''
    $('notes-scope-path').textContent = scoped ? `In: ${path}` : ''
    $('notes-scope-path').title = path
    $('notes-tree-search').placeholder = scoped
      ? 'Search this branch…'
      : searchAllTomes
        ? 'Search all tomes…'
        : 'Search this tome…'
  }

  function renderTree() {
    if (searchScopeId && !locate(searchScopeId)) searchScopeId = null
    syncScope()
    const terms = treeQuery.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = (node) => {
      const text = plainTextOf(node)
      return terms.every((term) => text.includes(term))
    }
    const hadFocus = treeEl.contains(document.activeElement)
    // A branch is drawn from the left edge, but keeps its usual level colors.
    const scope = searchScopeId && locate(searchScopeId)
    const levelsAbove = scope ? pathTo(searchScopeId).split(' › ').length - 1 : 0
    // parentLocked: this list is inside a seal, so its nodes can't be moved.
    const build = (list, depth, parentLocked, tome) => {
      const fragment = document.createDocumentFragment()
      const open = tome.id === tomeId
      list.forEach((node) => {
        const childItems = build(node.children, depth + 1, parentLocked || node.sealed, tome)
        if (terms.length && !matches(node) && !childItems.childNodes.length) return
        const li = document.createElement('li')
        li.setAttribute('role', 'treeitem')
        li.dataset.id = node.id
        li.dataset.tome = tome.id
        const selected = open && node.id === selectedId
        li.setAttribute('aria-selected', String(selected))
        const row = document.createElement('div')
        row.className = `notes-tree-row${selected ? ' selected' : ''}`
        row.style.setProperty('--depth', depth)
        // Nodes move only within the open tome.
        row.draggable = open && !parentLocked
        row.tabIndex = selected ? 0 : -1
        const twisty = document.createElement('button')
        twisty.type = 'button'
        twisty.tabIndex = -1
        twisty.className = 'notes-twisty'
        const expanded = terms.length > 0 || !node.collapsed
        if (node.children.length) {
          li.setAttribute('aria-expanded', String(expanded))
          twisty.textContent = expanded ? '▾' : '▸'
          twisty.setAttribute(
            'aria-label',
            expanded ? 'Collapse node' : 'Expand node',
          )
        } else {
          twisty.classList.add('leaf')
          twisty.setAttribute('aria-hidden', 'true')
        }
        const dot = document.createElement('span')
        dot.className = 'notes-dot'
        dot.dataset.level = String((depth + levelsAbove) % 5)
        const name = document.createElement('span')
        name.className = 'notes-node-name'
        name.textContent = node.name
        row.append(twisty, dot, name)
        if (node.sealed) row.append(sealIcon('Sealed: read-only'))
        li.appendChild(row)
        if (node.children.length && expanded) {
          const group = document.createElement('ul')
          group.setAttribute('role', 'group')
          group.appendChild(childItems)
          li.appendChild(group)
        }
        fragment.appendChild(li)
      })
      return fragment
    }
    if (searchAllTomes) {
      // Every tome under a heading; a tome with no matches is left out.
      const fragment = document.createDocumentFragment()
      tomes.forEach((tome) => {
        const items = build(tome.nodes, 0, tome.sealed, tome)
        if (terms.length && !items.childNodes.length) return
        const section = document.createElement('li')
        section.className = 'notes-tree-tome'
        section.setAttribute('role', 'none')
        const heading = document.createElement('div')
        heading.className = `notes-tree-tome-name${tome.id === tomeId ? ' current' : ''}`
        heading.dataset.tomeHeading = tome.id
        heading.title = `Open the “${tome.name}” tome`
        heading.textContent = tome.name
        if (tome.sealed) heading.append(sealIcon('Sealed tome: read-only'))
        const group = document.createElement('ul')
        group.setAttribute('role', 'group')
        group.setAttribute('aria-label', tome.name)
        group.appendChild(items)
        section.append(heading, group)
        fragment.appendChild(section)
      })
      treeEl.replaceChildren(fragment)
    } else {
      treeEl.replaceChildren(
        build(
          scope ? [scope.node] : nodes,
          0,
          listLocked(scope ? parentIdOf(scope) : null),
          activeTome(),
        ),
      )
    }
    syncTreeTools()
    if (terms.length && !treeEl.querySelector('li[data-id]')) {
      const none = document.createElement('li')
      none.className = 'notes-tree-none'
      none.textContent = scope
        ? 'No notes in this branch match'
        : searchAllTomes
          ? 'No notes in any tome match'
          : 'No notes match'
      treeEl.replaceChildren(none)
      treeEl.appendChild(none)
    }
    if (hadFocus) focusSelectedRow()
  }

  function focusSelectedRow() {
    const row = treeEl.querySelector('.notes-tree-row.selected')
    if (row) {
      row.focus()
      row.scrollIntoView({ block: 'nearest' })
    }
  }

  // ─── Tree actions ───────────────────────────────────────────────────
  // Selects a node that may be in another tome (from "All tomes").
  function openNode(id, nodeId) {
    if (id && id !== tomeId) switchTome(id, { keepSearch: true })
    selectNode(nodeId)
  }
  const openRow = (li) => openNode(li.dataset.tome, li.dataset.id)

  function selectNode(id) {
    if (id === selectedId) return
    if (dirty) flush()
    selectedId = id
    persist()
    renderTree()
    showSelected()
  }

  function addNode(asChild) {
    const at = locate(selectedId)
    if (listLocked(at ? (asChild ? at.node.id : parentIdOf(at)) : null)) return
    if (dirty) flush()
    const node = newNode('New Node')
    if (!at) {
      nodes.push(node)
    } else if (asChild) {
      at.node.children.push(node)
      at.node.collapsed = false
    } else {
      at.list.splice(at.index + 1, 0, node)
    }
    selectedId = node.id
    leaveScopeIfOutside(node.id)
    treeQuery = ''
    $('notes-tree-search').value = ''
    persist()
    renderTree()
    showSelected()
    startRename()
  }

  function startRename() {
    if (isSealed(selectedId)) return
    titleInput.focus()
    titleInput.select()
  }

  async function deleteSelected() {
    const at = locate(selectedId)
    if (!at) return
    const seal = sealOf(at.node.id)
    if (seal || hasSeal(at.node)) {
      const name = `“${at.node.name}”`
      await tell(
        'Branch is sealed',
        seal
          ? `${name} is ${seal === at.node ? 'sealed' : `sealed by ${sealName(seal)}`}. Unseal it before deleting it.`
          : `${name} contains a sealed branch. Unseal that branch before deleting ${name}.`,
      )
      return
    }
    const count = (n) => n.children.reduce((sum, c) => sum + 1 + count(c), 0)
    const below = count(at.node)
    const extra = below
      ? ` and the ${below} node${below === 1 ? '' : 's'} inside it`
      : ''
    const confirmed = await ask({
      title: 'Delete node',
      message: `Delete "${at.node.name}"${extra}? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!confirmed) return
    // Look it up again: nothing may have moved while the dialog was open, but
    // the tree belongs to this page and a stale index would delete the wrong node.
    const current = locate(at.node.id)
    if (!current) return
    clearTimeout(saveTimer)
    dirty = false
    current.list.splice(current.index, 1)
    const next =
      current.list[current.index] ||
      current.list[current.index - 1] ||
      current.parent
    selectedId = next ? next.id : null
    persist()
    renderTree()
    showSelected()
    focusSelectedRow()
  }

  function moveSelected(direction) {
    const at = locate(selectedId)
    if (!at || listLocked(parentIdOf(at))) return
    const { node, list, index, parent } = at
    if (direction === 'left' && parent && listLocked(parentIdOf(locate(parent.id)))) return
    if (direction === 'right' && index > 0 && isSealed(list[index - 1].id)) return
    if (direction === 'up' && index > 0) {
      list.splice(index, 1)
      list.splice(index - 1, 0, node)
    } else if (direction === 'down' && index < list.length - 1) {
      list.splice(index, 1)
      list.splice(index + 1, 0, node)
    } else if (direction === 'left' && parent) {
      const outer = locate(parent.id)
      list.splice(index, 1)
      outer.list.splice(outer.index + 1, 0, node)
    } else if (direction === 'right' && index > 0) {
      const newParent = list[index - 1]
      list.splice(index, 1)
      newParent.children.push(node)
      newParent.collapsed = false
    } else {
      return
    }
    leaveScopeIfOutside(node.id)
    persist()
    renderTree()
    $('notes-path').textContent = pathTo(node.id)
  }

  // Whether a node may be dropped before, after or inside another.
  function canDrop(id, targetId, position) {
    const from = locate(id)
    const target = locate(targetId)
    if (!from || !target || id === targetId || isInside(targetId, from.node)) return false
    if (listLocked(parentIdOf(from))) return false
    return position === 'inside' ? !isSealed(targetId) : !listLocked(parentIdOf(target))
  }

  // Drops a node before, after or inside another (drag and drop).
  function moveNodeTo(id, targetId, position) {
    const from = locate(id)
    if (!canDrop(id, targetId, position)) return
    from.list.splice(from.index, 1)
    const target = locate(targetId)
    if (position === 'inside') {
      target.node.children.push(from.node)
      target.node.collapsed = false
    } else {
      target.list.splice(
        target.index + (position === 'after' ? 1 : 0),
        0,
        from.node,
      )
    }
    leaveScopeIfOutside(id)
    persist()
    renderTree()
    $('notes-path').textContent = pathTo(selectedId)
  }

  function toggleCollapsed(id, collapsed) {
    const at = locateAnywhere(id)
    if (!at || !at.node.children.length) return
    at.node.collapsed = collapsed === undefined ? !at.node.collapsed : collapsed
    persist()
    renderTree()
  }

  // ─── Tree events ────────────────────────────────────────────────────
  $('notes-add-node').addEventListener('click', () => addNode(false))
  $('notes-add-child').addEventListener('click', () => addNode(true))
  $('notes-empty-add').addEventListener('click', () => addNode(false))
  $('notes-delete-node').addEventListener('click', deleteSelected)
  $('notes-scope-all').addEventListener('click', () => setSearchScope(null))
  $('notes-scope-clear').addEventListener('click', () => setSearchScope(null))
  $('notes-scope-branch').addEventListener('click', () => {
    if (!searchScopeId) setSearchScope(selectedId)
  })
  $('notes-scope-tomes').addEventListener('click', () => setSearchScope(null, true))
  $('notes-tree-search').addEventListener('input', (e) => {
    if (dirty) flush()
    treeQuery = e.target.value.trim()
    renderTree()
    refreshMatches({ jump: true })
  })

  treeEl.addEventListener('click', (e) => {
    const heading = e.target.closest('[data-tome-heading]')
    if (heading) {
      switchTome(heading.dataset.tomeHeading, { keepSearch: true })
      return
    }
    const li = e.target.closest('li[data-id]')
    if (!li) return
    if (e.target.closest('.notes-twisty:not(.leaf)')) {
      toggleCollapsed(li.dataset.id)
      return
    }
    openRow(li)
  })
  treeEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('.notes-node-name')) startRename()
  })
  treeEl.addEventListener('keydown', (e) => {
    const row = e.target.closest('.notes-tree-row')
    if (!row) return
    const rows = [...treeEl.querySelectorAll('.notes-tree-row')]
    const index = rows.indexOf(row)
    const li = row.parentElement
    const id = li.dataset.id
    const go = (target) => {
      if (!target) return
      openRow(target.parentElement)
      focusSelectedRow()
    }
    const expanded = li.getAttribute('aria-expanded')
    if (e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault()
      moveSelected(e.key.slice(5).toLowerCase())
      focusSelectedRow()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      go(rows[index + 1])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      go(rows[index - 1])
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (expanded === 'false') toggleCollapsed(id, false)
      else if (expanded === 'true') go(rows[index + 1])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (expanded === 'true') toggleCollapsed(id, true)
      else go(li.parentElement.closest('li[data-id]')?.firstElementChild)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      editor.focus()
    } else if (e.key === 'F2') {
      e.preventDefault()
      startRename()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      deleteSelected()
    }
  })

  // Drag and drop: top quarter = before, bottom quarter = after, middle = inside.
  const DRAG_TYPE = 'application/x-spellbook-note'
  let draggingId = null
  let dropMark = null
  const clearDropMark = () => {
    if (dropMark) dropMark.classList.remove('drop-before', 'drop-after', 'drop-inside')
    dropMark = null
  }
  const dropTarget = (e) => {
    const row = e.target.closest && e.target.closest('.notes-tree-row')
    if (!row || !draggingId) return null
    const targetId = row.parentElement.dataset.id
    const rect = row.getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    const position = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
    return canDrop(draggingId, targetId, position) ? { row, targetId, position } : null
  }
  treeEl.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]')
    if (!li) return
    draggingId = li.dataset.id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_TYPE, draggingId)
  })
  treeEl.addEventListener('dragover', (e) => {
    clearDropMark()
    const drop = dropTarget(e)
    if (!drop) return
    e.preventDefault()
    drop.row.classList.add(`drop-${drop.position}`)
    dropMark = drop.row
  })
  treeEl.addEventListener('dragleave', clearDropMark)
  treeEl.addEventListener('dragend', () => {
    draggingId = null
    clearDropMark()
  })
  treeEl.addEventListener('drop', (e) => {
    const drop = dropTarget(e)
    clearDropMark()
    if (!drop) return
    e.preventDefault()
    moveNodeTo(draggingId, drop.targetId, drop.position)
    draggingId = null
  })

  // Right-click menu.
  let treeMenu = null
  const closeTreeMenu = () => {
    if (treeMenu) treeMenu.remove()
    treeMenu = null
  }
  function treeMenuItems(hasNode) {
    const at = hasNode && locate(selectedId)
    if (!at) return [['Add Node', () => addNode(false), listLocked(null)]]
    const seal = sealOf(at.node.id)
    const fixed = listLocked(parentIdOf(at))
    const sealItem = at.node.sealed
      ? ['Unseal Branch', () => setSeal(at.node, false)]
      : seal
        ? [
            seal === activeTome() ? 'Unseal Tome' : `Unseal “${seal.name}”`,
            () => setSeal(seal, false),
          ]
        : ['Seal Branch', () => setSeal(at.node, true)]
    return [
      ['Add Node', () => addNode(false), fixed],
      ['Add Subnode', () => addNode(true), Boolean(seal)],
      ['Rename', startRename, Boolean(seal)],
      ['Search This Branch', () => setSearchScope(selectedId)],
      null,
      sealItem,
      null,
      ['Move Up', () => moveSelected('up'), fixed],
      ['Move Down', () => moveSelected('down'), fixed],
      ['Move Out a Level', () => moveSelected('left'), fixed],
      ['Move In a Level', () => moveSelected('right'), fixed],
      null,
      ['Delete', deleteSelected],
    ]
  }

  // items: [label, action, disabled] or null for a divider.
  function openMenu(x, y, items) {
    closeTreeMenu()
    treeMenu = document.createElement('div')
    treeMenu.className = 'notes-menu'
    treeMenu.setAttribute('role', 'menu')
    items.forEach((item) => {
      if (!item) {
        treeMenu.appendChild(document.createElement('hr'))
        return
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.textContent = item[0]
      button.disabled = Boolean(item[2])
      button.addEventListener('click', () => {
        closeTreeMenu()
        item[1]()
      })
      treeMenu.appendChild(button)
    })
    document.body.appendChild(treeMenu)
    const rect = treeMenu.getBoundingClientRect()
    treeMenu.style.left = `${Math.min(x, innerWidth - rect.width - 8)}px`
    treeMenu.style.top = `${Math.min(y, innerHeight - rect.height - 8)}px`
    const first = treeMenu.querySelector('button:not(:disabled)')
    if (first) first.focus()
  }
  $('notes-tree').closest('aside').addEventListener('contextmenu', (e) => {
    if (e.target.closest('input')) return
    e.preventDefault()
    const li = e.target.closest('li[data-id]')
    if (li) openRow(li)
    let { clientX: x, clientY: y } = e
    if (!x && !y && li) {
      const rect = li.firstElementChild.getBoundingClientRect()
      x = rect.left + 24
      y = rect.bottom
    }
    openMenu(x, y, treeMenuItems(Boolean(li)))
  })
  document.addEventListener('pointerdown', (e) => {
    if (treeMenu && !treeMenu.contains(e.target)) closeTreeMenu()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && treeMenu) {
      const fromTab = treeMenu.dataset.from === 'tab'
      closeTreeMenu()
      if (fromTab) focusActiveTab()
      else focusSelectedRow()
    }
  })

  // Node name box.
  titleInput.addEventListener('input', () => {
    const node = selectedNode()
    if (!node) return
    node.name = titleInput.value
    const name = treeEl.querySelector(
      `li[data-id="${CSS.escape(node.id)}"] > .notes-tree-row .notes-node-name`,
    )
    if (name) name.textContent = node.name
    $('notes-path').textContent = pathTo(node.id)
    syncScope()
    markDirty()
  })
  titleInput.addEventListener('blur', () => {
    const node = selectedNode()
    if (node && !node.name.trim()) {
      node.name = 'Untitled'
      titleInput.value = node.name
      renderTree()
      $('notes-path').textContent = pathTo(node.id)
      markDirty()
    }
  })
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      editor.focus()
    }
  })

  // Resizable divider between the tree and the editor.
  ;(() => {
    const body = $('notes-body')
    const splitter = $('notes-splitter')
    const MIN = 160
    const setWidth = (px, keep = true) => {
      const width = Math.max(MIN, Math.min(px, body.clientWidth - 320 || px))
      body.style.setProperty('--notes-tree-width', `${width}px`)
      if (keep) {
        try {
          localStorage.setItem(PANE_KEY, String(Math.round(width)))
        } catch {}
      }
    }
    const saved = Number.parseFloat(localStorage.getItem(PANE_KEY))
    if (saved > 0) body.style.setProperty('--notes-tree-width', `${saved}px`)
    splitter.addEventListener('pointerdown', (e) => {
      splitter.setPointerCapture(e.pointerId)
      splitter.classList.add('dragging')
      document.body.style.userSelect = 'none'
    })
    splitter.addEventListener('pointermove', (e) => {
      if (splitter.hasPointerCapture(e.pointerId)) {
        setWidth(e.clientX - body.getBoundingClientRect().left)
      }
    })
    const endDrag = () => {
      splitter.classList.remove('dragging')
      document.body.style.userSelect = ''
    }
    splitter.addEventListener('pointerup', endDrag)
    splitter.addEventListener('pointercancel', endDrag)
    splitter.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const current = splitter.previousElementSibling.offsetWidth
      setWidth(current + (e.key === 'ArrowLeft' ? -20 : 20))
    })
    splitter.addEventListener('dblclick', () => {
      body.style.removeProperty('--notes-tree-width')
      try {
        localStorage.removeItem(PANE_KEY)
      } catch {}
    })
  })()

  // ─── Text editor ────────────────────────────────────────────────────
  // document.execCommand is deprecated but still the only dependency-free way
  // to edit rich text with the browser's own undo history.
  let savedRange = null

  const selectionInEditor = () => {
    const selection = getSelection()
    return selection.rangeCount && editor.contains(selection.anchorNode)
      ? selection
      : null
  }

  // Cards are small forms inside the note: their inputs, not the editor, own any
  // typing, pasting or dropping that happens in them.
  const inCard = (node) => {
    const el = node && node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node
    return Boolean(el && el.closest && el.closest('.note-command, pre.note-code'))
  }

  // selectionchange can lag behind typing, so this also runs on edits and just
  // before anything that takes focus away from the editor.
  function rememberSelection() {
    const selection = selectionInEditor()
    if (selection && !inCard(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange()
    }
  }

  // Puts the caret back exactly where it was before a dialog took focus.
  function setRange(range) {
    editor.focus()
    if (range && editor.contains(range.startContainer)) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      savedRange = range.cloneRange()
    }
  }

  function restoreSelection() {
    if (document.activeElement === editor && selectionInEditor()) {
      rememberSelection()
      return
    }
    editor.focus()
    if (savedRange && editor.contains(savedRange.startContainer)) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(savedRange)
    }
  }

  function exec(command, value = null) {
    if (isSealed(selectedId)) return
    restoreSelection()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand('defaultParagraphSeparator', false, 'p')
    document.execCommand(command, false, value)
    afterEdit()
  }

  function afterEdit() {
    keepEdgesEditable()
    markDirty()
    refreshMatches()
    updateToolbarState()
  }

  function updateToolbarState() {
    if (!selectionInEditor()) return
    document.querySelectorAll('#notes-toolbar [data-cmd]').forEach((btn) => {
      const state = [
        'bold',
        'italic',
        'underline',
        'strikeThrough',
        'insertUnorderedList',
        'insertOrderedList',
        'justifyCenter',
        'justifyRight',
      ].includes(btn.dataset.cmd)
        ? document.queryCommandState(btn.dataset.cmd)
        : false
      btn.classList.toggle('active', state)
    })
    const block = document.queryCommandValue('formatBlock').toLowerCase()
    formatSelect.value = [...formatSelect.options].some((o) => o.value === block)
      ? block
      : 'p'
    $('notes-inline-code').classList.toggle('active', Boolean(enclosing('code')))
    $('notes-table-tools').hidden = !enclosing('td, th') || isSealed(selectedId)
  }

  function enclosing(selector) {
    const selection = selectionInEditor()
    if (!selection) return null
    let node = selection.anchorNode
    if (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement
    const found = node && node.closest(selector)
    return found && editor.contains(found) ? found : null
  }

  document.addEventListener('selectionchange', () => {
    if (!selectionInEditor()) return
    rememberSelection()
    updateToolbarState()
  })

  // Keep the editor's selection when toolbar buttons are pressed.
  $('notes-toolbar').addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault()
  })
  $('notes-toolbar').addEventListener('click', (e) => {
    const button = e.target.closest('[data-cmd]')
    if (button) exec(button.dataset.cmd)
  })
  formatSelect.addEventListener('change', () => {
    if (formatSelect.value === 'pre') {
      formatSelect.value = 'p'
      insertCodeBlock()
      return
    }
    exec('formatBlock', `<${formatSelect.value}>`)
  })
  $('notes-code-block').addEventListener('click', insertCodeBlock)
  $('notes-fore').addEventListener('change', (e) => exec('foreColor', e.target.value))
  $('notes-back').addEventListener('change', (e) => exec('hiliteColor', e.target.value))

  function toggleInlineCode() {
    restoreSelection()
    const code = enclosing('code')
    if (code && !code.closest('pre')) {
      const range = document.createRange()
      range.selectNode(code)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.execCommand('insertText', false, code.textContent)
      afterEdit()
      return
    }
    const selection = selectionInEditor()
    if (!selection || selection.isCollapsed || code) return
    const text = selection.toString()
    if (text.includes('\n')) {
      insertCodeBlock()
      return
    }
    document.execCommand('insertHTML', false, `<code>${escapeHtml(text)}</code>`)
    afterEdit()
  }
  $('notes-inline-code').addEventListener('click', toggleInlineCode)

  async function insertLink() {
    restoreSelection()
    const selection = selectionInEditor()
    const collapsed = !selection || selection.isCollapsed
    const caret = savedRange && savedRange.cloneRange()
    const toHref = (typed) => {
      const text = typed.trim()
      return safeHref(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
    }
    const typed = await ask({
      title: 'Insert link',
      input: 'https://',
      confirmText: 'Insert',
      validate: (value) =>
        value.trim() && value.trim() !== 'https://' && toHref(value)
          ? ''
          : 'Enter an http://, https:// or mailto: address.',
    })
    setRange(caret)
    if (typed === null) return
    const href = toHref(typed)
    if (collapsed) {
      const link = document.createElement('a')
      link.href = href
      link.textContent = href
      document.execCommand('insertHTML', false, link.outerHTML)
      afterEdit()
    } else {
      exec('createLink', href)
    }
  }
  $('notes-link').addEventListener('click', insertLink)

  editor.addEventListener('input', (e) => {
    if (e.target.closest && e.target.closest('pre.note-code')) {
      codeBlockInput(e)
      return
    }
    if (inCard(e.target)) {
      // Saved on the card itself, so it stays in this note only.
      const card = e.target.closest('.note-command')
      const values = readCommandFieldValues(card.querySelectorAll('[data-var]'))
      Object.keys(values).forEach((key) => {
        if (!values[key]) delete values[key]
      })
      card.dataset.values = JSON.stringify(values)
      updateGeneratedCommand(card)
      markDirty()
      refreshMatches()
      return
    }
    keepEdgesEditable()
    rememberSelection()
    markDirty()
    refreshMatches()
  })

  editor.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('.note-code-input')) {
      codeBlockKeydown(e)
      return
    }
    if (inCard(e.target) || isSealed(selectedId)) return
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault()
      flush()
    } else if (ctrl && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      insertLink()
    } else if (e.key === 'Tab' && enclosing('li')) {
      e.preventDefault()
      exec(e.shiftKey ? 'outdent' : 'indent')
    } else if (e.key === 'Tab' && enclosing('td, th')) {
      e.preventDefault()
      moveBetweenCells(enclosing('td, th'), e.shiftKey)
    } else if (e.key === 'Tab' && enclosing('pre') && !e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '    ')
    } else if (e.key === 'Enter' && enclosing('pre') && !ctrl) {
      // Stay in one code block instead of starting a new one for every line.
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  })

  // Clicks inside the editor: card links, card remove, and Ctrl+click on links.
  editor.addEventListener('click', (e) => {
    const codeCopy = e.target.closest('.note-code-copy')
    if (codeCopy) {
      const text = codeCopy.closest('pre.note-code').querySelector('.note-code-input').value
      navigator.clipboard.writeText(text).then(() => {
        codeCopy.textContent = 'Copied!'
        setTimeout(() => {
          codeCopy.textContent = 'Copy'
        }, 1200)
      })
      return
    }
    const codeRemove = e.target.closest('.note-code-remove')
    if (codeRemove) {
      if (isSealed(selectedId)) return
      const range = document.createRange()
      range.selectNode(codeRemove.closest('pre.note-code'))
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      document.execCommand('delete')
      afterEdit()
      return
    }
    const copy = e.target.closest('.note-command .copy-btn')
    if (copy) {
      const code = copy.parentElement.querySelector('code')
      navigator.clipboard.writeText(code.textContent).then(() => {
        copy.textContent = 'Copied!'
        setTimeout(() => {
          copy.textContent = 'Copy'
        }, 1200)
      })
      return
    }
    const edit = e.target.closest('.note-command-edit')
    if (edit) {
      editCardEntry(edit.closest('.note-command'))
      return
    }
    const remove = e.target.closest('.note-command-remove')
    if (remove && isSealed(selectedId)) return
    if (remove) {
      e.preventDefault()
      const range = document.createRange()
      range.selectNode(remove.closest('.note-command'))
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      document.execCommand('delete')
      afterEdit()
      return
    }
    const link = e.target.closest('a[href]')
    if (!link) return
    e.preventDefault()
    if (link.classList.contains('note-term') && link.classList.contains('missing')) {
      return
    }
    if (link.closest('.note-command') || link.classList.contains('note-term')) {
      flush()
      location.hash = link.getAttribute('href')
    } else if (e.ctrlKey || e.metaKey) {
      const href = safeHref(link.getAttribute('href'))
      if (href) window.open(href, '_blank', 'noopener')
    }
  })

  // Opens the Spell Book's own Edit Command or Edit Script window for a card's
  // entry. Saving changes the entry everywhere; every card showing it redraws.
  function editCardEntry(card) {
    const isScript = card.dataset.scriptId !== undefined
    const entry = isScript
      ? scripts.find((s) => s.id === card.dataset.scriptId)
      : commands.find((c) => c.id === card.dataset.commandId)
    if (!entry) return
    if (dirty) flush()
    rememberSelection()
    openEntryModalWithHooks(
      isScript ? 'script' : 'command',
      { onSave: refreshCards },
      entry,
    )
  }

  function insertClean(html, text) {
    if (html && !enclosing('pre')) {
      document.execCommand('insertHTML', false, sanitize(html, { keepStyles: false }))
    } else if (text) {
      document.execCommand('insertText', false, text)
    } else {
      return
    }
    cardsIn(editor).forEach((card) => {
      if (!card.querySelector('.note-command-head')) drawCard(card)
    })
    termLinksIn(editor).forEach(drawTermLink)
    drawCodeBlocks()
    afterEdit()
  }

  editor.addEventListener('paste', (e) => {
    if (inCard(e.target) || isSealed(selectedId)) return
    e.preventDefault()
    insertClean(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    )
  })

  // Moving text within the note is left to the browser; drops from anywhere
  // else go through the sanitizer.
  let draggingInEditor = false
  editor.addEventListener('dragstart', () => {
    draggingInEditor = true
  })
  editor.addEventListener('dragend', () => {
    draggingInEditor = false
  })
  editor.addEventListener('drop', (e) => {
    if (draggingInEditor || inCard(e.target) || isSealed(selectedId)) return
    e.preventDefault()
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (range) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
    insertClean(
      e.dataTransfer.getData('text/html'),
      e.dataTransfer.getData('text/plain'),
    )
  })

  // ─── Tables ─────────────────────────────────────────────────────────
  const MAX_TABLE_ROWS = 50
  const MAX_TABLE_COLS = 12

  async function insertTable() {
    restoreSelection()
    const caret = savedRange && savedRange.cloneRange()
    const form = document.createElement('div')
    form.className = 'notes-table-form'
    form.innerHTML = `
      <label>Rows <input id="notes-table-rows" max="${MAX_TABLE_ROWS}" min="1" type="number" value="3"/></label>
      <label>Columns <input id="notes-table-cols" max="${MAX_TABLE_COLS}" min="1" type="number" value="3"/></label>
      <label class="notes-table-header"><input id="notes-table-head" checked type="checkbox"/> First row is a header</label>`
    const rowsInput = form.querySelector('#notes-table-rows')
    const colsInput = form.querySelector('#notes-table-cols')
    const inRange = (input, max) =>
      Number.isInteger(input.valueAsNumber) &&
      input.valueAsNumber >= 1 &&
      input.valueAsNumber <= max
    const confirmed = await ask({
      title: 'Insert table',
      confirmText: 'Insert',
      extra: form,
      validate: () =>
        inRange(rowsInput, MAX_TABLE_ROWS) && inRange(colsInput, MAX_TABLE_COLS)
          ? ''
          : `Use 1 to ${MAX_TABLE_ROWS} rows and 1 to ${MAX_TABLE_COLS} columns.`,
    })
    setRange(caret)
    if (!confirmed) return
    const rows = rowsInput.valueAsNumber
    const cols = colsInput.valueAsNumber
    const hasHead = form.querySelector('#notes-table-head').checked
    const row = (tag) => `<tr>${`<${tag}><br></${tag}>`.repeat(cols)}</tr>`
    const head = hasHead ? `<thead>${row('th')}</thead>` : ''
    const bodyRows = hasHead ? rows - 1 : rows
    const body = bodyRows ? `<tbody>${row('td').repeat(bodyRows)}</tbody>` : ''
    replaceCaretBlock(`<table data-new-table="1">${head}${body}</table><p><br></p>`)
    const table = editor.querySelector('table[data-new-table]')
    if (table) {
      table.removeAttribute('data-new-table')
      caretInto(table.rows[0].cells[0])
    }
    afterEdit()
  }

  function caretInto(cell) {
    const selection = getSelection()
    selection.selectAllChildren(cell)
    selection.collapseToStart()
    rememberSelection()
  }

  const newCell = (tag) => {
    const cell = document.createElement(tag)
    cell.appendChild(document.createElement('br'))
    return cell
  }
  const widthOf = (table) =>
    Math.max(...[...table.rows].map((row) => row.cells.length))

  // Each change swaps in an edited copy through execCommand, so Ctrl+Z undoes it.
  // `change` returns the cell the caret should land in.
  function rewriteTable(cell, change) {
    const table = cell.closest('table')
    const copy = table.cloneNode(true)
    const rowIndex = cell.parentElement.rowIndex
    const colIndex = cell.cellIndex
    const target = change(copy, rowIndex, colIndex)
    if (target) target.dataset.caret = '1'
    const range = document.createRange()
    range.selectNode(table)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('insertHTML', false, copy.outerHTML)
    const landing = editor.querySelector('[data-caret]')
    if (landing) {
      landing.removeAttribute('data-caret')
      caretInto(landing)
    }
    afterEdit()
  }

  function addRow(copy, rowIndex, colIndex, below) {
    const reference = copy.rows[rowIndex]
    const row = document.createElement('tr')
    for (let i = 0; i < widthOf(copy); i++) row.appendChild(newCell('td'))
    // A new row beside a header row is an ordinary row at the top of the body.
    if (reference.parentElement.tagName === 'THEAD') {
      const body = copy.tBodies[0] || copy.createTBody()
      body.insertBefore(row, body.firstChild)
    } else if (below) {
      reference.after(row)
    } else {
      reference.before(row)
    }
    return row.cells[Math.min(colIndex, row.cells.length - 1)]
  }

  function addColumn(copy, rowIndex, at) {
    ;[...copy.rows].forEach((row) => {
      const tag = row.parentElement.tagName === 'THEAD' ? 'th' : 'td'
      row.insertBefore(newCell(tag), row.cells[at] || null)
    })
    return copy.rows[rowIndex].cells[at]
  }

  function deleteRow(copy, rowIndex, colIndex) {
    const row = copy.rows[rowIndex]
    const section = row.parentElement
    row.remove()
    if (!section.rows.length) section.remove()
    const next = copy.rows[Math.min(rowIndex, copy.rows.length - 1)]
    return next.cells[Math.min(colIndex, next.cells.length - 1)]
  }

  function deleteColumn(copy, rowIndex, colIndex) {
    ;[...copy.rows].forEach((row) => {
      if (row.cells[colIndex]) row.cells[colIndex].remove()
    })
    const row = copy.rows[rowIndex]
    return row.cells[Math.min(colIndex, row.cells.length - 1)]
  }

  function deleteTable(cell) {
    const range = document.createRange()
    range.selectNode(cell.closest('table'))
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('delete')
    afterEdit()
  }

  function tableAction(action) {
    const cell = enclosing('td, th')
    if (!cell) return
    const table = cell.closest('table')
    if (
      action === 'del-table' ||
      (action === 'del-row' && table.rows.length === 1) ||
      (action === 'del-col' && widthOf(table) === 1)
    ) {
      deleteTable(cell)
      return
    }
    rewriteTable(cell, (copy, row, col) => {
      if (action === 'row-above') return addRow(copy, row, col, false)
      if (action === 'row-below') return addRow(copy, row, col, true)
      if (action === 'col-left') return addColumn(copy, row, col)
      if (action === 'col-right') return addColumn(copy, row, col + 1)
      if (action === 'del-row') return deleteRow(copy, row, col)
      return deleteColumn(copy, row, col)
    })
  }

  // Tab moves between cells; Tab in the last cell adds a row.
  function moveBetweenCells(cell, backward) {
    const cells = [...cell.closest('table').querySelectorAll('td, th')]
    const next = cells[cells.indexOf(cell) + (backward ? -1 : 1)]
    if (next) {
      caretInto(next)
    } else if (!backward) {
      rewriteTable(cell, (copy, row) => addRow(copy, row, 0, true))
    }
  }

  $('notes-table').addEventListener('click', insertTable)
  $('notes-table-tools').addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault()
  })
  $('notes-table-tools').addEventListener('click', (e) => {
    const button = e.target.closest('[data-table-action]')
    if (button) tableAction(button.dataset.tableAction)
  })

  // ─── Insert Command / Script / Term ─────────────────────────────────
  // Puts a card after the block holding the caret, and reuses that block if it
  // is empty. Done with execCommand so Ctrl+Z takes the card back out.
  function replaceCaretBlock(html) {
    editor.focus()
    const inEditor = savedRange && editor.contains(savedRange.startContainer)
    let block = inEditor ? savedRange.startContainer : editor.lastChild
    while (block && block.parentNode !== editor) block = block.parentNode
    const isEmptyParagraph =
      block &&
      block.nodeType === Node.ELEMENT_NODE &&
      block.matches('p, div:not(.note-command)') &&
      !block.textContent.trim()
    if (!isEmptyParagraph) {
      const paragraph = document.createElement('p')
      paragraph.appendChild(document.createElement('br'))
      if (block) block.after(paragraph)
      else editor.appendChild(paragraph)
      block = paragraph
    }
    const range = document.createRange()
    range.selectNode(block)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('insertHTML', false, html)
  }

  // Shared with js/notes-callouts.js.
  window.NotesEditor = {
    editor,
    enclosing,
    replaceCaretBlock,
    afterEdit,
    restoreSelection,
    // For js/sealed-tomes.js: read the saved tree and draw note HTML elsewhere.
    flush,
    isSealed,
    selectedNode,
    sanitize,
    drawCard,
    drawTermLink,
    cardsIn,
    termLinksIn,
    updateGeneratedCommand,
  }

  function insertCard(shell) {
    replaceCaretBlock(`${shell.outerHTML}<p><br></p>`)
    const selection = getSelection()
    const added = [...cardsIn(editor)].filter(
      (card) => !card.querySelector('.note-command-head'),
    )
    added.forEach(drawCard)
    keepEdgesEditable()
    const after = added.length && added[added.length - 1].nextElementSibling
    if (after) {
      selection.selectAllChildren(after)
      selection.collapseToStart()
      after.scrollIntoView({ block: 'nearest' })
    }
    afterEdit()
  }

  // A term is a link in the running text, at the caret.
  function insertTermLink(term) {
    restoreSelection()
    const link = termLink({ termId: term.id, title: term.term })
    document.execCommand('insertHTML', false, `${link.outerHTML}\u00a0`)
    termLinksIn(editor).forEach(drawTermLink)
    afterEdit()
  }

  const PICKERS = {
    command: {
      heading: 'Insert Command',
      newLabel: '+ New Command',
      noun: 'command',
      search: 'Search title, platform, tags, template…',
      items: () => commands,
      title: (c) => c.title || c.id,
      badge: (c) => (c.platform ? renderBadge('commands', c.platform) : ''),
      preview: (c) =>
        highlightCode(c.command || '', codeLanguageFor(c.platform), { template: true }),
      description: (c) => c.description,
      text: (c) => [c.id, c.title, c.platform, (c.tags || []).join(' '), c.description, c.command, c.example, c.notes],
      insert: (c) => insertCard(cardShell(commandSnapshot(c))),
    },
    script: {
      heading: 'Insert Script',
      newLabel: '+ New Script',
      noun: 'script',
      search: 'Search name, language, tags, script text…',
      items: () => scripts,
      title: (s) => s.name || s.id,
      badge: (s) => (s.language ? renderBadge('scripts', s.language) : ''),
      preview: (s) => highlightCode((s.body || '').split('\n')[0], s.language),
      description: (s) => s.notes,
      text: (s) => [s.id, s.name, s.language, (s.tags || []).join(' '), s.body, s.notes],
      insert: (s) => insertCard(cardShell(scriptSnapshot(s))),
    },
    term: {
      heading: 'Insert Term',
      newLabel: '+ New Term',
      noun: 'term',
      search: 'Search term, category, tags, definition…',
      items: () => terms,
      title: (t) => t.term || t.id,
      badge: (t) => (t.category ? renderBadge('terms', t.category) : ''),
      preview: () => '',
      description: (t) => t.definition,
      text: (t) => [t.id, t.term, t.category, (t.tags || []).join(' '), t.definition, t.notes],
      insert: insertTermLink,
    },
  }

  const picker = $('notes-cmd-modal')
  const pickerSearch = $('notes-cmd-search')
  const pickerResults = $('notes-cmd-results')
  const RESULT_LIMIT = 100
  let pickerKind = 'command'
  let pickerActive = 0

  function findEntries(query) {
    const config = PICKERS[pickerKind]
    const terms_ = query.toLowerCase().split(/\s+/).filter(Boolean)
    const titleRank = (item) =>
      terms_.some((t) => String(config.title(item)).toLowerCase().includes(t)) ? 0 : 1
    return config
      .items()
      .filter((item) => {
        const text = config.text(item).join(' ').toLowerCase()
        return terms_.every((term) => text.includes(term))
      })
      .sort(
        (a, b) =>
          titleRank(a) - titleRank(b) ||
          String(config.title(a)).localeCompare(String(config.title(b))),
      )
  }

  function renderPicker() {
    const config = PICKERS[pickerKind]
    const total = config.items().length
    const found = findEntries(pickerSearch.value)
    const shown = found.slice(0, RESULT_LIMIT)
    pickerActive = Math.min(pickerActive, Math.max(shown.length - 1, 0))
    pickerResults.innerHTML = shown.length
      ? shown
          .map((item, i) => {
            const preview = config.preview(item)
            const description = config.description(item)
            return `
          <button class="notes-cmd-result${i === pickerActive ? ' active' : ''}" data-id="${escapeHtml(item.id)}" role="option" aria-selected="${i === pickerActive}" tabindex="-1" type="button">
            <span class="notes-cmd-result-head">
              <span class="notes-cmd-result-title">${escapeHtml(config.title(item))}</span>
              ${config.badge(item)}
            </span>
            ${preview ? `<code class="notes-cmd-result-code">${preview}</code>` : ''}
            ${description ? `<span class="notes-cmd-result-desc">${escapeHtml(description)}</span>` : ''}
          </button>`
          })
          .join('')
      : `<div class="notes-cmd-none">${
          total
            ? `No ${config.noun}s match. Use ${config.newLabel} to add this one.`
            : `No ${config.noun}s yet. Use ${config.newLabel} to add one.`
        }</div>`
    $('notes-cmd-count').textContent = found.length > RESULT_LIMIT
      ? `Showing ${RESULT_LIMIT} of ${found.length} ${config.noun}s`
      : `${found.length} of ${total} ${config.noun}${total === 1 ? '' : 's'}`
  }

  function setPickerActive(index) {
    const items = [...pickerResults.querySelectorAll('.notes-cmd-result')]
    if (!items.length) return
    pickerActive = (index + items.length) % items.length
    items.forEach((item, i) => {
      item.classList.toggle('active', i === pickerActive)
      item.setAttribute('aria-selected', String(i === pickerActive))
    })
    items[pickerActive].scrollIntoView({ block: 'nearest' })
  }

  function openPicker(kind) {
    const config = PICKERS[kind]
    pickerKind = kind
    pickerActive = 0
    $('notes-cmd-heading').textContent = config.heading
    $('notes-cmd-new').textContent = config.newLabel
    pickerSearch.placeholder = config.search
    pickerSearch.value = ''
    picker.classList.add('open')
    renderPicker()
    pickerSearch.focus()
  }

  function closePicker() {
    picker.classList.remove('open')
  }

  function cancelPicker() {
    closePicker()
    restoreSelection()
  }

  function chooseEntry(id) {
    const config = PICKERS[pickerKind]
    const item = config.items().find((entry) => entry.id === id)
    if (!item) return
    closePicker()
    config.insert(item)
  }

  document.querySelectorAll('[data-insert]').forEach((button) => {
    button.addEventListener('click', () => {
      rememberSelection()
      openPicker(button.dataset.insert)
    })
  })
  $('notes-cmd-cancel').addEventListener('click', cancelPicker)
  picker.addEventListener('click', (e) => {
    if (e.target === picker) cancelPicker()
  })
  picker.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      cancelPicker()
    }
  })
  pickerSearch.addEventListener('input', () => {
    pickerActive = 0
    renderPicker()
    pickerResults.scrollTop = 0
  })
  pickerSearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickerActive(pickerActive + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickerActive(pickerActive - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = pickerResults.querySelector('.notes-cmd-result.active')
      if (item) chooseEntry(item.dataset.id)
    }
  })
  pickerResults.addEventListener('click', (e) => {
    const item = e.target.closest('.notes-cmd-result')
    if (item) chooseEntry(item.dataset.id)
  })
  $('notes-cmd-new').addEventListener('click', () => {
    const kind = pickerKind
    closePicker()
    openEntryModalWithHooks(kind, {
      onSave: (entry) => PICKERS[kind].insert(entry),
      onCancel: () => openPicker(kind),
    })
  })

  // ─── Links from the Spell Book ──────────────────────────────────────
  const REFERENCE_SELECTOR = (kind, id) =>
    `[data-${kind}-id="${CSS.escape(id)}"]`

  // Every note that references an entry, for the "Linked in n notes" section.
  function findLinks(kind, id) {
    if (dirty) flush()
    const links = []
    const walk = (list, parents) => {
      list.forEach((node) => {
        const doc = new DOMParser().parseFromString(node.html, 'text/html')
        if (doc.querySelector(REFERENCE_SELECTOR(kind, id))) {
          links.push({
            nodeId: node.id,
            name: node.name,
            parents: parents.join(' › '),
          })
        }
        walk(node.children, [...parents, node.name])
      })
    }
    // With more than one tome, the path starts with the tome's name.
    if (id) tomes.forEach((tome) => walk(tome.nodes, tomes.length > 1 ? [tome.name] : []))
    return links
  }
  window.NoteLinks = { find: findLinks }

  // #/compendium/<node>/<kind>/<id> (or the old #/notes/...): open that note, in
  // whichever tome holds it, and scroll to the reference. The address then goes
  // back to #/compendium so it can't reopen a stale note on reload.
  function openNoteFromRoute() {
    const match = location.hash.match(
      /^#\/(?:notes|compendium)\/([^/]+)(?:\/(command|script|term)\/(.+))?$/,
    )
    if (!match) return
    history.replaceState(null, '', '#/compendium')
    let nodeId
    let refId
    try {
      nodeId = decodeURIComponent(match[1])
      refId = match[3] && decodeURIComponent(match[3])
    } catch {
      return
    }
    const home = tomes.find((tome) => locate(nodeId, tome.nodes))
    if (!home) return
    switchTome(home.id)
    let found = locate(nodeId)
    if (!found) return
    while (found.parent) {
      found.parent.collapsed = false
      found = locate(found.parent.id)
    }
    leaveScopeIfOutside(nodeId)
    if (nodeId === selectedId) renderTree()
    else selectNode(nodeId)
    const reference = refId && editor.querySelector(REFERENCE_SELECTOR(match[2], refId))
    if (reference) {
      reference.scrollIntoView({ block: 'center' })
      reference.classList.remove('note-flash')
      void reference.offsetWidth
      reference.classList.add('note-flash')
      setTimeout(() => reference.classList.remove('note-flash'), 2000)
    }
  }

  // ─── Tomes ──────────────────────────────────────────────────────────
  const tabsEl = $('notes-tabs')

  function renderTabs() {
    tabsEl.replaceChildren(
      ...tomes.map((tome) => {
        const tab = document.createElement('button')
        tab.type = 'button'
        tab.className = 'notes-tab'
        tab.dataset.id = tome.id
        const active = tome.id === tomeId
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-selected', String(active))
        tab.tabIndex = active ? 0 : -1
        tab.title = `${tome.name}\nDouble-click to rename, right-click for more`
        const name = document.createElement('span')
        name.textContent = tome.name
        tab.append(name)
        if (tome.sealed) tab.append(sealIcon('Sealed tome: read-only'))
        return tab
      }),
    )
  }

  function focusActiveTab() {
    const tab = tabsEl.querySelector('[aria-selected="true"]')
    if (tab) tab.focus()
  }

  // keepSearch: stay in "All tomes" with the same search, for opening a result.
  function switchTome(id, { keepSearch = false } = {}) {
    const tome = tomes.find((t) => t.id === id)
    if (!tome || id === tomeId) return
    if (dirty) flush()
    persist()
    useTome(tome)
    searchScopeId = null
    if (!keepSearch) {
      searchAllTomes = false
      treeQuery = ''
      $('notes-tree-search').value = ''
    }
    persist()
    renderTabs()
    renderTree()
    showSelected()
  }

  async function addTome() {
    const name = await ask({
      title: 'New tome',
      message: 'A tome is a separate tree of notes, shown as a tab.',
      input: 'New Tome',
      confirmText: 'Create',
      validate: (value) => (value.trim() ? '' : 'Enter a name.'),
    })
    if (name === null) return
    const tome = newTome(name.trim())
    tomes.push(tome)
    switchTome(tome.id)
    focusActiveTab()
  }

  async function renameTome(id) {
    const tome = tomes.find((t) => t.id === id)
    if (!tome) return
    if (tome.sealed) {
      await tell('Tome is sealed', `Unseal “${tome.name}” before renaming it.`)
      return
    }
    const name = await ask({
      title: 'Rename tome',
      input: tome.name,
      confirmText: 'Rename',
      validate: (value) => (value.trim() ? '' : 'Enter a name.'),
    })
    if (name === null) return
    tome.name = name.trim()
    persist()
    renderTabs()
    renderNoteLinks()
  }

  async function deleteTome(id) {
    const tome = tomes.find((t) => t.id === id)
    if (!tome) return
    if (tomes.length === 1) {
      await tell('Delete tome', 'The Compendium needs at least one tome.')
      return
    }
    if (tome.sealed || tome.nodes.some(hasSeal)) {
      await tell(
        'Tome is sealed',
        tome.sealed
          ? `“${tome.name}” is sealed. Unseal it before deleting it.`
          : `“${tome.name}” contains a sealed branch. Unseal it before deleting the tome.`,
      )
      return
    }
    const count = (list) => list.reduce((sum, n) => sum + 1 + count(n.children), 0)
    const total = count(tome.nodes)
    const confirmed = await ask({
      title: 'Delete tome',
      message: `Delete the “${tome.name}” tome${total ? ` and the ${total} node${total === 1 ? '' : 's'} in it` : ''}? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!confirmed) return
    const index = tomes.indexOf(tome)
    if (index < 0) return
    if (tome.id === tomeId) {
      clearTimeout(saveTimer)
      dirty = false
      switchTome((tomes[index + 1] || tomes[index - 1]).id)
    }
    tomes.splice(tomes.indexOf(tome), 1)
    persist()
    renderTabs()
    focusActiveTab()
    renderNoteLinks()
  }

  function tabMenuItems(tome) {
    return [
      ['Rename Tome', () => renameTome(tome.id), tome.sealed],
      tome.sealed
        ? ['Unseal Tome', () => setSeal(tome, false)]
        : ['Seal Tome', () => setSeal(tome, true)],
      null,
      ['Delete Tome', () => deleteTome(tome.id), tomes.length === 1],
    ]
  }

  $('notes-add-tome').addEventListener('click', addTome)
  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.notes-tab')
    if (tab) switchTome(tab.dataset.id)
  })
  tabsEl.addEventListener('dblclick', (e) => {
    const tab = e.target.closest('.notes-tab')
    if (tab) renameTome(tab.dataset.id)
  })
  tabsEl.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.notes-tab')
    if (!tab) return
    e.preventDefault()
    switchTome(tab.dataset.id)
    const tome = activeTome()
    let { clientX: x, clientY: y } = e
    if (!x && !y) {
      const rect = tab.getBoundingClientRect()
      x = rect.left
      y = rect.bottom
    }
    openMenu(x, y, tabMenuItems(tome))
    if (treeMenu) treeMenu.dataset.from = 'tab'
  })
  tabsEl.addEventListener('keydown', (e) => {
    const tab = e.target.closest('.notes-tab')
    if (!tab) return
    const index = tomes.findIndex((t) => t.id === tab.dataset.id)
    let next = null
    if (e.key === 'ArrowRight') next = tomes[(index + 1) % tomes.length]
    else if (e.key === 'ArrowLeft') next = tomes[(index - 1 + tomes.length) % tomes.length]
    else if (e.key === 'Home') next = tomes[0]
    else if (e.key === 'End') next = tomes[tomes.length - 1]
    else if (e.key === 'F2') {
      e.preventDefault()
      renameTome(tab.dataset.id)
      return
    }
    if (!next) return
    e.preventDefault()
    switchTome(next.id)
    focusActiveTab()
  })
  $('notes-unseal').addEventListener('click', () => setSeal(sealOf(selectedId), false))

  // For the Back button in app.js: where the Compendium is, and how to return.
  window.NotesNav = {
    current: () => ({ tomeId, nodeId: selectedId }),
    exists(loc) {
      const tome = tomes.find((t) => t.id === loc.tomeId)
      return Boolean(tome && (!loc.nodeId || locate(loc.nodeId, tome.nodes)))
    },
    describe(loc) {
      const tome = tomes.find((t) => t.id === loc.tomeId)
      const found = tome && loc.nodeId && locate(loc.nodeId, tome.nodes)
      if (found) return `“${found.node.name}”`
      return tome ? `the “${tome.name}” tome` : 'the Compendium'
    },
    open(loc) {
      switchTome(loc.tomeId)
      let found = loc.nodeId && locate(loc.nodeId)
      if (found) {
        // Expand the way down to it, as a link from the Spell Book does.
        while (found.parent) {
          found.parent.collapsed = false
          found = locate(found.parent.id)
        }
        leaveScopeIfOutside(loc.nodeId)
        if (loc.nodeId === selectedId) renderTree()
        else selectNode(loc.nodeId)
      }
      refreshCards()
    },
    flush() {
      if (dirty) flush()
    },
  }

  // ─── Page wiring ────────────────────────────────────────────────────
  window.addEventListener('hashchange', () => {
    if (currentPage === 'notes') {
      openNoteFromRoute()
      refreshCards()
    } else {
      flush()
    }
  })
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  loadNotes()
  renderTabs()
  renderTree()
  showSelected()
  savedEl.textContent = 'Saved'
  if (currentPage === 'notes') openNoteFromRoute()
  renderNoteLinks()
})()
