/*
 * Templates and template sections for the Compendium.
 * The code calls them "blocks" (block types, block sections); the UI says
 * "Templates" and "template sections" (for a while they were "Blueprints").
 * Whole-note starters are "Note Presets" (note-templates.js).
 *
 * A template (block type) is a kind of record with fixed fields, such as
 * "System" (hostname, address, OS, networking, recon notes) or "Log Entry"
 * (time, host, kind, action, why, result). Templates are made in the note:
 * a section's fields are set up with its Fields button and saved with "Save
 * as template". They are kept in spellbook_block_types_v1:
 *   [{ id, name, addLabel, layout: 'card' | 'table' | 'form',
 *      fields: [{ id, label, type, options, header, now, carry, sort, inline, wrap }] }]
 * Field types: text (Short text: plain, one paragraph), long (Rich text: a
 * small editor with the note toolbar's formatting, lists, links, terms and
 * command and script cards; saved as HTML in r.h), datetime, choice (from
 * options), number, checkbox.
 * The List type of older notes became Rich text (notes.js converts it). Field options: header (cards: shown
 * in the card's title), now (a new record starts with the current time), carry
 * (a new record starts with the previous record's value), sort (records are
 * shown in this field's order; one field per template) and inline ("Beside":
 * on the same row as the field before it, in the Cards and Form layouts) and
 * wrap (short and long text: wrap between words, anywhere, or not at all).
 *
 * Layouts: Cards (a box per record), Table (a row per record, columns wrap so
 * the table fits the note) and Form (each record as rows of labelled fields,
 * with no lines, like a filled-in form).
 *
 * A template section is placed in a note with Insert Template. It holds the
 * records of one template and has an Add button. Its fields can also be
 * changed right in the note (the Fields button, and the ▾ on Table headings; see
 * "Designing fields in the note"), which makes the section's fields its own:
 * data-block-type is then '' and data-block-from names the template it came
 * from, which can be updated from it. Insert Template can also start a blank
 * section with fields of its own, and deletes saved templates (×). Each record's fields are
 * typed into right there in the note (sealed notes and Sealed Notes show the
 * values as text). Older records may carry their own wrapping per field (r.w),
 * which wins over the field's.
 * The section and its records are saved inside the note's HTML (see "Block
 * sections" in notes.js, which checks that data), so search, seals, backups,
 * export, Duplicate and note presets all carry them. A section keeps a
 * snapshot of its template's fields, used if the template is deleted.
 *
 * Loaded after notes.js (window.NotesEditor). Styles: note-blocks.css.
 */
