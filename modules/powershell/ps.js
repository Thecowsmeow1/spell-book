/*
 * The PowerShell page (modules/powershell): the Find box, the command box, a
 * list and the help beside it. The list holds what was found while in the Find
 * box, and what can come next (ps-complete.js) while in the command box.
 * Picking a found command puts it in the command box, piped on when a command
 * is already there.
 *
 * As in PowerShell, Tab puts the marked choice in the command and each further
 * Tab (Shift+Tab to go back) swaps in the next, with the list staying up; a
 * space or Enter keeps it and lists what comes next. ↓ and ↑ move through the
 * list. Esc stops Tab from completing so it moves to the next control.
 *
 * Commands come from help text you paste or upload, saved under
 * spellbook_ps_help_v1 as { pages: { name: text }, aliases: { alias: name } }
 * (a large value: IndexedDB, js/core/datafile.js), and from the optional data
 * built by ps-export.ps1; an imported command replaces a built one. The data (ps-data-5.js
 * and ps-data-7.js, several MB each) is added as <script>s the first time the
 * tab is shown, which also works from file://. Its text is only ever shown as
 * text. The version filter is saved under spellbook_ps_version_v1.
 */
;(() => {
  const VERSION_KEY = 'spellbook_ps_version_v1'
  const KEY = 'spellbook_ps_help_v1'
  const PAGE_LIMIT = 1_000_000 // characters for one command's help
  const VERSIONS = [
    { id: '5.1', name: 'Windows PowerShell 5.1', src: 'modules/powershell/ps-data-5.js', global: 'SPELLBOOK_PS5' },
    { id: '7', name: 'PowerShell 7', src: 'modules/powershell/ps-data-7.js', global: 'SPELLBOOK_PS7' },
  ]
  const $ = (id) => document.getElementById(id)
  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }
  const input = $('ps-input')
  const finder = $('ps-search')
  const list = $('ps-options')
  const help = $('ps-help')

  let engine = null
  let loading = null
  let state = null // what the list shows: a complete() or search() result
  let finding = false // the list shows what the Find box found
  let stored = { pages: {}, aliases: {} } // imported help
  let commandCount = 0
  let marked = 0
  let tabCompletes = true
  let cycling = false // Tab is swapping choices into the command
  let shownHelp = ''

  // One version's data; resolves null when it hasn't been built.
  const loadVersion = (version) =>
    new Promise((resolve) => {
      const script = el('script')
      script.src = version.src
      script.onload = () => resolve(window[version.global] || null)
      script.onerror = () => {
        script.remove()
        resolve(null)
      }
      document.head.append(script)
    })

  function load() {
    if (!loading) {
      $('ps-hint').textContent = 'Loading commands…'
      loading = Promise.all(VERSIONS.map(loadVersion)).then((found) => {
        VERSIONS.forEach((version, i) => (version.data = found[i]))
        stored = readStored()
        fillVersions()
        useVersion()
        if (!commandCount) showImport(true)
      })
    }
    return loading
  }

  // ─── Imported help ──────────────────────────────────────────────────
  function readStored() {
    try {
      const saved = JSON.parse(window.DataFile.getItem(KEY) || '{}')
      const strings = (map) => Object.fromEntries(Object.entries(map && typeof map === 'object' ? map : {}).filter(([, v]) => typeof v === 'string'))
      return { pages: strings(saved.pages), aliases: strings(saved.aliases) }
    } catch {
      return { pages: {}, aliases: {} }
    }
  }

  async function store(next) {
    const any = Object.keys(next.pages).length || Object.keys(next.aliases).length
    const saved = any ? await window.DataFile.setItem(KEY, JSON.stringify(next)) : (await window.DataFile.removeItem(KEY), true)
    if (saved === false) throw new Error('Browser storage is full or unavailable; nothing was changed.')
    stored = next
    useVersion()
  }

  // The built commands (or none) with the imported ones in their place.
  function withImports(base) {
    const byName = new Map((base ? base.commands : []).map((c) => [c.n.toLowerCase(), c]))
    Object.values(stored.pages).forEach((text) => {
      const command = window.SpellBookPSParse.parse(text)
      const built = byName.get(command.n.toLowerCase())
      if (built) command.a = built.a
      byName.set(command.n.toLowerCase(), command)
    })
    Object.entries(stored.aliases).forEach(([alias, name]) => {
      const command = byName.get(name.toLowerCase())
      if (command && !command.a.includes(alias)) byName.set(name.toLowerCase(), { ...command, a: [...command.a, alias] })
    })
    return {
      common: base ? base.common : window.SpellBookPSParse.COMMON,
      commands: [...byName.values()].sort((a, b) => a.n.localeCompare(b.n)),
    }
  }

  // sources: [{ text, from }]
  async function add(sources) {
    const next = { pages: { ...stored.pages }, aliases: { ...stored.aliases } }
    const added = []
    const problems = []
    let aliases = 0
    sources.forEach(({ text, from }) => {
      const read = window.SpellBookPSParse.split(text)
      read.pages.forEach(({ name, text: part, syntaxOnly }) => {
        const known = Object.keys(next.pages).find((n) => n.toLowerCase() === name.toLowerCase())
        // Syntax adds to help already imported rather than replacing it.
        const whole = syntaxOnly && known ? `${next.pages[known]}\n\n${part}` : part
        if (whole.length > PAGE_LIMIT) return problems.push(`${name} is too long to keep.`)
        if (known) delete next.pages[known]
        next.pages[name] = whole
        added.push(`${name} (${Object.keys(window.SpellBookPSParse.parse(whole).params).length} parameters)`)
      })
      Object.assign(next.aliases, read.aliases)
      aliases += Object.keys(read.aliases).length
      if (!read.pages.length && !Object.keys(read.aliases).length) {
        problems.push(`No PowerShell help found in ${from}. Use Get-Help <name> -Full.`)
      }
    })
    const result = $('ps-result')
    try {
      if (added.length || aliases) await store(next)
      result.textContent = [added.length ? `Added ${added.join(', ')}.` : '', aliases ? `Added ${aliases} aliases.` : '', ...problems].filter(Boolean).join(' ')
    } catch (error) {
      result.textContent = error.message
    }
    return (added.length > 0 || aliases > 0) && !problems.length
  }

  function renderImported() {
    const names = Object.keys(stored.pages).sort((a, b) => a.localeCompare(b))
    const aliases = Object.keys(stored.aliases).length
    $('ps-count').textContent = `Imported (${names.length})${aliases ? `, ${aliases} aliases` : ''}`
    $('ps-imported').replaceChildren(
      ...names.map((name) => {
        const item = el('li')
        const remove = el('button', 'tag-x', '×')
        remove.type = 'button'
        remove.title = `Remove ${name}`
        remove.setAttribute('aria-label', remove.title)
        remove.addEventListener('click', () => {
          if (!confirm(`Remove the imported help for ${name}?`)) return
          const pages = { ...stored.pages }
          delete pages[name]
          store({ pages, aliases: stored.aliases }).catch((error) => ($('ps-result').textContent = error.message))
        })
        item.append(el('code', '', name), remove)
        return item
      }),
    )
  }

  function showImport(open) {
    $('ps-import').hidden = !open
    $('ps-body').hidden = open
    $('ps-import-toggle').setAttribute('aria-expanded', String(open))
    $('ps-import-toggle').textContent = open ? 'Close import' : 'Import help'
  }

  // ─── Version filter ─────────────────────────────────────────────────
  // The version list is only there for built data.
  function fillVersions() {
    const options = VERSIONS.filter((version) => version.data).map((version) => new Option(version.name, version.id))
    if (options.length > 1) options.unshift(new Option('Both versions', 'both'))
    const select = $('ps-version')
    select.replaceChildren(...options)
    select.hidden = !options.length
    let saved = null
    try {
      saved = localStorage.getItem(VERSION_KEY)
    } catch {}
    if (options.length) select.value = options.some((o) => o.value === saved) ? saved : options[0].value
  }

  function useVersion() {
    const chosen = $('ps-version').value
    const [five, seven] = VERSIONS
    let base = null
    if (chosen === 'both') {
      five.merged = five.merged || window.SpellBookPS.merge(five.data, seven.data)
      base = five.merged
    } else if (chosen) {
      base = VERSIONS.find((version) => version.id === chosen).data
    }
    const data = withImports(base)
    commandCount = data.commands.length
    engine = window.SpellBookPS.create(data)
    const used = VERSIONS.filter((version) => version.data && (chosen === 'both' || chosen === version.id))
    const imported = Object.keys(stored.pages).length
    $('ps-source').textContent = [
      `${commandCount} command${commandCount === 1 ? '' : 's'}`,
      imported ? `, ${imported} imported` : '',
      used.length ? `; built from ${used.map((v) => `${v.name} (${v.data.version}, ${v.data.built})`).join(' and ')}` : '',
      '.',
    ].join('')
    renderImported()
    shownHelp = null
    help.replaceChildren()
    if (finding && finder.value.trim()) find()
    else update()
  }

  const onlyChip = (version) => el('span', 'ps-chip ps-only', `${version} only`)

  // ─── The list of what can come next ─────────────────────────────────
  function update() {
    if (!engine) return
    finding = false
    state = engine.complete(input.value, input.selectionStart)
    show(
      commandCount ? state.hint : '',
      commandCount ? 'No fixed choices here. Type it, then a space to see what comes next.' : 'Nothing imported yet. Click Import help.',
    )
  }

  function find() {
    if (!engine) return
    if (!finder.value.trim()) return update()
    showImport(false)
    finding = true
    state = engine.search(finder.value)
    show(
      `${state.total} command${state.total === 1 ? '' : 's'} found. Enter or a click puts one in the command box.`,
      'No command matches. Try fewer or other words.',
    )
  }

  function show(hint, empty) {
    marked = 0
    cycling = false
    $('ps-hint').textContent =
      state.total > state.items.length ? `${hint} ${state.total} matches, first ${state.items.length} listed.` : hint
    const rows = state.items.map((item, i) => {
      const row = el('div', 'ps-option')
      row.id = `ps-option-${i}`
      row.setAttribute('role', 'option')
      const head = el('div', 'ps-option-head')
      head.append(el('code', '', item.label))
      if (item.only) head.append(onlyChip(item.only))
      if (item.required) head.append(el('span', 'ps-chip ps-required', 'required'))
      if (item.position >= 0) head.append(el('span', 'ps-chip', `position ${item.position}`))
      row.append(head, el('div', 'ps-option-note', item.note))
      if (item.aliases && item.aliases.length) {
        row.append(el('div', 'ps-option-note', `${item.aliases.length > 1 ? 'aliases' : 'alias'}: ${item.aliases.join(', ')}`))
      }
      row.addEventListener('mousedown', (e) => e.preventDefault())
      row.addEventListener('click', () => (finding ? use(i) : take(i)))
      row.addEventListener('mousemove', () => marked !== i && mark(i))
      return row
    })
    const none = el('p', 'ps-muted ps-none', empty)
    list.replaceChildren(...(rows.length ? rows : [none]))
    list.scrollTop = 0
    mark(0)
  }

  function mark(i) {
    const rows = list.querySelectorAll('.ps-option')
    if (rows[marked]) rows[marked].setAttribute('aria-selected', 'false')
    marked = Math.max(0, Math.min(i, state.items.length - 1))
    const row = rows[marked]
    if (row) {
      row.setAttribute('aria-selected', 'true')
      row.scrollIntoView({ block: 'nearest' })
      ;(finding ? finder : input).setAttribute('aria-activedescendant', row.id)
    } else {
      input.removeAttribute('aria-activedescendant')
      finder.removeAttribute('aria-activedescendant')
    }
    const item = state.items[marked]
    if (item && item.kind === 'command') showHelp(item.command, null)
    else showHelp(state.command, item && item.param ? item.param : state.param)
  }

  function take(i) {
    const item = state.items[i]
    if (!item) return false
    const before = input.value.slice(0, state.start)
    const after = input.value.slice(state.end).replace(/^\s+/, '')
    const text = `${before}${item.insert} `
    input.value = text + after
    input.focus()
    input.setSelectionRange(text.length, text.length)
    update()
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
      input.value = `${line}${/[|;({]$/.test(line) ? '' : ' |'} ${item.insert} `
      caret = input.value.length
    }
    input.focus()
    input.setSelectionRange(caret, caret)
    update()
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

  // Tab (1) or Shift+Tab (-1). Returns false when there's nothing to complete.
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
      $('ps-hint').textContent = 'Tab for the next choice, Shift+Tab for the one before. Space or Enter keeps it.'
    }
    return true
  }

  // ─── Help ───────────────────────────────────────────────────────────
  // Help text is wrapped Markdown: joins the lines of a paragraph, and shows
  // ``` blocks as code.
  function prose(text) {
    const box = el('div', 'ps-prose')
    String(text || '')
      .replace(/\r/g, '')
      .split(/^\s*```[\w-]*\s*$/m)
      .forEach((piece, i) => {
        if (!piece.trim()) return
        if (i % 2) {
          box.append(el('pre', '', piece.replace(/^\n+|\n+$/g, '')))
          return
        }
        piece
          .trim()
          .split(/\n\s*\n/)
          .forEach((para) => {
            const lines = /^\s*(?:[-*>|]|\d+\.)\s/m.test(para)
            const clean = para.replace(/\*\*|`/g, '')
            box.append(el('p', lines ? 'ps-lines' : '', lines ? clean : clean.replace(/\s*\n\s*/g, ' ')))
          })
      })
    return box
  }

  function syntax(command, set) {
    const parts = set.p.map(([name, mandatory, position]) => {
      const p = command.params[name]
      if (!p) return ''
      const flag = position >= 0 ? `[-${name}]` : `-${name}`
      const full = p.sw ? `-${name}` : `${flag} <${p.t}>`
      return mandatory ? full : `[${full}]`
    })
    return [command.n, ...parts.filter(Boolean), '[<CommonParameters>]'].join(' ')
  }

  function parameterBlock(command, name, open) {
    const p = command.params[name]
    const box = el('details', 'ps-param')
    box.dataset.param = name
    box.open = open
    const head = el('summary')
    head.append(el('code', '', `-${name}`), el('span', 'ps-muted', p.sw ? 'switch' : p.t))
    if (command.sets.every((s) => s.p.some((x) => x[0] === name && x[1]))) head.append(el('span', 'ps-chip ps-required', 'required'))
    if (p.only) head.append(onlyChip(p.only))
    box.append(head)
    const facts = el('dl')
    const fact = (label, value) => value && facts.append(el('dt', '', label), el('dd', '', value))
    fact('Aliases', (p.a || []).map((a) => `-${a}`).join(', '))
    fact('Values', (p.v || []).map((v) => (p.vOnly?.[v] ? `${v} (${p.vOnly[v]} only)` : v)).join(', '))
    const places = [...new Set(command.sets.flatMap((s) => s.p.filter((x) => x[0] === name && x[2] >= 0).map((x) => x[2])))]
    fact('Position', places.length ? places.join(', ') : 'named')
    fact('Default', p.df)
    fact('Takes pipeline input', p.pipe ? 'yes' : '')
    if (command.sets.length > 1) {
      const inSets = command.sets.filter((s) => s.p.some((x) => x[0] === name))
      fact('Parameter sets', inSets.length === command.sets.length ? 'all' : [...new Set(inSets.map((s) => s.n))].join(', '))
    }
    box.append(facts, p.d ? prose(p.d) : el('p', 'ps-muted', 'No description in the installed help.'))
    return box
  }

  function showHelp(command, param) {
    const key = command ? command.n : ''
    if (!command) {
      if (shownHelp === key && help.childElementCount) return
      shownHelp = key
      help.replaceChildren(el('p', 'ps-muted', 'A command’s help shows here.'))
      return
    }
    if (shownHelp !== key) {
      shownHelp = key
      const title = el('h2', '', command.n)
      if (command.m) title.append(el('span', 'ps-chip', command.m))
      if (command.only) title.append(onlyChip(command.only))
      const parts = [title]
      if (command.a.length) parts.push(el('p', 'ps-muted', `Aliases: ${engine.aliasNames(command).join(', ')}`))
      parts.push(el('p', 'ps-synopsis', command.s || 'No description for this command.'))
      if (command.d) parts.push(prose(command.d))
      if (/^https?:\/\//i.test(command.u)) {
        const link = el('a', '', 'Online help')
        link.href = command.u
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        parts.push(link)
      }
      parts.push(el('h3', '', 'Syntax'))
      command.sets.forEach((set) => {
        if (command.sets.length > 1 || set.only) {
          const notes = [set.def ? 'default' : '', set.only ? `${set.only} only` : ''].filter(Boolean).join(', ')
          parts.push(el('p', 'ps-muted', `${set.n}${notes ? ` (${notes})` : ''}`))
        }
        parts.push(el('pre', '', syntax(command, set)))
      })
      const names = Object.keys(command.params)
      parts.push(el('h3', '', `Parameters (${names.length})`))
      names.forEach((name) => parts.push(parameterBlock(command, name, false)))
      parts.push(el('p', 'ps-muted', `Every cmdlet also takes the common parameters, such as -Verbose and -ErrorAction.`))
      if (command.ex.length) {
        parts.push(el('h3', '', `Examples (${command.ex.length})`))
        command.ex.forEach(([heading, code, remarks]) => {
          const box = el('details', 'ps-param')
          box.append(el('summary', '', heading || 'Example'))
          if (code) box.append(el('pre', '', code))
          if (remarks) box.append(prose(remarks))
          parts.push(box)
        })
      }
      help.replaceChildren(...parts)
      help.scrollTop = 0
    }
    // Opens the parameter being typed and brings it into view.
    help.querySelectorAll('.ps-param.current').forEach((box) => {
      box.classList.remove('current')
      box.open = false
    })
    const box = param && help.querySelector(`.ps-param[data-param="${CSS.escape(param)}"]`)
    if (box) {
      box.classList.add('current')
      box.open = true
      help.scrollTop += box.getBoundingClientRect().top - help.getBoundingClientRect().top - 8
    }
  }

  // ─── Wiring ─────────────────────────────────────────────────────────
  input.addEventListener('input', () => {
    tabCompletes = true
    load().then(() => {
      showImport(false)
      update()
    })
  })
  input.addEventListener('focus', () => finding && update())
  finder.addEventListener('input', () => load().then(find))
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
  // Moving the caret changes what can come next.
  input.addEventListener('click', update)
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
  $('ps-version').addEventListener('change', () => {
    try {
      localStorage.setItem(VERSION_KEY, $('ps-version').value)
    } catch {}
    useVersion()
  })
  $('ps-import-toggle').addEventListener('click', () => load().then(() => showImport($('ps-import').hidden)))
  $('ps-add').addEventListener('click', async () => {
    const text = $('ps-text').value
    if (!text.trim()) {
      $('ps-result').textContent = 'Paste some text first.'
      return
    }
    await load()
    if (await add([{ text, from: 'the pasted text' }])) $('ps-text').value = ''
  })
  $('ps-files').addEventListener('change', async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    try {
      await load()
      const sources = await Promise.all(
        files.map(async (file) => {
          if (file.size > 20 * PAGE_LIMIT) throw new Error(`${file.name} is too big.`)
          const bytes = await file.arrayBuffer()
          const start = new Uint8Array(bytes.slice(0, 2))
          // Windows PowerShell's > writes UTF-16.
          const encoding = start[0] === 0xff && start[1] === 0xfe ? 'utf-16le' : 'utf-8'
          return { text: new TextDecoder(encoding).decode(bytes), from: file.name }
        }),
      )
      await add(sources)
    } catch (error) {
      $('ps-result').textContent = error.message
    }
  })
  window.SpellBook.settingGroup({
    id: 'powershellHelp',
    title: 'PowerShell help',
    sub: 'the help imported on the PowerShell tab',
    order: 91,
    keys: [KEY],
  })
  window.SpellBook.trackChanges &&
    window.SpellBook.trackChanges({
      key: KEY,
      label: 'PowerShell help',
      units: (text) => {
        try {
          return new Map(Object.entries(JSON.parse(text || '{}').pages || {}))
        } catch {
          return new Map()
        }
      },
    })
  $('ps-clear').addEventListener('click', () => {
    input.value = ''
    input.focus()
    update()
  })
  $('ps-copy').addEventListener('click', () => {
    const button = $('ps-copy')
    navigator.clipboard.writeText(input.value.trim()).then(
      () => (button.textContent = 'Copied'),
      () => (button.textContent = 'Copy failed'),
    )
    setTimeout(() => (button.textContent = 'Copy'), 1500)
  })

  document.addEventListener('spellbook:page', (e) => {
    if (e.detail.page !== 'powershell') return
    load().then(() => $('ps-import').hidden && input.focus())
  })
})()
