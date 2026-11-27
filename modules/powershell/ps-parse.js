/*
 * Reads pasted or uploaded PowerShell help for the PowerShell page: the text of
 * Get-Help <name> -Full (one command or several in a file), of
 * Get-Command <name> -Syntax, and Get-Alias lines. No page code here.
 * window.SpellBookPSParse:
 *   split(text)   { pages: [{ name, text, syntaxOnly }], aliases: { alias: name } }
 *   parse(text)   one command, shaped as ps-export.ps1 writes it
 */
;(() => {
  const clean = (text) =>
    String(text || '')
      .replace(/^﻿/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\x1b\[[0-9;]*m/g, '')
  const COMMON_END = '[<CommonParameters>]'
  const HEADING = /^[A-Z][A-Z ]+$/

  // The lines of a help text between a heading and the next one.
  function section(lines, title) {
    const start = lines.findIndex((l) => l.trim() === title && !/^\s/.test(l))
    if (start < 0) return []
    let end = start + 1
    while (end < lines.length && !HEADING.test(lines[end])) end += 1
    return lines.slice(start + 1, end)
  }

  const dedent = (lines) => {
    const used = lines.filter((l) => l.trim())
    const base = used.length ? Math.min(...used.map((l) => l.length - l.trimStart().length)) : 0
    return lines.map((l) => l.slice(base)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  // Syntax lines wrap: each set starts with the command's name.
  function syntaxSets(lines) {
    const sets = []
    let open = false
    lines.forEach((line) => {
      const text = line.trim()
      if (!text) return
      const starts = !open && /^[A-Za-z][\w.]*(?:-[\w.]+)?(?:\s|$)/.test(text)
      if (starts) sets.push(text)
      else if (sets.length) sets[sets.length - 1] += ` ${text}`
      open = sets.length > 0 && !sets[sets.length - 1].endsWith(COMMON_END)
    })
    return sets
  }

  const shortType = (text) => text.replace(/(?:[A-Za-z_]\w*\.)+(?=[A-Z])/g, '')

  // [[-A] <T>] optional by position, [-A] <T> required by position,
  // [-A <T>] optional, -A <T> required, [-A] switch.
  const PARAMETER = /(\[?)(\[?)-([A-Za-z]\w*)(\]?)(?:\s+(<[^>]*>|\{[^}]*\}))?(\]?)/g
  function readSet(text) {
    const list = []
    let position = 0
    for (const [, outer, inner, name, closed, value] of text.matchAll(PARAMETER)) {
      let mandatory = 1
      let positional = false
      if (inner) {
        mandatory = 0
        positional = true
      } else if (outer && closed && value) positional = true
      else if (outer) mandatory = 0
      const values = value && value.startsWith('{') ? value.slice(1, -1).split('|').map((v) => v.trim()).filter(Boolean) : []
      const type = value && !values.length ? shortType(value.slice(1, -1)) : ''
      list.push({ name, mandatory, position: positional ? position++ : -1, type, values, sw: !value || /^(SwitchParameter|switch)$/i.test(type) })
    }
    return list
  }

  function readParameters(lines) {
    const found = []
    let current = null
    lines.forEach((line) => {
      const head = line.match(/^ {4}-([A-Za-z]\w*)(?:\s+([[<{].*))?\s*$/)
      if (head) {
        current = { name: head[1], type: head[2] || '', body: [], facts: {} }
        found.push(current)
      } else if (/^\s*<CommonParameters>/.test(line)) current = null
      else if (current) {
        const fact = line.match(/^\s+(Required\?|Position\?|Default value|Accept pipeline input\?|Accept wildcard characters\?|Aliases|Dynamic\?|Parameter set name)(?:\s{2,}(.*))?$/)
        if (fact) current.facts[fact[1]] = (fact[2] || '').trim()
        else current.body.push(line)
      }
    })
    return found
  }

  function readExamples(lines) {
    const examples = []
    let current = null
    lines.forEach((line) => {
      const head = line.match(/^\s*-{3,}\s*(example\b.*?)\s*-{3,}\s*$/i)
      if (head) {
        current = { title: head[1], body: [] }
        examples.push(current)
      } else if (HEADING.test(line)) current = null
      else if (current) current.body.push(line)
    })
    return examples.map((e) => [e.title, '', dedent(e.body)])
  }

  function parse(text) {
    const lines = clean(text).split('\n')
    const isHelp = lines.includes('NAME')
    const help = isHelp ? section(lines, 'SYNTAX') : []
    // Syntax from Get-Command, on its own or added after a help text.
    const extra = lines.filter((l) => !/^\s/.test(l) && l.trim().endsWith(COMMON_END))
    const setTexts = [...new Set([...syntaxSets(help), ...extra.map((l) => l.trim())])]
    const name = (isHelp ? (section(lines, 'NAME').find((l) => l.trim()) || '').trim() : (setTexts[0] || '').split(/\s+/)[0]).split(/\s+/)[0]

    const params = {}
    const entry = (key) => {
      const known = Object.keys(params).find((n) => n.toLowerCase() === key.toLowerCase())
      return params[known || key] || (params[key] = { t: '', sw: true })
    }
    const sets = []
    const seen = new Set()
    setTexts.forEach((set) => {
      const list = readSet(set.slice(set.indexOf(' ') + 1))
      list.forEach((p) => {
        if (/^(Verbose|Debug)$/.test(p.name)) return
        const known = entry(p.name)
        if (!p.sw) {
          known.sw = false
          known.t = known.t || p.type || p.name
        }
        if (p.values.length) known.v = [...new Set([...(known.v || []), ...p.values])]
      })
      const p = list.map((x) => [x.name, x.mandatory, x.position])
      const key = JSON.stringify(p)
      if (!seen.has(key)) {
        seen.add(key)
        sets.push({ n: `Set ${sets.length + 1}`, def: !sets.length, p })
      }
    })

    readParameters(section(lines, 'PARAMETERS')).forEach((read) => {
      const p = entry(read.name)
      const type = shortType(read.type.replace(/^\[?[<{]|[>}]\]?$/g, ''))
      const isSwitch = /^(SwitchParameter|switch)$/i.test(type)
      if (type && !/\|/.test(type)) p.t = type
      if (read.type) p.sw = isSwitch
      const description = dedent(read.body)
      if (description) p.d = description
      const fallback = read.facts['Default value']
      if (fallback && !/^(none|false)$/i.test(fallback)) p.df = fallback
      if (/^true/i.test(read.facts['Accept pipeline input?'] || '')) p.pipe = true
      const aliases = (read.facts.Aliases || '').split(/[,;]\s*/).filter((a) => a && !/^none$/i.test(a))
      if (aliases.length) p.a = aliases
      // Help lists allowed values as "- `Value`" lines.
      if (!p.sw && !p.v && /values?\b/i.test(description)) {
        const values = [...description.matchAll(/^\s*-\s+`([\w$.]+)`\s*(?:[.:]|-\s|$)/gm)].map((m) => m[1])
        if (values.length > 1) p.v = [...new Set(values)]
      }
    })
    // Get-Help's syntax can leave parameters out (Copy-Item's -Path), and
    // number the rest wrongly: each parameter's own details fill that in.
    if (!sets.length) sets.push({ n: 'Set 1', def: true, p: [] })
    const positions = new Map(
      readParameters(section(lines, 'PARAMETERS'))
        .filter((read) => /^\d+$/.test(read.facts['Position?'] || ''))
        .map((read) => [read.name.toLowerCase(), Number(read.facts['Position?'])]),
    )
    Object.keys(params).forEach((key) => {
      if (sets.some((set) => set.p.some((x) => x[0].toLowerCase() === key.toLowerCase()))) return
      const at = positions.has(key.toLowerCase()) ? positions.get(key.toLowerCase()) : -1
      sets.forEach((set) => {
        // Its place is taken from whatever the syntax put there.
        if (at >= 0) set.p.forEach((x) => x[2] >= at && (x[2] += 1))
        set.p.push([key, 0, at])
      })
    })

    const links = section(lines, 'RELATED LINKS').join('\n')
    // A long address wraps onto the next line.
    const link = links.match(/Online Version:?\s*(https?:\/\/\S+(?:\n\s+[^\s:]+(?=\n|$))?)/)
    return {
      n: name,
      m: '',
      s: dedent(isHelp ? section(lines, 'SYNOPSIS') : []).replace(/\s*\n\s*/g, ' '),
      d: dedent(section(lines, 'DESCRIPTION')),
      u: link ? link[1].replace(/\s+/g, '') : '',
      a: [],
      sets,
      params,
      ex: readExamples(lines),
    }
  }

  function split(text) {
    const lines = clean(text).split('\n')
    const aliases = {}
    lines.forEach((line) => {
      const m = line.match(/^\s*Alias\s+(\S+)\s+->\s+(\S+)/)
      if (m) aliases[m[1]] = m[2]
    })
    const starts = lines.map((l, i) => (l === 'NAME' ? i : -1)).filter((i) => i >= 0)
    const parts = starts.map((start, i) => ({ text: lines.slice(start, starts[i + 1]).join('\n').trim(), syntaxOnly: false }))
    // Get-Command -Syntax lines before the first help text, or on their own.
    const loose = new Map()
    lines.slice(0, starts.length ? starts[0] : lines.length).forEach((line) => {
      const m = !/^\s/.test(line) && line.trim().endsWith(COMMON_END) && line.match(/^([A-Za-z][\w.-]*)\s/)
      if (m) loose.set(m[1], [...(loose.get(m[1]) || []), line.trim()])
    })
    loose.forEach((list) => parts.push({ text: list.join('\n'), syntaxOnly: true }))
    const pages = parts.map((part) => ({ ...part, name: parse(part.text).n })).filter((p) => /^[A-Za-z][\w.-]*$/.test(p.name))
    return { pages, aliases }
  }

  const COMMON = ['Verbose', 'Debug', 'ErrorAction', 'WarningAction', 'InformationAction', 'ErrorVariable', 'WarningVariable', 'OutVariable', 'OutBuffer', 'PipelineVariable', 'InformationVariable']

  window.SpellBookPSParse = { split, parse, COMMON }
})()