;(() => {
  const api = window.NotesEditor
  // Insert Template goes first among the Insert buttons, before Insert Variable.
  const varButton = document.getElementById('notes-insert-var')
  if (!api || !api.blockShell || !varButton) return
  const TYPES_KEY = 'spellbook_block_types_v1'
  const FIELD_TYPES = [
    ['text', 'Short text'],
    ['long', 'Rich text'],
    ['datetime', 'Date and time'],
    ['choice', 'Choice'],
    ['number', 'Number'],
    ['checkbox', 'Checkbox'],
  ]
  const LAYOUTS = [
    ['card', 'Cards', 'Cards (a box per record)'],
    ['table', 'Table', 'Table (a row per record)'],
    ['form', 'Form', 'Form (labelled fields, side by side in rows)'],
  ]
  const WRAPS = [
    ['words', 'Wrap between words'],
    ['anywhere', 'Wrap anywhere (long strings)'],
    ['none', 'Don’t wrap'],
  ]
  const layoutName = (layout) => (LAYOUTS.find(([key]) => key === layout) || LAYOUTS[0])[1]
  const wraps = (f) => f.type === 'text' || f.type === 'long'
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const parse = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  const button = (className, text, title) => {
    const b = el('button', className, text)
    b.type = 'button'
    if (title) {
      b.title = title
      b.setAttribute('aria-label', title)
    }
    return b
  }

  // ─── Library ────────────────────────────────────────────────────────
  const field = (id, label, type, extra = {}) => ({ id, label, type, options: [], header: false, now: false, carry: false, sort: false, inline: false, wrap: 'words', ...extra })
  const STARTER_TYPES = [
    {
      id: 'bt-system',
      name: 'System',
      addLabel: 'Add System',
      layout: 'card',
      fields: [
        field('hostname', 'Hostname', 'text', { header: true }),
        field('address', 'Address', 'text', { header: true, inline: true }),
        field('os', 'OS information', 'long'),
        field('network', 'Networking information', 'long'),
        field('recon', 'Recon notes', 'long'),
      ],
    },
    {
      id: 'bt-log',
      name: 'Log Entry',
      addLabel: 'Add Entry',
      layout: 'table',
      fields: [
        field('time', 'Time', 'datetime', { now: true, sort: true }),
        field('host', 'Host', 'text', { carry: true, inline: true }),
        field('kind', 'Kind', 'choice', { carry: true, inline: true, options: ['Query', 'Command', 'Script', 'GUI action', 'Hardening'] }),
        field('action', 'Action', 'long'),
        field('why', 'Why', 'long'),
        field('result', 'Result', 'long'),
        field('ttps', 'Related TTPs', 'text'),
      ],
    },
  ]

  const cleanType = (raw) => ({
    id: raw && typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid('bt'),
    ...api.cleanBlockSchema(raw),
  })

  // The library; the first time, it starts with the System and Log Entry templates.
  function loadTypes() {
    let stored = null
    try {
      stored = localStorage.getItem(TYPES_KEY)
    } catch {}
    if (stored === null) {
      const starters = STARTER_TYPES.map(cleanType)
      saveTypes(starters)
      return starters
    }
    const list = parse(stored)
    return Array.isArray(list) ? list.filter((t) => t && typeof t === 'object').map(cleanType) : []
  }

  function saveTypes(list) {
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify(list))
    } catch {}
  }

  const schemaOf = (type) => {
    const { id, ...schema } = type
    return api.cleanBlockSchema(schema)
  }
  const typeById = (id) => loadTypes().find((t) => t.id === id) || null

  // ─── Values ─────────────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0')
  const nowLocal = () => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const fieldLabel = (f) => f.label.trim() || 'Untitled field'
  const addLabel = (schema) => schema.addLabel.trim() || `Add ${schema.name}`
  // A record's own wrapping (older notes) wins over the field's.
  const wrapOf = (record, f) => (wraps(f) && ((record.w && record.w[f.id]) || f.wrap)) || 'words'

  // A field's value as plain text (v) or as rich text HTML (h). A field whose
  // type changed keeps its value: plain text shows as rich text and back.
  const htmlOf = (record, f) => (record.h && record.h[f.id]) || (record.v[f.id] ? api.textToFieldHtml(record.v[f.id]) : '')
  // Rich text's plain text and cleaned HTML are remembered (by the HTML), so
  // filtering, sorting and redrawing a long table don't work them out again.
  const cache = (limit) => {
    const map = new Map()
    return (key, make) => {
      if (map.has(key)) return map.get(key)
      const value = make(key)
      if (map.size >= limit) map.delete(map.keys().next().value)
      map.set(key, value)
      return value
    }
  }
  const plainCache = cache(5000)
  const cleanCache = cache(5000)
  const plainOf = (html) => plainCache(html, (h) => api.htmlText(h).trim())
  const textOf = (record, f) => record.v[f.id] || (record.h && record.h[f.id] ? plainOf(record.h[f.id]) : '')
  const hasValue = (record, f) => Boolean(record.v[f.id] || (record.h && record.h[f.id]))
  const rich = (f) => f.type === 'long'

  // Fields grouped into rows: a "Beside" field joins the row of the one before.
  function rowsOf(fields) {
    const rows = []
    fields.forEach((f) => {
      if (f.inline && rows.length) rows[rows.length - 1].push(f)
      else rows.push([f])
    })
    return rows
  }

  // Records in the order shown: by the sort field if the template has one.
  function ordered(records, schema) {
    const sortField = schema.fields.find((f) => f.sort)
    if (!sortField) return records
    const keys = new Map(records.map((r) => [r, textOf(r, sortField)]))
    const key = (r) => keys.get(r)
    const compare =
      sortField.type === 'number'
        ? (a, b) => (Number.parseFloat(key(a)) || 0) - (Number.parseFloat(key(b)) || 0)
        : (a, b) => key(a).localeCompare(key(b), undefined, { numeric: true })
    // Records without a value go last; the rest keep their order when equal.
    return [...records].sort((a, b) => (!key(a) - !key(b)) || compare(a, b))
  }

  // Rich text, cleaned again and with its cards and term links drawn.
  function richNode(className, html) {
    const box = el('div', className)
    box.innerHTML = cleanCache(html, (h) => api.sanitizeField(h))
    api.cardsIn(box).forEach(api.drawCard)
    api.termLinksIn(box).forEach(api.drawTermLink)
    return box
  }

  // A value as it is shown in sealed notes and Sealed Notes: plain values as
  // text (never as HTML), rich text cleaned.
  function valueNode(f, record, inTable) {
    if (rich(f)) return richNode(`nb-rich-view nb-wrap-${wrapOf(record, f)}`, htmlOf(record, f))
    const value = textOf(record, f)
    if (f.type === 'checkbox') return document.createTextNode(value ? (inTable ? '✓' : 'Yes') : '')
    if (f.type === 'datetime') return el('span', inTable ? '' : 'nb-nowrap', value.replace('T', ' '))
    return el('span', `nb-text nb-wrap-${wrapOf(record, f)}`, value)
  }

  // The longest word, cut to a cap: a table column wrapping between words is
  // kept at least this wide, so short words stay whole.
  const longestWord = (text, cap) =>
    String(text)
      .split(/\s+/)
      .reduce((a, b) => (b.length > a.length ? b : a), '')
      .slice(0, cap)

  // ─── Fields you type in (unlocked notes) ────────────────────────────
  let controlCount = 0

  // A text box grows to fit what is in it, so nothing scrolls inside it.
  function grow(area) {
    if (!area.isConnected || !area.offsetParent) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`
  }

  function control(f, record) {
    const value = textOf(record, f)
    let box
    if (rich(f)) {
      // A small editor of its own: the note's toolbar, paste, links and
      // Insert Term work in it (see "Text editor" in notes.js).
      box = richNode(`nb-rich nb-wrap-${wrapOf(record, f)}`, htmlOf(record, f))
      box.contentEditable = 'true'
      api.keepFieldEdges(box)
      box.setAttribute('role', 'textbox')
      box.setAttribute('aria-multiline', 'true')
    } else if (f.type === 'checkbox') {
      box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = Boolean(value)
    } else if (f.type === 'choice') {
      box = document.createElement('select')
      const options = ['', ...f.options]
      // (A value from before the choices were set that isn't one of them.)
      if (value && !options.includes(value)) options.push(value)
      options.forEach((o) => {
        const option = el('option', '', o && !f.options.includes(o) ? `${o} (not a choice)` : o || '—')
        option.value = o
        box.append(option)
      })
      box.value = value
    } else if (f.type === 'datetime' || f.type === 'number') {
      box = document.createElement('input')
      box.type = f.type === 'datetime' ? 'datetime-local' : 'number'
      if (f.type === 'number') box.step = 'any'
      box.value = value
    } else {
      // Short text: one paragraph (Enter does nothing) that wraps and grows.
      box = document.createElement('textarea')
      box.rows = 1
      box.value = value
      box.classList.add('nb-area', 'nb-single', `nb-wrap-${wrapOf(record, f)}`)
      if (wrapOf(record, f) === 'none') box.wrap = 'off'
    }
    box.classList.add('nb-input')
    box.dataset.nb = f.id
    box.id = `nb-c${++controlCount}`
    box.setAttribute('aria-label', fieldLabel(f))
    box.spellcheck = rich(f)
    if (f.type !== 'datetime') return box
    const row = el('span', 'nb-time')
    row.append(box, button('nb-btn nb-now', 'Now', 'Set to the current time'))
    return row
  }

  const controlIn = (node) => (node.matches('[data-nb]') ? node : node.querySelector('[data-nb]'))

  // Rows of labelled fields you type in (Cards and Form layouts).
  function editRows(fields, record) {
    const box = el('div', 'nb-rows')
    rowsOf(fields).forEach((row) => {
      const line = el('div', 'nb-row')
      line.style.setProperty('--nb-cols', String(row.length))
      row.forEach((f) => {
        const cell = el('div', 'nb-field')
        const input = control(f, record)
        if (f.type === 'checkbox') {
          const label = el('label', 'nb-check-field')
          label.append(input, el('span', 'nb-label', fieldLabel(f)))
          cell.append(label)
        } else {
          const label = el('label', 'nb-label', fieldLabel(f))
          label.htmlFor = controlIn(input).id
          cell.append(label, input)
        }
        line.append(cell)
      })
      box.append(line)
    })
    return box
  }

  function rowActions(movable, first, last) {
    const box = el('span', 'nb-actions')
    if (movable) {
      const up = button('nb-btn nb-up', '↑', 'Move up')
      up.disabled = first
      const down = button('nb-btn nb-down', '↓', 'Move down')
      down.disabled = last
      box.append(up, down)
    }
    box.append(button('nb-btn nb-del', '×', 'Delete this record'))
    return box
  }

  // A card's heading: its Title fields, or "System 2".
  function cardTitle(card, schema, record, index) {
    const parts = schema.fields.filter((f) => f.header).map((f) => textOf(record, f).trim()).filter(Boolean)
    card.querySelector('.nb-card-title').textContent = parts[0] || `${schema.name} ${index + 1}`
    const sub = card.querySelector('.nb-card-sub')
    sub.textContent = parts.slice(1).join(' · ')
    sub.hidden = parts.length < 2
  }

  function editCards(schema, shown, movable) {
    const grid = el('div', 'nb-cards')
    shown.forEach((record, index) => {
      const card = el('div', 'nb-card nb-record')
      card.dataset.id = record.id
      card.dataset.index = String(index)
      const head = el('div', 'nb-card-head')
      head.append(el('strong', 'nb-card-title'), el('code', 'nb-card-sub'), el('span', 'note-command-spacer'), rowActions(movable, index === 0, index === shown.length - 1))
      card.append(head, editRows(schema.fields, record))
      cardTitle(card, schema, record, index)
      grid.append(card)
    })
    return grid
  }

  function editForm(schema, shown, movable) {
    const list = el('div', 'nb-form-list')
    shown.forEach((record, index) => {
      const item = el('div', 'nb-form-record nb-record')
      item.dataset.id = record.id
      const actions = rowActions(movable, index === 0, index === shown.length - 1)
      actions.classList.add('nb-form-actions')
      item.append(actions, editRows(schema.fields, record))
      list.append(item)
    })
    return list
  }

  // An invisible, unbreakable copy of a word, which keeps a table column at
  // least that wide (table cells ignore min-width; this matches the font).
  function sizer(word) {
    const node = el('div', 'nb-sizer', word)
    node.setAttribute('aria-hidden', 'true')
    return node
  }

  // How wide a column must stay for a value: its longest word (up to 14
  // characters, 8 for long text, which often holds long paths or command
  // lines). Values that wrap anywhere, or not at all, set no minimum.
  function minWord(f, record) {
    const value = textOf(record, f)
    if (f.type === 'checkbox' || f.type === 'datetime' || f.type === 'number' || f.type === 'choice') return ''
    if (wrapOf(record, f) !== 'words') return ''
    return longestWord(value, f.type === 'long' ? 8 : 14)
  }

  // What is only on screen, per section: the filter text, a heading's sort
  // (not saved), and the table row being edited.
  const views = new WeakMap()
  const viewOf = (section) => {
    if (!views.has(section)) views.set(section, { query: '', sort: null, live: null, design: false })
    return views.get(section)
  }

  // Records in the order shown and matching the filter.
  function shownOf(section, schema, records) {
    const view = viewOf(section)
    const sortField = view.sort && schema.fields.find((f) => f.id === view.sort.id)
    if (view.sort && !sortField) view.sort = null
    let list = sortField ? sortedBy(records, sortField, view.sort.dir) : ordered(records, schema)
    const terms = view.query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length) {
      list = list.filter((record) => {
        const text = schema.fields.map((f) => textOf(record, f)).join(' ').toLowerCase()
        return terms.every((term) => text.includes(term))
      })
    }
    return list
  }
  function sortedBy(records, f, dir) {
    const keys = new Map(records.map((r) => [r, textOf(r, f)]))
    const key = (r) => keys.get(r)
    const compare =
      f.type === 'number'
        ? (a, b) => (Number.parseFloat(key(a)) || 0) - (Number.parseFloat(key(b)) || 0)
        : (a, b) => key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' })
    // Empty values last either way.
    return [...records].sort((a, b) => (!key(a) - !key(b)) || compare(a, b) * dir)
  }

  // The heading row: click a heading to sort by it (again to reverse; a third
  // time goes back to the template's order).
  function tableHead(section, schema, withActions) {
    const view = viewOf(section)
    const headRow = el('tr')
    schema.fields.forEach((f) => {
      const sorted = view.sort && view.sort.id === f.id
      const th = el('th', `nb-label nb-col-${f.type} nb-sortable${sorted ? ' nb-sorted' : ''}`)
      th.dataset.sortField = f.id
      th.title = 'Sort by this column (click again to reverse, a third time for the usual order)'
      const label = fieldLabel(f) + (sorted ? (view.sort.dir === 1 ? ' ▲' : ' ▼') : '')
      th.append(sizer(longestWord(label, 14)), document.createTextNode(label))
      if (withActions) {
        const menuButton = button('nb-col-menu', '▾', `Change the ${fieldLabel(f)} column: name, type and options`)
        menuButton.dataset.designField = f.id
        th.append(menuButton)
      }
      headRow.append(th)
    })
    if (withActions) {
      const th = el('th', 'nb-label nb-actions-col')
      th.append(button('nb-col-add', '+', 'Add a column'))
      headRow.append(th)
    }
    const thead = el('thead')
    thead.append(headRow)
    return thead
  }

  // A record's row: values as text, or (the live row) the boxes you type in.
  function tableRow(schema, record, index, total, movable, live) {
    const tr = el('tr', live ? 'nb-record nb-live' : 'nb-record nb-view-row')
    tr.dataset.id = record.id
    tr.dataset.index = String(index)
    schema.fields.forEach((f) => {
      const td = el('td', `nb-col-${f.type}`)
      td.dataset.field = f.id
      if (live) td.append(sizer(minWord(f, record)), control(f, record))
      else if (hasValue(record, f)) {
        const plain = f.type === 'choice' || f.type === 'number' || f.type === 'datetime'
        const word = plain ? longestWord(textOf(record, f).replace('T', ' '), 16) : minWord(f, record)
        td.append(sizer(word), valueNode(f, record, true))
      }
      tr.append(td)
    })
    if (total !== null) {
      const td = el('td', 'nb-actions-col')
      td.append(rowActions(movable, index === 0, index === total - 1))
      tr.append(td)
    }
    if (!live && total !== null) tr.title = 'Click to edit this record'
    return tr
  }

  // Unlocked: every record is drawn as text, and only the one you click (or
  // Tab into, or just added) becomes boxes to type in, so a long log draws fast.
  function editTable(section, schema, shown, movable) {
    const live = viewOf(section).live
    const wrap = el('div', 'nb-table-wrap')
    const table = el('table', 'nb-table nb-edit-table')
    const tbody = el('tbody')
    shown.forEach((record, index) => tbody.append(tableRow(schema, record, index, shown.length, movable, record.id === live)))
    table.append(tableHead(section, schema, true), tbody)
    wrap.append(table)
    return wrap
  }

  // Turns a record's row into boxes (or back into text), leaving the rest.
  function setLive(section, recordId) {
    const view = viewOf(section)
    const table = section.querySelector('.nb-edit-table')
    if (!table) {
      view.live = recordId
      return
    }
    const meta = section._nbTable
    const swap = (id, live) => {
      const tr = [...table.querySelectorAll('tbody > tr.nb-record')].find((row) => row.dataset.id === id)
      const record = id && currentRecords(section).find((r) => r && r.id === id)
      if (!tr || !record) return null
      const row = tableRow(meta.schema, record, Number(tr.dataset.index), meta.total, meta.movable, live)
      tr.replaceWith(row)
      return row
    }
    if (view.live && view.live !== recordId) swap(view.live, false)
    view.live = recordId
    const row = recordId ? swap(recordId, true) : null
    if (row) row.querySelectorAll('textarea.nb-area').forEach(grow)
    return row
  }

  // ─── Drawing a section ──────────────────────────────────────────────
  const sealedNow = () => {
    const node = api.selectedNode()
    return Boolean(node && api.isSealed(node.id))
  }

  function readSection(section) {
    commitPending()
    const saved = parse(section.dataset.blockSchema)
    const type = typeById(section.dataset.blockType)
    const schema = type ? schemaOf(type) : api.cleanBlockSchema(saved)
    const records = api.cleanBlockRecords(parse(section.dataset.blockRecords), saved)
    // Keep the snapshot up to date with the live template.
    if (type) section.dataset.blockSchema = JSON.stringify(schema)
    return { type, schema, records }
  }

  // Text boxes are sized once they are on screen, and again when the note
  // gets wider or narrower.
  const widths = new WeakMap()
  const resized = new ResizeObserver((entries) => {
    entries.forEach(({ target, contentRect }) => {
      if (widths.get(target) === contentRect.width) return
      widths.set(target, contentRect.width)
      target.querySelectorAll('textarea.nb-area').forEach(grow)
    })
  })

  function draw(section, { readOnly } = {}) {
    const locked = readOnly === undefined ? sealedNow() : readOnly
    const { type, schema, records } = readSection(section)
    const shown = ordered(records, schema)
    const movable = !schema.fields.some((f) => f.sort)
    section.setAttribute('contenteditable', 'false')
    section.classList.toggle('nb-locked', locked)
    section.dataset.layout = schema.layout

    const view = viewOf(section)
    const head = el('div', 'nb-head')
    head.append(el('span', 'nb-name', schema.name), el('span', 'nb-count', String(records.length)))
    if (!type && section.dataset.blockType) head.append(el('span', 'nb-gone', 'Template deleted: shown with its saved fields'))
    const filter = el('input', 'nb-filter')
    filter.type = 'search'
    filter.placeholder = 'Filter records…'
    filter.autocomplete = 'off'
    filter.spellcheck = false
    filter.value = view.query
    filter.setAttribute('aria-label', `Filter the ${schema.name} records`)
    head.append(filter, el('span', 'note-command-spacer'))
    if (locked) view.design = false
    if (!locked) {
      const design = button('btn secondary sm nb-design-toggle', 'Fields')
      design.title = view.design ? 'Close the field settings' : 'Change this section’s fields, name and layout'
      design.setAttribute('aria-pressed', String(view.design))
      head.append(design)
      const importButton = button('btn secondary sm nb-import', 'Import CSV…')
      importButton.title = 'Add records from a .csv file whose first line names the fields'
      head.append(importButton)
    }
    const csv = button('btn secondary sm nb-export', 'Export CSV')
    csv.title = 'Save these records as a .csv file (opens in Excel and other spreadsheets)'
    head.append(csv)
    if (!locked) {
      head.append(button('btn sm nb-add', `+ ${addLabel(schema)}`, `${addLabel(schema)} (Ctrl+Enter in a field)`))
      head.append(button('nb-remove-section', '×', 'Remove this template section from the note'))
    }
    section.replaceChildren(head, ...(view.design ? [designBar(section, schema, type)] : []), el('div', 'nb-body'))
    section._nbLocked = locked
    drawBody(section, { schema, records, movable })
    if (!locked) resized.observe(section)
  }

  // The records, drawn again on their own when the filter or a sort changes.
  function drawBody(section, known) {
    const { schema, records, movable: templateOrder } = known || (() => {
      const read = readSection(section)
      return { ...read, movable: !read.schema.fields.some((f) => f.sort) }
    })()
    const locked = section._nbLocked
    const view = viewOf(section)
    const shown = shownOf(section, schema, records)
    // Moving records only makes sense in their own order, all of them shown.
    const movable = templateOrder && !view.sort && !view.query.trim()
    const count = section.querySelector('.nb-count')
    if (count) count.textContent = view.query.trim() ? `${shown.length} of ${records.length}` : String(records.length)
    const body = el('div', 'nb-body')
    if (!locked && !schema.fields.length) {
      body.append(el('p', 'nb-empty', 'No fields yet. Use Fields to add some.'))
    } else if (!records.length) {
      if (!locked && schema.layout === 'table') body.append(editTable(section, schema, [], movable))
      body.append(el('p', 'nb-empty', locked ? 'No records.' : `Nothing here yet. Use + ${addLabel(schema)}.`))
    } else if (!shown.length) {
      body.append(el('p', 'nb-empty', 'No records match.'))
    } else if (locked) {
      body.append(schema.layout === 'table' ? showTable(section, schema, shown) : schema.layout === 'form' ? showForm(schema, shown) : showCards(schema, shown))
    } else if (schema.layout === 'table') {
      if (view.live && !shown.some((r) => r.id === view.live)) view.live = null
      body.append(editTable(section, schema, shown, movable))
    } else {
      body.append(schema.layout === 'form' ? editForm(schema, shown, movable) : editCards(schema, shown, movable))
    }
    section._nbTable = { schema, movable, total: shown.length }
    section.querySelector('.nb-body').replaceWith(body)
    if (!locked) body.querySelectorAll('textarea.nb-area').forEach(grow)
  }

  // ─── Read-only layouts (sealed notes, Sealed Notes) ─────────────────
  // Rows of labelled values. keepEmpty: show a row's empty fields too, so the
  // columns line up from one record to the next (Form layout).
  function fieldRows(fields, record, keepEmpty) {
    const box = el('div', 'nb-rows')
    rowsOf(fields).forEach((row) => {
      if (!row.some((f) => hasValue(record, f))) return
      const line = el('div', 'nb-row')
      line.style.setProperty('--nb-cols', String(row.length))
      row.forEach((f) => {
        const value = hasValue(record, f)
        if (!value && !keepEmpty) return
        const cell = el('div', `nb-field${value ? '' : ' nb-field-empty'}`)
        cell.append(el('div', 'nb-label', fieldLabel(f)))
        const box2 = el('div', 'nb-value')
        if (value) box2.append(valueNode(f, record, false))
        cell.append(box2)
        line.append(cell)
      })
      box.append(line)
    })
    return box
  }

  function showCards(schema, shown) {
    const grid = el('div', 'nb-cards')
    const rest = schema.fields.filter((f) => !f.header)
    shown.forEach((record, index) => {
      const card = el('div', 'nb-card nb-record')
      const head = el('div', 'nb-card-head')
      head.append(el('strong', 'nb-card-title'), el('code', 'nb-card-sub'))
      card.append(head)
      cardTitle(card, schema, record, index)
      if (!schema.fields.some((f) => hasValue(record, f))) card.append(el('p', 'nb-empty', 'Empty.'))
      card.append(fieldRows(rest, record, false))
      grid.append(card)
    })
    return grid
  }

  function showForm(schema, shown) {
    const list = el('div', 'nb-form-list')
    shown.forEach((record) => {
      const item = el('div', 'nb-form-record nb-record')
      if (!schema.fields.some((f) => hasValue(record, f))) item.append(el('p', 'nb-empty', 'Empty.'))
      item.append(fieldRows(schema.fields, record, true))
      list.append(item)
    })
    return list
  }

  function showTable(section, schema, shown) {
    const wrap = el('div', 'nb-table-wrap')
    const table = el('table', 'nb-table')
    const tbody = el('tbody')
    shown.forEach((record, index) => tbody.append(tableRow(schema, record, index, null, false, false)))
    table.append(tableHead(section, schema, false), tbody)
    wrap.append(table)
    return wrap
  }

  function drawAll() {
    api.blockSectionsIn(api.editor).forEach((section) => draw(section))
  }

  // ─── Editing records in the note ────────────────────────────────────
  // Records being typed into are kept in memory: writing every record back
  // into the note on each key is slow in a long log. They are written into
  // the section shortly after, and always before the note is saved
  // (notes.js calls commitPending) or the section is read or redrawn.
  const pending = new Map()
  let pendingTimer = null
  function commitPending() {
    clearTimeout(pendingTimer)
    pendingTimer = null
    pending.forEach((records, section) => {
      section.dataset.blockRecords = JSON.stringify(records)
    })
    pending.clear()
  }
  const currentRecords = (section) => pending.get(section) || parse(section.dataset.blockRecords) || []

  const editable = (section) => section && api.editor.contains(section) && !sealedNow()
  const recordsOf = (section) => {
    commitPending()
    return api.cleanBlockRecords(parse(section.dataset.blockRecords))
  }

  // Saves a section's records into the note and redraws it.
  function writeRecords(section, records) {
    commitPending()
    section.dataset.blockRecords = JSON.stringify(records)
    draw(section)
    api.markDirty()
  }

  function focusField(section, recordId, fieldId) {
    const record = [...section.querySelectorAll('.nb-record')].find((r) => r.dataset.id === recordId)
    if (!record) return
    const controls = [...record.querySelectorAll('[data-nb]')]
    const empty = (c) => (c.matches('.nb-rich') ? !c.textContent.trim() : !c.value && c.type !== 'checkbox')
    const target = (fieldId && controls.find((c) => c.dataset.nb === fieldId)) || controls.find(empty) || controls[0]
    if (!target) return
    target.focus()
    target.scrollIntoView({ block: 'nearest' })
  }

  // A new record: "now" fields get the time, "carry" fields the last value.
  function addRecord(section) {
    const { schema, records } = readSection(section)
    const last = ordered(records, schema).slice(-1)[0]
    const v = {}
    const h = {}
    const w = {}
    schema.fields.forEach((f) => {
      if (f.type === 'datetime' && f.now) v[f.id] = nowLocal()
      if (f.carry && last && last.v[f.id]) v[f.id] = last.v[f.id]
      if (f.carry && last && last.h && last.h[f.id]) h[f.id] = last.h[f.id]
      if (f.carry && last && last.w && last.w[f.id]) w[f.id] = last.w[f.id]
    })
    const record = { id: uid('rec'), v, ...(Object.keys(h).length ? { h } : {}), ...(Object.keys(w).length ? { w } : {}) }
    // The new record opens for typing, and the filter would hide it.
    const view = viewOf(section)
    view.live = record.id
    view.query = ''
    const filter = section.querySelector('.nb-filter')
    if (filter) filter.value = ''
    writeRecords(section, [...records, record])
    focusField(section, record.id)
  }

  async function deleteRecord(section, recordId) {
    const record = recordsOf(section).find((r) => r.id === recordId)
    if (!record) return
    // Asks first unless nothing was typed: values in Now and Carry fields
    // are filled in for you.
    const { schema } = readSection(section)
    const typed = [...Object.keys(record.v), ...Object.keys(record.h || {})].some((id) => {
      const f = schema.fields.find((x) => x.id === id)
      return !f || !(f.carry || (f.now && f.type === 'datetime'))
    })
    if (typed) {
      const ok = await api.ask({ title: 'Delete record', message: 'Delete this record? Ctrl+Z will not bring it back.', confirmText: 'Delete', danger: true })
      if (!ok) return
    }
    writeRecords(section, recordsOf(section).filter((r) => r.id !== recordId))
  }

  async function removeSection(section) {
    const { schema, records } = readSection(section)
    if (records.length) {
      const ok = await api.ask({
        title: 'Remove template section',
        message: `Remove this ${schema.name} section and its ${records.length} record${records.length === 1 ? '' : 's'} from the note? Ctrl+Z brings it back.`,
        confirmText: 'Remove',
        danger: true,
      })
      if (!ok) return
    }
    api.selectWhole(section)
    document.execCommand('delete')
    api.afterEdit()
  }

  function move(section, recordId, delta) {
    const records = recordsOf(section)
    const index = records.findIndex((r) => r.id === recordId)
    const to = index + delta
    if (index < 0 || to < 0 || to >= records.length) return
    ;[records[index], records[to]] = [records[to], records[index]]
    writeRecords(section, records)
  }

  const valueOf = (box) => (box.type === 'checkbox' ? (box.checked ? '1' : '') : box.value.replace(/\s+$/, ''))

  // Typing in a field saves it into the section (no redraw, so the caret
  // stays put).
  function fieldInput(section, box) {
    const recordEl = box.closest('.nb-record')
    // The section's own (already cleaned) records: cleaning them all again on
    // every key would be slow in a long log. The note cleans them on save.
    const records = currentRecords(section)
    const record = recordEl && records.find((r) => r && r.id === recordEl.dataset.id)
    if (!record) return
    const id = box.dataset.nb
    record.v = record.v || {}
    const before = `${record.v[id] || ''}\u0000${(record.h && record.h[id]) || ''}`
    if (box.matches('.nb-rich')) {
      const html = api.fieldHtml(box)
      record.h = record.h || {}
      if (html) record.h[id] = html
      else delete record.h[id]
      delete record.v[id]
    } else {
      const value = valueOf(box)
      if (value) record.v[id] = value
      else delete record.v[id]
      if (record.h) delete record.h[id]
    }
    if (`${record.v[id] || ''}\u0000${(record.h && record.h[id]) || ''}` === before) return
    pending.set(section, records)
    clearTimeout(pendingTimer)
    pendingTimer = setTimeout(commitPending, 400)
    api.markDirty()
    if (box.matches('textarea')) grow(box)
    const schema = api.cleanBlockSchema(parse(section.dataset.blockSchema))
    const f = schema.fields.find((x) => x.id === box.dataset.nb)
    if (!f) return
    if (recordEl.matches('.nb-card') && f.header) cardTitle(recordEl, schema, record, Number(recordEl.dataset.index))
    const cell = box.closest('td')
    const size = cell && cell.querySelector('.nb-sizer')
    if (size) size.textContent = minWord(f, record)
  }

  // The filter box: only the records are drawn again.
  api.editor.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('.nb-filter')) return
    const section = e.target.closest('.note-block-section')
    if (!section) return
    viewOf(section).query = e.target.value
    drawBody(section)
  })
  api.editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !e.target.matches || !e.target.matches('.nb-filter') || !e.target.value) return
    e.preventDefault()
    e.stopPropagation()
    e.target.value = ''
    viewOf(e.target.closest('.note-block-section')).query = ''
    drawBody(e.target.closest('.note-block-section'))
  })

  // Clicking anywhere but the row being edited puts that row back to text.
  api.editor.addEventListener(
    'pointerdown',
    (e) => {
      api.blockSectionsIn(api.editor).forEach((section) => {
        const view = views.get(section)
        if (!view || !view.live) return
        const row = section.querySelector('tr.nb-live')
        if (row && row.contains(e.target)) return
        if (row) setLive(section, null)
        else view.live = null
      })
    },
    true,
  )

  // Tab past the last box of the row being edited opens the next record
  // (Shift+Tab before the first, the one above).
  api.editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return
    const box = e.target.closest && e.target.closest('tr.nb-live [data-nb]')
    if (!box) return
    const row = box.closest('tr.nb-live')
    const section = row.closest('.note-block-section')
    const boxes = [...row.querySelectorAll('[data-nb], .nb-now')]
    const edge = e.shiftKey ? boxes[0] : boxes[boxes.length - 1]
    if (!edge || !(edge === e.target || edge.contains(e.target))) return
    const next = e.shiftKey ? row.previousElementSibling : row.nextElementSibling
    if (!next || !next.matches('.nb-record')) return
    e.preventDefault()
    const opened = setLive(section, next.dataset.id)
    const targets = opened ? [...opened.querySelectorAll('[data-nb]')] : []
    const target = e.shiftKey ? targets[targets.length - 1] : targets[0]
    if (target) target.focus()
  })

  api.editor.addEventListener('input', (e) => {
    const box = e.target.closest && e.target.closest('[data-nb]')
    const section = box && box.closest('.note-block-section')
    if (editable(section)) fieldInput(section, box)
  })
  // A new value in the sort field can move its record.
  api.editor.addEventListener('change', (e) => {
    const box = e.target.closest && e.target.closest('[data-nb]')
    const section = box && box.closest('.note-block-section')
    if (!editable(section)) return
    const { schema } = readSection(section)
    const sortField = schema.fields.find((f) => f.sort)
    if (!sortField || sortField.id !== box.dataset.nb) return
    const recordId = box.closest('.nb-record').dataset.id
    const before = [...section.querySelectorAll('.nb-record')].map((r) => r.dataset.id).join()
    if (ordered(recordsOf(section), schema).map((r) => r.id).join() === before) return
    const hadFocus = document.activeElement === box
    draw(section)
    if (hadFocus) focusField(section, recordId, box.dataset.nb)
  })
  api.editor.addEventListener('keydown', (e) => {
    const box = e.target.closest && e.target.closest('[data-nb]')
    const section = box && box.closest('.note-block-section')
    if (!editable(section) || e.key !== 'Enter') return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      addRecord(section)
    } else if (box.matches('.nb-single')) {
      e.preventDefault()
    }
  })
  api.editor.addEventListener('click', (e) => {
    const section = e.target.closest('.note-block-section')
    if (!editable(section)) return
    if (designClick(section, e)) return
    const record = e.target.closest('.nb-record')
    const id = record && record.dataset.id
    const heading = e.target.closest('th[data-sort-field]')
    if (heading) {
      sortBy(section, heading.dataset.sortField)
      return
    }
    if (e.target.closest('.nb-export')) {
      exportCsv(section)
      return
    }
    if (e.target.closest('.nb-import')) {
      chooseCsv(section)
      return
    }
    // A record shown as text: open it for typing, in the cell clicked.
    // (The section is itself a .note-command, so only cards inside the row count.)
    const inner = e.target.closest('button, a, input, select, textarea, .note-command')
    if (record && record.matches('.nb-view-row') && !(inner && record.contains(inner))) {
      const cell = e.target.closest('td[data-field]')
      const row = setLive(section, id)
      if (row) {
        const target = (cell && row.querySelector(`[data-nb="${CSS.escape(cell.dataset.field)}"]`)) || row.querySelector('[data-nb]')
        if (target) {
          target.focus()
          // The caret goes after what is already there.
          if (target.matches('textarea')) target.setSelectionRange(target.value.length, target.value.length)
          else if (target.matches('.nb-rich')) {
            const range = document.createRange()
            range.selectNodeContents(target)
            range.collapse(false)
            const selection = getSelection()
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
      }
      return
    }
    if (e.target.closest('.nb-add')) addRecord(section)
    else if (e.target.closest('.nb-remove-section')) removeSection(section)
    else if (e.target.closest('.nb-del')) deleteRecord(section, id)
    else if (e.target.closest('.nb-up')) move(section, id, -1)
    else if (e.target.closest('.nb-down')) move(section, id, 1)
    else if (e.target.closest('label.nb-label')) {
      const target = document.getElementById(e.target.closest('label.nb-label').htmlFor)
      if (target && target.matches('.nb-rich')) target.focus()
    } else if (e.target.closest('.nb-now')) {
      const box = e.target.closest('.nb-time').querySelector('[data-nb]')
      box.value = nowLocal()
      box.dispatchEvent(new Event('input', { bubbles: true }))
      box.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  // Sealed notes and Sealed Notes can still sort, filter and export.
  document.addEventListener('click', (e) => {
    const section = e.target.closest && e.target.closest('.note-block-section.nb-locked')
    if (!section) return
    const heading = e.target.closest('th[data-sort-field]')
    if (heading) sortBy(section, heading.dataset.sortField)
    else if (e.target.closest('.nb-export')) exportCsv(section)
  })
  document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('.nb-locked .nb-filter')) return
    const section = e.target.closest('.note-block-section')
    viewOf(section).query = e.target.value
    drawBody(section)
  })

  function sortBy(section, fieldId) {
    const view = viewOf(section)
    if (!view.sort || view.sort.id !== fieldId) view.sort = { id: fieldId, dir: 1 }
    else if (view.sort.dir === 1) view.sort = { id: fieldId, dir: -1 }
    else view.sort = null
    drawBody(section)
  }

  // ─── Designing fields in the note ───────────────────────────────────
  // The Fields button opens a bar above a section's records: its name, add-button
  // text, layout and order, and its fields as chips (click one for its menu;
  // + Field adds one). Table headings have the same menu (▾) and a + for a new
  // column. The menu (outside the note, so it is never saved) changes a
  // field's name, type, choices, wrapping and options, moves it, or deletes it.
  //
  // Changes apply to this section only. A section that followed a template
  // becomes its own copy (data-block-type '' and data-block-from the
  // template's id); the bar then offers to update that template or save the
  // fields as a new one. Ctrl+Z does not undo field changes.

  const BLANKS = {
    table: () => ({ name: 'Table', addLabel: 'Add Row', layout: 'table', fields: [field(uid('f'), 'Name', 'text'), field(uid('f'), 'Value', 'text'), field(uid('f'), 'Notes', 'long')] }),
    card: () => ({ name: 'Cards', addLabel: 'Add Card', layout: 'card', fields: [field(uid('f'), 'Name', 'text', { header: true }), field(uid('f'), 'Notes', 'long')] }),
    form: () => ({
      name: 'Form',
      addLabel: 'Add Entry',
      layout: 'form',
      fields: [field(uid('f'), 'Name', 'text'), field(uid('f'), 'Date', 'datetime', { inline: true, now: true }), field(uid('f'), 'Notes', 'long')],
    }),
  }
  const typeName = (t) => (FIELD_TYPES.find(([key]) => key === t) || FIELD_TYPES[0])[1]
  const copyOf = (value) => JSON.parse(JSON.stringify(value))

  // Saves a section's new fields (and records, when values changed with them).
  function writeSchema(section, schema, records) {
    commitPending()
    if (section.dataset.blockType) {
      section.dataset.blockFrom = section.dataset.blockType
      section.dataset.blockType = ''
    }
    section.dataset.blockSchema = JSON.stringify(api.cleanBlockSchema(schema))
    if (records) section.dataset.blockRecords = JSON.stringify(records)
    draw(section)
    api.markDirty()
    if (menuAt && menuAt.section === section) placeFieldMenu()
  }

  function designBar(section, schema, type) {
    const bar = el('div', 'nb-design')
    const labeled = (text, control) => {
      const label = el('label', 'nb-design-label')
      label.append(el('span', '', text), control)
      return label
    }
    const textBox = (key, value, placeholder) => {
      const box = el('input', 'nb-design-input')
      box.type = 'text'
      box.value = value
      box.placeholder = placeholder
      box.spellcheck = false
      box.autocomplete = 'off'
      box.dataset.design = key
      return box
    }
    const choose = (key, pairs, value) => {
      const box = el('select', 'nb-design-select')
      box.dataset.design = key
      pairs.forEach(([v, text]) => {
        const option = el('option', '', text)
        option.value = v
        box.append(option)
      })
      box.value = value
      return box
    }
    const top = el('div', 'nb-design-row')
    top.append(
      labeled('Name', textBox('name', schema.name, 'Name')),
      labeled('Add button', textBox('addLabel', schema.addLabel, `Add ${schema.name}`)),
      labeled('Layout', choose('layout', LAYOUTS.map(([key, name]) => [key, name]), schema.layout)),
      labeled('Order', choose('sort', [['', 'As added'], ...schema.fields.map((f) => [f.id, `By ${fieldLabel(f)}`])], (schema.fields.find((f) => f.sort) || { id: '' }).id)),
    )
    const fields = el('div', 'nb-design-fields')
    fields.append(el('span', 'nb-design-caption', schema.layout === 'table' ? 'Columns' : 'Fields'))
    schema.fields.forEach((f) => {
      const chip = button('nb-chip', '', `Change the ${fieldLabel(f)} field`)
      chip.dataset.designField = f.id
      chip.append(el('span', 'nb-chip-name', fieldLabel(f)), el('span', 'nb-chip-type', typeName(f.type)))
      fields.append(chip)
    })
    fields.append(button('btn secondary sm nb-design-add-field', schema.layout === 'table' ? '+ Column' : '+ Field'))
    const foot = el('div', 'nb-design-foot')
    const from = !type && section.dataset.blockFrom ? typeById(section.dataset.blockFrom) : null
    const note = el('span', 'nb-design-note')
    if (type) note.textContent = `Fields from the “${type.name}” template. Changing them here changes this section only, then offers to update the template.`
    else if (from) note.textContent = `Changed in this note, from the “${from.name}” template. The template and its other sections are unchanged.`
    else note.textContent = 'This section’s fields are its own. Save them as a template to use them again.'
    foot.append(note)
    if (from) foot.append(button('btn secondary sm nb-design-update', `Update “${from.name}”`, `Save these fields and this layout into the “${from.name}” template`))
    if (!type) foot.append(button('btn secondary sm nb-design-save', from ? 'Save as new template…' : 'Save as template…'))
    foot.append(button('btn sm nb-design-done', 'Done'))
    bar.append(top, fields, foot)
    return bar
  }

  // Clicks on the design controls; true when handled.
  function designClick(section, e) {
    const t = e.target
    const view = viewOf(section)
    if (t.closest('.nb-design-toggle') || t.closest('.nb-design-done')) {
      flushLabel()
      view.design = !view.design && !t.closest('.nb-design-done')
      closeFieldMenu()
      draw(section)
      return true
    }
    const anchor = t.closest('[data-design-field]')
    if (anchor) {
      const id = anchor.dataset.designField
      if (menuAt && menuAt.section === section && menuAt.id === id) {
        flushLabel()
        closeFieldMenu()
      } else openFieldMenu(section, id, anchor.matches('.nb-col-menu') ? 'head' : 'chip')
      return true
    }
    if (t.closest('.nb-col-add')) addField(section, 'head')
    else if (t.closest('.nb-design-add-field')) addField(section, 'chip')
    else if (t.closest('.nb-design-update')) updateTemplate(section)
    else if (t.closest('.nb-design-save')) saveAsTemplate(section)
    else if (!t.closest('.nb-design')) return false
    return true
  }

  // The bar's boxes save when they change (Enter, or leaving the box).
  // (Focus goes back to the box after Enter or a pick from a list, not after
  // clicking somewhere else.)
  api.editor.addEventListener('change', (e) => {
    const box = e.target.closest && e.target.closest('[data-design]')
    if (box) applyDesign(box, box.matches('select'))
  })
  api.editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('input[data-design]')) return
    e.preventDefault()
    applyDesign(e.target, true)
  })
  function applyDesign(box, refocus) {
    const section = box && box.closest('.note-block-section')
    if (!editable(section)) return
    const { schema } = readSection(section)
    const next = copyOf(schema)
    const value = box.value
    const key = box.dataset.design
    if (key === 'name') next.name = value.trim() || 'Template'
    else if (key === 'addLabel') next.addLabel = value
    else if (key === 'layout') next.layout = value
    else if (key === 'sort') next.fields.forEach((f) => (f.sort = f.id === value))
    if (JSON.stringify(next) === JSON.stringify(schema)) return
    writeSchema(section, next)
    const again = refocus && section.querySelector(`[data-design="${key}"]`)
    if (again) again.focus()
  }

  function addField(section, from) {
    flushLabel()
    const { schema } = readSection(section)
    const next = copyOf(schema)
    const f = field(uid('f'), `${schema.layout === 'table' ? 'Column' : 'Field'} ${next.fields.length + 1}`, 'text')
    next.fields.push(f)
    writeSchema(section, next)
    openFieldMenu(section, f.id, from, { selectLabel: true })
  }

  // ─── The field menu ───
  const menu = el('div', 'nb-field-menu')
  menu.hidden = true
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-label', 'Field settings')
  document.body.append(menu)
  let menuAt = null
  let labelTimer = 0

  function currentField() {
    if (!menuAt || !menuAt.section.isConnected || !editable(menuAt.section)) return null
    const { schema, records } = readSection(menuAt.section)
    const index = schema.fields.findIndex((f) => f.id === menuAt.id)
    return index < 0 ? null : { schema, records, index, f: schema.fields[index] }
  }

  function openFieldMenu(section, id, from = 'chip', { selectLabel = false } = {}) {
    flushLabel()
    menuAt = { section, id, from }
    drawFieldMenu()
    const label = !menu.hidden && menu.querySelector('.nb-fm-label')
    if (!label) return
    label.focus()
    if (selectLabel) label.select()
  }

  function closeFieldMenu() {
    menu.hidden = true
    menuAt = null
    document.querySelectorAll('.nb-design-open').forEach((n) => n.classList.remove('nb-design-open'))
  }

  // Changes the open field (fn gets copies of the field and the schema).
  function changeField(fn, { redrawMenu = true } = {}) {
    const at = currentField()
    if (!at) return closeFieldMenu()
    const next = copyOf(at.schema)
    fn(next.fields[at.index], next)
    if (JSON.stringify(next) === JSON.stringify(at.schema)) return
    writeSchema(menuAt.section, next)
    if (redrawMenu) drawFieldMenu()
  }

  // The name is saved a moment after typing stops (it redraws the section).
  function flushLabel() {
    if (!labelTimer) return
    clearTimeout(labelTimer)
    labelTimer = 0
    const box = menu.querySelector('.nb-fm-label')
    if (box) changeField((g) => (g.label = box.value), { redrawMenu: false })
  }

  function drawFieldMenu() {
    const at = currentField()
    if (!at) return closeFieldMenu()
    const { schema, index, f } = at
    const layout = schema.layout
    const row = (text, control) => {
      const line = el('label', 'nb-fm-row')
      line.append(el('span', '', text), control)
      return line
    }
    const choose = (pairs, value) => {
      const box = document.createElement('select')
      pairs.forEach(([v, text]) => {
        const option = el('option', '', text)
        option.value = v
        box.append(option)
      })
      box.value = value
      return box
    }
    const parts = [el('div', 'nb-fm-title', layout === 'table' ? 'Column' : 'Field')]
    const label = el('input', 'nb-fm-label')
    label.type = 'text'
    label.value = f.label
    label.placeholder = 'Untitled field'
    label.spellcheck = false
    label.autocomplete = 'off'
    label.addEventListener('input', () => {
      clearTimeout(labelTimer)
      labelTimer = setTimeout(flushLabel, 300)
    })
    label.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      flushLabel()
      closeFieldMenu()
    })
    parts.push(row('Name', label))
    const kind = choose(FIELD_TYPES, f.type)
    kind.addEventListener('change', () => changeType(kind.value))
    parts.push(row('Type', kind))
    if (f.type === 'choice') {
      const choices = el('input')
      choices.type = 'text'
      choices.value = f.options.join(', ')
      choices.placeholder = 'Low, Medium, High'
      choices.addEventListener('change', () => setChoices(splitChoices(choices.value)))
      parts.push(row('Choices', choices))
    }
    if (wraps(f)) {
      const wrap = choose(WRAPS, f.wrap)
      wrap.addEventListener('change', () => changeField((g) => (g.wrap = wrap.value)))
      parts.push(row('Wrapping', wrap))
    }
    const flags = el('div', 'nb-fm-flags')
    const flag = (key, text, title, on, set) => {
      if (!on) return
      const wrap = el('label')
      wrap.title = title
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = Boolean(f[key])
      box.addEventListener('change', () => changeField(set ? (g, s) => set(g, s, box.checked) : (g) => (g[key] = box.checked)))
      wrap.append(box, ` ${text}`)
      flags.append(wrap)
    }
    flag('header', 'Title', 'Show this field in the card’s title', layout === 'card')
    flag('inline', 'Beside', 'On the same row as the field before it', layout !== 'table' && index > 0)
    flag('carry', 'Carry', 'A new record starts with the previous record’s value', true)
    flag('now', 'Now', 'A new record starts with the current date and time', f.type === 'datetime')
    flag('sort', 'Order by this', 'Show the records in this field’s order (one field per section)', true, (g, s, on) => s.fields.forEach((x) => (x.sort = on && x.id === g.id)))
    parts.push(flags)
    const tools = el('div', 'nb-fm-tools')
    const across = layout === 'table'
    const back = button('btn secondary sm', across ? '← Move' : '↑ Move', 'Move before the field before it')
    back.disabled = index === 0
    back.addEventListener('click', () => changeField((g, s) => ([s.fields[index - 1], s.fields[index]] = [s.fields[index], s.fields[index - 1]])))
    const forward = button('btn secondary sm', across ? 'Move →' : 'Move ↓', 'Move after the field after it')
    forward.disabled = index === schema.fields.length - 1
    forward.addEventListener('click', () => changeField((g, s) => ([s.fields[index + 1], s.fields[index]] = [s.fields[index], s.fields[index + 1]])))
    const remove = button('btn secondary sm danger', 'Delete')
    remove.addEventListener('click', deleteField)
    const done = button('btn sm', 'Done')
    done.addEventListener('click', () => {
      flushLabel()
      closeFieldMenu()
    })
    tools.append(back, forward, remove, el('span', 'note-command-spacer'), done)
    parts.push(tools)
    menu.replaceChildren(...parts)
    placeFieldMenu()
  }

  // Under its ▾ or chip; above it when there is no room below.
  function placeFieldMenu() {
    if (!menuAt) return
    const { section, id, from } = menuAt
    if (!section.isConnected) return closeFieldMenu()
    document.querySelectorAll('.nb-design-open').forEach((n) => n.classList.remove('nb-design-open'))
    const anchors = [...section.querySelectorAll(`[data-design-field="${CSS.escape(id)}"]`)]
    anchors.forEach((a) => a.classList.add('nb-design-open'))
    const anchor = anchors.find((a) => a.matches(from === 'head' ? '.nb-col-menu' : '.nb-chip')) || anchors[0] || section.querySelector('.nb-head')
    const rect = (anchor.closest('th') || anchor).getBoundingClientRect()
    menu.hidden = false
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    let top = rect.bottom + 4
    if (top + height > innerHeight - 8 && rect.top - height - 4 > 8) top = rect.top - height - 4
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`
    menu.style.top = `${Math.max(8, top)}px`
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (menu.hidden) return
      const t = e.target
      if (menu.contains(t) || (t.closest && t.closest('[data-design-field], #notes-ask'))) return
      flushLabel()
      closeFieldMenu()
    },
    true,
  )
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    const back = menuAt && menuAt.section.querySelector(`[data-design-field="${CSS.escape(menuAt.id)}"]`)
    flushLabel()
    closeFieldMenu()
    if (back) back.focus()
  })
  addEventListener('scroll', () => menu.hidden || placeFieldMenu(), true)
  addEventListener('resize', () => menu.hidden || placeFieldMenu())

  // A new type for a field's values: what doesn't fit is counted (and asked
  // about) before it is removed.
  const YES = /^(1|true|yes|y|x|✓)$/i
  const NO = /^(0|false|no|n)$/i
  const splitChoices = (text) => [...new Set(text.split(',').map((o) => o.trim()).filter(Boolean))].slice(0, 100)
  // The choice a value stands for (matched ignoring case), or '' for none.
  const choiceFor = (options, text) => options.find((o) => o.toLowerCase() === text.trim().toLowerCase()) || ''

  // A field's values as another type. For Choice, only values that match one
  // of the choices are kept; values never become choices themselves.
  function convertValues(records, f, to, choices = []) {
    const out = copyOf(records)
    let dropped = 0
    let unformatted = 0
    out.forEach((r) => {
      if (!hasValue(r, f)) return
      r.v = r.v || {}
      let text = textOf(r, f).trim()
      if (f.type === 'checkbox') text = text ? 'Yes' : ''
      if (f.type === 'datetime') text = text.replace('T', ' ')
      const html = r.h && r.h[f.id]
      if (to === 'long') {
        delete r.v[f.id]
        if (!html && text) {
          r.h = r.h || {}
          r.h[f.id] = api.textToFieldHtml(text)
        }
        return
      }
      if (html) {
        delete r.h[f.id]
        if (/<(?!br\b|\/)/i.test(html)) unformatted++
      }
      let value = text
      if (to === 'number') {
        const n = text.replace(/[,\s]/g, '')
        value = /^-?\d+(\.\d+)?$/.test(n) ? n : ''
      } else if (to === 'datetime') {
        const m = text.match(/^(\d{4}-\d\d-\d\d)(?:[ T](\d\d:\d\d))?/)
        value = m ? `${m[1]}T${m[2] || '00:00'}` : ''
      } else if (to === 'checkbox') {
        value = YES.test(text) ? '1' : ''
      } else if (to === 'choice') {
        value = choiceFor(choices, text)
      }
      if (!value && text && !(to === 'checkbox' && NO.test(text))) dropped++
      if (value) r.v[f.id] = value
      else delete r.v[f.id]
      if (r.w && to !== 'text') delete r.w[f.id]
    })
    return { records: out, dropped, unformatted }
  }

  async function changeType(to) {
    flushLabel()
    const at = currentField()
    if (!at || at.f.type === to) return
    const keep = { ...menuAt }
    let choices = at.f.options
    if (to === 'choice' && at.records.some((r) => hasValue(r, at.f))) {
      // The choices come first, so the values can be matched against them.
      const answer = await api.ask({
        title: 'Change to Choice',
        message: `List the choices for “${fieldLabel(at.f)}”, separated by commas. Values that match a choice (ignoring case) are kept; the others are removed.`,
        input: choices.join(', '),
        confirmText: 'Next',
      })
      menuAt = keep
      if (typeof answer !== 'string') return drawFieldMenu()
      choices = splitChoices(answer)
    }
    const { records, dropped, unformatted } = convertValues(at.records, at.f, to, choices)
    if (dropped || unformatted) {
      const plural = (n) => (n === 1 ? '' : 's')
      const parts = []
      if (dropped && to === 'choice') parts.push(`${dropped} value${plural(dropped)} ${dropped === 1 ? 'doesn’t' : 'don’t'} match any of the choices and will be removed`)
      else if (dropped) parts.push(`${dropped} value${plural(dropped)} can’t be read as ${typeName(to)} and will be removed`)
      if (unformatted) parts.push(`${unformatted} value${plural(unformatted)} will lose formatting (bold, lists, links or cards)`)
      const ok = await api.ask({
        title: 'Change field type',
        message: `Change “${fieldLabel(at.f)}” to ${typeName(to)}? ${parts.join('; ')}. Ctrl+Z will not bring ${dropped + unformatted === 1 ? 'it' : 'them'} back.`,
        confirmText: 'Change',
        danger: Boolean(dropped),
      })
      menuAt = keep
      if (!ok) return drawFieldMenu()
    }
    const { schema } = readSection(keep.section)
    const next = copyOf(schema)
    const g = next.fields.find((x) => x.id === at.f.id)
    if (!g) return closeFieldMenu()
    g.type = to
    if (to !== 'datetime') g.now = false
    if (to === 'choice') g.options = choices
    writeSchema(keep.section, next, records)
    menuAt = keep
    drawFieldMenu()
  }

  // New choices for a Choice field. Values that no longer match one are
  // removed (after asking); ones that match in another case take its spelling.
  async function setChoices(options) {
    const at = currentField()
    if (!at) return closeFieldMenu()
    const keep = { ...menuAt }
    const records = copyOf(at.records)
    let dropped = 0
    records.forEach((r) => {
      const value = r.v && r.v[at.f.id]
      if (!value) return
      const match = choiceFor(options, value)
      if (match) r.v[at.f.id] = match
      else {
        delete r.v[at.f.id]
        dropped++
      }
    })
    const same = JSON.stringify(options) === JSON.stringify(at.f.options) && JSON.stringify(records) === JSON.stringify(at.records)
    if (same) return
    if (dropped) {
      const ok = await api.ask({
        title: 'Change choices',
        message: `${dropped} value${dropped === 1 ? ' doesn’t' : 's don’t'} match any of the new choices for “${fieldLabel(at.f)}” and will be removed. Ctrl+Z will not bring ${dropped === 1 ? 'it' : 'them'} back.`,
        confirmText: 'Change',
        danger: true,
      })
      menuAt = keep
      if (!ok) return drawFieldMenu()
    }
    const next = copyOf(at.schema)
    next.fields[at.index].options = options
    writeSchema(keep.section, next, records)
    menuAt = keep
    drawFieldMenu()
  }

  async function deleteField() {
    flushLabel()
    const at = currentField()
    if (!at) return
    const section = menuAt.section
    const used = at.records.filter((r) => hasValue(r, at.f)).length
    if (used) {
      const ok = await api.ask({
        title: 'Delete field',
        message: `Delete the “${fieldLabel(at.f)}” field and its values in ${used} record${used === 1 ? '' : 's'}? Ctrl+Z will not bring them back.`,
        confirmText: 'Delete',
        danger: true,
      })
      if (!ok) return
    }
    closeFieldMenu()
    if (!section.isConnected) return
    const { schema, records } = readSection(section)
    const next = copyOf(schema)
    next.fields = next.fields.filter((x) => x.id !== at.f.id)
    const kept = copyOf(records)
    kept.forEach((r) => {
      delete r.v[at.f.id]
      if (r.h) delete r.h[at.f.id]
      if (r.w) delete r.w[at.f.id]
    })
    writeSchema(section, next, kept)
  }

  // ─── Saving a section's fields as a template ───
  async function saveAsTemplate(section) {
    flushLabel()
    const { schema } = readSection(section)
    const taken = new Set(loadTypes().map((t) => t.name.trim().toLowerCase()))
    const name = await api.ask({
      title: 'Save as template',
      message: 'Insert Template will offer it, with these fields and this layout. This section then follows the template.',
      input: schema.name,
      confirmText: 'Save',
      validate: (v) => (!v.trim() ? 'Give it a name.' : taken.has(v.trim().toLowerCase()) ? 'A template already has that name.' : ''),
    })
    if (typeof name !== 'string' || !section.isConnected) return
    const type = cleanType({ ...schema, id: uid('bt'), name: name.trim() })
    saveTypes([...loadTypes(), type])
    section.dataset.blockType = type.id
    delete section.dataset.blockFrom
    section.dataset.blockSchema = JSON.stringify(schemaOf(type))
    draw(section)
    api.markDirty()
  }

  async function updateTemplate(section) {
    flushLabel()
    const from = typeById(section.dataset.blockFrom)
    if (!from) return draw(section)
    const { schema } = readSection(section)
    const ok = await api.ask({
      title: 'Update template',
      message: `Save this section’s fields and layout into the “${from.name}” template? New sections get them, and its sections in other notes change the next time they are shown (values of fields it no longer has are hidden there, not deleted).`,
      confirmText: 'Update',
    })
    if (!ok || !section.isConnected) return
    saveTypes(loadTypes().map((t) => (t.id === from.id ? cleanType({ ...schema, id: from.id }) : t)))
    section.dataset.blockType = from.id
    delete section.dataset.blockFrom
    drawAll()
    api.markDirty()
  }

  // ─── CSV ────────────────────────────────────────────────────────────
  // Export: the field names, then each record as plain text (rich text loses
  // its formatting). Import adds records from a file whose first line names
  // the fields (by name; other columns are left out).
  // Comma-separated, with "quoted" cells that may hold commas, "" and line
  // breaks (as spreadsheets save them). Returns a list of rows of cells.
  function parseCsv(text) {
    const src = String(text || '').replace(/^\ufeff/, '')
    const rows = []
    let row = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') {
          cell += '"'
          i++
        } else if (ch === '"') quoted = false
        else cell += ch
      } else if (ch === '"' && !cell.trim()) {
        quoted = true
        cell = ''
      } else if (ch === ',') {
        row.push(cell)
        cell = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else cell += ch
    }
    if (cell || row.length) {
      row.push(cell)
      rows.push(row)
    }
    // Line breaks inside a cell become spaces: cells are one line of text.
    return rows
      .map((r) => r.map((c) => c.replace(/\s*[\r\n]+\s*/g, ' ').trim()))
      .filter((r) => r.some(Boolean))
  }
  const csvCell = (value) => {
    const text = String(value == null ? '' : value)
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const toCsv = (columns, rows) => [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  const fileNameOf = (name) => `${(name || 'records').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'records'}.csv`
  // Saves columns and rows as <name>.csv.
  function downloadCsv(name, columns, rows) {
    // The byte order mark makes Excel read the file as UTF-8.
    const blob = new Blob([String.fromCharCode(0xfeff) + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = el('a')
    a.href = url
    a.download = fileNameOf(name)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const csvTools = () => ({ parse: parseCsv, download: downloadCsv })
  function exportCsv(section) {
    const tools = csvTools()
    if (!tools) return
    const { schema, records } = readSection(section)
    const rows = ordered(records, schema).map((record) =>
      schema.fields.map((f) => (f.type === 'datetime' ? textOf(record, f).replace('T', ' ') : textOf(record, f))),
    )
    tools.download(schema.name || 'records', schema.fields.map(fieldLabel), rows)
  }

  const csvInput = el('input')
  csvInput.type = 'file'
  csvInput.accept = '.csv,text/csv'
  csvInput.hidden = true
  document.body.appendChild(csvInput)
  let csvTarget = null
  function chooseCsv(section) {
    csvTarget = section
    csvInput.click()
  }
  csvInput.addEventListener('change', async () => {
    const file = csvInput.files && csvInput.files[0]
    csvInput.value = ''
    const section = csvTarget
    csvTarget = null
    const tools = csvTools()
    if (!file || !section || !tools || !editable(section)) return
    let lines = []
    try {
      lines = tools.parse(await file.text())
    } catch {}
    const { schema, records } = readSection(section)
    const [header = [], ...body] = lines
    const norm = (t) => String(t).trim().toLowerCase()
    const map = header.map((name) => schema.fields.find((f) => norm(fieldLabel(f)) === norm(name) || norm(f.id) === norm(name)) || null)
    const used = map.filter(Boolean)
    if (!body.length || !used.length) {
      await api.ask({
        title: 'Import CSV',
        message: body.length
          ? `None of the columns in ${file.name} match this section's fields (${schema.fields.map(fieldLabel).join(', ')}). The first line must name them.`
          : `${file.name} has no records.`,
        alertOnly: true,
      })
      return
    }
    const skipped = header.filter((_, i) => !map[i])
    const ok = await api.ask({
      title: 'Import CSV',
      message: `Add ${body.length} record${body.length === 1 ? '' : 's'} from ${file.name}? Columns used: ${used.map(fieldLabel).join(', ')}.${skipped.length ? ` Left out (no field of that name): ${skipped.join(', ')}.` : ''}`,
      confirmText: 'Add',
    })
    if (!ok || !editable(section)) return
    const yes = /^(1|true|yes|y|x|✓)$/i
    const added = body.map((cells) => {
      const v = {}
      const h = {}
      map.forEach((f, i) => {
        const value = String(cells[i] || '').trim()
        if (!f || !value) return
        if (rich(f)) h[f.id] = api.textToFieldHtml(value)
        else if (f.type === 'checkbox') {
          if (yes.test(value)) v[f.id] = '1'
        } else if (f.type === 'datetime') v[f.id] = value.replace(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d).*$/, '$1T$2')
        else v[f.id] = value.slice(0, 10000)
      })
      return { id: uid('rec'), v, ...(Object.keys(h).length ? { h } : {}) }
    })
    writeRecords(section, [...records, ...added])
  })

  // Seals and other redraws of the open note.
  document.addEventListener('notes:shown', drawAll)

  // ─── Insert Template ───────────────────────────────────────────────
  // Lists the saved templates (× deletes one), and starts blank sections.
  // Just its icon (a section of records); the name is in its tooltip.
  const insertButton = button('btn sm btn-icon-only', '')
  insertButton.insertAdjacentHTML('afterbegin', '<svg aria-hidden="true" class="btn-icon" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><rect height="16" rx="1.5" width="18" x="3" y="4"></rect><path d="M3 9h18"></path><path d="M7 13h3M13.5 13H17M7 16.5h3M13.5 16.5H17"></path></svg>')
  insertButton.setAttribute('aria-label', 'Insert template (Alt+P)')
  insertButton.id = 'notes-insert-block'
  insertButton.title = 'Insert Template: a template section (such as Systems or a Log), or a blank table, cards or form, at the cursor (Alt+P)'
  varButton.before(insertButton)

  const pickOverlay = el('div', 'modal-overlay')
  pickOverlay.id = 'nb-pick-modal'
  pickOverlay.setAttribute('role', 'dialog')
  pickOverlay.setAttribute('aria-modal', 'true')
  pickOverlay.setAttribute('aria-labelledby', 'nb-pick-title')
  pickOverlay.innerHTML = `
    <div class="modal nb-pick-dialog">
      <h2 id="nb-pick-title">Insert Template</h2>
      <p class="form-hint">A template section holds records that all have the same fields. Pick a template, or start blank and save its fields as a new one (Fields → Save as template).</p>
      <div class="nb-pick-list" id="nb-pick-list"></div>
      <div class="nb-pick-blank" id="nb-pick-blank">
        <span class="form-hint">Start blank:</span>
        <button class="btn secondary sm" type="button" data-blank="table">Blank table</button>
        <button class="btn secondary sm" type="button" data-blank="card">Blank cards</button>
        <button class="btn secondary sm" type="button" data-blank="form">Blank form</button>
      </div>
      <div class="modal-actions">
        <span class="note-command-spacer"></span>
        <button class="btn secondary" id="nb-pick-cancel" type="button">Cancel</button>
      </div>
    </div>`
  document.body.appendChild(pickOverlay)
  const pickList = pickOverlay.querySelector('#nb-pick-list')

  function sectionShell(type) {
    return api.blockShell({ blockType: type.id, blockSchema: JSON.stringify(schemaOf(type)), blockRecords: '[]' })
  }

  function drawPickList() {
    const types = loadTypes()
    pickList.replaceChildren()
    if (!types.length) pickList.append(el('p', 'nb-empty', 'No templates yet. Start a blank one below, then use Fields → Save as template.'))
    types.forEach((type) => {
      const row = el('div', 'nb-pick-row')
      const choice = button('nb-pick-item')
      choice.dataset.id = type.id
      choice.append(el('strong', '', type.name), el('span', 'nb-pick-layout', layoutName(type.layout)))
      choice.append(el('span', 'nb-pick-fields', type.fields.map(fieldLabel).join(', ') || 'No fields yet'))
      const remove = button('nb-pick-delete', '×', `Delete the “${type.name}” template`)
      remove.dataset.id = type.id
      remove.setAttribute('aria-label', `Delete the ${type.name} template`)
      row.append(choice, remove)
      pickList.append(row)
    })
  }

  function openPicker() {
    if (sealedNow() || !api.selectedNode()) return
    drawPickList()
    pickOverlay.classList.add('open')
    const first = pickList.querySelector('button') || pickOverlay.querySelector('[data-blank]')
    if (first) first.focus()
  }

  // Sections already in notes keep their records and saved fields.
  async function deleteTemplate(id) {
    const type = typeById(id)
    if (!type) return drawPickList()
    const ok = await api.ask({
      title: 'Delete template',
      message: `Delete the “${type.name}” template? Sections already in notes keep their records and fields; they just stop following it. This can't be undone.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return
    saveTypes(loadTypes().filter((t) => t.id !== id))
    drawPickList()
    drawAll()
    const next = pickList.querySelector('button') || pickOverlay.querySelector('[data-blank]')
    if (next) next.focus()
  }

  const closePicker = () => pickOverlay.classList.remove('open')

  function insertSection(typeId) {
    const type = typeById(typeId)
    closePicker()
    if (!type) return
    api.restoreSelection()
    api.replaceCaretBlock(`${sectionShell(type).outerHTML}<p><br></p>`)
    api.blockSectionsIn(api.editor).forEach((section) => {
      if (!section.querySelector('.nb-head')) draw(section)
    })
    api.afterEdit()
  }

  // A section with fields of its own, opened for changing them.
  function insertBlank(layout) {
    closePicker()
    if (!BLANKS[layout]) return
    api.restoreSelection()
    const before = new Set(api.blockSectionsIn(api.editor))
    const shell = api.blockShell({ blockType: '', blockSchema: JSON.stringify(BLANKS[layout]()), blockRecords: '[]' })
    api.replaceCaretBlock(`${shell.outerHTML}<p><br></p>`)
    api.blockSectionsIn(api.editor).forEach((section) => {
      if (!before.has(section)) viewOf(section).design = true
      if (!section.querySelector('.nb-head')) draw(section)
    })
    api.afterEdit()
  }

  insertButton.addEventListener('mousedown', (e) => e.preventDefault())
  insertButton.addEventListener('click', openPicker)
  pickList.addEventListener('click', (e) => {
    const remove = e.target.closest('.nb-pick-delete')
    if (remove) return deleteTemplate(remove.dataset.id)
    const item = e.target.closest('.nb-pick-item')
    if (item) insertSection(item.dataset.id)
  })
  pickOverlay.querySelector('#nb-pick-blank').addEventListener('click', (e) => {
    const blank = e.target.closest('[data-blank]')
    if (blank) insertBlank(blank.dataset.blank)
  })
  pickOverlay.querySelector('#nb-pick-cancel').addEventListener('click', closePicker)
  pickOverlay.addEventListener('click', (e) => {
    if (e.target === pickOverlay) closePicker()
  })
  pickOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('notes-ask').classList.contains('open')) {
      e.preventDefault()
      e.stopPropagation()
      closePicker()
    }
  })

  // For note-templates.js (the starter note preset) and sealed-tomes.js.
  window.NoteBlocks = {
    draw,
    drawAll,
    // After cards are redrawn from the Spell Book (notes.js refreshCards):
    // saves the cards in Rich text fields with their fields.
    commitPending,
    syncFields() {
      if (sealedNow()) return
      api.blockSectionsIn(api.editor).forEach((section) => {
        section.querySelectorAll('.nb-rich').forEach((box) => {
          if (api.cardsIn(box).length) fieldInput(section, box)
        })
      })
    },
    // A saved section for a starter template, putting the template back in
    // the library if it was deleted.
    starterSectionHtml(typeId) {
      let list = loadTypes()
      let type = list.find((t) => t.id === typeId)
      if (!type) {
        const starter = STARTER_TYPES.find((t) => t.id === typeId)
        if (!starter) return ''
        type = cleanType(starter)
        list = [...list, type]
        saveTypes(list)
      }
      const shell = sectionShell(type)
      shell.removeAttribute('contenteditable')
      return shell.outerHTML
    },
  }
  drawAll()
})()
