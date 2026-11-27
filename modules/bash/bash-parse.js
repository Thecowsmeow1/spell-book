/*
 * Reads pasted or uploaded help text for the Bash page (modules/bash): man
 * pages (man ls > ls.txt), --help output and Bash's own help (help cd). No
 * page code here. window.SpellBookBashParse:
 *   split(text)          the pages in a text that holds one or several
 *   parse(text, name)    { name, summary, synopsis, description, options,
 *                          subcommands, examples }
 * Manuals are free text, so it reads the usual layouts; the whole text is kept
 * by the page for whatever is missed.
 */
;(() => {
  // man without col -b marks bold and underline with backspaces; terminals
  // add colors; man breaks words with a typographic hyphen.
  const clean = (text) =>
    String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/.\x08/g, '')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/‐\n\s*/g, '')
      .replace(/[‐−]/g, '-')
      .replace(/\t/g, '        ')

  // The line at the top of each man page: "LS(1)   User Commands   LS(1)".
  const PAGE_HEAD = /^(\S+\(\d[a-z]*\))\s{2,}(?:.*\s)?\1\s*$/

  function split(text) {
    const lines = clean(text).split('\n')
    const starts = lines.map((line, i) => (PAGE_HEAD.test(line) ? i : -1)).filter((i) => i >= 0)
    if (starts.length < 2) return [lines.join('\n').trim()].filter(Boolean)
    // Anything before the first header belongs to the first page.
    starts[0] = 0
    return starts.map((start, i) => lines.slice(start, starts[i + 1]).join('\n').trim())
  }

  const indentOf = (line) => line.length - line.trimStart().length
  const HEADING = /^[A-Z][A-Z0-9'()]*(?:[ ,/&-]+[A-Z0-9'()]+)*:?$/

  // A man page's sections: [name, lines]. Text without headings is one ''.
  function sectionsOf(lines) {
    const sections = [['', []]]
    lines.forEach((line) => {
      if (HEADING.test(line)) sections.push([line.replace(/:$/, ''), []])
      else sections[sections.length - 1][1].push(line)
    })
    return sections
  }

  const dedent = (lines) => {
    const used = lines.filter((l) => l.trim())
    const base = used.length ? Math.min(...used.map(indentOf)) : 0
    return lines.map((l) => l.slice(base)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  const joined = (text) =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n')

  // "-a, --all", "-w, --width=COLS", "--color[=WHEN]", "-o <file>",
  // "--[no-]verify" → { names, argument }, or null if it isn't a flag list.
  function flags(spec) {
    const names = []
    let argument = ''
    const parts = spec.trim().replace(/[,:]$/, '').split(/\s*(?:,|\s\|\s|\sor\s)\s*(?=-)/)
    for (const part of parts) {
      const m = part.match(/^(-{1,2}(?:\[no-\])?[A-Za-z0-9?@#!][\w+.-]*|-{1,2}[?#@])(.*)$/)
      if (!m) return null
      const rest = m[2]
      // What follows a flag: =VALUE, [=VALUE], [VALUE], <value> or one or two
      // words for it.
      if (rest && !/^(\[?=.*|\[[^\]]*\]|(?:\s+(?:<[^>]*>|\[[^\]]*\]|\{[^}]*\}|[\w.:|/+=-]+(?:\.\.\.)?)){1,2})$/.test(rest)) return null
      if (m[1].includes('[no-]')) names.push(m[1].replace('[no-]', ''), m[1].replace('[no-]', 'no-'))
      else names.push(m[1])
      const value = rest.trim().replace(/^\[?=/, '').replace(/^[<[{]|[>\]}]$/g, '')
      // A sentence that starts with flags isn't a flag list.
      if (/\s-|\.\s|[^.]\.$/.test(value)) return null
      if (value && !argument) argument = value
    }
    const optional = /\[=/.test(spec) || /\s\[/.test(spec)
    return names.length ? { names: [...new Set(names)], argument, optional } : null
  }

  function readOptions(lines) {
    const options = []
    let current = null
    let blank = true
    const finish = () => {
      if (!current) return
      current.description = joined(dedent(current.lines))
      delete current.lines
      delete current.indent
      options.push(current)
      current = null
    }
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) {
        blank = true
        if (current) current.lines.push('')
        return
      }
      const indent = indentOf(line)
      // A flag line deeper than the one before is part of its description,
      // unless a blank line sets it apart (--help indents long-only flags).
      if (trimmed.startsWith('-') && (!current || indent <= current.indent + (blank ? 8 : 5))) {
        const [spec, ...rest] = trimmed.split(/\s{2,}/)
        let header = flags(spec)
        let inline = rest.join(' ')
        if (!header) {
          // "--help display this help": one space before the description.
          const m = spec.match(/^((?:-{1,2}[\w?][\w-]*(?:\[?=\S+)?,?\s*)+?)\s+([a-zA-Z(].*\s.*)$/)
          header = m && flags(m[1])
          if (header) inline = [m[2], ...rest].join(' ')
        }
        if (!header && blank && trimmed.length < 60 && indentOf(lines[i + 1] || '') > indent) {
          // "-exec command ;" and other shapes of their own.
          const word = trimmed.match(/^-{1,2}[\w?]+[\w-]*/)
          if (word) header = { names: [word[0]], argument: trimmed.slice(word[0].length).trim(), optional: false }
        }
        if (header) {
          finish()
          current = { ...header, indent, lines: inline ? [' '.repeat(indent + 8) + inline] : [] }
          blank = false
          return
        }
      }
      if (current) {
        // Text at or left of the flags ends the option.
        if (indent <= current.indent) finish()
        else current.lines.push(line)
      }
      blank = false
    })
    finish()
    return options
  }

  // "install  Install packages" under a "Commands:" heading, and man's
  // "update (apt-get(8))" lines under COMMANDS or DESCRIPTION.
  function readSubcommands(lines, sections, isMan) {
    const found = new Map()
    const add = (name, text) => {
      if (!found.has(name)) found.set(name, { name, description: text.trim() })
    }
    let inList = false
    // Only --help text: in a man page such a line is ordinary prose.
    ;(isMan ? [] : lines).forEach((line) => {
      if (/commands?\b[^.]*:\s*$/i.test(line)) inList = true
      else if (inList && line.trim()) {
        const m = line.match(/^\s{1,12}([a-z][\w-]*)(?:\s+-\s+|\s{2,})(\S.*)$/)
        if (m) add(m[1], m[2])
        else if (!/^\s/.test(line)) inList = /commands?/i.test(line)
      }
    })
    sections.forEach(([title, body]) => {
      if (!/COMMAND|^DESCRIPTION$/.test(title)) return
      body.forEach((line, i) => {
        const m =
          line.match(/^\s{3,8}([a-z][\w-]*(?:, [a-z][\w-]*)*) \([a-z][\w.-]*\(\d\)\)\s*$/) ||
          (/COMMAND/.test(title) && line.match(/^\s{3,8}([a-z][\w-]*)(?: [A-Z[<.].*)?$/))
        const next = body[i + 1] || ''
        if (m && indentOf(next) > indentOf(line)) m[1].split(', ').forEach((name) => add(name, next.trim()))
      })
    })
    return [...found.values()]
  }

  function parse(text, givenName) {
    const lines = clean(text).trim().split('\n')
    const isMan = lines.some((l) => l === 'NAME') || PAGE_HEAD.test(lines[0] || '')
    // Bash's help: "cd: cd [-L|-P] [dir]", then an indented description.
    const builtin = !isMan && (lines[0] || '').match(/^([\w.:[\]-]+): (\1(?:\s.*)?)$/)
    const sections = sectionsOf(isMan ? lines.filter((l, i) => !(i === 0 && PAGE_HEAD.test(l))) : lines)
    const section = (...titles) => sections.filter(([t]) => titles.includes(t)).flatMap(([, body]) => body)

    let name = ''
    let summary = ''
    let synopsis = ''
    let description = ''
    if (isMan) {
      const line = joined(dedent(section('NAME'))).split('\n')[0] || ''
      const m = line.match(/^(.+?)\s+(?:-|–|—)\s+(.*)$/)
      name = (m ? m[1] : line).split(',')[0].trim().split(/\s+/)[0] || ''
      summary = m ? m[2] : ''
      synopsis = dedent(section('SYNOPSIS'))
      const body = dedent(section('DESCRIPTION'))
      // The description stops where the options start.
      description = joined(body.split(/\n\s*-{1,2}[A-Za-z0-9]/)[0]).slice(0, 3000)
      // git-commit(1) is the page of "git commit".
      const words = synopsis.split(/\s+/)
      if (name.includes('-') && `${words[0]}-${words[1]}` === name) name = `${words[0]} ${words[1]}`
    } else if (builtin) {
      name = builtin[1]
      synopsis = builtin[2]
      const body = lines.slice(1)
      const parts = joined(dedent(body)).split('\n\n')
      summary = parts[0] || ''
      const end = body.findIndex((l) => /^\s*Options:/.test(l))
      description = joined(dedent(body.slice(1, end < 0 ? undefined : end))).slice(0, 3000)
    } else {
      const at = lines.findIndex((l) => /^\s*usage:/i.test(l))
      if (at >= 0) {
        const usage = [lines[at].replace(/^\s*usage:\s*/i, '')]
        for (let i = at + 1; i < lines.length && /^\s*(or:|\s{4,}[^-\s])/i.test(lines[i]); i += 1) {
          usage.push(lines[i].replace(/^\s*(or:)?\s*/i, ''))
        }
        synopsis = usage.filter(Boolean).join('\n')
        name = (synopsis.split(/\s+/)[0] || '').replace(/^.*\//, '').replace(/:$/, '')
      }
      const prose = lines.filter((l, i) => i !== at && /^[A-Za-z].*\s/.test(l) && !/^usage|:\s*$/i.test(l))
      summary = (prose[0] || '').trim()
      description = prose.slice(0, 6).join(' ').trim()
    }

    const skip = ['NAME', 'SYNOPSIS', 'SEE ALSO', 'AUTHOR', 'AUTHORS', 'COPYRIGHT', 'REPORTING BUGS', 'HISTORY', 'EXAMPLES', 'EXAMPLE']
    const options = readOptions(
      builtin ? lines.slice(1) : sections.filter(([t]) => !skip.includes(t)).flatMap(([, body]) => ['', ...body]),
    )
    // Bash's help lists "  -L        force …" the same way, so one reader does.
    const seen = new Map()
    options.forEach((o) => {
      const key = o.names.join(' ')
      const known = seen.get(key)
      if (!known || o.description.length > known.description.length) seen.set(key, o)
    })

    return {
      name: String(givenName || '').trim() || name,
      summary,
      synopsis,
      description,
      options: [...seen.values()],
      subcommands: readSubcommands(lines, sections, isMan),
      examples: dedent(section('EXAMPLES', 'EXAMPLE')),
    }
  }

  window.SpellBookBashParse = { split, parse, clean }
})()
