/*
 * Man page importer (Tools page). Paste a man page (`man ls | col -b`), a
 * command's --help output, PowerShell Get-Help -Full text, or a help harvester
 * dump, and it becomes a Spell Book command:
 *
 *   - the SYNOPSIS (or "Usage:" lines, or SYNTAX) becomes the Command Template,
 *     written in the template syntax: <required>, [optional], [-x] switches,
 *     [-o <value>] options with a value, <a|b> choices. With several forms
 *     (ls has one, tar several) you pick which one.
 *   - the options become the command's Options list, read by the same parser
 *     the Edit window uses for pasted man pages (the spells service's
 *     parseManOptions).
 *   - NAME gives the title and description; the first example line that runs
 *     the command, if any, the Example.
 *
 * Nothing is saved here: "Create command…" opens the New Command window filled
 * in, to check and save as usual. Uses the Spells tab's service at run time
 * (SpellBook.service('spells')): parseManOptions, fields, platforms, edit.
 */
;(() => {
  const T = window.SpellBookTools
  const grid = document.getElementById('tools-grid')
  // It makes commands, so it is only there with the Spells tab.
  if (!T || !grid || !window.SpellBook.service('spells')) return
  const { el, labelled } = T
  const spells = () => window.SpellBook.service('spells')

  // ─── Reading the text ───────────────────────────────────────────────
  const splitLines = (text) => String(text || '').replace(/\r\n?/g, '\n').split('\n')

  // man without col -b: "N\bNA\bAM\bME\bE" (bold) and "_\bf_\bi" (underline).
  const clean = (text) =>
    String(text || '')
      .replace(/.\x08/g, '')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\t/g, '    ')

  // A help harvester dump (Tools → Help harvester): sections headed
  // "##### SPELLBOOK: <shell> | <command line> #####".
  const DUMP_HEADER = /^#{3,}\s*SPELLBOOK:\s*([^|#\n]+?)\s*\|\s*([^#\n]+?)\s*#{3,}\s*$/
  function splitDump(text) {
    const sections = []
    let current = null
    splitLines(text).forEach((line) => {
      const m = line.match(DUMP_HEADER)
      if (m) {
        current = { shell: m[1].trim(), command: m[2].trim(), lines: [] }
        sections.push(current)
      } else if (current) current.lines.push(line)
    })
    return sections.map(({ lines, ...s }) => ({ ...s, text: lines.join('\n').trim() }))
  }

  // Sections of a man page: a heading is a line in capitals at the left edge
  // (NAME, SYNOPSIS, DESCRIPTION, OPTIONS, EXAMPLES, SEE ALSO…).
  const HEADING = /^([A-Z][A-Z0-9]*(?:[ /-][A-Z0-9]+)*)\s*$/
  function sectionsOf(text) {
    const sections = {}
    const order = []
    let current = null
    splitLines(text).forEach((line) => {
      const m = line.match(HEADING)
      if (m && !/^\s/.test(line)) {
        current = m[1]
        if (!sections[current]) {
          sections[current] = []
          order.push(current)
        }
        return
      }
      if (current) sections[current].push(line)
    })
    return { sections, order }
  }

  // Wrapped lines of one paragraph joined; blank lines separate paragraphs.
  const paragraphs = (lines) =>
    lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)

  // The forms of a synopsis: each starts with the command's name, and lines
  // indented further continue it. Sub-headings indented less than the
  // command lines ("Traditional usage" in tar's) are left out.
  function synopsisForms(lines, name) {
    const forms = []
    const indentOf = (line) => line.match(/^\s*/)[0].length
    const firstWord = (line) => line.trim().split(/\s+/)[0]
    const named = name && lines.find((l) => l.trim() && firstWord(l).toLowerCase() === name.toLowerCase())
    let base = named ? indentOf(named) : null
    lines.forEach((line) => {
      if (!line.trim()) return
      const indent = indentOf(line)
      if (base === null) base = indent
      if (indent < base) return
      if (indent === base || !forms.length) forms.push(line.trim())
      else forms[forms.length - 1] += ' ' + line.trim()
    })
    return forms
  }

  // "Usage: tool [OPTION]... FILE" lines of --help text, with any lines
  // indented under them, and the "or:" lines GNU tools add.
  function usageForms(text) {
    const lines = splitLines(text)
    const forms = []
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(?:usage|syntax|or):?\s+(\S.*)$/i)
      if (!m || (/^\s*or/i.test(line) && !forms.length)) return
      let form = m[1].trim()
      for (let j = i + 1; j < lines.length && /^\s{4,}\S/.test(lines[j]) && !/^\s*-/.test(lines[j]); j++) {
        form += ' ' + lines[j].trim()
      }
      forms.push(form)
    })
    return forms
  }

  // Everything the importer needs from the text.
  function readHelp(text) {
    const source = clean(text)
    const { sections, order } = sectionsOf(source)
    const has = (name) => Array.isArray(sections[name])
    const style = /^\s*(SYNTAX|PARAMETERS)\s*$/m.test(source) || /<CommonParameters>/.test(source)
      ? 'powershell'
      : order.length
        ? 'man'
        : 'help'

    let name = ''
    let summary = ''
    if (has('NAME')) {
      const line = paragraphs(sections.NAME)[0] || ''
      const m = line.match(/^(\S+(?:,\s*\S+)*)\s+(?:-|—|–)\s+(.*)$/)
      name = (m ? m[1].split(',')[0] : line.split(/\s+/)[0] || '').trim()
      if (m) summary = m[2].trim()
    }
    let forms = []
    if (has('SYNOPSIS')) forms = synopsisForms(sections.SYNOPSIS, name)
    if (has('SYNTAX')) forms = synopsisForms(sections.SYNTAX, name)
    if (!forms.length) forms = usageForms(source)
    // A synopsis that is a sentence, not a command line (PowerShell puts the
    // summary there).
    if (style === 'powershell' && has('SYNOPSIS') && has('SYNTAX')) {
      summary = summary || paragraphs(sections.SYNOPSIS)[0] || ''
    }
    forms = forms.filter((f) => /\S/.test(f) && !/^[A-Z][a-z].*[.!]$/.test(f))
    if (!name && forms.length) name = forms[0].split(/\s+/)[0]
    if (!summary && has('DESCRIPTION')) summary = (paragraphs(sections.DESCRIPTION)[0] || '').replace(/^(.*?[.!?])\s.*$/, '$1')
    if (!summary && style === 'help') {
      // --help: the first sentence that is not a usage line or an option.
      const line = splitLines(source).find((l) => l.trim() && !/^\s*(usage|or):/i.test(l) && !/^\s*-/.test(l))
      if (line) summary = line.trim()
    }

    // Options: everything but NAME and SYNOPSIS (GNU tools list them under
    // DESCRIPTION, others under OPTIONS).
    const optionText = order.length
      ? order
          .filter((s) => !['NAME', 'SYNOPSIS', 'SYNTAX', 'SEE ALSO', 'EXAMPLES', 'AUTHOR', 'AUTHORS', 'COPYRIGHT', 'REPORTING BUGS', 'HISTORY'].includes(s))
          .map((s) => sections[s].join('\n'))
          .join('\n\n')
      : splitLines(source)
          .filter((l) => !/^\s*(usage|or):/i.test(l))
          .join('\n')
    let options = []
    try {
      options = spells() ? spells().parseManOptions(optionText) : []
    } catch (error) {
      console.error(error)
    }
    // PowerShell parameters: "-Name <String[]>" headings under PARAMETERS.
    if (style === 'powershell' && has('PARAMETERS')) options = powerShellParameters(sections.PARAMETERS)

    // The first example line that runs the command.
    let example = ''
    const exampleLines = sections.EXAMPLES || sections.EXAMPLE || []
    if (name) {
      const run = exampleLines.map((l) => l.trim().replace(/^(\$|#|PS [^>]*>|C:\\[^>]*>)\s*/, '')).find((l) => l.split(/\s+/)[0] === name)
      if (run) example = run
    }
    const description = has('DESCRIPTION') ? paragraphs(sections.DESCRIPTION).slice(0, 2).join('\n\n') : ''
    return { style, name, summary, forms, options, example, description }
  }

  function powerShellParameters(lines) {
    const options = []
    let current = null
    const finish = () => {
      if (!current) return
      const text = paragraphs(current.lines.filter((l) => !/^\s*(Required\?|Position\?|Default value|Accept pipeline input\?|Accept wildcard characters\?|Aliases|Dynamic\?)\s{2,}/.test(l)))
      const all = text.join('\n\n')
      const first = all.match(/^(.*?[.!?])(\s|$)/)
      current.description = first ? first[1] : all
      current.details = first ? all.slice(first[1].length).trim() : ''
      delete current.lines
      options.push(current)
      current = null
    }
    lines.forEach((line) => {
      const m = line.match(/^\s{0,8}-([A-Za-z][A-Za-z0-9]*)(?:\s+\[?<([^>]+)>\]?)?\s*$/)
      if (m) {
        finish()
        const isSwitch = !m[2] || /SwitchParameter/i.test(m[2])
        current = { kind: 'option', short: '', long: `-${m[1]}`, argument: isSwitch ? '' : m[1], info: m[2] ? [{ label: 'Type', value: m[2] }] : [], lines: [] }
        return
      }
      if (/^\s*<CommonParameters>/.test(line)) return finish()
      if (current) current.lines.push(line)
    })
    finish()
    return options
  }

  // ─── Synopsis → Command Template ────────────────────────────────────
  // A synopsis line is read into a small tree ([groups], {choices}, a | b
  // alternatives, words) and written back in the template syntax.
  function tokenize(line) {
    const tokens = []
    let i = 0
    let word = ''
    const push = () => {
      if (!word) return
      // FILE... → FILE and an ellipsis
      const m = word.match(/^(.*?)(\.\.\.|…)$/)
      if (m && m[1]) {
        tokens.push(m[1], '...')
      } else tokens.push(word)
      word = ''
    }
    while (i < line.length) {
      const c = line[i]
      if (/\s/.test(c)) {
        push()
        i++
      } else if (c === '<') {
        // <String[]>, <file>, <a|b>: one token (attached to a word before it,
        // as in -u<mode>)
        const end = line.indexOf('>', i)
        if (end === -1) {
          word += c
          i++
          continue
        }
        word += line.slice(i, end + 1)
        i = end + 1
      } else if (c === '[' && word) {
        // --color[=WHEN], MODE[,MODE]: part of the word
        const end = line.indexOf(']', i)
        word += line.slice(i, end === -1 ? line.length : end + 1)
        i = end === -1 ? line.length : end + 1
      } else if (c === '|' && word && line[i + 1] && !/[\s\]}-]/.test(line[i + 1])) {
        // pid|name: one word with alternatives in it
        word += c
        i++
      } else if ('[]{}|'.includes(c)) {
        push()
        tokens.push(c)
        i++
      } else if (c === '.' && line.startsWith('...', i)) {
        push()
        tokens.push('...')
        i += 3
      } else {
        word += c
        i++
      }
    }
    push()
    return tokens
  }

  // Returns the alternatives of one level: [[items…], [items…]] for a | b.
  function readLevel(tokens, state, close) {
    const alternatives = [[]]
    while (state.i < tokens.length) {
      const t = tokens[state.i++]
      if (t === close) return alternatives
      if (t === '|') alternatives.push([])
      else if (t === '[') alternatives[alternatives.length - 1].push({ type: 'group', alts: readLevel(tokens, state, ']') })
      else if (t === '{') alternatives[alternatives.length - 1].push({ type: 'choice', alts: readLevel(tokens, state, '}') })
      else if (t === ']' || t === '}') continue
      else if (t === '...') alternatives[alternatives.length - 1].push({ type: 'more' })
      else alternatives[alternatives.length - 1].push({ type: 'word', text: t })
    }
    return alternatives
  }

  // Words that stand for a value in BSD-style synopses, where the underline
  // that marks a placeholder is lost in plain text.
  const VALUE_WORDS = new Set(
    'address addr arg args argument arguments command commands count destination dest dir directory domain expression file filename files host hostname interface key level mode name number option options path pattern pid port process service signal unit device mountpoint group owner prefix program query script seconds size source src string target template time timeout url user username value'.split(' '),
  )
  const placeholder = (text) => {
    const n = String(text)
      .replace(/^<|>$/g, '')
      .replace(/\[\]$/, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
    return n === 'option' ? 'options' : n || 'value'
  }
  const isFlag = (t) => /^-{1,2}[A-Za-z0-9?]/.test(t)
  // FILE, bind_address, destination: a word that stands for a value.
  const isValueWord = (t) => !isFlag(t) && (/^[A-Z][A-Z0-9_-]+$/.test(t) || /_/.test(t) || VALUE_WORDS.has(t.toLowerCase()))

  function toTemplate(form, info) {
    const tokens = tokenize(form)
    const tree = readLevel(tokens, { i: 0 }, null)
    const ps = info.style === 'powershell' || /<(String|Int|Switch|Object|Hashtable|DateTime|UInt|ScriptBlock|PSCredential)/.test(form)
    const usesAngles = !ps && /<[A-Za-z][\w.-]*>/.test(form)
    const shortFlags = new Set((info.options || []).map((o) => o.short).filter(Boolean))
    const extras = [] // variable details the template needs (flag clusters)
    let seenName = false

    // One word: a literal, a flag or a value.
    const word = (text, ctx) => {
      if (isFlag(text)) {
        // --opt=VALUE, --opt[=VALUE], -u<mode>
        const eq = text.match(/^(-{1,2}[\w?-]+)(\[?=)([^\]]+)\]?$/)
        if (eq) {
          const value = `<${placeholder(eq[3])}>`
          return eq[2] === '[=' ? `${eq[1]}[=${value}]` : `${eq[1]}=${value}`
        }
        const attached = text.match(/^(-{1,2}[\w?-]+)<([^>]+)>$/)
        if (attached) return `${attached[1]}<${placeholder(attached[2])}>`
        return text
      }
      if (/^<.*>$/.test(text)) {
        if (/^<CommonParameters>$/i.test(text)) return ''
        // PowerShell: -Name <String[]> → -Name <name>
        if (ps && ctx.afterFlag) return `<${placeholder(ctx.afterFlag)}>`
        const inner = text.slice(1, -1)
        const choices = inner.split('|').map((s) => s.trim()).filter(Boolean)
        return choices.length > 1 ? `<${choices.join('|')}>` : `<${placeholder(inner)}>`
      }
      if (!seenName) {
        seenName = true
        return text
      }
      // pid|name: a value that can be one thing or another; start|stop: a choice.
      if (/\|/.test(text) && !isFlag(text)) {
        const parts = text.split('|').filter(Boolean)
        if (parts.some(isValueWord)) return `<${parts.map(placeholder).join('_or_')}>`
        return `<${parts.join('|')}>`
      }
      // MODE[,MODE]: a list of one value; the repeat is left out.
      const tail = text.match(/^([^[\]]+)\[([^\]]*)\]$/)
      if (tail) return word(tail[1], ctx)
      const value =
        !usesAngles &&
        !ps &&
        (/^[A-Z][A-Z0-9_-]+$/.test(text) || (ctx.afterFlag && /^[a-z][\w.-]*$/.test(text)) || /_/.test(text) || VALUE_WORDS.has(text.toLowerCase()))
      return value ? `<${placeholder(text)}>` : text.replace(/([[\]<>\\])/g, '\\$1')
    }

    const simple = (items) => items.length === 1 && items[0].type === 'word'

    function sequence(items) {
      const out = []
      let afterFlag = ''
      items.forEach((item, index) => {
        if (item.type === 'more') return
        if (item.type === 'word') {
          const text = word(item.text, { afterFlag })
          afterFlag = isFlag(item.text) ? item.text.replace(/^-+/, '') : ''
          if (text) out.push(text)
          return
        }
        if (item.type === 'choice') {
          const alts = item.alts.filter((a) => a.length)
          const value = alts.find((a) => simple(a) && isValueWord(a[0].text))
          if (value) out.push(`<${placeholder(value[0].text)}>`)
          else if (alts.every(simple)) out.push(`<${alts.map((a) => a[0].text).join('|')}>`)
          else out.push(alts.map(sequence).join(' | '))
          afterFlag = ''
          return
        }
        // [group]
        const text = group(item, items[index + 1])
        afterFlag = ''
        // PowerShell [[-Name] <String[]>]: the flag inside, the type after it.
        if (text) out.push(text)
      })
      return out.join(' ')
    }

    function group(item) {
      const alts = item.alts.filter((a) => a.length)
      if (!alts.length) return ''
      if (alts.length > 1) {
        if (alts.every(simple)) {
          const words = alts.map((a) => a[0].text)
          const value = words.find(isValueWord)
          return value ? `[${placeholder(value)}]` : `[<${words.join('|')}>]`
        }
        return `[${alts.map(sequence).join(' | ')}]`
      }
      const items = alts[0]
      // PowerShell positional parameter: [[-Name] <String[]>]
      if (ps && items[0] && items[0].type === 'group' && items[0].alts.length === 1 && simple(items[0].alts[0]) && isFlag(items[0].alts[0][0].text)) {
        const flag = items[0].alts[0][0].text
        const rest = items.slice(1).filter((i) => i.type === 'word')
        return rest.length ? `[${flag} <${placeholder(flag.replace(/^-+/, ''))}>]` : `[${flag}]`
      }
      // A cluster of one-letter switches, as in ssh's [-46AaCfGgKkMNnqsTtVvXxYy]
      if (simple(items)) {
        const t = items[0].text
        const letters = !ps && t.match(/^-([A-Za-z0-9]{3,})$/)
        // -Olevel: a switch with its value written straight after it
        const attachedValue = letters && t.match(/^-([A-Za-z])([a-z]{3,})$/)
        if (attachedValue && VALUE_WORDS.has(attachedValue[2])) return `[-${attachedValue[1]}<${attachedValue[2]}>]`
        if (letters) {
          const known = [...letters[1]].filter((c) => shortFlags.has(`-${c}`)).length
          // Without the options to check against, a run of letters in mixed
          // case or with digits is a cluster; a plain word (-print) is not.
          const looksLikeCluster = shortFlags.size
            ? known >= Math.ceil(letters[1].length / 2)
            : /[A-Z0-9]/.test(letters[1]) && /[a-z]/.test(letters[1])
          if (looksLikeCluster) {
            extras.push({
              name: 'flags',
              type: 'switches',
              description: `Any of the switches ${[...letters[1]].map((c) => `-${c}`).join(' ')}, written together (e.g. -${letters[1].slice(0, 2)}).`,
              info: [],
            })
            return '[-<flags>]'
          }
        }
        if (/^<CommonParameters>$/i.test(t) || t === '--') return ''
      }
      const inner = sequence(items)
      if (!inner) return ''
      // [FILE] → [file]: an optional value
      const lone = inner.match(/^<([\w.-]+)>$/)
      if (lone) return `[${lone[1]}]`
      return `[${inner}]`
    }

    const template = tree.map(sequence).join(' | ').replace(/\s+/g, ' ').trim()
    return { template, extras }
  }

  // ─── The card ───────────────────────────────────────────────────────
  const card = el('section', 'tool man-import')
  card.append(
    el('h2', '', 'Man page importer'),
    el(
      'div',
      'notes',
      'Paste a man page (man ls | col -b), --help output, PowerShell Get-Help -Full text, or a help harvester dump. The synopsis becomes the Command Template, written as Spell Book templates are (<required>, [optional], [-x] switches, <a|b> choices), and the options become the command\'s Options list. Nothing is saved until you check it in the New Command window and save.',
    ),
  )
  const source = el('textarea', 'man-source')
  source.placeholder = 'LS(1)                      User Commands                      LS(1)\n\nNAME\n       ls - list directory contents\n\nSYNOPSIS\n       ls [OPTION]... [FILE]...\n\nDESCRIPTION\n       -a, --all\n              do not ignore entries starting with .'
  source.spellcheck = false
  source.setAttribute('aria-label', 'Man page or help text')
  card.append(source)

  const dumpRow = el('div', 'tool-row')
  const dumpSelect = el('select')
  dumpRow.append(labelled('Section of the help dump', dumpSelect))
  dumpRow.hidden = true

  const result = el('div', 'man-import-result')
  result.hidden = true
  const fieldsRow = el('div', 'tool-row')
  const titleInput = T.input('Title')
  const platformSelect = el('select')
  fieldsRow.append(labelled('Title', titleInput), labelled('Platform', platformSelect))
  const forms = el('fieldset', 'man-import-forms')
  const templateInput = T.input('Command Template')
  const templateRow = el('div', 'tool-row')
  templateRow.append(labelled('Command Template (edit it here or in the New Command window)', templateInput))
  const preview = el('div', 'man-import-preview')
  preview.setAttribute('aria-label', 'Fields the template makes')
  const summary = el('div', 'man-import-summary')
  const actions = el('div', 'man-import-actions')
  const create = el('button', 'btn', 'Create command…')
  create.type = 'button'
  const status = el('span', 'man-import-summary')
  actions.append(create, status)
  result.append(fieldsRow, forms, templateRow, preview, summary, actions)
  card.append(dumpRow, result)
  grid.prepend(card)

  let info = null
  let extras = []

  function fillPlatforms(style) {
    const list = spells() ? spells().platforms(true) : []
    const wanted =
      style === 'powershell' ? ['PowerShell'] : style === 'cmd' ? ['CMD', 'Windows'] : ['Linux', 'Bash', 'Unix']
    const current = platformSelect.value
    platformSelect.replaceChildren(
      ...list.map((p) => {
        const o = el('option', '', p)
        o.value = p
        return o
      }),
    )
    const pick = list.find((p) => wanted.some((w) => w.toLowerCase() === p.toLowerCase())) || current || list[0]
    if (pick) platformSelect.value = pick
  }

  // What the template makes, as the Spell Book shows it.
  function showPreview() {
    const template = templateInput.value.trim()
    let fields = []
    try {
      fields = spells() ? spells().fields.ofTemplate(template) : []
    } catch {}
    const kinds = {
      required: 'required',
      optional: 'optional',
      conditional: 'with its option',
      choice: 'choice',
      conditionalChoice: 'choice',
      toggle: 'switch',
    }
    preview.textContent = fields.length
      ? fields.map((f) => `${f.type === 'toggle' ? f.flag : f.raw || `<${f.name}>`}  ${kinds[f.type] || f.type}`).join('\n')
      : 'No fields: the command runs as written.'
    create.disabled = !template || !titleInput.value.trim()
  }

  function chooseForm(index) {
    const form = info.forms[index]
    const made = form ? toTemplate(form, info) : { template: info.name, extras: [] }
    templateInput.value = made.template
    extras = made.extras
    showPreview()
  }

  function read() {
    status.textContent = ''
    const text = source.value
    const dump = splitDump(text)
    dumpRow.hidden = !dump.length
    if (dump.length) {
      const before = dumpSelect.value
      dumpSelect.replaceChildren(
        ...dump.map((s, i) => {
          const o = el('option', '', `${s.command} (${s.shell})`)
          o.value = String(i)
          return o
        }),
      )
      if (before && Number(before) < dump.length) dumpSelect.value = before
    }
    const section = dump.length ? dump[Number(dumpSelect.value) || 0] : null
    const body = section ? section.text : text
    if (!body.trim()) {
      result.hidden = true
      info = null
      return
    }
    info = readHelp(body)
    if (section) {
      // The section's own command line, which may name a subcommand.
      info.name = section.command
      if (/powershell/i.test(section.shell)) info.style = 'powershell'
      else if (/cmd/i.test(section.shell)) info.style = 'cmd'
    }
    result.hidden = false
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
    titleInput.value = info.summary ? `${cap(info.summary.replace(/\.$/, ''))} (${info.name})` : info.name
    fillPlatforms(info.style)
    forms.replaceChildren()
    if (info.forms.length > 1) {
      forms.append(el('legend', '', 'Synopsis: which form becomes the template?'))
      info.forms.forEach((form, i) => {
        const label = el('label')
        const radio = el('input')
        radio.type = 'radio'
        radio.name = 'man-import-form'
        radio.value = String(i)
        radio.checked = i === 0
        radio.addEventListener('change', () => chooseForm(i))
        label.append(radio, el('span', '', form))
        forms.append(label)
      })
    }
    forms.hidden = info.forms.length < 2
    chooseForm(0)
    const n = info.options.length
    summary.replaceChildren(
      document.createTextNode(
        `${n} option${n === 1 ? '' : 's'} found${n ? ' (they go to the Options list; the Edit window can add any of them to the template)' : ''}.${info.forms.length ? '' : ' No synopsis or usage line: the template is just the command name.'}`,
      ),
    )
    if (info.example) {
      summary.append(document.createTextNode(' Example: '), el('code', '', info.example))
    }
  }

  let timer = null
  source.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(read, 250)
  })
  dumpSelect.addEventListener('change', read)
  templateInput.addEventListener('input', showPreview)
  titleInput.addEventListener('input', showPreview)

  create.addEventListener('click', () => {
    if (!info || !spells()) return
    const template = templateInput.value.trim()
    const variables = spells().fields.placeholders(template)
    const notes = info.description ? `From the ${info.style === 'powershell' ? 'Get-Help text' : info.style === 'man' ? 'man page' : 'help text'}:\n\n${info.description}` : ''
    const entry = {
      id: '',
      title: titleInput.value.trim(),
      platform: platformSelect.value,
      tags: [],
      description: info.summary ? info.summary.charAt(0).toUpperCase() + info.summary.slice(1) : '',
      command: template,
      variables,
      variableDetails: [...extras.filter((x) => variables.includes(x.name)), ...info.options],
      example: info.example,
      notes,
    }
    spells().edit(
      'command',
      {
        onSave(saved) {
          status.replaceChildren(
            document.createTextNode(`Saved “${saved.title}”. `),
            Object.assign(el('a', '', 'Open it in the Spell Book'), { href: `#/command/${encodeURIComponent(saved.id)}` }),
          )
        },
      },
      entry,
    )
    // openModal() titles it "Edit Command" when given an entry.
    const heading = document.getElementById('modal-title')
    if (heading) heading.textContent = 'New Command'
  })

  // For checking by hand or from the console.
  window.ManImport = { readHelp, toTemplate, splitDump }
})()
