/*
 * Compendium page (called Notes in the code): tabs of tomes, each a CherryTree
 * style node tree beside a rich text editor. Nodes and tomes can be sealed,
 * which makes them read-only until unsealed.
 *
 * Commands, scripts and terms (cards, term links, the Insert pickers, the tag
 * editor) come from the Spells tab's service, SpellBook.service('spells').
 * Also uses the core's escapeHtml, highlightCode, codeLanguageFor, currentPage
 * and scheduleLocationCheck, and registers its Back / Forward places and
 * Trash section with the core. index.html owns the markup (#page-notes, #notes-cmd-modal
 * and #notes-ask). Storage: spellbook_notes_v1 ({ version: 2, tomes, tomeId };
 * version 1 was a single { nodes, selectedId } tree) and spellbook_notes_pane_v1;
 * js/core/datafile.js picks both up through the spellbook_ prefix. It exposes
 * window.NoteLinks for the "Linked in n notes" section in spells.js.
 *
 * Note HTML can arrive from a shared data file, so everything entering the
 * editor from storage, the clipboard or a drop passes through sanitize().
 */
;(() => {
  const NOTES_KEY = 'spellbook_notes_v1'
  // The notes are kept in IndexedDB through js/core/datafile.js (room for images),
  // and still saved in the data file and backups under NOTES_KEY.
  const store = window.DataFile && window.DataFile.getItem
    ? window.DataFile
    : {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value)
            return Promise.resolve(true)
          } catch {
            return Promise.resolve(false)
          }
        },
      }
  const PANE_KEY = 'spellbook_notes_pane_v1'
  // Commands, scripts and terms come from the Spells tab, through its service
  // (js/core/pages.js); see modules/spells/spells.js for what it offers.
  const spells = () => window.SpellBook.service('spells')
  const spellList = (kind) => (spells() ? spells().list(kind) : [])
  // Without Spells (the tab removed), cards and term links show the copy
  // saved in the note, read-only, and the Insert buttons are hidden.
  const badge = (kind, name) => (spells() ? spells().badge(kind, name) : `<span class="badge">${escapeHtml(name)}</span>`)
  const AWAY = 'Spells isn’t installed, so this shows the copy saved in the note.'
  const notesChanged = () => spells() && spells().notesChanged()
  const SAVE_DELAY = 400

  const $ = (id) => document.getElementById(id)
  const pane = $('notes-editor-pane')
  const treeEl = $('notes-tree')
  const editor = $('notes-editor')
  const titleInput = $('notes-title')
  const formatSelect = $('notes-format')
  const fontSelect = $('notes-font')
  const sizeSelect = $('notes-size')
  const savedEl = $('notes-saved')

  // ─── Sanitizer ──────────────────────────────────────────────────────
  // Rebuilds the HTML from an allowlist instead of removing known bad parts.
  const ALLOWED_TAGS = new Set(
    'P DIV BR B STRONG I EM U S STRIKE DEL SUB SUP CODE PRE H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE HR A SPAN TABLE COLGROUP COL THEAD TBODY TR TH TD'.split(
      ' ',
    ),
  )
  // Removed along with their contents; any other unknown tag keeps its text.
  const DROPPED_TAGS = new Set(
    'SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE NOSCRIPT LINK META HEAD TITLE BASE FORM INPUT BUTTON SELECT TEXTAREA VIDEO AUDIO SOURCE CANVAS APPLET FRAME FRAMESET'.split(
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
    'font-family',
    'font-size',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
  ]
  // Font names (letters, spaces, quotes, commas, hyphens) and sizes (a number
  // with a unit, or a size word) from the Font and Size lists.
  const STYLE_CHECKS = {
    'font-family': /^[\w\s,'"-]{1,200}$/,
    'font-size': /^(\d{1,3}(\.\d+)?(px|pt|em|rem|%)|(xx?x?-)?(small|large)|medium|smaller|larger)$/,
  }
  // Table sizes set by hand (see "Table sizes"): column widths, the table's
  // width (their sum) and row heights, in pixels.
  const SIZE_STYLES = { TABLE: 'width', COL: 'width', TR: 'height' }
  const PIXELS = /^\d{1,4}(\.\d+)?px$/
  const MIN_COL = 32 // narrowest column
  const MIN_ROW = 20 // shortest row
  const EDGE = 4 // how near a border the pointer grabs it
  // generated: the command built from the card's values when they were last
  // saved, shown when Spells isn't installed.
  const CARD_FIELDS = ['commandId', 'scriptId', 'title', 'platform', 'template', 'values', 'generated']

  // An image's address: a picture saved in the note (data:image/…;base64, not
  // SVG, which can hold scripts) or a web address.
  const safeImageSrc = (value) => {
    const src = String(value || '').trim()
    if (/^data:image\/(png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(src) && src.length <= 12000000) return src.replace(/\s+/g, '')
    if (/^https?:\/\/[^\s"'<>]+$/i.test(src) && src.length <= 2000) return src
    return ''
  }

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
        // Images (notes.js "Images"): the address, a width and alt text only.
        if (tag === 'IMG') {
          const src = safeImageSrc(child.getAttribute('src'))
          if (!src) return
          const img = target.createElement('img')
          img.setAttribute('src', src)
          const width = parseInt(child.getAttribute('width'), 10)
          if (width >= 16 && width <= 4000) img.setAttribute('width', String(width))
          const alt = String(child.getAttribute('alt') || '').trim().slice(0, 300)
          if (alt) img.setAttribute('alt', alt)
          to.appendChild(img)
          return
        }
        if (
          tag === 'DIV' &&
          (child.hasAttribute('data-command-id') ||
            child.hasAttribute('data-script-id'))
        ) {
          to.appendChild(cardShell(child.dataset, target))
          return
        }
        // Block sections (note-blocks.js): rebuilt from their checked data.
        // Filter tables of older notes become template table sections.
        if (tag === 'DIV' && child.hasAttribute('data-filter-table')) {
          to.appendChild(filterTableAsBlock(child.dataset, target))
          return
        }
        if (tag === 'DIV' && child.hasAttribute('data-block-section')) {
          to.appendChild(blockShell(child.dataset, target))
          return
        }
        // Callout boxes (notes-callouts.js): only the known kinds survive.
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
        // Attachments (note-files.js): a link to a file kept apart.
        if (tag === 'SPAN' && child.hasAttribute('data-attachment')) {
          const chip = fileShell(child.dataset, target)
          if (chip) to.appendChild(chip)
          return
        }
        // Environment variable chips (note-vars.js).
        if (tag === 'SPAN' && child.hasAttribute('data-var-id')) {
          const chip = varShell(child.dataset, target)
          if (chip) to.appendChild(chip)
          return
        }
        // A span raised or lowered (pasted, or older notes) becomes <sup> / <sub>.
        if (tag === 'SPAN' && child.style && /^(super|sub)$/.test(child.style.verticalAlign)) {
          const wrap = target.createElement(child.style.verticalAlign === 'super' ? 'sup' : 'sub')
          const inner = child.cloneNode(true)
          inner.style.removeProperty('vertical-align')
          const holder = target.createElement('div')
          // No other style left: just its contents.
          copyChildren(inner.getAttribute('style') ? { childNodes: [inner] } : inner, holder)
          wrap.append(...holder.childNodes)
          to.appendChild(wrap)
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
            if (value && !/url|expression|javascript|[<>]/i.test(value) && (!STYLE_CHECKS[prop] || STYLE_CHECKS[prop].test(value))) {
              copy.style.setProperty(prop, value)
            }
          })
        }
        if (SIZE_STYLES[tag] && child.style) {
          const size = child.style.getPropertyValue(SIZE_STYLES[tag])
          if (PIXELS.test(size)) copy.style.setProperty(SIZE_STYLES[tag], size)
        }
        // A table that fills the note and sizes its columns to their text
        // (the Expand toggle in "Table options").
        if (tag === 'TABLE' && child.getAttribute('data-expand') === '1') copy.setAttribute('data-expand', '1')
        copyChildren(child, copy)
        to.appendChild(copy)
      })
    }
    const root = target.createElement('div')
    copyChildren(source.body, root)
    return root.innerHTML
  }

  // ─── Block sections ─────────────────────────────────────────────────
  // A block section (note-blocks.js) holds records of one block type, such
  // as Systems or Log entries. It is saved in the note as a shell:
  //   <div data-block-section="1" data-block-type="<type id, or '' when the
  //        section has fields of its own>" [data-block-from="<type id>"]
  //        data-block-schema="<the type's fields, JSON>"
  //        data-block-records="[{ id, v: { <field id>: text },
  //                                    h: { <field id>: rich text HTML } }], JSON">
  // The schema is a snapshot of the type, so the section still shows if the
  // type is deleted or the note goes to someone without it. Both JSON parts
  // pass through these cleaners. Plain values (v) are drawn as text only;
  // rich text values (h, from Rich text fields) go through sanitizeField.
  // "list" fields of older notes are now Rich text, their lines a bulleted list.
  const BLOCK_FIELD_TYPES = ['text', 'long', 'datetime', 'choice', 'number', 'checkbox']
  const BLOCK_LAYOUTS = ['card', 'table', 'form']
  const BLOCK_WRAPS = ['words', 'anywhere', 'none']
  const str = (value, max = 100000) => (typeof value === 'string' ? value.slice(0, max) : '')
  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  function cleanBlockSchema(raw) {
    const s = raw && typeof raw === 'object' ? raw : {}
    const seen = new Set()
    return {
      name: str(s.name, 200).trim() || 'Template',
      addLabel: str(s.addLabel, 200),
      layout: BLOCK_LAYOUTS.includes(s.layout) ? s.layout : 'card',
      fields: (Array.isArray(s.fields) ? s.fields : [])
        .filter((f) => f && typeof f === 'object' && typeof f.id === 'string' && f.id && !seen.has(f.id) && seen.add(f.id))
        .slice(0, 100)
        .map((f) => ({
          id: str(f.id, 100),
          label: str(f.label, 200),
          type: f.type === 'list' ? 'long' : BLOCK_FIELD_TYPES.includes(f.type) ? f.type : 'text',
          options: (Array.isArray(f.options) ? f.options : []).map((o) => str(o, 200).trim()).filter(Boolean).slice(0, 100),
          header: Boolean(f.header),
          now: Boolean(f.now),
          carry: Boolean(f.carry),
          sort: Boolean(f.sort),
          // Shown beside the field before it, on the same row.
          inline: Boolean(f.inline),
          // Line wrapping of short and long text: between words (the default),
          // anywhere (long strings), or not at all.
          wrap: BLOCK_WRAPS.includes(f.wrap) ? f.wrap : 'words',
        })),
    }
  }

  // Rich text in a template field: what a note allows, minus what can't sit
  // inside a field (template sections, tables and info boxes). Command and
  // script cards may. Empty text comes back as ''.
  // Cleaning is remembered: a long log's rich text is checked again on every
  // read and redraw, and the same value always cleans the same way. A clean
  // result is remembered as cleaning to itself, so checking it again is free.
  const fieldCache = new Map()
  const FIELD_CACHE_MAX = 20000
  function sanitizeField(html, { keepStyles = true } = {}) {
    const raw = String(html || '')
    if (raw.length > 200000) return sanitizeFieldNow(raw, keepStyles)
    const key = `${keepStyles ? 1 : 0}${raw}`
    const known = fieldCache.get(key)
    if (known !== undefined) return known
    const clean = sanitizeFieldNow(raw, keepStyles)
    if (fieldCache.size >= FIELD_CACHE_MAX) fieldCache.clear()
    fieldCache.set(key, clean)
    fieldCache.set(`${keepStyles ? 1 : 0}${clean}`, clean)
    return clean
  }
  function sanitizeFieldNow(html, keepStyles) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
    doc.querySelectorAll('[data-block-section], [data-filter-table]').forEach((el) => el.remove())
    doc.querySelectorAll('[data-callout]').forEach((el) => el.removeAttribute('data-callout'))
    doc.querySelectorAll('table').forEach((table) => {
      table.replaceWith(
        ...[...table.rows].map((row) => {
          const p = doc.createElement('p')
          p.textContent = [...row.cells].map((cell) => cell.textContent.trim()).join(' | ')
          return p
        }),
      )
    })
    const clean = sanitize(doc.body.innerHTML, { keepStyles })
    const check = new DOMParser().parseFromString(clean, 'text/html').body
    return check.textContent.trim() || check.querySelector('hr, [data-command-id], [data-script-id]') ? clean : ''
  }

  // A field's searchable text: its words, plus its cards' commands and values.
  function fieldSearchText(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
    const cards = [...doc.querySelectorAll('[data-command-id], [data-script-id]')].map(
      (card) => `${card.dataset.template || ''} ${card.dataset.values || ''}`,
    )
    return `${doc.body.textContent} ${cards.join(' ')}`
  }

  const htmlText = (html) => new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent

  // Plain text as rich text: lines kept, or as a bulleted list.
  function textToFieldHtml(text, asList = false) {
    const escape = (line) => line.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    if (!asList) return escape(String(text)).replace(/\n/g, '<br>')
    const items = String(text).split('\n').map((l) => l.trim()).filter(Boolean)
    return items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''
  }

  // rawSchema: the section's saved fields, before cleaning, to find the
  // List fields of older notes.
  function cleanBlockRecords(raw, rawSchema) {
    const listIds = (rawSchema && Array.isArray(rawSchema.fields) ? rawSchema.fields : [])
      .filter((f) => f && f.type === 'list' && typeof f.id === 'string')
      .map((f) => f.id)
    return (Array.isArray(raw) ? raw : [])
      .filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id)
      .slice(0, 5000)
      .map((r) => {
        const v = {}
        if (r.v && typeof r.v === 'object') {
          Object.entries(r.v).forEach(([key, value]) => {
            if (typeof value === 'string' && value) v[str(key, 100)] = str(value)
          })
        }
        // Line wrapping for one record's field (older notes); it overrides the
        // field's own setting. "words" is the default.
        const w = {}
        if (r.w && typeof r.w === 'object') {
          Object.entries(r.w).forEach(([key, value]) => {
            if (BLOCK_WRAPS.includes(value) && value !== 'words') w[str(key, 100)] = value
          })
        }
        const h = {}
        if (r.h && typeof r.h === 'object') {
          Object.entries(r.h).forEach(([key, value]) => {
            const clean = typeof value === 'string' && value ? sanitizeField(str(value)) : ''
            if (clean) h[str(key, 100)] = clean
          })
        }
        listIds.forEach((id) => {
          if (v[id] && !h[id]) h[id] = textToFieldHtml(v[id], true)
          delete v[id]
        })
        return {
          id: str(r.id, 100),
          v,
          ...(Object.keys(h).length ? { h } : {}),
          ...(Object.keys(w).length ? { w } : {}),
        }
      })
  }

  function blockShell(fields, doc = document) {
    const shell = doc.createElement('div')
    shell.className = 'note-command note-block-section'
    shell.setAttribute('contenteditable', 'false')
    const schema = cleanBlockSchema(parseJson(fields.blockSchema))
    shell.dataset.blockSection = '1'
    shell.dataset.blockType = str(fields.blockType, 100)
    // A section whose fields were changed in the note: the template it came
    // from (note-blocks.js offers to update it).
    if (fields.blockFrom) shell.dataset.blockFrom = str(fields.blockFrom, 100)
    shell.dataset.blockSchema = JSON.stringify(schema)
    shell.dataset.blockRecords = JSON.stringify(cleanBlockRecords(parseJson(fields.blockRecords), parseJson(fields.blockSchema)))
    shell.textContent = schema.name
    return shell
  }

  const blockSectionsIn = (root) => root.querySelectorAll('.note-block-section')

  // ─── Filter tables (older notes) ────────────────────────────────────
  // Notes once held "filter tables", saved as
  //   <div data-filter-table="1" data-ft-name="…" data-ft-columns='["Port", …]'
  //        data-ft-rows='[["22", …], …]' data-ft-wrap="1" data-ft-widths='…'>
  // The feature is gone: the sanitizer turns each one into a template table
  // section with fields of its own (a Short text field per column, a record
  // per row), so its data is kept. Ids are fixed (ft1…, ftr1…), so the same
  // table always becomes the same section. Column widths are not kept.
  function cleanFilterColumns(raw) {
    const list = (Array.isArray(raw) ? raw : []).map((c) => str(c, 200).trim()).filter(Boolean).slice(0, 30)
    return list.length ? list : ['Value', 'Label', 'Description']
  }
  function cleanFilterRows(raw, width) {
    const out = []
    ;(Array.isArray(raw) ? raw : []).slice(0, 5000).forEach((row) => {
      if (!Array.isArray(row)) return
      const cells = row.slice(0, width).map((c) => (typeof c === 'string' ? c : c == null ? '' : String(c)).trim().slice(0, 10000))
      if (!cells[0]) return
      while (cells.length < width) cells.push('')
      out.push(cells)
    })
    return out
  }
  function filterTableAsBlock(fields, doc = document) {
    const columns = cleanFilterColumns(parseJson(fields.ftColumns))
    const rows = cleanFilterRows(parseJson(fields.ftRows), columns.length)
    const wrap = fields.ftWrap === '0' ? 'none' : 'words'
    const schema = {
      name: str(fields.ftName, 200).trim() || 'Table',
      addLabel: 'Add Row',
      layout: 'table',
      fields: columns.map((label, i) => ({ id: `ft${i + 1}`, label, type: 'text', options: [], wrap })),
    }
    const records = rows.map((cells, r) => {
      const v = {}
      cells.forEach((cell, i) => {
        if (cell) v[`ft${i + 1}`] = cell
      })
      return { id: `ftr${r + 1}`, v }
    })
    return blockShell({ blockType: '', blockSchema: JSON.stringify(schema), blockRecords: JSON.stringify(records) }, doc)
  }
  const drawBlockSection = (section) => {
    if (window.NoteBlocks) window.NoteBlocks.draw(section)
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

  // An environment variable in the note: which variable (its id in the note's
  // Environment panel) and its name when saved, as the text. note-vars.js
  // draws it as a chip showing the value. Nothing in the note's text is ever
  // searched for variable names, so no notation can be mistaken for one.
  //   <span class="note-var" data-var-id="var-…" data-var-name="dc.ip">dc.ip</span>
  function varShell(fields, doc = document) {
    const id = String(fields.varId || '')
    if (!/^[\w-]{1,60}$/.test(id)) return null
    const name = String(fields.varName || '').slice(0, 200)
    const chip = doc.createElement('span')
    chip.className = 'note-var'
    chip.dataset.varId = id
    chip.dataset.varName = name
    chip.textContent = name
    return chip
  }
  const varChipsIn = (root) => root.querySelectorAll('span.note-var[data-var-id]')

  // An attached file (note-files.js, js/core/attachments.js): the file's
  // SHA-256, which is how the file is found, and its name, size and type when
  // attached. The file itself is never in the note.
  //   <span class="note-file" data-attachment="<sha-256>" data-name="scan.pdf"
  //     data-size="48211" data-type="application/pdf">scan.pdf</span>
  function fileShell(fields, doc = document) {
    const id = String(fields.attachment || '').toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(id)) return null
    const name =
      String(fields.name || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, 200) || 'file'
    const size = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, parseInt(fields.size, 10) || 0))
    const type = /^[\w.+-]{1,60}\/[\w.+-]{1,80}$/.test(String(fields.type || '')) ? String(fields.type).toLowerCase() : ''
    const chip = doc.createElement('span')
    chip.className = 'note-file'
    chip.setAttribute('contenteditable', 'false')
    chip.dataset.attachment = id
    chip.dataset.name = name
    chip.dataset.size = String(size)
    if (type) chip.dataset.type = type
    chip.dataset.sizeText = window.Attachments ? window.Attachments.formatSize(size) : `${size} B`
    chip.title = `${name}: click to open or download`
    chip.textContent = name
    return chip
  }
  // Puts attachment chips at the remembered caret. False where they can't
  // go: an archived note, a card, a code block or a template field.
  function insertFiles(metas) {
    if (isSealed(selectedId) || !selectedNode()) return false
    restoreSelection()
    const selection = getSelection()
    const at = selection.rangeCount ? selection.getRangeAt(0).startContainer : null
    if (!at || !editor.contains(at) || inCard(at) || richOf(at) || enclosing('pre')) return false
    const chips = metas.map((meta) => fileShell({ attachment: meta.id, name: meta.name, size: meta.size, type: meta.type })).filter(Boolean)
    if (!chips.length) return false
    document.execCommand('insertHTML', false, chips.map((chip) => `${chip.outerHTML}\u00a0`).join(''))
    afterEdit()
    flush()
    return true
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
    if (!spells()) {
      return `
      <div class="note-command-head">
        <span class="note-command-title">${escapeHtml(title)}</span>
        ${platform ? badge(badgeKind, platform) : ''}
        <span class="note-command-spacer"></span>
        <span class="note-command-gone" title="${AWAY}">Saved copy</span>
        <button aria-label="Remove from this note" class="note-command-remove" title="Remove from note" type="button">×</button>
      </div>`
    }
    return `
      <div class="note-command-head">
        ${
          live
            ? `<a class="note-command-title" href="${href}">${escapeHtml(title)}</a>`
            : `<span class="note-command-title">${escapeHtml(title)}</span>`
        }
        ${platform ? badge(badgeKind, platform) : ''}
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
    if (!spells()) {
      const { title, platform, template, generated } = card.dataset
      card.classList.remove('missing')
      card.innerHTML = `
        ${cardHead(false, 'commands', title, platform, '')}
        <div class="note-command-label">${generated ? 'Generated command' : 'Command template'}</div>
        <pre class="cmd"><button class="copy-btn" type="button">Copy</button><code>${highlightCode(generated || template || '', codeLanguageFor(platform), { template: !generated })}</code></pre>`
      return
    }
    const live = spellList('commands').find((c) => c.id === card.dataset.commandId)
    if (live) Object.assign(card.dataset, commandSnapshot(live))
    const { commandId, title, platform, template } = card.dataset
    const cmd = live || { id: commandId, title, platform, command: template }
    const fields = spells().fields.of(cmd)
    cardCount += 1
    card.classList.toggle('missing', !live)
    card.innerHTML = `
      ${cardHead(live, 'commands', title, platform, `#/command/${encodeURIComponent(commandId)}`)}
      ${
        fields.length
          ? `<div class="note-command-label">Variables</div>
             <div class="vars-grid">${spells().fields.html(cmd, fields, `note-var-${cardCount}-`)}</div>`
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
    const values = spells().fields.read(card.querySelectorAll('[data-var]'))
    card.querySelector('pre.cmd code').innerHTML = highlightCode(
      spells().fields.build(card.dataset.template, values),
      codeLanguageFor(card.dataset.platform),
      { template: true },
    )
  }

  function drawScriptCard(card) {
    const live = spellList('scripts').find((s) => s.id === card.dataset.scriptId)
    if (live) Object.assign(card.dataset, scriptSnapshot(live))
    const { scriptId, title, platform, template } = card.dataset
    card.classList.toggle('missing', !live && Boolean(spells()))
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
    const live = spellList('terms').find((t) => t.id === link.dataset.termId)
    if (live) link.dataset.title = live.term || ''
    link.textContent = link.dataset.title
    link.classList.toggle('missing', !live && Boolean(spells()))
    link.title = live
      ? live.definition || ''
      : spells()
        ? 'No longer in the Spell Book'
        : AWAY
  }

  const cardsIn = (root) =>
    root.querySelectorAll('.note-command[data-command-id], .note-command[data-script-id]')
  const termLinksIn = (root) => root.querySelectorAll('a.note-term[data-term-id]')

  function drawReferences() {
    cardsIn(editor).forEach(drawCard)
    termLinksIn(editor).forEach(drawTermLink)
    if (window.NoteVars) window.NoteVars.draw(editor)
    blockSectionsIn(editor).forEach(drawBlockSection)
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
  // "auto" guesses the language from the text (notes-codelang.js).
  const resolveCodeLang = (lang, text) =>
    window.NoteCodeLang ? window.NoteCodeLang.resolve(lang, text) : lang === 'auto' ? 'generic' : lang

  const codeBlocksIn = (root) => root.querySelectorAll(':scope > pre.note-code')

  // The text of a stored or pasted <pre>, with <br> line breaks as newlines.
  function preText(pre) {
    const copy = pre.cloneNode(true)
    copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
    return copy.textContent
  }

  // nodeId: whose variables (the open note's unless Branch view draws
  // another note this way).
  function renderCodeView(block, nodeId) {
    const input = block.querySelector('.note-code-input')
    const text = input.value
    const lang = resolveCodeLang(block.dataset.lang, text)
    // Variables (note-vars.js) show their values, except in the block being
    // typed in, where they show their names so the text lines up with the
    // textarea above it.
    const html = window.NoteVars
      ? window.NoteVars.codeHtml(text, lang, document.activeElement !== input, nodeId)
      : highlightCode(text, lang)
    // A trailing newline needs something after it, or the last line collapses
    // and the textarea and the colored copy stop lining up.
    block.querySelector('.note-code-view code').innerHTML = html + (text === '' || text.endsWith('\n') ? ' ' : '')
  }

  // sealed and nodeId: for Branch view's drawing of a note it isn't editing
  // (the open note's by default).
  function drawCodeBlock(pre, { sealed: lockedAs, nodeId } = {}) {
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
        <textarea aria-label="Code" class="note-code-input" rows="1" placeholder="Type or paste code… (press Enter twice or Esc to leave the block)" spellcheck="false"></textarea>
      </div>`
    const input = pre.querySelector('.note-code-input')
    input.value = text
    const sealed = lockedAs === undefined ? isSealed(selectedId) : lockedAs
    input.readOnly = sealed
    pre.querySelector('.note-code-lang').disabled = sealed
    renderCodeView(pre, nodeId)
  }

  // Pasted text often wraps its <pre> in a <div> or <p>. A code block has to
  // sit directly in the note, so such a <pre> is lifted out, splitting its
  // wrappers around it. Pre elements inside lists, tables, quotes, cards and
  // boxes stay where they are.
  function liftCodeBlocks() {
    editor.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement === editor || pre.classList.contains('note-code')) return
      if (pre.closest('.note-code, .note-command, .note-callout, li, td, th, blockquote')) return
      let node = pre
      while (node.parentElement && node.parentElement !== editor) {
        const parent = node.parentElement
        const rest = parent.cloneNode(false)
        while (node.nextSibling) rest.append(node.nextSibling)
        parent.after(node)
        if (rest.textContent.trim() || rest.querySelector('img, br, pre')) node.after(rest)
        if (!parent.textContent.trim() && !parent.querySelector('img, pre')) parent.remove()
      }
    })
  }

  // Turns every top-level <pre> that isn't drawn yet into a code block.
  function drawCodeBlocks() {
    liftCodeBlocks()
    const drawn = []
    editor.querySelectorAll(':scope > pre').forEach((pre) => {
      if (pre.querySelector(':scope > .note-code-head')) return
      drawCodeBlock(pre)
      drawn.push(pre)
    })
    return drawn
  }

  // Up on the first line of a paragraph just below a code block (or Down on
  // the last line of one just above it) goes into the code block, at the end
  // of its code (Up) or the start (Down), instead of past it.
  function codeBeyondLine(up) {
    const selection = selectionInEditor()
    if (!selection || !selection.isCollapsed) return null
    const range = selection.getRangeAt(0)
    let block = range.startContainer
    while (block && block.parentNode !== editor) block = block.parentNode
    if (!block || block === editor) return null
    let next = up ? block.previousSibling : block.nextSibling
    while (next && next.nodeType === Node.TEXT_NODE && !next.data.trim()) next = up ? next.previousSibling : next.nextSibling
    if (!next || next.nodeType !== Node.ELEMENT_NODE || !next.matches('pre.note-code')) return null
    if (!block.textContent.replace(/​/g, '').trim() && !block.querySelector('img')) return next
    // The caret's line, from its own box or the character beside it.
    let caret = range.getClientRects()[0]
    if (!caret) {
      // Between elements (or at a text's very end): the text just before the
      // caret, or else just after it.
      let text = range.startContainer
      let at = range.startOffset
      if (text.nodeType !== Node.TEXT_NODE) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
        const all = []
        while (walker.nextNode()) if (walker.currentNode.data.length) all.push(walker.currentNode)
        const point = document.createRange()
        point.setStart(range.startContainer, range.startOffset)
        const before = all.filter((t) => point.comparePoint(t, t.data.length) <= 0)
        text = before.length ? before[before.length - 1] : all[0]
        at = before.length ? text.data.length : 0
      }
      if (text && text.nodeType === Node.TEXT_NODE && text.data.length) {
        const near = document.createRange()
        near.setStart(text, at > 0 ? at - 1 : 0)
        near.setEnd(text, at > 0 ? at : 1)
        caret = near.getClientRects()[0]
      }
    }
    if (!caret) return null
    const box = block.getBoundingClientRect()
    const line = parseFloat(getComputedStyle(block).lineHeight) || caret.height || 20
    const edge = up ? caret.top - box.top : box.bottom - caret.bottom
    return edge < line * 0.75 ? next : null
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
    // Inside a template field: plain preformatted text.
    if (richAtCaret()) {
      document.execCommand('formatBlock', false, '<pre>')
      afterEdit()
      return
    }
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

  // Moves the caret to the paragraph after a code block (adding one when the
  // block is last or is followed by another block or card).
  function exitCodeBlock(block) {
    let next = block.nextElementSibling
    if (!next || next.matches('pre.note-code, .note-command')) {
      next = document.createElement('p')
      next.innerHTML = '<br>'
      block.after(next)
    }
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(next)
    range.collapse(true)
    setRange(range)
    afterEdit()
  }

  // Keys inside a code block: Tab indents, and the arrow keys leave the block
  // from its first or last line, so it never traps the caret. Enter on an empty
  // last line (Enter twice at the end), Ctrl+Enter and Escape also leave it.
  function codeBlockKeydown(e) {
    const input = e.target
    const block = input.closest('pre.note-code')
    const ctrl = e.ctrlKey || e.metaKey
    const atEmptyLastLine =
      input.selectionStart === input.selectionEnd &&
      input.selectionEnd === input.value.length &&
      input.value.endsWith('\n')
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault()
      flush()
    } else if (
      e.key === 'Escape' ||
      (e.key === 'Enter' && ctrl) ||
      (e.key === 'Enter' && !e.shiftKey && !e.altKey && !input.readOnly && atEmptyLastLine)
    ) {
      e.preventDefault()
      // The empty line that Enter would have left behind is not part of the code.
      if (atEmptyLastLine && !input.readOnly) {
        input.value = input.value.replace(/\n$/, '')
        renderCodeView(block)
        markDirty()
      }
      exitCodeBlock(block)
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

  // A note's tags follow the same rules as a command's (cleanTags in js/core/util.js):
  // trimmed, lowercase, no repeats.
  function cleanNoteTags(value) {
    const list = Array.isArray(value) ? value : []
    return [
      ...new Set(list.map((t) => (typeof t === 'string' ? t : '').trim().toLowerCase().slice(0, 100)).filter(Boolean)),
    ].slice(0, 100)
  }

  function cleanNodes(list) {
    if (!Array.isArray(list)) return []
    return list
      .filter((n) => n && typeof n === 'object' && typeof n.id === 'string')
      .map((n) => {
        const tags = cleanNoteTags(n.tags)
        return {
          id: n.id,
          name: typeof n.name === 'string' ? n.name : 'Untitled',
          html: typeof n.html === 'string' ? n.html : '',
          children: cleanNodes(n.children),
          collapsed: Boolean(n.collapsed),
          sealed: Boolean(n.sealed),
          // A template (note-templates.js) is stored only when set, and
          // tags only when there are some.
          ...(n.template ? { template: true } : {}),
          // A star (a favorite) is stored only when set.
          ...(n.starred ? { starred: true } : {}),
          ...(tags.length ? { tags } : {}),
        }
      })
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

  // The archive button beside it: archived branches show in the tree (and in
  // Branch view, and archived tomes in "All tomes") only while it's on.
  // Saved as '1' in spellbook_notes_show_archived_v1.
  const SHOW_ARCHIVED_KEY = 'spellbook_notes_show_archived_v1'
  let showArchived = (() => {
    try {
      return localStorage.getItem(SHOW_ARCHIVED_KEY) === '1'
    } catch {
      return false
    }
  })()
  // Whether a node is inside an archived branch (itself included) of the
  // open tome, so the tree hides it while archived notes aren't shown.
  const inArchivedBranch = (id) => {
    let found = id ? locate(id) : null
    while (found) {
      if (found.node.sealed) return true
      found = found.parent ? locate(found.parent.id) : null
    }
    return false
  }
  const hiddenNode = (id) => !showArchived && inArchivedBranch(id)
  // The first note the tree shows in a list (depth first), or null.
  const firstShown = (list) => {
    for (const node of list) {
      if (!showArchived && node.sealed) continue
      return node
    }
    return null
  }

  function useTome(tome) {
    tomeId = tome.id
    nodes = tome.nodes
    selectedId = locate(tome.selectedId) && !hiddenNode(tome.selectedId) ? tome.selectedId : (firstShown(nodes) || {}).id || null
  }

  function loadNotes() {
    const raw = store.getItem(NOTES_KEY)
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
        store.setItem(`${NOTES_KEY}_unreadable`, raw)
      }
    }
    if (!tomes.length) {
      const tome = newTome('Notes')
      tome.nodes = [newNode('My Notes')]
      tomes = [tome]
    }
    useTome(tomes.find((t) => t.id === wanted) || tomes[0])
    loadNoteBaseline()
    showNoteTotal()
  }

  // The "N notes  +A -D" line at the foot of the note tree: every node in
  // every tome, and how many were added and deleted since the last import of
  // tomes (or since the count first appeared), the same way Spells counts its
  // commands, scripts and terms.
  const NOTE_BASELINE_KEY = 'spellbook_baseline_notes_v1'
  let noteBaseline = new Set()
  function noteIds() {
    const ids = new Set()
    const walk = (list) =>
      list.forEach((node) => {
        ids.add(node.id)
        walk(node.children)
      })
    tomes.forEach((tome) => walk(tome.nodes))
    return ids
  }
  function loadNoteBaseline() {
    let ids = null
    try {
      const stored = JSON.parse(localStorage.getItem(NOTE_BASELINE_KEY))
      if (Array.isArray(stored)) ids = stored.filter((id) => typeof id === 'string')
    } catch {}
    if (ids) noteBaseline = new Set(ids)
    else resetNoteBaseline()
  }
  // An import starts a new "since last import" count.
  function resetNoteBaseline() {
    noteBaseline = noteIds()
    try {
      localStorage.setItem(NOTE_BASELINE_KEY, JSON.stringify([...noteBaseline]))
    } catch {}
  }
  function showNoteTotal() {
    const el = $('note-total')
    if (!el) return
    // Hidden until the first count, so a stale "0 notes" never shows.
    el.closest('.count-row').hidden = false
    const ids = noteIds()
    el.textContent = `${ids.size} ${ids.size === 1 ? 'note' : 'notes'}`
    const added = [...ids].filter((id) => !noteBaseline.has(id)).length
    const deleted = [...noteBaseline].filter((id) => !ids.has(id)).length
    $('added-note-count').textContent = `+${added}`
    $('deleted-note-count').textContent = `-${deleted}`
  }

  // Saves every tome. The copy in memory is updated at once; the browser
  // database is written in the background, and a failure there shows below
  // the note.
  let saveCount = 0
  function persist() {
    const tome = activeTome()
    if (tome) tome.selectedId = selectedId
    let text
    try {
      text = JSON.stringify({ version: 2, tomes, tomeId })
    } catch {
      showSaveError('Could not save: the notes could not be written out')
      return false
    }
    showNoteTotal()
    const count = ++saveCount
    savedEl.textContent = 'Saved'
    savedEl.classList.remove('error')
    store.setItem(NOTES_KEY, text).then((ok) => {
      if (!ok && count === saveCount) showSaveError()
    })
    return true
  }
  function showSaveError(text) {
    const reason = window.DataFile && window.DataFile.storeError ? window.DataFile.storeError() : ''
    savedEl.textContent = text || `Could not save${reason ? `: ${reason}` : ': the browser refused the change'}`
    savedEl.classList.add('error')
  }

  // The part of the note on screen: the editor's box, or in Branch view (where
  // the editor is one section of a longer page) the part of it in view.
  function visibleBox() {
    const box = editor.getBoundingClientRect()
    const page = editor.closest('.notes-branch')
    if (!page) return box
    const view = page.getBoundingClientRect()
    const top = Math.max(box.top, view.top)
    const bottom = Math.min(box.bottom, view.bottom)
    return { top, bottom, left: box.left, right: box.right, width: box.width, height: Math.max(0, bottom - top) }
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

  // A node's id and the ids of every node inside it.
  const branchIds = (node) => [node.id, ...node.children.flatMap(branchIds)]

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
    icon.innerHTML = '<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg>'
    return icon
  }

  function templateIcon() {
    const icon = sealIcon('Note preset: new notes can be made from it')
    icon.className = 'notes-template-mark'
    icon.innerHTML = '<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="5" r="2.5"></circle><path d="M10 7.5 9.5 12h5L14 7.5"></path><rect height="4" rx="1" width="16" x="4" y="12"></rect><path d="M5 20h14"></path></svg>'
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
    // No banner: the lock after the note's name (note-branch.js) shows the
    // seal, and clicking it unseals with the hidden Unseal button below.
    $('notes-sealed-bar').hidden = true
    drawNoteTags()
    if (seal) {
      $('notes-table-tools').hidden = true
      const by = seal === node ? 'This branch is archived' : `Archived by ${sealName(seal)}`
      $('notes-sealed-text').textContent = `${by}, so it is read-only.`
      $('notes-unseal').textContent = seal === activeTome() ? 'Unarchive Tome' : 'Unarchive'
    }
    syncTreeTools()
    // sealed-tomes.js redraws its panel for the node and seal now shown.
    document.dispatchEvent(new CustomEvent('notes:shown'))
  }

  function syncTreeTools() {
    const at = locate(selectedId)
    const siblingLocked = listLocked(parentIdOf(at))
    const childLocked = at ? isSealed(at.node.id) : siblingLocked
    const why = (locked) => (locked ? ' (archived)' : '')
    const add = $('notes-add-node')
    add.disabled = siblingLocked
    add.title = `Add a node after the selected one${why(siblingLocked)}`
    const child = $('notes-add-child')
    child.disabled = childLocked
    child.title = `Add a node inside the selected one${why(childLocked)}`
    $('notes-empty-add').disabled = listLocked(null)
    const fromTemplate = $('notes-add-template')
    fromTemplate.disabled = siblingLocked
    fromTemplate.title = `Add a node made from a note preset after the selected one${why(siblingLocked)}`
    // A sealed node, or one with a sealed branch inside it, can't be deleted.
    const remove = $('notes-delete-node')
    const deleteLocked = at ? isSealed(at.node.id) || hasSeal(at.node) : true
    remove.disabled = deleteLocked
    remove.title = !at
      ? 'Delete the selected node'
      : at && isSealed(at.node.id)
        ? 'Delete the selected node (archived: unarchive it first)'
        : hasSeal(at.node)
          ? 'Delete the selected node (a branch inside it is archived: unarchive that first)'
          : 'Delete the selected node and everything inside it (Delete key)'
  }

  function setSeal(target, sealed) {
    if (!target) return
    if (dirty) flush()
    const scroll = editor.scrollTop
    target.sealed = sealed
    persist()
    // An archived tome leaves the tabs (it's in the Archive): open another.
    if (sealed && target.id === tomeId && tomes.includes(target)) {
      const next = shownTomes().find((t) => t.id !== tomeId)
      if (next) {
        switchTome(next.id)
        return
      }
    }
    renderTabs()
    // An archived branch leaves the tree unless archived notes are shown.
    if (sealed && leaveHiddenNote()) return
    renderTree()
    // Redraw the note so its editing state matches the seal.
    showSelected()
    editor.scrollTop = scroll
  }

  // A notice with only an OK button.
  const tell = (title, message) => ask({ title, message, alertOnly: true })

  // ─── Editor contents ────────────────────────────────────────────────
  // Text you can't otherwise reach: keep a paragraph before the first card or
  // code block of a note and after the last, so the caret can get past them.
  // The same inside a Rich text field of a template section, around its cards.
  function keepFieldEdges(host) {
    const card = (el) => el && el.matches('.note-command')
    const paragraph = () => {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      return p
    }
    if (card(host.firstElementChild) && host.firstChild === host.firstElementChild) host.prepend(paragraph())
    if (card(host.lastElementChild) && host.lastChild === host.lastElementChild) host.append(paragraph())
  }

  function keepEdgesEditable() {
    editor.querySelectorAll('.nb-rich').forEach(keepFieldEdges)
    const needsGap = (el) =>
      el && (el.matches('.note-command') || el.matches('pre, hr, table'))
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
    // When lines are joined, Chrome copies the note's own size onto the moved
    // text (<span style="font-size: 0.95rem">). A font or size that changes
    // nothing is taken off again, so it isn't saved.
    editor.querySelectorAll('[style*="font-"]').forEach((node) => {
      const parent = node.parentElement
      if (!parent || (node.closest('[contenteditable="false"]') && !node.closest('.nb-rich'))) return
      let changed = false
      ;['font-size', 'font-family'].forEach((prop) => {
        if (!node.style.getPropertyValue(prop)) return
        if (getComputedStyle(node).getPropertyValue(prop) !== getComputedStyle(parent).getPropertyValue(prop)) return
        node.style.removeProperty(prop)
        changed = true
      })
      if (changed && !node.getAttribute('style').trim()) node.removeAttribute('style')
    })
    // Highlight taken off (see highlight()) leaves a transparent background.
    editor.querySelectorAll('[style*="background"]').forEach((node) => {
      const value = node.style.backgroundColor.replace(/\s/g, '')
      if (value !== 'transparent' && value !== 'rgba(0,0,0,0)') return
      node.style.removeProperty('background-color')
      if (!node.getAttribute('style').trim()) node.removeAttribute('style')
    })
    if (!editor.firstChild) editor.appendChild(paragraph())
    // A note may start with a block (Backspace or Delete on an empty first
    // line above one removes the line); clicking just above it adds a line.
    const first = editor.firstElementChild
    if (first && first.matches('table')) first.before(paragraph())
    // A note may end with a kept block too (clicking below it adds a line);
    // a rule or table at the end still gets a line to type after it.
    const last = editor.lastElementChild
    if (needsGap(last) && !last.matches('.note-command, pre.note-code')) editor.appendChild(paragraph())
    // Two blocks may meet; clicking the space between them adds a line there
    // (see "Blocks Backspace and Delete leave alone").
  }

  function serializeEditor() {
    // Template sections keep records being typed into in memory for a moment.
    if (window.NoteBlocks && window.NoteBlocks.commitPending) window.NoteBlocks.commitPending()
    const copy = editor.cloneNode(true)
    cardsIn(copy).forEach((card) => {
      const shell = cardShell(card.dataset)
      shell.removeAttribute('contenteditable')
      card.replaceWith(shell)
    })
    termLinksIn(copy).forEach((link) => link.replaceWith(termLink(link.dataset)))
    varChipsIn(copy).forEach((chip) => chip.replaceWith(varShell(chip.dataset) || ''))
    blockSectionsIn(copy).forEach((section) => {
      const shell = blockShell(section.dataset)
      shell.removeAttribute('contenteditable')
      section.replaceWith(shell)
    })
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
      drawTitleStar()
      if (window.NoteBranch) window.NoteBranch.sync()
      return
    }
    titleInput.value = node.name
    editor.innerHTML = sanitize(node.html)
    drawReferences()
    keepEdgesEditable()
    fixTableSizes()
    editor.scrollTop = 0
    $('notes-path').textContent = pathTo(node.id)
    applySealState()
    updateWordCount()
    updateToolbarState()
    refreshMatches({ jump: true })
    drawTitleStar()
    // Branch view (note-branch.js) moves the editor to this note's section.
    if (window.NoteBranch) window.NoteBranch.sync()
  }

  // Entries may have changed while another page was open.
  function refreshCards() {
    if (!selectedNode()) return
    const before = serializeEditor()
    drawReferences()
    if (window.NoteBlocks) window.NoteBlocks.syncFields()
    if (serializeEditor() !== before) markDirty()
    refreshMatches()
  }

  // ─── Tree rendering ─────────────────────────────────────────────────
  function plainTextOf(node) {
    const doc = new DOMParser().parseFromString(node.html, 'text/html')
    const cards = [
      ...doc.querySelectorAll('[data-command-id], [data-script-id]'),
    ].map((card) => `${card.dataset.template || ''} ${card.dataset.values || ''}`)
    const blocks = [...doc.querySelectorAll('[data-block-section]')].map((section) =>
      cleanBlockRecords(parseJson(section.dataset.blockRecords))
        .map((record) => [...Object.values(record.v), ...Object.values(record.h || {}).map(fieldSearchText)].join(' '))
        .join(' '),
    )
    // Older notes not yet opened may still hold filter tables.
    const filterTables = [...doc.querySelectorAll('[data-filter-table]')].map((table) => {
      const rows = parseJson(table.dataset.ftRows)
      return `${(parseJson(table.dataset.ftColumns) || []).join(' ')} ${(Array.isArray(rows) ? rows : []).map((r) => (Array.isArray(r) ? r.join(' ') : '')).join(' ')}`
    })
    return `${node.name} ${(node.tags || []).join(' ')} ${doc.body.textContent} ${cards.join(' ')} ${blocks.join(' ')} ${filterTables.join(' ')}`.toLowerCase()
  }

  // ─── Matches in the open note ───────────────────────────────────────
  // Uses the CSS Custom Highlight API, which paints text ranges without changing
  // the DOM, so highlights can never reach the saved note or the undo history.
  // Field values can't be painted that way, so a matching field gets a class,
  // which serializeEditor drops along with the rest of the card's markup.
  const MATCH_SKIP =
    'button, select, input, .note-command-label, .note-command-open, .note-command-gone, .nb-label, .nb-sizer, .nb-count, .nb-design'
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
        '.note-command input[data-var]:not([type="checkbox"]), .note-command select[data-var], .note-block-section [data-nb]:not([type="checkbox"]):not(.nb-rich)',
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

  // ─── Tags ───────────────────────────────────────────────────────────
  // A note's tags work like a command's (bindTagEditor, js/core/tags.js): chips under
  // the note's name, × to remove, a box to add with suggestions drawn from the
  // tags of every command, script, term and note. Clicking a tag filters the
  // tree by it. The Tag box under the tree search shows only notes carrying
  // every chosen tag, like the Tag filter on the Spellbook page.
  let tagFilter = []
  const hasFilterTags = (node) => tagFilter.every((t) => (node.tags || []).includes(t))
  // The ★ button by the search box: only starred notes (and the notes they're in).
  let starOnly = false
  const tagsIn = (list, into) => {
    list.forEach((node) => {
      ;(node.tags || []).forEach((t) => into.add(t))
      tagsIn(node.children, into)
    })
    return into
  }
  const sortTags = (set) => [...set].sort((a, b) => a.localeCompare(b))
  const allNoteTags = () => sortTags(tomes.reduce((set, tome) => tagsIn(tome.nodes, set), new Set()))
  // The Tag box offers the tags of the notes it can show.
  const filterableTags = () => (searchAllTomes ? allNoteTags() : sortTags(tagsIn(nodes, new Set())))

  function drawNoteTags() {
    // A fresh element each time, so the last note's tag editor and its
    // listeners go with it.
    const old = $('notes-tags')
    const host = old.cloneNode(false)
    old.replaceWith(host)
    const node = selectedNode()
    host.hidden = !node
    if (!node) return
    if (isSealed(node.id)) {
      ;(node.tags || []).forEach((tag) => {
        const chip = document.createElement('span')
        chip.className = 'tag-chip'
        chip.textContent = tag
        chip.title = `Show the notes tagged "${tag}"`
        host.append(chip)
      })
      host.hidden = !(node.tags || []).length
      return
    }
    bindTagEditor(
      node,
      () => {
        const tags = cleanNoteTags(node.tags)
        if (tags.length) node.tags = tags
        else delete node.tags
        persist()
      },
      { host, onChange: () => renderTree() },
    )
    host.querySelectorAll('.tag-chip.editable').forEach((chip) => {
      chip.title = `Show the notes tagged "${chip.firstChild.textContent}"`
    })
  }

  // Clicking a note's tag (not its ×) filters the tree by it.
  $('notes-editor-pane').addEventListener('click', (e) => {
    const chip = e.target.closest('#notes-tags .tag-chip')
    if (!chip || e.target.closest('.tag-x, .tag-pick')) return
    const tag = (chip.firstChild && chip.firstChild.textContent) || ''
    if (tag && !tagFilter.includes(tag)) setTagFilter([...tagFilter, tag])
  })

  const tagFilterInput = $('notes-tag-filter')
  let tagPanelShown = false
  let tagPicks = []
  let tagPickIndex = -1

  function setTagFilter(list) {
    if (dirty) flush()
    tagFilter = list
    drawTagFilter()
    renderTree()
    refreshMatches()
  }

  function drawTagFilter() {
    const known = new Set(allNoteTags())
    tagFilter = tagFilter.filter((t) => known.has(t))
    const active = $('notes-active-tags')
    active.replaceChildren()
    tagFilter.forEach((tag) => {
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
      active.append(chip)
    })
    active.hidden = !tagFilter.length
    drawTagPicks()
  }

  function drawTagPicks() {
    const panel = $('notes-tag-suggestions')
    panel.hidden = !tagPanelShown
    if (!tagPanelShown) return
    const typed = tagFilterInput.value.trim().toLowerCase()
    tagPicks = filterableTags()
      .filter((t) => !tagFilter.includes(t) && t.includes(typed))
      .sort((a, b) => Number(b.startsWith(typed)) - Number(a.startsWith(typed)) || a.localeCompare(b))
    if (tagPickIndex >= tagPicks.length) tagPickIndex = -1
    panel.replaceChildren()
    tagPicks.forEach((tag, i) => {
      const pick = document.createElement('button')
      pick.type = 'button'
      pick.className = `tag-chip tag-pick${i === tagPickIndex ? ' active' : ''}`
      pick.textContent = tag
      pick.addEventListener('click', () => pickTag(tag))
      panel.append(pick)
    })
    if (!tagPicks.length) {
      const none = document.createElement('span')
      none.className = 'tag-suggestions-empty'
      none.textContent = typed
        ? 'No note tags match'
        : filterableTags().length
          ? 'No more tags to add'
          : 'No notes here have tags yet. Add them under a note’s name.'
      panel.append(none)
    }
  }

  function pickTag(tag) {
    tagFilterInput.value = ''
    tagPickIndex = -1
    setTagFilter([...tagFilter, tag])
  }

  tagFilterInput.addEventListener('focus', () => {
    tagPanelShown = true
    drawTagPicks()
  })
  tagFilterInput.addEventListener('blur', () => {
    tagPanelShown = false
    tagPickIndex = -1
    drawTagPicks()
  })
  tagFilterInput.addEventListener('input', () => {
    tagPickIndex = -1
    drawTagPicks()
  })
  $('notes-tag-suggestions').addEventListener('mousedown', (e) => e.preventDefault())
  tagFilterInput.addEventListener('keydown', (e) => {
    const typed = tagFilterInput.value.trim().toLowerCase()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!tagPicks.length) return
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      tagPickIndex = (tagPickIndex + step + tagPicks.length + 1) % (tagPicks.length + 1)
      if (tagPickIndex === tagPicks.length) tagPickIndex = -1
      drawTagPicks()
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // The highlighted tag, the tag typed in full, or the only one left.
      const tag =
        tagPicks[tagPickIndex] ||
        tagPicks.find((t) => t === typed) ||
        (typed && tagPicks.length === 1 ? tagPicks[0] : null)
      if (tag) pickTag(tag)
    } else if (e.key === 'Backspace' && !tagFilterInput.value && tagFilter.length) {
      setTagFilter(tagFilter.slice(0, -1))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      tagFilterInput.value = ''
      tagFilterInput.blur()
    }
  })

  function renderTree() {
    if (searchScopeId && !locate(searchScopeId)) searchScopeId = null
    syncScope()
    const terms = treeQuery.toLowerCase().split(/\s+/).filter(Boolean)
    // Filtering by text, by tags (the Tag box), or both.
    const filtering = terms.length > 0 || tagFilter.length > 0 || starOnly
    const matches = (node) => {
      if (starOnly && !node.starred) return false
      if (!hasFilterTags(node)) return false
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
        // An archived branch only while the lock button shows them.
        if (node.sealed && !showArchived) return
        const childItems = build(node.children, depth + 1, parentLocked || node.sealed, tome)
        if (filtering && !matches(node) && !childItems.childNodes.length) return
        const li = document.createElement('li')
        li.setAttribute('role', 'treeitem')
        li.dataset.id = node.id
        li.dataset.tome = tome.id
        const selected = open && node.id === selectedId
        li.setAttribute('aria-selected', String(selected))
        const row = document.createElement('div')
        row.className = `notes-tree-row${selected ? ' selected' : ''}`
        // A match itself, not a note shown only for what's inside it.
        if (filtering && matches(node)) row.classList.add('filter-match')
        row.style.setProperty('--depth', depth)
        // Dragged from the open tome, into it or onto another tome's tab.
        row.draggable = open && !parentLocked
        row.tabIndex = selected ? 0 : -1
        const twisty = document.createElement('button')
        twisty.type = 'button'
        twisty.tabIndex = -1
        twisty.className = 'notes-twisty'
        const expanded = filtering || !node.collapsed
        // Children the tree shows (archived ones hide unless the lock is on).
        const shownKids = showArchived ? node.children.length : node.children.filter((c) => !c.sealed).length
        if (shownKids) {
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
        // The star sits before the level dot (☆ only on hover), so the name,
        // and the lock and preset marks after it, line up on every row.
        row.append(twisty, starButton(node), dot, name)
        if (node.template) row.append(templateIcon())
        if (node.sealed) row.append(sealIcon('Archived: read-only'))
        if (window.NoteSelect && window.NoteSelect.active()) row.append(selectButton(node.id, node.name))
        li.appendChild(row)
        if (shownKids && expanded) {
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
        // An archived tome is in the Archive tab (and here with the lock on).
        if (tome.sealed && !showArchived && tome.id !== tomeId) return
        const items = build(tome.nodes, 0, tome.sealed, tome)
        if (filtering && !items.childNodes.length) return
        const section = document.createElement('li')
        section.className = 'notes-tree-tome'
        section.setAttribute('role', 'none')
        const heading = document.createElement('div')
        heading.className = `notes-tree-tome-name${tome.id === tomeId ? ' current' : ''}`
        heading.dataset.tomeHeading = tome.id
        heading.title = `Open the “${tome.name}” tome`
        heading.textContent = tome.name
        if (tome.sealed) heading.append(sealIcon('Archived tome: read-only'))
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
    if (filtering && !treeEl.querySelector('li[data-id]')) {
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
    // Notes added, moved, renamed or removed: Branch view redraws its list,
    // and deleted notes leave the export selection.
    if (window.NoteBranch) window.NoteBranch.sync()
    if (window.NoteSelect) window.NoteSelect.treeChanged()
  }


  // Select & Export (note-select.js): while its list is open, a ＋ at the end
  // of each note adds it to the list (✓ once it's there; click to take it out).
  function selectButton(id, name) {
    const picked = window.NoteSelect.has(id)
    const button = document.createElement('button')
    button.type = 'button'
    button.tabIndex = -1
    button.className = `note-select-add${picked ? ' on' : ''}`
    button.textContent = picked ? '✓' : '＋'
    button.title = picked ? 'In the export list: click to take it out' : 'Add to the export list'
    button.setAttribute('aria-label', picked ? `Take “${name}” out of the export list` : `Add “${name}” to the export list`)
    button.setAttribute('aria-pressed', String(picked))
    return button
  }

  // ─── Stars ──────────────────────────────────────────────────────────
  // A star marks a favorite note. It's kept with the note in the data file,
  // isn't part of the note's text (so sealed notes can be starred too), and
  // the ★ button by the search box shows only starred notes.
  function starButton(node) {
    const star = document.createElement('button')
    star.type = 'button'
    star.tabIndex = -1
    star.className = `notes-star${node.starred ? ' on' : ''}`
    star.textContent = node.starred ? '★' : '☆'
    star.title = node.starred ? 'Starred: click to unstar' : 'Star this note (a favorite)'
    star.setAttribute('aria-label', node.starred ? `Unstar “${node.name}”` : `Star “${node.name}”`)
    star.setAttribute('aria-pressed', String(Boolean(node.starred)))
    return star
  }

  function setStar(id, on) {
    const at = locateAnywhere(id)
    if (!at) return
    if (dirty) flush()
    if (on) at.node.starred = true
    else delete at.node.starred
    persist()
    renderTree()
    drawTitleStar()
    document.dispatchEvent(new CustomEvent('notes:starred', { detail: { id, on: Boolean(on) } }))
  }

  // The open note's star, before its name above the editor.
  const titleStar = $('notes-title-star')
  function drawTitleStar() {
    const node = selectedNode()
    const on = Boolean(node && node.starred)
    titleStar.hidden = !node
    titleStar.classList.toggle('on', on)
    titleStar.textContent = on ? '★' : '☆'
    titleStar.title = on ? 'Starred: click to unstar' : 'Star this note (a favorite)'
    titleStar.setAttribute('aria-label', on ? 'Unstar this note' : 'Star this note')
    titleStar.setAttribute('aria-pressed', String(on))
  }
  titleStar.addEventListener('mousedown', (e) => e.preventDefault())
  titleStar.addEventListener('click', () => {
    const node = selectedNode()
    if (node) setStar(node.id, !node.starred)
  })

  const starFilterButton = $('notes-star-filter')
  function setStarOnly(on) {
    if (dirty) flush()
    starOnly = Boolean(on)
    starFilterButton.setAttribute('aria-pressed', String(starOnly))
    starFilterButton.textContent = starOnly ? '★' : '☆'
    starFilterButton.title = starOnly ? 'Showing only starred notes: click to show all' : 'Show only starred notes'
    renderTree()
    refreshMatches()
  }
  starFilterButton.addEventListener('click', () => setStarOnly(!starOnly))

  const archiveFilterButton = $('notes-archive-filter')
  function drawArchiveFilter() {
    archiveFilterButton.setAttribute('aria-pressed', String(showArchived))
    archiveFilterButton.title = showArchived
      ? 'Showing archived notes: click to hide them'
      : 'Show archived notes too'
    archiveFilterButton.setAttribute('aria-label', showArchived ? 'Hide archived notes' : 'Show archived notes')
  }
  function setShowArchived(on) {
    on = Boolean(on)
    if (on === showArchived) return
    if (dirty) flush()
    showArchived = on
    try {
      if (on) localStorage.setItem(SHOW_ARCHIVED_KEY, '1')
      else localStorage.removeItem(SHOW_ARCHIVED_KEY)
    } catch {}
    drawArchiveFilter()
    // The open note may have just been hidden: open the nearest one shown.
    if (!leaveHiddenNote()) {
      renderTree()
      showSelected()
    }
    refreshMatches()
  }
  // When the open note is in a hidden archived branch, opens the note the
  // branch is in, or else the tome's first note shown. True if it moved.
  function leaveHiddenNote() {
    if (!selectedId || !hiddenNode(selectedId)) return false
    let found = locate(selectedId)
    while (found && found.parent && hiddenNode(found.node.id)) found = locate(found.parent.id)
    const next = found && !hiddenNode(found.node.id) ? found.node : firstShown(nodes)
    selectedId = next ? next.id : null
    persist()
    renderTree()
    showSelected()
    return true
  }
  // Opening an archived note (from the Archive, or a link to it): the tree
  // shows archived notes, so it's there to select.
  function revealArchived(tome, nodeId) {
    if (!tome || !nodeId || showArchived) return
    let at = locate(nodeId, tome.nodes)
    while (at && !at.node.sealed) at = at.parent ? locate(at.parent.id, tome.nodes) : null
    if (at) setShowArchived(true)
  }
  drawArchiveFilter()
  archiveFilterButton.addEventListener('click', () => setShowArchived(!showArchived))

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

  // Whether a node can be added after the selected one, or inside it.
  function addLocked(asChild) {
    const at = locate(selectedId)
    return listLocked(at ? (asChild ? at.node.id : parentIdOf(at)) : null)
  }

  // Puts a node (with any subnodes) after the selected one, or inside it, and
  // opens it. Also used by note-templates.js.
  function insertBranch(branch, asChild) {
    if (addLocked(asChild)) return false
    const at = locate(selectedId)
    if (dirty) flush()
    if (!at) {
      nodes.push(branch)
    } else if (asChild) {
      at.node.children.push(branch)
      at.node.collapsed = false
    } else {
      at.list.splice(at.index + 1, 0, branch)
    }
    selectedId = branch.id
    leaveScopeIfOutside(branch.id)
    treeQuery = ''
    $('notes-tree-search').value = ''
    // A new note has no tags yet, so the tag filter would hide it.
    tagFilter = []
    drawTagFilter()
    persist()
    renderTree()
    showSelected()
    return true
  }

  function addNode(asChild) {
    if (insertBranch(newNode('New Node'), asChild)) startRename()
  }

  // Copies the selected node and its subnodes, as they are, right after it.
  // The copy keeps the note preset mark and the Environment variables (so a
  // duplicated preset still has its fields), but not the seal: a copy is
  // made to be changed. Links between notes inside the branch point at the copies.
  function duplicateSelected() {
    const at = locate(selectedId)
    if (!at || addLocked(false)) return
    if (dirty) flush()
    const renames = new Map()
    const mapIds = (node) => {
      renames.set(node.id, newNode('').id)
      node.children.forEach(mapIds)
    }
    mapIds(at.node)
    const copy = (node) => {
      let html = node.html
      renames.forEach((to, from) => {
        if (html.includes(from)) html = html.split(from).join(to)
      })
      return {
        id: renames.get(node.id),
        name: node.name,
        html,
        children: node.children.map(copy),
        collapsed: node.collapsed,
        sealed: false,
        ...(node.template ? { template: true } : {}),
        ...(node.tags && node.tags.length ? { tags: [...node.tags] } : {}),
      }
    }
    const branch = copy(at.node)
    branch.name = `${at.node.name} (copy)`
    if (window.NoteEnv) {
      renames.forEach((to, from) => {
        const vars = window.NoteEnv.varsOf(from)
        if (vars.length) window.NoteEnv.setVars(to, vars)
      })
    }
    if (insertBranch(branch, false)) startRename()
  }

  // ─── Note presets ──────────────────────────────────────────────────────
  // A node marked as a note preset (stored as `template`, an older name) is
  // copied, with its subnodes, by "New from Note Preset" (note-templates.js,
  // which owns the dialog). "Templates" in the UI are note-blocks.js's.)
  function setTemplate(node, on) {
    if (!node) return
    if (on) node.template = true
    else delete node.template
    persist()
    renderTree()
    document.dispatchEvent(new CustomEvent('notes:shown'))
  }

  const openTemplates = (asChild) => {
    if (window.NoteTemplates) window.NoteTemplates.open(asChild)
  }

  // Every note preset in every tome, in tree order.
  function listTemplates() {
    if (dirty) flush()
    const found = []
    tomes.forEach((tome) => {
      const walk = (list, names) =>
        list.forEach((node) => {
          const path = [...names, node.name]
          if (node.template) found.push({ id: node.id, name: node.name, tomeName: tome.name, path: path.join(' › '), node })
          walk(node.children, path)
        })
      walk(tome.nodes, [])
    })
    return found
  }

  // Adds a preset branch to the "Note Presets" tome (or an older "Templates"
  // one), making it if it is missing or sealed. Used for the starter preset.
  function addToTemplatesTome(branch) {
    if (dirty) flush()
    let tome =
      tomes.find((t) => t.name === 'Note Presets' && !t.sealed) || tomes.find((t) => t.name === 'Templates' && !t.sealed)
    if (!tome) {
      tome = newTome('Note Presets')
      tomes.push(tome)
    }
    tome.nodes.push(branch)
    persist()
    renderTabs()
    if (tome.id === tomeId) renderTree()
    return tome
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
        'Branch is archived',
        seal
          ? `${name} is ${seal === at.node ? 'archived' : `archived by ${sealName(seal)}`}. Unarchive it before deleting it.`
          : `${name} contains an archived branch. Unarchive that branch before deleting ${name}.`,
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
      message: trashBin
        ? `Move "${at.node.name}"${extra} to Trash?`
        : `Delete "${at.node.name}"${extra}? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!confirmed) return
    // Keep the last keystrokes: they go to Trash with the note.
    if (dirty) flush()
    // Look it up again: nothing may have moved while the dialog was open, but
    // the tree belongs to this page and a stale index would delete the wrong node.
    const current = locate(at.node.id)
    if (!current) return
    clearTimeout(saveTimer)
    dirty = false
    trashNode(current)
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

  // Whether a list in any tome is locked: the node `parentId`'s children (or
  // the tome's top level when it's null), by a seal on the tome, that node or
  // a node above it. listLocked() is the same for the open tome.
  function lockedIn(tome, parentId) {
    if (!tome || tome.sealed) return true
    let found = parentId ? locate(parentId, tome.nodes) : null
    while (found) {
      if (found.node.sealed) return true
      found = found.parent ? locate(found.parent.id, tome.nodes) : null
    }
    return false
  }

  // Whether a dragged node (`drag`: { id, tomeId }) may be dropped before,
  // after or inside another node, in its own tome or another one. `targetId`
  // null with `intoTome` drops it at the end of that tome's top level.
  function canDrop(drag, targetId, position, intoTome) {
    const source = drag && tomes.find((t) => t.id === drag.tomeId)
    const from = source && locate(drag.id, source.nodes)
    if (!from || lockedIn(source, parentIdOf(from))) return false
    if (!targetId) return Boolean(intoTome) && !lockedIn(intoTome, null)
    const target = locateAnywhere(targetId)
    if (!target || drag.id === targetId || isInside(targetId, from.node)) return false
    return !lockedIn(target.tome, position === 'inside' ? targetId : parentIdOf(target))
  }

  // Drops a node (with its subnodes) before, after or inside another, or at
  // the end of a tome (drag and drop). Across tomes the branch keeps its ids,
  // so links to it, its variables and its seals go with it.
  function moveNodeTo(drag, targetId, position, intoTome) {
    if (!canDrop(drag, targetId, position, intoTome)) return
    // The open note's text is saved before its node moves.
    if (dirty) flush()
    const source = tomes.find((t) => t.id === drag.tomeId)
    const from = locate(drag.id, source.nodes)
    const moved = from.node
    from.list.splice(from.index, 1)
    const target = targetId ? locateAnywhere(targetId) : null
    const home = target ? target.tome : intoTome
    if (!target) {
      home.nodes.push(moved)
    } else if (position === 'inside') {
      target.node.children.push(moved)
      target.node.collapsed = false
    } else {
      target.list.splice(target.index + (position === 'after' ? 1 : 0), 0, moved)
    }
    if (home !== source) {
      // The source tome opens on another note next time if its open one left.
      const left = (id) => id && (id === moved.id || isInside(id, moved))
      if (source.id === tomeId && left(selectedId)) {
        // Showing a note that's now in another tome: follow it there.
        home.selectedId = selectedId
        selectedId = null
        source.selectedId = null
        persist()
        tomeId = null
        switchTome(home.id, { keepSearch: true })
        return
      }
      if (left(source.selectedId)) source.selectedId = null
    }
    leaveScopeIfOutside(moved.id)
    persist()
    renderTabs()
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
    if (e.target.closest('.notes-star')) {
      const at = locateAnywhere(li.dataset.id)
      if (at) setStar(at.node.id, !at.node.starred)
      return
    }
    if (e.target.closest('.note-select-add')) {
      window.NoteSelect.toggle(li.dataset.id)
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
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      duplicateSelected()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      deleteSelected()
    }
  })

  // Drag and drop: top quarter = before, bottom quarter = after, middle = inside.
  // Below the last row (or in an empty tome) = at the end of the top level.
  // Into another tome: hold the node over its tab to open it, then drop it in
  // its tree, or drop it on the tab to put it at the end of that tome.
  const DRAG_TYPE = 'application/x-spellbook-note'
  const TAB_OPEN_DELAY = 600
  let dragging = null // { id, tomeId }
  let dropMark = null
  let tabTimer = null
  let tabTimerFor = null
  const clearDropMark = () => {
    if (dropMark) dropMark.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-end', 'drop-tab')
    dropMark = null
  }
  const clearTabTimer = () => {
    clearTimeout(tabTimer)
    tabTimer = null
    tabTimerFor = null
  }
  const endDrag = () => {
    dragging = null
    clearDropMark()
    clearTabTimer()
  }
  const dropTarget = (e) => {
    if (!dragging || !e.target.closest) return null
    const row = e.target.closest('.notes-tree-row')
    if (!row) {
      // Empty space in the tree (not a tome heading of "All tomes").
      if (e.target.closest('[data-tome-heading]') || searchAllTomes) return null
      return canDrop(dragging, null, 'end', activeTome()) ? { row: treeEl, targetId: null, position: 'end' } : null
    }
    const targetId = row.parentElement.dataset.id
    const rect = row.getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    const position = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
    return canDrop(dragging, targetId, position) ? { row, targetId, position } : null
  }
  treeEl.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]')
    if (!li) return
    dragging = { id: li.dataset.id, tomeId: li.dataset.tome || tomeId }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_TYPE, dragging.id)
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
  treeEl.addEventListener('drop', (e) => {
    const drop = dropTarget(e)
    const drag = dragging
    endDrag()
    if (!drop) return
    e.preventDefault()
    moveNodeTo(drag, drop.targetId, drop.position, activeTome())
  })

  // Tome tabs while a node is dragged (tabsEl is declared further down).
  const tabsBar = $('notes-tabs')
  tabsBar.addEventListener('dragover', (e) => {
    const tab = dragging && e.target.closest('.notes-tab')
    const tome = tab && tomes.find((t) => t.id === tab.dataset.id)
    if (!tome) return
    clearDropMark()
    if (tome.id !== tomeId && tabTimerFor !== tome.id) {
      clearTabTimer()
      tabTimerFor = tome.id
      tabTimer = setTimeout(() => {
        tabTimer = null
        if (dragging) switchTome(tome.id)
      }, TAB_OPEN_DELAY)
    }
    if (!canDrop(dragging, null, 'end', tome)) return
    e.preventDefault()
    tab.classList.add('drop-tab')
    dropMark = tab
  })
  tabsBar.addEventListener('dragleave', (e) => {
    const tab = e.target.closest('.notes-tab')
    if (tab && tab.contains(e.relatedTarget)) return
    clearDropMark()
    clearTabTimer()
  })
  tabsBar.addEventListener('drop', (e) => {
    const tab = dragging && e.target.closest('.notes-tab')
    const tome = tab && tomes.find((t) => t.id === tab.dataset.id)
    const drag = dragging
    endDrag()
    if (!tome || !canDrop(drag, null, 'end', tome)) return
    e.preventDefault()
    moveNodeTo(drag, null, 'end', tome)
  })
  // The dragged row may be gone (another tome opened), so dragend is caught
  // here rather than on the tree.
  document.addEventListener('dragend', () => dragging && endDrag())

  // Right-click menu.
  let treeMenu = null
  const closeTreeMenu = () => {
    if (treeMenu) treeMenu.remove()
    treeMenu = null
  }
  function treeMenuItems(hasNode) {
    const at = hasNode && locate(selectedId)
    if (!at) {
      return [
        ['Add Node', () => addNode(false), listLocked(null)],
        ['Add Node from Preset…', () => openTemplates(false), listLocked(null)],
      ]
    }
    const seal = sealOf(at.node.id)
    const fixed = listLocked(parentIdOf(at))
    const sealItem = at.node.sealed
      ? ['Unarchive Branch', () => setSeal(at.node, false)]
      : seal
        ? [
            seal === activeTome() ? 'Unarchive Tome' : `Unarchive “${seal.name}”`,
            () => setSeal(seal, false),
          ]
        : ['Archive Branch', () => setSeal(at.node, true)]
    return [
      ['Add Node', () => addNode(false), fixed],
      ['Add Subnode', () => addNode(true), Boolean(seal)],
      ['Add Node from Preset…', () => openTemplates(false), fixed],
      ['Add Subnode from Preset…', () => openTemplates(true), Boolean(seal)],
      ['Duplicate', duplicateSelected, fixed],
      ['Rename', startRename, Boolean(seal)],
      ['Search This Branch', () => setSearchScope(selectedId)],
      ...(window.NoteBranch ? [['Open as Whole Branch', () => window.NoteBranch.open(selectedId)]] : []),
      null,
      at.node.starred ? ['Unstar', () => setStar(at.node.id, false)] : ['Star', () => setStar(at.node.id, true)],
      ...(window.NoteSelect
        ? [
            window.NoteSelect.has(at.node.id)
              ? ['Remove from Export List', () => window.NoteSelect.set([at.node.id], false)]
              : ['Add to Export List', () => window.NoteSelect.set([at.node.id], true)],
            ['Add Branch to Export List', () => window.NoteSelect.set(branchIds(at.node), true)],
          ]
        : []),
      null,
      at.node.template
        ? ['Stop Using as Note Preset', () => setTemplate(at.node, false)]
        : ['Use as Note Preset', () => setTemplate(at.node, true)],
      sealItem,
      null,
      ['Move Up', () => moveSelected('up'), fixed],
      ['Move Down', () => moveSelected('down'), fixed],
      ['Move Out a Level', () => moveSelected('left'), fixed],
      ['Move In a Level', () => moveSelected('right'), fixed],
      null,
      ['Delete', deleteSelected, Boolean(seal) || hasSeal(at.node)],
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

  // A drag handle on a side pane's right edge (the Sealed Notes list, the
  // Select & Export list), like the tree's: drag or ←/→ to resize,
  // double-click to reset. The width is saved under `key` (in the data file).
  window.NotesSplitter = {
    attach(pane, { key, label, min = 160, keepRoom = 320 }) {
      const splitter = document.createElement('div')
      splitter.className = 'notes-splitter side-splitter'
      splitter.setAttribute('role', 'separator')
      splitter.setAttribute('aria-orientation', 'vertical')
      splitter.setAttribute('aria-label', label)
      splitter.tabIndex = 0
      splitter.title = 'Drag to resize (double-click to reset)'
      pane.after(splitter)
      const setWidth = (px, keep = true) => {
        const row = pane.parentElement
        const room = row ? row.clientWidth - (pane.offsetLeft - row.offsetLeft) - keepRoom : px
        const width = Math.max(min, Math.min(px, room > min ? room : px))
        pane.style.flexBasis = `${width}px`
        if (keep) {
          try {
            localStorage.setItem(key, String(Math.round(width)))
          } catch {}
        }
      }
      let saved = 0
      try {
        saved = Number.parseFloat(localStorage.getItem(key))
      } catch {}
      if (saved > 0) pane.style.flexBasis = `${saved}px`
      splitter.addEventListener('pointerdown', (e) => {
        splitter.setPointerCapture(e.pointerId)
        splitter.classList.add('dragging')
        document.body.style.userSelect = 'none'
      })
      splitter.addEventListener('pointermove', (e) => {
        if (splitter.hasPointerCapture(e.pointerId)) setWidth(e.clientX - pane.getBoundingClientRect().left)
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
        setWidth(pane.offsetWidth + (e.key === 'ArrowLeft' ? -20 : 20))
      })
      splitter.addEventListener('dblclick', () => {
        pane.style.removeProperty('flex-basis')
        try {
          localStorage.removeItem(key)
        } catch {}
      })
      // The handle follows its pane when the pane is moved.
      return { splitter, follow: () => pane.after(splitter) }
    },
  }

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
  // A Rich text field of a template section (.nb-rich) is a small editor of
  // its own inside a card, so it is not "in a card": the toolbar, paste, links
  // and terms work in it.
  const inCard = (node) => {
    const el = node && node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node
    const found = el && el.closest && el.closest('.note-command, pre.note-code, .nb-rich')
    return Boolean(found && !found.matches('.nb-rich'))
  }
  const richOf = (node) => {
    const el = node && node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node
    return (el && el.closest && el.closest('.nb-rich')) || null
  }
  // Where the caret goes back to: the note, or the field it was in.
  const hostOf = (node) => richOf(node) || editor
  const richAtCaret = () => {
    const selection = selectionInEditor()
    return selection ? richOf(selection.anchorNode) : null
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
  // Selects a whole block (a card, template section, code block, table,
  // image or chip) so execCommand('delete') removes it and Ctrl+Z brings it
  // back. The selection runs from its end back to its start: Chrome refuses a
  // forward one when the block is the first thing in the note.
  function selectWhole(node) {
    const parent = node.parentNode
    if (!parent) return
    const host = parent.nodeType === 1 && parent.closest('[contenteditable="true"]')
    if (host) host.focus({ preventScroll: true })
    const index = [...parent.childNodes].indexOf(node)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.setBaseAndExtent(parent, index + 1, parent, index)
  }

  function setRange(range) {
    const inNote = range && editor.contains(range.startContainer)
    ;(inNote ? hostOf(range.startContainer) : editor).focus()
    if (inNote) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      savedRange = range.cloneRange()
    }
  }

  function restoreSelection() {
    const current = selectionInEditor()
    if (current && document.activeElement === hostOf(current.anchorNode)) {
      rememberSelection()
      return
    }
    const inNote = savedRange && editor.contains(savedRange.startContainer)
    ;(inNote ? hostOf(savedRange.startContainer) : editor).focus()
    if (inNote) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(savedRange)
    }
  }

  function exec(command, value = null) {
    if (isSealed(selectedId)) return
    restoreSelection()
    // Superscript and subscript as <sup> / <sub> (with CSS on, the browser
    // writes a vertical-align span, which isn't kept).
    document.execCommand('styleWithCSS', false, !/^(superscript|subscript)$/.test(command))
    document.execCommand('defaultParagraphSeparator', false, 'p')
    document.execCommand(command, false, value)
    afterEdit()
  }

  function afterEdit() {
    keepEdgesEditable()
    fixTableSizes()
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
        'superscript',
        'subscript',
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
    $('notes-back-apply').classList.toggle('active', highlighted())
    showInlineStyle(fontSelect, 'font-family')
    showInlineStyle(sizeSelect, 'font-size')
    $('notes-inline-code').classList.toggle('active', Boolean(enclosing('code')))
    placeTableTools()
    // Blocks that can't go inside a template field.
    const inField = Boolean(richAtCaret())
    document.querySelectorAll(NOT_IN_FIELDS).forEach((button) => {
      if (button.dataset.fieldTitle === undefined) button.dataset.fieldTitle = button.title
      button.disabled = inField
      button.title = inField ? 'Not available inside a template field' : button.dataset.fieldTitle
    })
  }
  const NOT_IN_FIELDS =
    '#notes-insert-block, #notes-table, #notes-callout, #notes-insert-var'

  function enclosing(selector) {
    const selection = selectionInEditor()
    if (!selection) return null
    let node = selection.anchorNode
    if (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement
    const found = node && node.closest(selector)
    // A block section's own table and text are not part of the note's text,
    // but what is inside one of its Rich text fields is.
    if (found && found.closest('.note-block-section') && !found.matches('.note-block-section') && !found.closest('.nb-rich')) return null
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
  // ─── Text color and highlight ───────────────────────────────────────
  // The button applies the color shown on it; the ▾ picks another color,
  // which is applied to the selection and remembered for the button.
  const COLOR_KEY = 'spellbook_note_colors_v1'
  const colors = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLOR_KEY) || '{}')
      return {
        fore: /^#[0-9a-f]{6}$/i.test(saved.fore) ? saved.fore : $('notes-fore').value,
        back: /^#[0-9a-f]{6}$/i.test(saved.back) ? saved.back : $('notes-back').value,
      }
    } catch {
      return { fore: $('notes-fore').value, back: $('notes-back').value }
    }
  })()
  function showColors() {
    $('notes-fore').value = colors.fore
    $('notes-back').value = colors.back
    $('notes-fore-bar').style.background = colors.fore
    $('notes-back-bar').style.background = colors.back
  }
  function setColor(kind, value) {
    colors[kind] = value
    showColors()
    try {
      localStorage.setItem(COLOR_KEY, JSON.stringify(colors))
    } catch {}
  }
  // Highlighted text at the start of the selection (a color other than none).
  // (A function declaration: updateToolbarState can run before this line.)
  // (queryCommandValue('backColor') gives the page's background for plain
  // text, so the text's own styles are looked at.)
  function highlighted() {
    const selection = selectionInEditor()
    if (!selection) return false
    const range = selection.getRangeAt(0)
    let node = range.startContainer
    // A selection that starts at the very end of one piece of text really
    // starts in the next.
    if (!range.collapsed && node.nodeType === Node.TEXT_NODE && range.startOffset === node.data.length) {
      const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT)
      walker.currentNode = node
      let next = walker.nextNode()
      while (next && !next.data.length) next = walker.nextNode()
      if (next) node = next
    }
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement
    while (node && node !== editor && editor.contains(node)) {
      const value = (node.style && node.style.backgroundColor.replace(/\s/g, '')) || ''
      if (value && value !== 'transparent' && value !== 'rgba(0,0,0,0)') return true
      if (node.matches('.note-command, .nb-rich')) break
      node = node.parentElement
    }
    return false
  }
  function highlight() {
    if (isSealed(selectedId)) return
    restoreSelection()
    exec('hiliteColor', highlighted() ? 'transparent' : colors.back)
  }
  showColors()
  $('notes-fore-apply').addEventListener('click', () => exec('foreColor', colors.fore))
  $('notes-back-apply').addEventListener('click', highlight)
  $('notes-fore').addEventListener('change', (e) => {
    setColor('fore', e.target.value)
    exec('foreColor', colors.fore)
  })
  $('notes-back').addEventListener('change', (e) => {
    setColor('back', e.target.value)
    exec('hiliteColor', colors.back)
  })

  // ─── Font and size ──────────────────────────────────────────────────
  // The browser applies a stand-in value (so undo, partly selected text and
  // nested styles work as for bold or colors), which then becomes the chosen
  // font or size. "Default" takes the font or size off again. With nothing
  // selected, the next thing typed gets it.
  const STAND_IN = { 'font-family': 'spellbook-stand-in', 'font-size': 'xxx-large' }
  const styleValue = (node, prop) => node.style.getPropertyValue(prop).replace(/["']/g, '').trim()

  function applyInlineStyle(prop, value) {
    if (isSealed(selectedId)) return
    restoreSelection()
    const selection = getSelection()
    if (!selectionInEditor()) return
    if (selection.isCollapsed) {
      // A place to type into: an empty span would be dropped by the browser.
      const span = document.createElement('span')
      if (value) span.style.setProperty(prop, value)
      span.textContent = '\u200b'
      const range = selection.getRangeAt(0)
      range.insertNode(span)
      range.setStart(span.firstChild, 1)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      afterEdit()
      return
    }
    document.execCommand('styleWithCSS', false, true)
    if (prop === 'font-size') document.execCommand('fontSize', false, '7')
    else document.execCommand('fontName', false, STAND_IN[prop])
    editor.querySelectorAll('[style]').forEach((node) => {
      if (styleValue(node, prop) !== STAND_IN[prop]) return
      if (value) node.style.setProperty(prop, value)
      else node.style.removeProperty(prop)
      if (!node.getAttribute('style').trim()) node.removeAttribute('style')
    })
    afterEdit()
  }

  // The nearest font or size set on the text at the caret ('' for none).
  function showInlineStyle(select, prop) {
    let node = enclosing('[style]')
    let value = ''
    while (node && editor.contains(node) && node !== editor) {
      if (node.style && node.style.getPropertyValue(prop)) {
        value = node.style.getPropertyValue(prop)
        break
      }
      node = node.parentElement
    }
    const plain = value.replace(/["']/g, '').replace(/\s+/g, ' ').trim()
    const match = [...select.options].find((o) => o.value.replace(/["']/g, '').replace(/\s+/g, ' ').trim() === plain)
    select.value = match ? match.value : ''
  }

  fontSelect.addEventListener('change', () => applyInlineStyle('font-family', fontSelect.value))
  sizeSelect.addEventListener('change', () => applyInlineStyle('font-size', sizeSelect.value))

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
    const card = inCard(e.target) && e.target.closest('.note-command')
    if (card && card.matches('[data-command-id], [data-script-id]')) {
      // Saved on the card itself, so it stays in this note only. A card in a
      // template field is then saved with the field by note-blocks.js.
      if (!spells()) return
      const values = spells().fields.read(card.querySelectorAll('[data-var]'))
      Object.keys(values).forEach((key) => {
        if (!values[key]) delete values[key]
      })
      card.dataset.values = JSON.stringify(values)
      // Kept with the values, so the card still shows it without Spells.
      if (Object.keys(values).length) card.dataset.generated = spells().fields.build(card.dataset.template, values)
      else delete card.dataset.generated
      updateGeneratedCommand(card)
      markDirty()
      refreshMatches()
      return
    }
    if (e.target.closest && e.target.closest('.note-block-section')) {
      // Saved into the section by note-blocks.js.
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
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !ctrl && !e.shiftKey && !e.altKey) {
      const code = codeBeyondLine(e.key === 'ArrowUp')
      if (code) {
        e.preventDefault()
        focusCode(code, e.key === 'ArrowUp')
      }
      return
    }
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault()
      flush()
    } else if (ctrl && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      insertLink()
    } else if (ctrl && !e.shiftKey && !e.altKey && (e.key === '.' || e.key === ',') && !enclosing('pre')) {
      // Superscript (Ctrl+.) and subscript (Ctrl+,), as in most editors.
      e.preventDefault()
      exec(e.key === '.' ? 'superscript' : 'subscript')
    } else if (e.key === 'Tab' && enclosing('li')) {
      e.preventDefault()
      exec(e.shiftKey ? 'outdent' : 'indent')
    } else if (e.key === 'Tab' && enclosing('td, th')) {
      e.preventDefault()
      moveBetweenCells(enclosing('td, th'), e.shiftKey)
    } else if (e.key === 'Tab' && enclosing('pre') && !e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '	')
    } else if (e.key === 'Enter' && enclosing('pre') && !ctrl) {
      // Stay in one code block instead of starting a new one for every line.
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  })

  // ─── Blocks Backspace and Delete leave alone ────────────────────────
  // Code blocks, cards and template sections are removed with
  // their own ×, never by Backspace or Delete next to them. Backspace on an
  // empty line just after one removes the line instead, also a line between
  // two of them (they then meet; clicking between them adds a line back).
  // A selection that takes
  // one of them in asks first before Backspace, Delete, cutting, typing over
  // it or pasting removes it.
  const KEPT = '.note-command, pre.note-code, .note-block-section'
  const isKept = (node) => Boolean(node && node.nodeType === Node.ELEMENT_NODE && node.matches(KEPT))

  // The kept blocks a range would take with it (not one the range is inside).
  function keptIn(range) {
    if (range.collapsed) return []
    const found = [...editor.querySelectorAll(KEPT)].filter(
      (block) => range.intersectsNode(block) && !block.contains(range.startContainer),
    )
    return found.filter((block) => !found.some((other) => other !== block && other.contains(block)))
  }

  // Asks before a selection with kept blocks in it is replaced. Resolves true
  // when it may go ahead, with the selection put back.
  async function mayDeleteKept(range) {
    const kept = keptIn(range)
    if (!kept.length) return true
    const saved = range.cloneRange()
    const many = kept.length > 1
    const ok = await ask({
      title: many ? `Delete ${kept.length} blocks?` : 'Delete a block?',
      message: `The selection includes ${many ? `${kept.length} code blocks, cards or tables` : 'a code block, card or table'}. Delete ${many ? 'them' : 'it'} along with the text?`,
      confirmText: 'Delete',
      danger: true,
    })
    setRange(saved)
    return ok
  }

  const nextTo = (node, dir) => {
    let next = dir < 0 ? node.previousSibling : node.nextSibling
    while (next && next.nodeType === Node.TEXT_NODE && !next.data.replace(/​/g, '').trim()) {
      next = dir < 0 ? next.previousSibling : next.nextSibling
    }
    return next
  }
  // Nothing between the caret and that end of the block. Spaces you typed
  // (stored as non-breaking spaces) count as something, so Backspace and
  // Delete still remove them; only the source's own line breaks and indents
  // and the zero-width space of the Font and Size lists don't.
  function atEdge(block, range, dir) {
    const rest = document.createRange()
    rest.selectNodeContents(block)
    if (dir < 0) rest.setEnd(range.startContainer, range.startOffset)
    else rest.setStart(range.endContainer, range.endOffset)
    return !rest.toString().replace(/[​ \t\n\r]/g, '') &&!rest.cloneContents().querySelector('img, hr, [contenteditable="false"]')
  }

  // What a Backspace (dir -1) or Delete (dir 1) with nothing selected would do
  // to a kept block next to the caret: 'ok' (nothing), 'stop', or 'line' (the
  // caret is on an empty line beside it, which goes instead).
  function besideKept(range, dir) {
    const host = hostOf(range.startContainer)
    const { startContainer: at, startOffset: offset } = range
    if (at === host || (at.nodeType === Node.ELEMENT_NODE && isKept(at.childNodes[dir < 0 ? offset - 1 : offset]))) {
      const node = at.childNodes[dir < 0 ? offset - 1 : offset]
      return isKept(node) ? 'stop' : 'ok'
    }
    let block = at
    while (block && block.parentNode !== host) block = block.parentNode
    if (!block || isKept(block) || !atEdge(block, range, dir)) return 'ok'
    // An empty first line just above a block, or an empty last line just
    // below one: Backspace or Delete removes it.
    if (host === editor && atEdge(block, range, -dir)) {
      if (!nextTo(block, -1) && isKept(nextTo(block, 1))) {
        gapLine = block
        return 'top'
      }
      if (!nextTo(block, 1) && isKept(nextTo(block, -1))) {
        gapLine = block
        return 'bottom'
      }
    }
    if (!isKept(nextTo(block, dir))) return 'ok'
    const other = nextTo(block, -dir)
    const empty = atEdge(block, range, -dir)
    if (empty && other && !isKept(other)) return 'line'
    // An empty line between two blocks: it goes, and the blocks meet (click
    // the space between them for a line again).
    if (empty && isKept(other)) {
      gapLine = block
      return 'gap'
    }
    return 'stop'
  }
  let gapLine = null

  editor.addEventListener('beforeinput', async (e) => {
    if (isSealed(selectedId) || e.target.matches('input, textarea, select') || inCard(e.target)) return
    const type = e.inputType
    if (!/^(delete|insert(Text|Paragraph|LineBreak|ReplacementText)$)/.test(type)) return
    const selection = selectionInEditor()
    if (!selection) return
    const range = selection.getRangeAt(0)
    if (range.collapsed) {
      if (!type.startsWith('delete')) return
      const dir = /Backward$/.test(type) ? -1 : /Forward$/.test(type) ? 1 : 0
      const verdict = dir ? besideKept(range, dir) : 'ok'
      // The browser's own range too, in case a word or line delete reaches further.
      const reaches = (e.getTargetRanges ? e.getTargetRanges() : []).some((target) => {
        const r = document.createRange()
        r.setStart(target.startContainer, target.startOffset)
        r.setEnd(target.endContainer, target.endOffset)
        return keptIn(r).length > 0
      })
      if (verdict === 'ok' && !reaches) return
      e.preventDefault()
      if (verdict === 'line') {
        document.execCommand(dir < 0 ? 'forwardDelete' : 'delete')
        afterEdit()
      } else if ((verdict === 'top' || verdict === 'bottom') && gapLine) {
        const line = gapLine
        const way = verdict === 'top' ? 1 : -1
        const beside = nextTo(line, way)
        line.remove()
        // The caret goes to the nearest text past the block(s) now at the edge.
        let place = nextTo(beside, way)
        while (place && isKept(place)) place = nextTo(place, way)
        if (place) {
          const caret = document.createRange()
          caret.selectNodeContents(place)
          caret.collapse(way > 0)
          selection.removeAllRanges()
          selection.addRange(caret)
        } else {
          selection.removeAllRanges()
        }
        afterEdit()
      } else if (verdict === 'gap' && gapLine) {
        const line = gapLine
        const above = nextTo(line, -1)
        const near = dir < 0 ? above : nextTo(line, 1)
        // The browser's delete command, so Ctrl+Z brings the line back. With
        // both blocks as they are it would take one of them along; with the
        // block above editable for a moment it just removes the empty line.
        above.setAttribute('contenteditable', 'true')
        try {
          const inLine = document.createRange()
          inLine.setStart(line, 0)
          inLine.collapse(true)
          selection.removeAllRanges()
          selection.addRange(inLine)
          document.execCommand('delete')
        } finally {
          above.setAttribute('contenteditable', 'false')
        }
        if (line.isConnected) line.remove()
        // The caret goes to the nearest text past the block it was beside.
        const host = hostOf(near)
        let place = dir < 0 ? nextTo(near, -1) : nextTo(near, 1)
        while (place && isKept(place)) place = dir < 0 ? nextTo(place, -1) : nextTo(place, 1)
        if (place && host.contains(place)) {
          const caret = document.createRange()
          caret.selectNodeContents(place)
          caret.collapse(dir > 0)
          selection.removeAllRanges()
          selection.addRange(caret)
        }
        afterEdit()
      }
      gapLine = null
      return
    }
    if (!keptIn(range).length) return
    e.preventDefault()
    if (type === 'deleteByDrag') return
    const data = e.data ?? (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null)
    if (!(await mayDeleteKept(range))) return
    document.execCommand('delete')
    if (type === 'insertParagraph' || type === 'insertLineBreak') document.execCommand(type)
    else if (type.startsWith('insert') && data) document.execCommand('insertText', false, data)
    afterEdit()
  })

  // Clicking the space between two blocks that meet starts a line there.
  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isSealed(selectedId)) return
    const host = e.target === editor || (e.target.matches && e.target.matches('.nb-rich')) ? e.target : null
    if (!host) return
    const blocks = [...host.children]
    // Above a block that starts the note, or below one that ends it: a line there.
    const lastBlock = blocks[blocks.length - 1]
    const above = host === editor && isKept(blocks[0]) && e.clientY < blocks[0].getBoundingClientRect().top
    const below = host === editor && isKept(lastBlock) && e.clientY > lastBlock.getBoundingClientRect().bottom
    if (above || below) {
      e.preventDefault()
      const line = document.createElement('p')
      line.appendChild(document.createElement('br'))
      if (above) blocks[0].before(line)
      else lastBlock.after(line)
      editor.focus()
      const caret = document.createRange()
      caret.setStart(line, 0)
      caret.collapse(true)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(caret)
      afterEdit()
      return
    }
    for (let i = 0; i < blocks.length - 1; i++) {
      const [above, below] = [blocks[i], blocks[i + 1]]
      if (!isKept(above) || !isKept(below)) continue
      if (e.clientY < above.getBoundingClientRect().bottom || e.clientY > below.getBoundingClientRect().top) continue
      e.preventDefault()
      const line = document.createElement('p')
      line.appendChild(document.createElement('br'))
      above.after(line)
      host.focus()
      const caret = document.createRange()
      caret.setStart(line, 0)
      caret.collapse(true)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(caret)
      afterEdit()
      return
    }
  })

  // A code block shows variable names while it is typed in and values
  // otherwise (renderCodeView).
  editor.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches('.note-code-input')) renderCodeView(e.target.closest('pre.note-code'))
  })
  editor.addEventListener('focusout', (e) => {
    if (e.target.matches && e.target.matches('.note-code-input')) {
      const block = e.target.closest('pre.note-code')
      setTimeout(() => block.isConnected && renderCodeView(block), 0)
    }
  })

  // Clicks inside the editor: card links, card remove, and Ctrl+click on links.
  editor.addEventListener('click', (e) => {
    const codeCopy = e.target.closest('.note-code-copy')
    if (codeCopy) {
      const raw = codeCopy.closest('pre.note-code').querySelector('.note-code-input').value
      // With variables' values (note-vars.js).
      const text = window.NoteVars ? window.NoteVars.codeValues(raw) : raw
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
      selectWhole(codeRemove.closest('pre.note-code'))
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
      const card = remove.closest('.note-command')
      selectWhole(card)
      document.execCommand('delete')
      afterEdit()
      return
    }
    const link = e.target.closest('a[href]')
    if (!link) return
    e.preventDefault()
    if (link.classList.contains('note-term') && (link.classList.contains('missing') || !spells())) {
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
      ? spellList('scripts').find((s) => s.id === card.dataset.scriptId)
      : spellList('commands').find((c) => c.id === card.dataset.commandId)
    if (!entry || !spells()) return
    if (dirty) flush()
    rememberSelection()
    spells().edit(
      isScript ? 'script' : 'command',
      { onSave: refreshCards },
      entry,
    )
  }

  function insertClean(html, text) {
    if (html && !enclosing('pre')) {
      const clean = richAtCaret() ? sanitizeField(html, { keepStyles: false }) : sanitize(html, { keepStyles: false })
      document.execCommand('insertHTML', false, clean)
    } else if (text) {
      document.execCommand('insertText', false, text)
    } else {
      return
    }
    cardsIn(editor).forEach((card) => {
      if (!card.querySelector('.note-command-head')) drawCard(card)
    })
    termLinksIn(editor).forEach(drawTermLink)
    blockSectionsIn(editor).forEach((section) => {
      if (!section.querySelector('.nb-head')) drawBlockSection(section)
    })
    drawCodeBlocks()
    afterEdit()
  }

  editor.addEventListener('paste', async (e) => {
    if (inCard(e.target) || isSealed(selectedId)) return
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const files = [...e.clipboardData.files]
    const selection = selectionInEditor()
    if (selection && !(await mayDeleteKept(selection.getRangeAt(0)))) return
    insertWithImages(html, text, files)
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
    insertWithImages(
      e.dataTransfer.getData('text/html'),
      e.dataTransfer.getData('text/plain'),
      [...e.dataTransfer.files],
    )
  })

  // ─── Images ─────────────────────────────────────────────────────────
  // An image is saved in the note itself, as <img src="data:image/…" width>.
  // Notes live in browser storage, so pictures are made smaller first: at most
  // IMAGE_MAX pixels wide, as WebP. Images pasted or dropped with text from a
  // web page are fetched and saved the same way; one whose site doesn't allow
  // that keeps its web address, so it shows only while that address works.
  // Click an image to resize it (drag the corner; double-click the corner for
  // its own size) or remove it.
  const IMAGE_MAX = 1600
  const isImageFile = (file) => Boolean(file && /^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type))
  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  async function shrinkImage(blob) {
    // A small GIF stays as it is, so it keeps moving.
    if (blob.type === 'image/gif' && blob.size < 1500000) return safeImageSrc(await blobToDataUrl(blob)) || null
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, IMAGE_MAX / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    if (bitmap.close) bitmap.close()
    let url = canvas.toDataURL('image/webp', 0.85)
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85)
    // Already small: keep the original if that is smaller still.
    if (scale === 1 && blob.size * 1.37 < url.length) {
      const original = safeImageSrc(await blobToDataUrl(blob))
      if (original) return original
    }
    return url
  }

  async function imageFromAddress(src) {
    try {
      const response = await fetch(src, { credentials: 'omit' })
      if (!response.ok) return null
      const blob = await response.blob()
      if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(blob.type)) return null
      return await shrinkImage(blob)
    } catch {
      return null
    }
  }

  // Inserts at the caret: HTML with its images saved into the note, image
  // files (a screenshot, a file from the desktop), or else plain HTML / text.
  async function insertWithImages(html, text, fileList = []) {
    // Files that aren't pictures (a PDF, a scan's output) are attached
    // (note-files.js). Only when nothing else came with them: an app's
    // copied text may carry a file of its own.
    const others = fileList.filter((file) => !isImageFile(file))
    if (others.length && !html && window.NoteFiles) {
      rememberSelection()
      await window.NoteFiles.attach(others)
      fileList = fileList.filter(isImageFile)
      if (!fileList.length) return
    }
    const files = fileList.filter(isImageFile)
    const hasImages = Boolean(html) && /<img\b/i.test(html)
    if (!hasImages && !(files.length && !html)) {
      insertClean(html, text)
      return
    }
    rememberSelection()
    const nodeId = selectedId
    savedEl.textContent = 'Adding images…'
    let out = ''
    if (hasImages) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      let fileIndex = 0
      for (const img of [...doc.querySelectorAll('img')]) {
        const src = img.getAttribute('src') || ''
        let data = null
        if (/^data:image\//i.test(src) || /^https?:/i.test(src)) data = await imageFromAddress(src)
        // Word and other apps point at a local file and send the picture too.
        else if (files[fileIndex]) data = await shrinkImage(files[fileIndex++]).catch(() => null)
        if (data) img.setAttribute('src', data)
        else if (!/^https?:/i.test(src)) img.remove()
        img.removeAttribute('height')
        img.removeAttribute('srcset')
      }
      out = doc.body.innerHTML
    } else {
      for (const file of files) {
        const data = await shrinkImage(file).catch(() => null)
        if (data) out += `<img src="${data}" alt="">`
      }
    }
    if (selectedId !== nodeId || isSealed(selectedId)) return
    restoreSelection()
    if (out) insertClean(out, text)
    else if (text) insertClean('', text)
    afterImages()
  }

  // Saves now, and says so if the note no longer fits in browser storage.
  async function afterImages() {
    flush()
    if (window.DataFile && window.DataFile.whenWritten) await window.DataFile.whenWritten()
    if (savedEl.classList.contains('error')) {
      ask({
        title: 'Not saved',
        message:
          'The browser would not store the note with this image, so the last change is not saved. Remove the image, or free some disk space, and try again.',
        alertOnly: true,
      })
    } else updateWordCount()
  }

  const imageInput = document.createElement('input')
  imageInput.type = 'file'
  imageInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp'
  imageInput.multiple = true
  imageInput.hidden = true
  document.body.appendChild(imageInput)
  $('notes-image').addEventListener('mousedown', (e) => e.preventDefault())
  $('notes-image').addEventListener('click', () => {
    if (isSealed(selectedId) || !selectedNode()) return
    rememberSelection()
    imageInput.click()
  })
  imageInput.addEventListener('change', () => {
    const files = [...imageInput.files]
    imageInput.value = ''
    if (files.length) insertWithImages('', '', files)
  })

  // The frame drawn over a clicked image: drag its corner to resize, × removes.
  // It sits outside the note, so it is never saved.
  const imageFrame = document.createElement('div')
  imageFrame.className = 'note-image-frame'
  imageFrame.hidden = true
  imageFrame.innerHTML =
    '<button type="button" class="note-image-remove" title="Remove this image" aria-label="Remove this image">×</button>' +
    '<span class="note-image-size" aria-hidden="true"></span>' +
    '<span class="note-image-grip" title="Drag to resize (double-click for the image’s own size)"></span>'
  document.body.appendChild(imageFrame)
  let activeImage = null

  function placeImageFrame() {
    if (!activeImage || !editor.contains(activeImage) || isSealed(selectedId) || pane.classList.contains('is-empty')) {
      activeImage = null
      imageFrame.hidden = true
      return
    }
    const box = activeImage.getBoundingClientRect()
    const view = visibleBox()
    const shown = box.bottom > view.top && box.top < view.bottom && box.width > 0
    imageFrame.hidden = !shown
    if (!shown) return
    imageFrame.style.left = `${box.left}px`
    imageFrame.style.top = `${box.top}px`
    imageFrame.style.width = `${box.width}px`
    imageFrame.style.height = `${box.height}px`
    // Kept inside the note's box where the image runs past it.
    imageFrame.style.clipPath = `inset(${Math.max(0, view.top - box.top)}px 0 ${Math.max(0, box.bottom - view.bottom)}px 0)`
    imageFrame.querySelector('.note-image-size').textContent = `${Math.round(box.width)} × ${Math.round(box.height)}`
  }
  const selectImage = (img) => {
    activeImage = img
    placeImageFrame()
  }

  editor.addEventListener('click', (e) => {
    selectImage(e.target instanceof HTMLImageElement && !inCard(e.target) ? e.target : null)
  })
  editor.addEventListener('scroll', placeImageFrame)
  editor.addEventListener('input', placeImageFrame)
  window.addEventListener('resize', placeImageFrame)
  document.addEventListener('notes:shown', () => selectImage(null))
  document.addEventListener('mousedown', (e) => {
    if (!activeImage || imageFrame.contains(e.target) || e.target === activeImage) return
    selectImage(null)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeImage) selectImage(null)
  })

  imageFrame.querySelector('.note-image-remove').addEventListener('click', () => {
    const img = activeImage
    selectImage(null)
    if (!img || !editor.contains(img)) return
    selectWhole(img)
    document.execCommand('delete')
    afterEdit()
  })

  const grip = imageFrame.querySelector('.note-image-grip')
  grip.addEventListener('pointerdown', (e) => {
    if (!activeImage) return
    e.preventDefault()
    const img = activeImage
    const startX = e.clientX
    const startWidth = img.getBoundingClientRect().width
    const style = getComputedStyle(editor)
    const room = editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    grip.setPointerCapture(e.pointerId)
    imageFrame.classList.add('resizing')
    const move = (ev) => {
      const width = Math.round(Math.max(32, Math.min(room, startWidth + ev.clientX - startX)))
      img.setAttribute('width', String(width))
      placeImageFrame()
    }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      imageFrame.classList.remove('resizing')
      markDirty()
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
  })
  grip.addEventListener('dblclick', () => {
    if (!activeImage) return
    activeImage.removeAttribute('width')
    placeImageFrame()
    markDirty()
  })
  // Images that finish loading move the frame.
  editor.addEventListener('load', placeImageFrame, true)

  // ─── Tables ─────────────────────────────────────────────────────────
  const MAX_TABLE_ROWS = 50
  const MAX_TABLE_COLS = 12

  async function insertTable() {
    restoreSelection()
    if (richAtCaret()) return
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
    // Equal columns filling the note's width; from then on, sized by hand.
    const style = getComputedStyle(editor)
    const room = editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2
    const colWidth = Math.max(MIN_COL, Math.floor(room / cols))
    const colgroup = `<colgroup>${`<col style="width: ${colWidth}px">`.repeat(cols)}</colgroup>`
    const row = (tag) => `<tr>${`<${tag}><br></${tag}>`.repeat(cols)}</tr>`
    const head = hasHead ? `<thead>${row('th')}</thead>` : ''
    const bodyRows = hasHead ? rows - 1 : rows
    const body = bodyRows ? `<tbody>${row('td').repeat(bodyRows)}</tbody>` : ''
    replaceCaretBlock(`<table data-new-table="1" style="width: ${colWidth * cols}px">${colgroup}${head}${body}</table><p><br></p>`)
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

  function addColumn(copy, rowIndex, at, from) {
    ;[...copy.rows].forEach((row) => {
      const tag = row.parentElement.tagName === 'THEAD' ? 'th' : 'td'
      row.insertBefore(newCell(tag), row.cells[at] || null)
    })
    // The new column is as wide as the one it was added beside.
    const cols = colsOf(copy)
    if (cols.length) {
      const col = document.createElement('col')
      col.style.width = (cols[from] || cols[cols.length - 1]).style.width
      cols[0].parentElement.insertBefore(col, cols[at] || null)
      sumWidths(copy)
    }
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
    const cols = colsOf(copy)
    if (cols[colIndex]) {
      cols[colIndex].remove()
      sumWidths(copy)
    }
    const row = copy.rows[rowIndex]
    return row.cells[Math.min(colIndex, row.cells.length - 1)]
  }

  function deleteTable(cell) {
    selectWhole(cell.closest('table'))
    document.execCommand('delete')
    afterEdit()
  }

  // Expand on: the table fills the note's width and its columns size to
  // their text (how tables worked before "Table sizes"). Off: the columns
  // keep the widths they show now, and are sized by hand from then on.
  function toggleExpand(copy, widths) {
    if (copy.dataset.expand) {
      delete copy.dataset.expand
      let group = copy.querySelector(':scope > colgroup')
      if (!group) {
        group = document.createElement('colgroup')
        copy.prepend(group)
      }
      group.replaceChildren(
        ...widths.map((w) => {
          const col = document.createElement('col')
          col.style.width = `${w}px`
          return col
        }),
      )
      sumWidths(copy)
    } else {
      copy.dataset.expand = '1'
      const group = copy.querySelector(':scope > colgroup')
      if (group) group.remove()
      copy.style.removeProperty('width')
      if (!copy.getAttribute('style')) copy.removeAttribute('style')
    }
  }

  function tableAction(action) {
    const cell = enclosing('td, th')
    if (!cell) return
    const table = cell.closest('table')
    if (action === 'expand') {
      // Measured here: the edited copy isn't drawn.
      const widest = [...table.rows].reduce((a, b) => (b.cells.length > a.cells.length ? b : a), table.rows[0])
      const widths = [...widest.cells].map((c) => Math.max(MIN_COL, Math.round(c.getBoundingClientRect().width)))
      rewriteTable(cell, (copy, row, col) => {
        toggleExpand(copy, widths)
        return copy.rows[row].cells[col]
      })
      placeTableTools()
      return
    }
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
      if (action === 'col-left') return addColumn(copy, row, col, col)
      if (action === 'col-right') return addColumn(copy, row, col + 1, col)
      if (action === 'del-row') return deleteRow(copy, row, col)
      return deleteColumn(copy, row, col)
    })
  }

  // ─── Table sizes ────────────────────────────────────────────────────
  // Tables keep the sizes they are given: each column has a set width (a
  // <col> in a <colgroup>) and the table is as wide as its columns, so typing
  // never reflows the columns. Drag a column's right border to change its
  // width, or a row's bottom border to change its height (a row still grows
  // if its text needs more room). Older tables are fixed at the sizes they
  // show the first time the note is opened.
  const colsOf = (table) => [...table.querySelectorAll(':scope > colgroup > col')]
  const ownTable = (table) => table && editor.contains(table) && !table.closest('[contenteditable="false"]')

  function sumWidths(table) {
    const total = colsOf(table).reduce((sum, col) => sum + (parseFloat(col.style.width) || 0), 0)
    if (total) table.style.width = `${Math.round(total)}px`
  }

  function fixTableSizes() {
    editor.querySelectorAll('table').forEach((table) => {
      if (!ownTable(table) || table.dataset.expand) return
      const cols = colsOf(table)
      if (cols.length === widthOf(table) && cols.every((col) => PIXELS.test(col.style.width)) && table.style.width) return
      // Measured from the row with the most cells; nothing to measure while
      // the note is hidden, so that waits for the next edit.
      const row = [...table.rows].reduce((a, b) => (b.cells.length > a.cells.length ? b : a), table.rows[0])
      const widths = row ? [...row.cells].map((cell) => Math.round(cell.getBoundingClientRect().width)) : []
      if (!widths.length || widths.some((w) => !w)) return
      let group = table.querySelector(':scope > colgroup')
      if (!group) {
        group = document.createElement('colgroup')
        table.prepend(group)
      }
      group.replaceChildren(
        ...widths.map((w) => {
          const col = document.createElement('col')
          col.style.width = `${Math.max(MIN_COL, w)}px`
          return col
        }),
      )
      sumWidths(table)
    })
  }

  // The border under the pointer: { table, col } for a column's right
  // border, { table, row } for a row's bottom border.
  function tableEdgeAt(x, y) {
    if (!editor.isContentEditable || isSealed(selectedId)) return null
    const cellAt = (px, py) => {
      const el = document.elementFromPoint(px, py)
      const cell = el && el.closest && el.closest('td, th')
      return cell && ownTable(cell.closest('table')) ? cell : null
    }
    // Just past a table's last column or row, the pointer is outside it.
    const cell = cellAt(x, y) || cellAt(x - EDGE - 1, y) || cellAt(x, y - EDGE - 1)
    if (!cell) return null
    const table = cell.closest('table')
    const box = cell.getBoundingClientRect()
    let index = -1
    if (Math.abs(x - box.right) <= EDGE) index = cell.cellIndex
    else if (Math.abs(x - box.left) <= EDGE && cell.cellIndex > 0) index = cell.cellIndex - 1
    // An expanding table sizes its own columns: only rows are dragged.
    if (index >= 0 && !table.dataset.expand) {
      fixTableSizes()
      const col = colsOf(table)[index]
      if (col) return { table, col }
    }
    if (Math.abs(y - box.bottom) <= EDGE) return { table, row: cell.parentElement }
    if (Math.abs(y - box.top) <= EDGE && cell.parentElement.rowIndex > 0) {
      return { table, row: table.rows[cell.parentElement.rowIndex - 1] }
    }
    return null
  }

  editor.addEventListener('pointermove', (e) => {
    if (e.buttons) return
    const edge = tableEdgeAt(e.clientX, e.clientY)
    editor.classList.toggle('table-col-edge', Boolean(edge && edge.col))
    editor.classList.toggle('table-row-edge', Boolean(edge && edge.row))
  })
  editor.addEventListener('pointerleave', () => {
    editor.classList.remove('table-col-edge', 'table-row-edge')
  })
  editor.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      const edge = tableEdgeAt(e.clientX, e.clientY)
      if (!edge) return
      // Not a click into the text: no caret move, no selection.
      e.preventDefault()
      e.stopPropagation()
      const { table, col, row } = edge
      const start = col ? parseFloat(col.style.width) : row.getBoundingClientRect().height
      const from = col ? e.clientX : e.clientY
      editor.setPointerCapture(e.pointerId)
      document.body.classList.add(col ? 'table-col-resizing' : 'table-row-resizing')
      const move = (ev) => {
        const change = (col ? ev.clientX : ev.clientY) - from
        if (col) {
          col.style.width = `${Math.round(Math.max(MIN_COL, start + change))}px`
          sumWidths(table)
        } else {
          row.style.height = `${Math.round(Math.max(MIN_ROW, start + change))}px`
        }
        placeTableTools()
      }
      const up = () => {
        editor.removeEventListener('pointermove', move)
        editor.removeEventListener('pointerup', up)
        editor.removeEventListener('pointercancel', up)
        document.body.classList.remove('table-col-resizing', 'table-row-resizing')
        // A row can't be shorter than its text: keep the height it shows.
        if (row) row.style.height = `${Math.round(row.getBoundingClientRect().height)}px`
        markDirty()
      }
      editor.addEventListener('pointermove', move)
      editor.addEventListener('pointerup', up)
      editor.addEventListener('pointercancel', up)
    },
    true,
  )
  // Double-click a row's bottom border: back to the height its text needs.
  editor.addEventListener(
    'dblclick',
    (e) => {
      const edge = tableEdgeAt(e.clientX, e.clientY)
      if (!edge || !edge.row) return
      e.preventDefault()
      edge.row.style.removeProperty('height')
      if (!edge.row.getAttribute('style')) edge.row.removeAttribute('style')
      markDirty()
      placeTableTools()
    },
    true,
  )

  // ─── Table options ──────────────────────────────────────────────────
  // Shown over the note, just above the table holding the caret (below it, or
  // at the top of the note, when there's no room), so the note never moves.
  function placeTableTools() {
    const bar = $('notes-table-tools')
    const cell = !isSealed(selectedId) && enclosing('td, th')
    const table = cell && cell.closest('table')
    const view = visibleBox()
    const box = table && table.getBoundingClientRect()
    const shown = Boolean(box && box.bottom > view.top && box.top < view.bottom)
    bar.hidden = !shown
    if (!shown) return
    bar.querySelector('[data-table-action="expand"]').setAttribute('aria-pressed', String(Boolean(table.dataset.expand)))
    const gap = 6
    const height = bar.offsetHeight
    const width = bar.offsetWidth
    let top = box.top - height - gap
    if (top < view.top) top = box.bottom + gap + height <= view.bottom ? box.bottom + gap : view.top + gap
    const left = Math.max(view.left + gap, Math.min(box.left, view.right - width - gap))
    bar.style.top = `${Math.round(top)}px`
    bar.style.left = `${Math.round(left)}px`
  }
  editor.addEventListener('scroll', placeTableTools)
  editor.addEventListener('input', placeTableTools)
  window.addEventListener('resize', placeTableTools)

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
    const inEditor = savedRange && editor.contains(savedRange.startContainer)
    // A card can also go in a template's Rich text field.
    const host = inEditor ? hostOf(savedRange.startContainer) : editor
    host.focus()
    let block = inEditor ? savedRange.startContainer : editor.lastChild
    while (block && block.parentNode !== host) block = block.parentNode
    const isEmptyParagraph =
      block &&
      block.nodeType === Node.ELEMENT_NODE &&
      block.matches('p, div:not(.note-command)') &&
      !block.textContent.trim()
    if (!isEmptyParagraph) {
      const paragraph = document.createElement('p')
      paragraph.appendChild(document.createElement('br'))
      if (block) block.after(paragraph)
      else host.appendChild(paragraph)
      block = paragraph
    }
    const range = document.createRange()
    range.selectNode(block)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('insertHTML', false, html)
  }

  // Shared with notes-callouts.js.
  window.NotesEditor = {
    editor,
    selectWhole,
    // Whether archived branches show (the lock button by the tree search).
    showArchived: () => showArchived,
    // Branch view draws the notes it isn't editing as the editor would.
    drawCodeBlock,
    // A small menu at x, y (note-vars.js: a removed variable's chip).
    openMenu,
    // Branch view's tag chips: filter the tree by a tag too.
    addTagFilter(tag) {
      if (tag && !tagFilter.includes(tag)) setTagFilter([...tagFilter, tag])
    },
    enclosing,
    replaceCaretBlock,
    afterEdit,
    restoreSelection,
    // For sealed-tomes.js: read the saved tree and draw note HTML elsewhere.
    flush,
    // For note-branch.js.
    selectNode,
    // Stars, and for note-select.js.
    setStar,
    renderTree: () => renderTree(),
    branchIds,
    existsAnywhere: (id) => Boolean(locateAnywhere(id)),
    // A note in any tome: the node, its tome, the names above it, and
    // whether a seal (its own, an ancestor's or the tome's) covers it.
    infoAnywhere(id) {
      for (const tome of tomes) {
        let at = locate(id, tome.nodes)
        if (!at) continue
        const node = at.node
        const path = []
        let sealed = Boolean(tome.sealed || node.sealed)
        while (at && at.parent) {
          path.unshift(at.parent.name)
          if (at.parent.sealed) sealed = true
          at = locate(at.parent.id, tome.nodes)
        }
        return { node, tome: { id: tome.id, name: tome.name }, path, sealed }
      }
      return null
    },
    // Opens a note in whichever tome holds it.
    openAnywhere(id) {
      const found = locateAnywhere(id)
      if (found) openNode(found.tome.id, id)
    },
    selectedId: () => selectedId,
    tomeId: () => tomeId,
    // The Archive's lock on an archived tome: unarchive it and open it (its
    // tab comes back).
    unarchiveTome(id) {
      const tome = tomes.find((t) => t.id === id)
      if (!tome) return
      switchTome(id)
      setSeal(tome, false)
    },
    findNode: (id) => {
      const at = locate(id)
      return at ? at.node : null
    },
    depthOf: (id) => (locate(id) ? pathTo(id).split(' › ').length - 1 : 0),
    isInside,
    sealOf,
    isSealed,
    selectedNode,
    sanitize,
    drawCard,
    drawTermLink,
    cardsIn,
    termLinksIn,
    // For note-files.js.
    fileShell,
    insertFiles,
    rememberSelection,
    // For note-vars.js.
    varChipsIn,
    renderCodeView,
    codeBlocksIn,
    insertVariable,
    canInsertAt: (node) => !isSealed(selectedId) && editor.contains(node) && !inCard(node) && !richOf(node),
    updateGeneratedCommand,
    // For note-blocks.js.
    markDirty,
    cleanBlockSchema,
    cleanBlockRecords,
    blockShell,
    blockSectionsIn,
    sanitizeField,
    textToFieldHtml,
    htmlText,
    // The saved HTML of a Rich text field.
    fieldHtml(el) {
      const copy = el.cloneNode(true)
      cardsIn(copy).forEach((card) => card.replaceWith(cardShell(card.dataset)))
      termLinksIn(copy).forEach((link) => link.replaceWith(termLink(link.dataset)))
      return sanitizeField(copy.innerHTML)
    },
    keepFieldEdges,
    // For note-templates.js.
    newId: () => newNode('').id,
    listTemplates,
    // For the tag editor: every note tag, for shared tag suggestions.
    allTags: () => allNoteTags(),
    addLocked,
    insertBranch,
    addToTemplatesTome,
    startRename,
    ask,
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
  // Puts a variable chip at the remembered caret (note-vars.js). Returns
  // false where chips can't go: a sealed note, a card or code block, or a
  // template field.
  function insertVariable(variable, range) {
    if (isSealed(selectedId) || !variable || !range || !editor.contains(range.startContainer)) return false
    if (inCard(range.startContainer) || richOf(range.startContainer)) return false
    setRange(range)
    const chip = varShell({ varId: variable.id, varName: variable.name })
    if (!chip) return false
    document.execCommand('insertHTML', false, `${chip.outerHTML}\u00a0`)
    if (window.NoteVars) window.NoteVars.draw(editor)
    afterEdit()
    return true
  }

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
      items: () => spellList('commands'),
      title: (c) => c.title || c.id,
      badge: (c) => (c.platform ? badge('commands', c.platform) : ''),
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
      items: () => spellList('scripts'),
      title: (s) => s.name || s.id,
      badge: (s) => (s.language ? badge('scripts', s.language) : ''),
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
      items: () => spellList('terms'),
      title: (t) => t.term || t.id,
      badge: (t) => (t.category ? badge('terms', t.category) : ''),
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
      if (!spells()) return
      rememberSelection()
      openPicker(button.dataset.insert)
    })
  })
  // Insert Command, Script and Term need Spells; without it they are hidden
  // (their Alt shortcuts then do nothing).
  // Insert Command, Script and Term sit together at the end of the toolbar,
  // labelled as coming from Spells, and are hidden with it.
  function showSpellsButtons() {
    const on = Boolean(spells())
    document.querySelectorAll('#notes-toolbar [data-insert]').forEach((button) => {
      button.hidden = !on
    })
    const group = $('notes-spells-group')
    if (group) group.hidden = !on
  }
  showSpellsButtons()
  document.addEventListener('spellbook:ready', showSpellsButtons)

  // Alt+C, Alt+S, Alt+T and Alt+P while typing in a note press Insert
  // Command, Script, Term and Template (Alt+V, Insert Variable, is in
  // note-vars.js). Not with Ctrl, so AltGr letters still type, and not in a
  // code block or other box in the note. A button that can't be used there
  // (Template inside a template field) does nothing.
  const INSERT_KEYS = {
    KeyC: '#notes-toolbar [data-insert="command"]',
    KeyS: '#notes-toolbar [data-insert="script"]',
    KeyT: '#notes-toolbar [data-insert="term"]',
    KeyP: '#notes-insert-block',
  }
  document.addEventListener('keydown', (e) => {
    const target = INSERT_KEYS[e.code]
    if (!target || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const active = document.activeElement
    if (!active || !(active === editor || editor.contains(active)) || !active.isContentEditable) return
    if (!editor.isContentEditable || isSealed(selectedId)) return
    const button = document.querySelector(target)
    e.preventDefault()
    if (!button || button.disabled || button.hidden) return
    rememberSelection()
    button.click()
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
    spells().edit(kind, {
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
  // Notes carrying any of these tags (for a command's, script's or term's
  // detail pane), with the tags they share.
  function taggedNotes(tags) {
    const wanted = new Set(tags || [])
    const found = []
    if (!wanted.size) return found
    if (dirty) flush()
    const walk = (list, parents) => {
      list.forEach((node) => {
        const shared = (node.tags || []).filter((t) => wanted.has(t))
        if (shared.length) found.push({ nodeId: node.id, name: node.name, parents: parents.join(' › '), shared })
        walk(node.children, [...parents, node.name])
      })
    }
    tomes.forEach((tome) => walk(tome.nodes, tomes.length > 1 ? [tome.name] : []))
    return found.sort((a, b) => b.shared.length - a.shared.length)
  }
  window.NoteLinks = { find: findLinks, tagged: taggedNotes }

  // Used by js/transfer.js (Import / Export Manager). Sealed tomes travel as
  // they are stored, still sealed.
  const countNodes = (list) => list.reduce((n, node) => n + 1 + countNodes(node.children), 0)
  const collectIds = (list, into) => {
    list.forEach((node) => {
      into.add(node.id)
      collectIds(node.children, into)
    })
    return into
  }
  window.NotesIO = {
    list() {
      return tomes.map((t) => ({ id: t.id, name: t.name, sealed: t.sealed, notes: countNodes(t.nodes) }))
    },
    // Copies of the named tomes (all of them when no ids are given).
    get(ids) {
      if (dirty) flush()
      persist()
      const wanted = tomes.filter((t) => !ids || ids.has(t.id))
      return JSON.parse(JSON.stringify(cleanTomes(wanted)))
    },
    // Adds tomes as new tabs. A tome whose id, or any note id, is already in
    // use gets fresh ids, and links to its notes are updated to match.
    add(list) {
      if (dirty) flush()
      const incoming = cleanTomes(list)
      const taken = new Set(tomes.map((t) => t.id))
      tomes.forEach((t) => collectIds(t.nodes, taken))
      incoming.forEach((tome) => {
        const ids = collectIds(tome.nodes, new Set([tome.id]))
        if ([...ids].some((id) => taken.has(id))) {
          const renames = new Map()
          const fresh = () => newNode('').id
          renames.set(tome.id, newTome('').id)
          const rename = (nodesList) =>
            nodesList.forEach((node) => {
              renames.set(node.id, fresh())
              rename(node.children)
            })
          rename(tome.nodes)
          const apply = (nodesList) =>
            nodesList.forEach((node) => {
              let html = node.html
              renames.forEach((to, from) => {
                if (from !== tome.id && html.includes(from)) html = html.split(from).join(to)
              })
              node.html = html
              node.id = renames.get(node.id)
              apply(node.children)
            })
          if (tome.selectedId) tome.selectedId = renames.get(tome.selectedId) || null
          apply(tome.nodes)
          tome.id = renames.get(tome.id)
        }
        collectIds(tome.nodes, taken)
        taken.add(tome.id)
        tomes.push(tome)
      })
      resetNoteBaseline()
      persist()
      renderTabs()
      return incoming.length
    },
  }

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
    revealArchived(home, nodeId)
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

  // The tomes with a tab: not archived ones (the Archive tab has them),
  // unless it's the one open, reached from the Archive.
  const shownTomes = () => tomes.filter((tome) => !tome.sealed || tome.id === tomeId)

  function renderTabs() {
    tabsEl.replaceChildren(
      ...shownTomes().map((tome) => {
        const tab = document.createElement('button')
        tab.type = 'button'
        tab.className = 'notes-tab'
        tab.dataset.id = tome.id
        const active = tome.id === tomeId
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-selected', String(active))
        tab.tabIndex = active ? 0 : -1
        tab.title = `${tome.name}\nDouble-click to rename, right-click for more`
        if (shownTomes().length > 1) tab.append(window.SpellBook.reorderHandle('Drag to move this tome'))
        const name = document.createElement('span')
        name.className = 'notes-tab-name'
        name.textContent = tome.name
        tab.append(name)
        if (tome.sealed) tab.append(sealIcon('Archived tome: read-only'))
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
      await tell('Tome is archived', `Unarchive “${tome.name}” before renaming it.`)
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
    notesChanged()
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
        'Tome is archived',
        tome.sealed
          ? `“${tome.name}” is archived. Unarchive it before deleting it.`
          : `“${tome.name}” contains an archived branch. Unarchive it before deleting the tome.`,
      )
      return
    }
    const count = (list) => list.reduce((sum, n) => sum + 1 + count(n.children), 0)
    const total = count(tome.nodes)
    const confirmed = await ask({
      title: 'Delete tome',
      message: `${trashBin ? 'Move' : 'Delete'} the “${tome.name}” tome${total ? ` and the ${total} node${total === 1 ? '' : 's'} in it` : ''}${trashBin ? ' to Trash' : ''}?${trashBin ? '' : ' This cannot be undone.'}`,
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
    if (trashBin) trashBin.add({ id: tome.id, kind: 'tome', tome: JSON.parse(JSON.stringify(tome)), index })
    tomes.splice(tomes.indexOf(tome), 1)
    persist()
    renderTabs()
    focusActiveTab()
    notesChanged()
  }

  // ─── Trash (js/core/trash.js) ────────────────────────────────────────────
  // Deleted nodes (with everything inside them) and tomes go to the shared
  // Trash, kept under spellbook_trash_notes_v1 (in IndexedDB, like the notes).
  // A note's Environment variables are stored by note id and left in place,
  // so a restored note has them again.
  //   { id, kind: 'node', node, tomeId, tomeName, parentId, prevId, index, trashedAt }
  //   { id, kind: 'tome', tome, index, trashedAt }
  const trashBin = window.SpellBook && window.SpellBook.trash ? window.SpellBook.trash.bin('spellbook_trash_notes_v1') : null

  function trashNode(at) {
    if (!trashBin) return
    const tome = activeTome()
    const prev = at.index > 0 ? at.list[at.index - 1] : null
    trashBin.add({
      id: at.node.id,
      kind: 'node',
      node: JSON.parse(JSON.stringify(at.node)),
      tomeId: tome ? tome.id : null,
      tomeName: tome ? tome.name : '',
      parentId: at.parent ? at.parent.id : null,
      prevId: prev ? prev.id : null,
      index: at.index,
    })
  }

  // Whether a tome's top level (parentId null) or a node's children can take
  // a node: not inside a seal.
  function lockedIn(tome, parentId) {
    if (tome.sealed) return true
    let found = parentId ? locate(parentId, tome.nodes) : null
    while (found) {
      if (found.node.sealed) return true
      found = found.parent ? locate(found.parent.id, tome.nodes) : null
    }
    return false
  }

  // Ids already in use get fresh ones (an import may have brought the same
  // note back meanwhile), so nothing is ever there twice.
  function freshIds(list) {
    const used = new Set()
    const walk = (nodes) => nodes.forEach((n) => (used.add(n.id), walk(n.children)))
    tomes.forEach((t) => walk(t.nodes))
    const fix = (nodes) =>
      nodes.forEach((n) => {
        if (used.has(n.id)) n.id = newNode('').id
        used.add(n.id)
        fix(n.children)
      })
    fix(list)
  }

  function restoreFromTrash(id) {
    const item = trashBin.all().find((it) => String(it.id) === String(id))
    if (!item) return
    if (dirty) flush()
    if (item.kind === 'tome') {
      const [tome] = cleanTomes([item.tome])
      if (!tome) return
      trashBin.take(id)
      if (tomes.some((t) => t.id === tome.id)) tome.id = newTome('').id
      freshIds(tome.nodes)
      tomes.splice(Math.min(Number(item.index) || 0, tomes.length), 0, tome)
      persist()
      renderTabs()
      notesChanged()
      return
    }
    const [node] = cleanNodes([item.node])
    if (!node) return
    // Back where it was if it can go there: under its parent after the note
    // that came before it, or at the top of its tome; otherwise the open tome.
    let tome = tomes.find((t) => t.id === item.tomeId && !t.sealed)
    let parent = tome && item.parentId ? locate(item.parentId, tome.nodes) : null
    let message = ''
    if (tome && item.parentId && (!parent || lockedIn(tome, item.parentId))) {
      parent = null
      message = `“${node.name}” was restored to the top of “${tome.name}”: the note it was in is gone or archived.`
    }
    if (!tome) {
      tome = [activeTome(), ...tomes].find((t) => t && !t.sealed)
      if (!tome) {
        tome = newTome('Restored')
        tomes.push(tome)
      }
      message = `“${node.name}” was restored to “${tome.name}”: its tome, “${item.tomeName || 'unknown'}”, is gone or archived.`
    }
    const list = parent ? parent.node.children : tome.nodes
    if (parent) parent.node.collapsed = false
    trashBin.take(id)
    freshIds([node])
    const prevAt = item.prevId ? list.findIndex((n) => n.id === item.prevId) : -1
    const at = prevAt >= 0 ? prevAt + 1 : parent || item.parentId === null ? Math.min(item.index || 0, list.length) : list.length
    list.splice(at, 0, node)
    if (tome.id === tomeId) selectedId = node.id
    else tome.selectedId = node.id
    persist()
    renderTabs()
    if (tome.id === tomeId) {
      renderTree()
      showSelected()
    }
    notesChanged()
    return message
  }

  if (trashBin) {
    window.SpellBook.trash.section({
      id: 'compendium',
      label: 'Compendium',
      order: 40,
      items: () =>
        trashBin.all().map((item) => {
          if (item.kind === 'tome') {
            const n = countNodes((item.tome && item.tome.nodes) || [])
            return {
              id: item.id,
              title: (item.tome && item.tome.name) || 'Untitled tome',
              detail: `Tome${n ? `, ${n} note${n === 1 ? '' : 's'}` : ''}`,
              trashedAt: item.trashedAt,
            }
          }
          const n = countNodes((item.node && item.node.children) || [])
          return {
            id: item.id,
            title: (item.node && item.node.name) || 'Untitled',
            detail: `In “${item.tomeName || 'a tome'}”${n ? `, with ${n} note${n === 1 ? '' : 's'} inside` : ''}`,
            trashedAt: item.trashedAt,
          }
        }),
      restore: restoreFromTrash,
      purge: (id) => trashBin.remove(id),
      empty: () => trashBin.clear(),
    })
  }

  function tabMenuItems(tome) {
    return [
      ['Rename Tome', () => renameTome(tome.id), tome.sealed],
      tome.sealed
        ? ['Unarchive Tome', () => setSeal(tome, false)]
        : ['Archive Tome', () => setSeal(tome, true)],
      null,
      ['Delete Tome', () => deleteTome(tome.id), tomes.length === 1],
    ]
  }

  $('notes-add-tome').addEventListener('click', addTome)
  // Drag a tome's handle to move it (js/core/reorder.js). The order is saved
  // with the tomes.
  window.SpellBook.reorderable(tabsEl, {
    items: '.notes-tab',
    id: (tab) => tab.dataset.id,
    move(ids) {
      // Only the tabs shown move; archived tomes keep their places.
      const moved = ids.map((id) => tomes.find((t) => t.id === id)).filter(Boolean)
      let k = 0
      const order = tomes.map((tome) => (ids.includes(tome.id) ? moved[k++] : tome))
      tomes.splice(0, tomes.length, ...order)
      persist()
      renderTabs()
    },
  })
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

  // For the Back button (js/core/router.js): where the Compendium is, and how to return.
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
      // An archived note (opened from the Archive or a link): the tree shows
      // archived notes, so it's there to select.
      revealArchived(tomes.find((t) => t.id === loc.tomeId), loc.nodeId)
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
    // Every note of every tome with its plain text (lower case), for other
    // pages that look for something in the notes (modules/attack).
    all() {
      if (dirty) flush()
      const out = []
      const walk = (tome, list) =>
        list.forEach((node) => {
          out.push({ tomeId: tome.id, nodeId: node.id, name: node.name, tags: node.tags || [], text: plainTextOf(node) })
          walk(tome, node.children || [])
        })
      tomes.forEach((tome) => walk(tome, tome.nodes || []))
      return out
    },
  }

  // Import / Export (js/transfer.js): tomes, under "tomes" in the file as
  // before. Imported tomes are added as new tabs.
  const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`
  window.SpellBook.transferPart({
    id: 'tomes',
    title: 'Compendium',
    unit: 'tome',
    list: () =>
      window.NotesIO.list().map((t) => ({
        id: t.id,
        label: t.name,
        sub: `${plural(t.notes, 'note')}${t.sealed ? ', sealed' : ''}`,
      })),
    export: (ids) => window.NotesIO.get(ids),
    accept: (data) => (Array.isArray(data) && data.length ? data : null),
    describe: (list) => ({
      sub: `${plural(list.length, 'tome')} in the file, added as new tabs.`,
      items: list.map((t, i) => ({ id: String(i), label: t.name || 'Untitled', sub: t.sealed ? 'sealed' : '' })),
    }),
    apply: (list, picked) => plural(window.NotesIO.add(list.filter((_, i) => picked.has(String(i)))), 'tome'),
  })

  // Saved layout that Import / Export copies as a group of settings.
  window.SpellBook.settingGroup({
    id: 'compendium',
    title: 'Compendium layout',
    sub: 'the widths of the tree, the Archive list, the export list and notes',
    order: 20,
    keys: ['spellbook_notes_pane_v1', 'spellbook_sealed_list_width_v1', 'spellbook_select_pane_width_v1', 'spellbook_note_width_v1', 'spellbook_note_bars_v1', 'spellbook_note_titles_v1', 'spellbook_notes_show_archived_v1'],
  })

  // What other tabs use from the Compendium (js/core/pages.js services):
  // every note's plain text and tags, and opening one note.
  window.SpellBook.provide('compendium', {
    all: () => window.NotesNav.all(),
    open(loc) {
      window.SpellBook.goTo('notes')
      window.NotesNav.open(loc)
    },
    describe: (loc) => window.NotesNav.describe(loc),
    // For an entry's "Linked in n notes" and "notes with the same tags".
    linksTo: (kind, id) => window.NoteLinks.find(kind, id),
    tagged: (tags) => window.NoteLinks.tagged(tags),
  })

  // Note tags, suggested by the tag editor everywhere (js/core/tags.js).
  window.SpellBook.tagSource({ id: 'compendium', tags: () => allNoteTags() })

  // Back / Forward (js/core/router.js): a place here is a tome and a note.
  window.SpellBook.places('notes', {
    current: () => window.NotesNav.current(),
    exists: (loc) => window.NotesNav.exists(loc),
    describe: (loc) => window.NotesNav.describe(loc),
    open: (loc) => window.NotesNav.open(loc),
    leave: () => window.NotesNav.flush(),
  })

  // ─── Unsaved changes (js/core/unsaved.js) ────────────────────────────────
  // Counted per note (its name, text, tags, seal and place in the tree, not
  // whether it is folded open), per tome, per note's variables and per
  // template. Opening a note or a tome changes nothing.
  if (window.SpellBook && window.SpellBook.trackChanges) {
    const track = window.SpellBook.trackChanges
    track({
      key: NOTES_KEY,
      label: 'Notes',
      units(text) {
        const out = new Map()
        const data = JSON.parse(text)
        ;(data.tomes || []).forEach((tome, index) => {
          out.set(`tome:${tome.id}`, JSON.stringify([tome.name, Boolean(tome.sealed), index]))
          const walk = (list, parent) =>
            (list || []).forEach((n, i) => {
              out.set(n.id, JSON.stringify([n.name, n.html, n.tags || [], Boolean(n.sealed), Boolean(n.template), parent, i ? list[i - 1].id : '', Boolean(n.starred)]))
              walk(n.children, n.id)
            })
          walk(tome.nodes, tome.id)
        })
        return out
      },
    })
    const perNote = (text) => new Map(Object.entries(JSON.parse(text) || {}).map(([id, v]) => [id, JSON.stringify(v)]))
    track({ key: 'spellbook_sealed_env_v1', label: 'Variables', units: perNote })
    track({ key: 'spellbook_sealed_env_values_v1', label: 'Variables', units: perNote })
    track({
      key: 'spellbook_block_types_v1',
      label: 'Templates',
      units(text) {
        const list = JSON.parse(text)
        return new Map((Array.isArray(list) ? list : []).map((t, i) => [t && t.id ? t.id : `#${i}`, JSON.stringify(t)]))
      },
    })
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
  // Before any save of the data file: the open note's pending edits (and
  // a template record still being typed) go to storage first.
  if (window.DataFile && window.DataFile.beforeSave) {
    window.DataFile.beforeSave(() => {
      if (window.NoteBlocks && window.NoteBlocks.commitPending) window.NoteBlocks.commitPending()
      flush()
    })
  }
  // Leaving while the notes are still being written to the browser database
  // asks first (it takes a moment, so this is rare).
  window.addEventListener('beforeunload', (e) => {
    flush()
    if (window.DataFile && window.DataFile.writing && window.DataFile.writing()) e.preventDefault()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  loadNotes()
  renderTabs()
  renderTree()
  showSelected()
  savedEl.textContent = 'Saved'
  if (currentPage === 'notes') openNoteFromRoute()
  notesChanged()
})()
