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
 * list. Esc stops Tab from completing so it moves to the next control. The data (ps-data-5.js
 * and ps-data-7.js, several MB each) is added as <script>s the first time the
 * tab is shown, which also works from file://. Its text is only ever shown as
 * text. The version filter is saved under spellbook_ps_version_v1.
 */
;(() => {
  const VERSION_KEY = 'spellbook_ps_version_v1'
  const VERSIONS = [
    { id: '5.1', name: 'Windows PowerShell 5.1', src: 'modules/powershell/ps-data-5.js', global: 'SPELLBOOK_PS5', run: 'powershell' },
    { id: '7', name: 'PowerShell 7', src: 'modules/powershell/ps-data-7.js', global: 'SPELLBOOK_PS7', run: 'pwsh' },
  ]
  const buildLine = (version) => `${version.run} -NoProfile -File modules\\powershell\\ps-export.ps1`
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
        if (!found.some(Boolean)) {
          loading = null
          $('ps-hint').textContent = ''
          help.replaceChildren(
            el('h2', '', 'No commands yet'),
            el('p', '', 'Build them from this computer’s PowerShell: open PowerShell in the Spell Book folder, run the line for each version you want, then reload this page.'),
            ...VERSIONS.flatMap((version) => [el('p', '', version.name), el('pre', '', buildLine(version))]),
            el('p', '', 'If Windows says the script can’t be loaded or isn’t signed, read the script, then add -ExecutionPolicy Bypass after -NoProfile for that one run.'),
          )
          throw new Error('missing')
        }
        fillVersions()
        useVersion()
      })
    }
    return loading
  }

  // ─── Version filter ─────────────────────────────────────────────────
  function fillVersions() {
    const options = VERSIONS.map((version) => {
      const option = new Option(version.data ? version.name : `${version.name} (not built)`, version.id)
      option.disabled = !version.data
      return option
    })
    if (VERSIONS.every((version) => version.data)) options.unshift(new Option('Both versions', 'both'))
    const select = $('ps-version')
    select.replaceChildren(...options)
    let saved = null
    try {
      saved = localStorage.getItem(VERSION_KEY)
    } catch {}
    const usable = options.find((o) => o.value === saved && !o.disabled)
    select.value = (usable || options.find((o) => !o.disabled)).value
  }

  function useVersion() {
    const chosen = $('ps-version').value
    const [five, seven] = VERSIONS
    let data
    if (chosen === 'both') {
      five.merged = five.merged || window.SpellBookPS.merge(five.data, seven.data)
      data = five.merged
    } else {
      data = VERSIONS.find((version) => version.id === chosen).data
    }
    engine = window.SpellBookPS.create(data)
    const used = VERSIONS.filter((version) => version.data && (chosen === 'both' || chosen === version.id))
    const missing = VERSIONS.filter((version) => !version.data)
    $('ps-source').textContent = [
      `${data.commands.length} commands: ${used.map((v) => `${v.name} (${v.data.version}, built ${v.data.built})`).join(' and ')}.`,
      ...missing.map((v) => `To add ${v.name}, run: ${buildLine(v)}`),
    ].join(' ')
    shownHelp = null
    help.replaceChildren()
    update()
  }

  const onlyChip = (version) => el('span', 'ps-chip ps-only', `${version} only`)

  // ─── The list of what can come next ─────────────────────────────────
  function update() {
    if (!engine) return
    finding = false
    state = engine.complete(input.value, input.selectionStart)
    show(state.hint, 'No fixed choices here. Type it, then a space to see what comes next.')
  }

  function find() {
    if (!engine) return
    if (!finder.value.trim()) return update()
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
      parts.push(el('p', 'ps-synopsis', command.s || 'No help is installed for this command.'))
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
    load().then(update, () => {})
  })
  input.addEventListener('focus', () => finding && update())
  finder.addEventListener('input', () => load().then(find, () => {}))
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
    load().then(() => input.focus(), () => {})
  })
})()
