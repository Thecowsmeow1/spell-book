/*
 * The Bash page (modules/bash): importing manuals, the Find box, the command
 * box, a list and the help beside it. It works like the PowerShell page.
 *
 * In the command box Tab puts the marked choice in the command and each further
 * Tab (Shift+Tab to go back) swaps in the next; a space or Enter keeps it. ↓
 * and ↑ move through the list, Esc lets Tab leave the box. In the Find box,
 * Enter or a click puts a command in the command box.
 *
 * Saved under spellbook_bash_v1: { pages: { name: text } }. The text is kept
 * and read again at each start, so a better reader improves old imports. It is
 * a large value (IndexedDB, js/core/datafile.js). It is only ever shown as
 * text.
 */
;(() => {
  const KEY = 'spellbook_bash_v1'
  const PAGE_LIMIT = 1_000_000 // characters; the longest manuals are under this
  const $ = (id) => document.getElementById(id)
  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }
  const input = $('bash-input')
  const finder = $('bash-search')
  const list = $('bash-options')
  const help = $('bash-help')
  const parser = window.SpellBookBashParse

  let pages = {} // name → imported text
  let engine = null
  let state = null // what the list shows: a complete() or search() result
  let finding = false
  let cycling = false
  let tabCompletes = true
  let marked = 0
  let shown = null // the command in the help pane

  // ─── Storage ────────────────────────────────────────────────────────
  function readStored() {
    try {
      const stored = JSON.parse(window.DataFile.getItem(KEY) || '{}')
      const found = stored && typeof stored.pages === 'object' && stored.pages ? stored.pages : {}
      return Object.fromEntries(Object.entries(found).filter(([, text]) => typeof text === 'string'))
    } catch {
      return {}
    }
  }

  async function store(next) {
    const stored = Object.keys(next).length
      ? await window.DataFile.setItem(KEY, JSON.stringify({ pages: next }))
      : (await window.DataFile.removeItem(KEY), true)
    if (stored === false) throw new Error('Browser storage is full or unavailable; nothing was changed.')
    pages = next
    rebuild()
  }

  function rebuild() {
    const commands = Object.entries(pages)
      .map(([name, text]) => ({ ...parser.parse(text, name), text }))
      .sort((a, b) => a.name.localeCompare(b.name))
    engine = window.SpellBookBash.create(commands)
    shown = null
    help.replaceChildren()
    renderImported()
    if (finder.value.trim() && finding) find()
    else update()
  }

  // ─── Import ─────────────────────────────────────────────────────────
  // sources: [{ text, name, from }]
  async function add(sources) {
    const next = { ...pages }
    const added = []
    const problems = []
    sources.forEach(({ text, name, from }) => {
      const parts = parser.split(text)
      if (!parts.length) problems.push(`${from} is empty.`)
      parts.forEach((part) => {
        const read = parser.parse(part, parts.length === 1 ? name : '')
        if (!read.name || /[<>]/.test(read.name)) problems.push(`No command name found in ${from}; type it in Command name.`)
        else if (part.length > PAGE_LIMIT) problems.push(`${read.name} is too long to keep.`)
        else {
          next[read.name] = part
          added.push(`${read.name} (${read.options.length} option${read.options.length === 1 ? '' : 's'})`)
        }
      })
    })
    const result = $('bash-result')
    try {
      if (added.length) await store(next)
      result.textContent = [added.length ? `Added ${added.join(', ')}.` : '', ...problems].filter(Boolean).join(' ')
    } catch (error) {
      result.textContent = error.message
    }
    return added.length > 0 && !problems.length
  }

  function renderImported() {
    const names = Object.keys(pages).sort((a, b) => a.localeCompare(b))
    $('bash-count').textContent = `Imported (${names.length})`
    $('bash-imported').replaceChildren(
      ...names.map((name) => {
        const item = el('li')
        const remove = el('button', 'tag-x', '×')
        remove.type = 'button'
        remove.title = `Remove ${name}`
        remove.setAttribute('aria-label', remove.title)
        remove.addEventListener('click', () => {
          if (!confirm(`Remove the imported manual for ${name}?`)) return
          const next = { ...pages }
          delete next[name]
          store(next).catch((error) => ($('bash-result').textContent = error.message))
        })
        item.append(el('code', '', name), remove)
        return item
      }),
    )
  }

  function showImport(open) {
    $('bash-import').hidden = !open
    $('bash-body').hidden = open
    $('bash-import-toggle').setAttribute('aria-expanded', String(open))
    $('bash-import-toggle').textContent = open ? 'Close import' : 'Import manuals'
  }

  // ─── The list ───────────────────────────────────────────────────────
  function update() {
    if (!engine) return
    finding = false
    state = engine.complete(input.value, input.selectionStart)
    const empty = Object.keys(pages).length
      ? 'No choices here. Type it, then a space to see what comes next.'
      : 'Nothing imported yet. Click Import manuals.'
    show(Object.keys(pages).length ? state.hint : '', empty)
  }

  function find() {
    if (!engine) return
    if (!finder.value.trim()) return update()
    showImport(false)
    finding = true
    state = engine.search(finder.value)
    show(
      `${state.total} command${state.total === 1 ? '' : 's'} found. Enter or a click puts one in the command box.`,
      'No imported command matches.',
    )
  }

  function show(hint, empty) {
    marked = 0
    cycling = false
    $('bash-hint').textContent = hint
    const rows = state.items.map((item, i) => {
      const row = el('div', 'bash-option')
      row.id = `bash-option-${i}`
      row.setAttribute('role', 'option')
      row.append(el('code', '', item.label))
      if (item.aliases && item.aliases.length) row.append(el('span', 'bash-also', item.aliases.join(', ')))
      row.append(el('div', 'bash-option-note', item.note))
      row.addEventListener('mousedown', (e) => e.preventDefault())
      row.addEventListener('click', () => (finding ? use(i) : take(i)))
      row.addEventListener('mousemove', () => marked !== i && mark(i))
      return row
    })
    list.replaceChildren(...(rows.length ? rows : [el('p', 'bash-muted bash-none', empty)]))
    list.scrollTop = 0
    mark(0)
  }

  function mark(i) {
    const rows = list.querySelectorAll('.bash-option')
    if (rows[marked]) rows[marked].setAttribute('aria-selected', 'false')
    marked = Math.max(0, Math.min(i, state.items.length - 1))
    const row = rows[marked]
    const box = finding ? finder : input
    if (row) {
      row.setAttribute('aria-selected', 'true')
      row.scrollIntoView({ block: 'nearest' })
      box.setAttribute('aria-activedescendant', row.id)
    } else {
      box.removeAttribute('aria-activedescendant')
    }
    const item = state.items[marked]
    if (item && item.command) showHelp(item.command, null)
    else showHelp(state.command, (item && item.option) || state.option)
  }

  // Keeps a choice: puts it in the command, with a space unless a value follows.
  function take(i) {
    const item = state.items[i]
    if (!item) return false
    const text = input.value.slice(0, state.start) + item.insert + (item.open ? '' : ' ')
    input.value = text + input.value.slice(state.end).replace(/^\s+/, '')
    input.focus()
    input.setSelectionRange(text.length, text.length)
    update()
    return true
  }

  // Puts a choice where the word being completed is, leaving the list as it is.
  function put(i) {
    mark(i)
    const item = state.items[marked]
    const text = input.value.slice(0, state.start) + item.insert
    input.value = text + input.value.slice(state.end)
    state.end = text.length
    input.setSelectionRange(text.length, text.length)
  }

  function cycle(step) {
    const count = state.items.length
    if (!count) return false
    if (cycling) {
      put((marked + step + count) % count)
    } else if (count === 1) {
      take(0)
    } else {
      cycling = true
      put(marked)
      $('bash-hint').textContent = 'Tab for the next choice, Shift+Tab for the one before. Space or Enter keeps it.'
    }
    return true
  }

  // Puts a found command in the command box: where a command name goes at the
  // cursor, or else piped onto the end.
  function use(i) {
    const item = state.items[i]
    if (!item) return
    const at = engine.complete(input.value, input.selectionStart)
    const typed = input.value.slice(at.start, at.end)
    let caret
    if (at.atCommand && !engine.find(typed)) {
      const before = `${input.value.slice(0, at.start)}${item.insert} `
      input.value = before + input.value.slice(at.end).replace(/^\s+/, '')
      caret = before.length
    } else {
      const line = input.value.trimEnd()
      input.value = `${line}${/[|;&(]$/.test(line) ? '' : ' |'} ${item.insert} `
      caret = input.value.length
    }
    input.focus()
    input.setSelectionRange(caret, caret)
    update()
  }

  // ─── Help ───────────────────────────────────────────────────────────
  function optionBlock(option) {
    const box = el('details', 'bash-detail')
    const head = el('summary')
    head.append(el('code', '', option.names.join(', ')))
    if (option.argument) head.append(el('span', 'bash-muted', option.optional ? `[${option.argument}]` : option.argument))
    head.append(el('span', 'bash-first', option.description.split('\n')[0]))
    box.append(head)
    option.description.split('\n\n').forEach((para) => box.append(el('p', '', para)))
    box.option = option
    return box
  }

  function showHelp(command, option) {
    if (!command) {
      if (shown === '' && help.childElementCount) return
      shown = ''
      help.replaceChildren(
        el('p', 'bash-muted', Object.keys(pages).length ? 'A command’s help shows here.' : 'Click Import manuals, then paste or upload the help of the commands you use.'),
      )
      return
    }
    if (shown !== command) {
      shown = command
      const parts = [el('h2', '', command.name), el('p', 'bash-synopsis', command.summary)]
      if (command.description && command.description !== command.summary) {
        command.description.split('\n\n').forEach((para) => parts.push(el('p', '', para)))
      }
      if (command.synopsis) parts.push(el('h3', '', 'Synopsis'), el('pre', '', command.synopsis))
      if (command.subcommands.length) {
        parts.push(el('h3', '', `Subcommands (${command.subcommands.length})`))
        const table = el('dl')
        command.subcommands.forEach((s) => table.append(el('dt', '', s.name), el('dd', '', s.description)))
        parts.push(table)
      }
      parts.push(el('h3', '', `Options (${command.options.length})`))
      parts.push(...command.options.map(optionBlock))
      if (command.examples) parts.push(el('h3', '', 'Examples'), el('pre', '', command.examples))
      const full = el('details', 'bash-detail')
      full.append(el('summary', '', 'Full text, as imported'), el('pre', '', parser.clean(command.text)))
      parts.push(el('h3', '', 'Manual'), full)
      help.replaceChildren(...parts)
      help.scrollTop = 0
    }
    // Opens the option being typed and brings it into view.
    help.querySelectorAll('.bash-detail.current').forEach((box) => {
      box.classList.remove('current')
      box.open = false
    })
    const box = option && [...help.querySelectorAll('.bash-detail')].find((d) => d.option === option)
    if (box) {
      box.classList.add('current')
      box.open = true
      help.scrollTop += box.getBoundingClientRect().top - help.getBoundingClientRect().top - 8
    }
  }

  // ─── Wiring ─────────────────────────────────────────────────────────
  input.addEventListener('input', () => {
    tabCompletes = true
    showImport(false)
    update()
  })
  input.addEventListener('click', update)
  input.addEventListener('focus', () => finding && update())
  input.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update()
  })
  input.addEventListener('keydown', (e) => {
    if (!state || e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      tabCompletes = true
      const next = marked + (e.key === 'ArrowDown' ? 1 : -1)
      if (!cycling) mark(next)
      else if (next >= 0 && next < state.items.length) put(next)
    } else if (e.key === 'Tab' && tabCompletes && (cycling || !e.shiftKey)) {
      if (cycle(e.shiftKey ? -1 : 1)) e.preventDefault()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      take(marked)
    } else if (e.key === 'Escape') {
      if (cycling) update()
      tabCompletes = false
    }
  })
  finder.addEventListener('input', find)
  finder.addEventListener('focus', () => finder.value.trim() && find())
  finder.addEventListener('keydown', (e) => {
    if (!finding || e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      mark(marked + (e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      use(marked)
    }
  })
  $('bash-import-toggle').addEventListener('click', () => showImport($('bash-import').hidden))
  $('bash-add').addEventListener('click', async () => {
    const text = $('bash-text').value
    if (!text.trim()) {
      $('bash-result').textContent = 'Paste some text first.'
      return
    }
    if (await add([{ text, name: $('bash-name').value, from: 'the pasted text' }])) {
      $('bash-text').value = ''
      $('bash-name').value = ''
    }
  })
  $('bash-files').addEventListener('change', async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    try {
      const sources = await Promise.all(
        files.map(async (file) => {
          if (file.size > 5 * PAGE_LIMIT) throw new Error(`${file.name} is too big.`)
          let text = await file.text()
          // PowerShell's > writes UTF-16.
          if (text.includes('\u0000')) text = new TextDecoder('utf-16le').decode(await file.arrayBuffer()).replace(/^﻿/, '')
          // A file holding help without a name is named after the file.
          const base = file.name.replace(/\.[^.]*$/, '')
          const named = parser.split(text).length === 1 && !parser.parse(text).name
          return { text, name: named ? base : '', from: file.name }
        }),
      )
      await add(sources)
    } catch (error) {
      $('bash-result').textContent = error.message
    }
  })
  $('bash-clear').addEventListener('click', () => {
    input.value = ''
    input.focus()
    update()
  })
  $('bash-copy').addEventListener('click', () => {
    const button = $('bash-copy')
    navigator.clipboard.writeText(input.value.trim()).then(
      () => (button.textContent = 'Copied'),
      () => (button.textContent = 'Copy failed'),
    )
    setTimeout(() => (button.textContent = 'Copy'), 1500)
  })

  window.SpellBook.settingGroup({
    id: 'bashManuals',
    title: 'Bash manuals',
    sub: 'the manuals imported on the Bash tab',
    order: 90,
    keys: [KEY],
  })
  window.SpellBook.trackChanges &&
    window.SpellBook.trackChanges({
      key: KEY,
      label: 'Bash manuals',
      units: (text) => {
        try {
          return new Map(Object.entries(JSON.parse(text || '{}').pages || {}))
        } catch {
          return new Map()
        }
      },
    })

  document.addEventListener('spellbook:page', (e) => {
    if (e.detail.page !== 'bash') return
    if (!engine) {
      pages = readStored()
      rebuild()
      if (!Object.keys(pages).length) showImport(true)
    }
    if ($('bash-import').hidden) input.focus()
  })
})()
