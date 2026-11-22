// ─── Tools page (modules/tools) ────────────────────────────────────────
// Small helpers that need no data: a number base converter, a crontab
// interpreter, a regex tester with a plain-English breakdown of the pattern,
// and a generator for help-harvester scripts whose output the Man page
// importer (man-import.js) turns into commands. Everything runs locally.
// Ported from spell-book-hk's js/tools.js.
;(() => {
  const grid = document.getElementById('tools-grid')
  if (!grid) return

  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  const labelled = (text, control) => {
    const label = el('label')
    label.append(el('span', '', text), control)
    return label
  }
  const input = (placeholder, value = '') => {
    const i = el('input')
    i.type = 'text'
    i.placeholder = placeholder
    i.value = value
    i.autocomplete = 'off'
    i.spellcheck = false
    return i
  }
  const tool = (title, blurb) => {
    const card = el('section', 'tool')
    card.append(el('h2', '', title), el('div', 'notes', blurb))
    grid.append(card)
    return card
  }
  const output = (card) => {
    const out = el('div', 'tool-output')
    card.append(out)
    return out
  }
  const fail = (out, message) => {
    out.className = 'tool-output error'
    out.textContent = message
  }
  // Copies, and says so on the button for a moment.
  const copyToClipboard = (button, text) => {
    const done = (label) => {
      button.textContent = label
      setTimeout(() => (button.textContent = 'Copy'), 1500)
    }
    if (!navigator.clipboard) return done('Copy failed')
    navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Copy failed'))
  }
  const copyButton = (text) => {
    const b = el('button', 'btn secondary sm', 'Copy')
    b.type = 'button'
    b.addEventListener('click', () => copyToClipboard(b, typeof text === 'function' ? text() : text))
    return b
  }
  // Shared with the other scripts of this module.
  window.SpellBookTools = { el, labelled, input, tool, output, fail, copyButton }

  // ── Number base converter ──────────────────────────────────────────
  {
    const card = tool(
      'Number converter',
      'Decimal, hexadecimal, octal and binary; type in any box. Prefixes 0x, 0o, 0b and underscores are accepted. Big numbers are fine.',
    )
    const boxes = {
      dec: input('decimal, e.g. 4688'),
      hex: input('hex, e.g. 0x1250'),
      oct: input('octal, e.g. 0o11120'),
      bin: input('binary, e.g. 0b1001001010000'),
    }
    const row = el('div', 'tool-row')
    row.append(
      labelled('Decimal', boxes.dec),
      labelled('Hex', boxes.hex),
      labelled('Octal', boxes.oct),
      labelled('Binary', boxes.bin),
    )
    card.append(row)
    const out = output(card)
    const radix = { dec: 10, hex: 16, oct: 8, bin: 2 }
    const parse = (text, base) => {
      let t = text.trim().replace(/_/g, '').toLowerCase()
      let negative = false
      if (t.startsWith('-')) {
        negative = true
        t = t.slice(1)
      }
      t = t.replace(/^(0x|0o|0b)/, '')
      if (!t) return null
      const digits = { 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/, 8: /^[0-7]+$/, 2: /^[01]+$/ }[base]
      if (!digits.test(t)) throw new Error(`Not a valid ${{ 10: 'decimal', 16: 'hex', 8: 'octal', 2: 'binary' }[base]} number.`)
      const prefix = { 16: '0x', 8: '0o', 2: '0b', 10: '' }[base]
      const value = BigInt(prefix + t)
      return negative ? -value : value
    }
    const render = (value) => {
      const abs = value < 0n ? -value : value
      const sign = value < 0n ? '-' : ''
      const bits = abs === 0n ? 1 : abs.toString(2).length
      const lines = [`${bits} bit${bits === 1 ? '' : 's'}`]
      if (abs < 0x110000n && abs >= 0x20n) lines.push(`Unicode: ${String.fromCodePoint(Number(abs))}`)
      if (abs <= 0xffffffffffffffffn) {
        const hex = abs.toString(16).padStart(Math.ceil(bits / 8) * 2, '0')
        const bytes = hex.match(/../g)
        lines.push(`Bytes big-endian: ${bytes.join(' ')}`)
        lines.push(`Bytes little-endian: ${[...bytes].reverse().join(' ')}`)
      }
      if (value < 0n && abs <= 0x80000000n) lines.push(`Two's complement 32-bit: 0x${((1n << 32n) + value).toString(16)}`)
      if (value >= 0x80000000n && value <= 0xffffffffn) lines.push(`As signed 32-bit: ${value - (1n << 32n)}`)
      out.className = 'tool-output'
      out.textContent = `${sign}${abs.toString(10)}` === value.toString() ? lines.join('\n') : lines.join('\n')
    }
    Object.entries(boxes).forEach(([key, box]) => {
      box.addEventListener('input', () => {
        try {
          const value = parse(box.value, radix[key])
          if (value === null) {
            Object.entries(boxes).forEach(([k, b]) => {
              if (k !== key) b.value = ''
            })
            out.textContent = ''
            return
          }
          const sign = value < 0n ? '-' : ''
          const abs = value < 0n ? -value : value
          Object.entries(boxes).forEach(([k, b]) => {
            if (k !== key) b.value = sign + abs.toString(radix[k])
          })
          render(value)
        } catch (err) {
          fail(out, err.message)
        }
      })
    })
  }

  // ── Crontab interpreter ────────────────────────────────────────────
  {
    const card = tool(
      'Crontab interpreter',
      'Paste a schedule (the five fields, or a whole crontab line) to read it in English and see the next runs in local time.',
    )
    const box = input('*/5 * * * * /usr/bin/check.sh', '')
    box.classList.add('mono')
    const row = el('div', 'tool-row')
    row.append(labelled('Schedule', box))
    card.append(row)
    const out = output(card)
    const NAMES = {
      month: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
      dow: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    }
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const FIELDS = [
      { key: 'minute', min: 0, max: 59 },
      { key: 'hour', min: 0, max: 23 },
      { key: 'dom', min: 1, max: 31 },
      { key: 'month', min: 1, max: 12, names: NAMES.month, nameBase: 1 },
      { key: 'dow', min: 0, max: 7, names: NAMES.dow, nameBase: 0 },
    ]
    const SPECIAL = {
      '@yearly': '0 0 1 1 *',
      '@annually': '0 0 1 1 *',
      '@monthly': '0 0 1 * *',
      '@weekly': '0 0 * * 0',
      '@daily': '0 0 * * *',
      '@midnight': '0 0 * * *',
      '@hourly': '0 * * * *',
    }
    const number = (text, field) => {
      const t = text.toLowerCase()
      if (field.names) {
        const i = field.names.indexOf(t.slice(0, 3))
        if (i >= 0 && t.length === 3) return i + field.nameBase
      }
      if (!/^\d+$/.test(t)) throw new Error(`"${text}" is not a number for the ${field.key} field.`)
      return Number(t)
    }
    // One field → { any, values: Set, parts: [{from,to,step,all}] }
    const parseField = (text, field) => {
      const parts = []
      const values = new Set()
      text.split(',').forEach((piece) => {
        if (!piece) throw new Error(`Empty list entry in the ${field.key} field.`)
        const [rangeText, stepText] = piece.split('/')
        const step = stepText === undefined ? 1 : Number(stepText)
        if (!(step >= 1) || !Number.isInteger(step)) throw new Error(`Bad step "${stepText}" in the ${field.key} field.`)
        let from
        let to
        let all = false
        if (rangeText === '*' || rangeText === '?') {
          from = field.min
          to = field.max
          all = true
        } else if (rangeText.includes('-')) {
          const [a, b] = rangeText.split('-')
          from = number(a, field)
          to = number(b, field)
        } else {
          from = number(rangeText, field)
          to = stepText === undefined ? from : field.max
        }
        if (from < field.min || to > field.max || from > to) throw new Error(`"${piece}" is outside ${field.min}-${field.max} for the ${field.key} field.`)
        parts.push({ from, to, step, all, text: piece })
        for (let v = from; v <= to; v += step) values.add(field.key === 'dow' && v === 7 ? 0 : v)
      })
      return { any: parts.length === 1 && parts[0].all && parts[0].step === 1, values, parts }
    }
    const parseCron = (line) => {
      let text = line.trim()
      if (!text) return null
      const special = text.split(/\s+/)[0].toLowerCase()
      if (special === '@reboot') return { reboot: true }
      if (SPECIAL[special]) text = SPECIAL[special] + text.slice(special.length)
      const tokens = text.split(/\s+/)
      if (tokens.length < 5) throw new Error('A schedule needs five fields: minute hour day-of-month month day-of-week.')
      const fields = {}
      FIELDS.forEach((f, i) => {
        fields[f.key] = parseField(tokens[i], f)
      })
      return { fields, command: tokens.slice(5).join(' ') }
    }
    const two = (n) => String(n).padStart(2, '0')
    const nameOf = (field, v) => (field === 'month' ? MONTHS[v - 1] : field === 'dow' ? DAYS[v % 7] : String(v))
    const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)
    const describeField = (key, parsed, unit, plural) => {
      if (parsed.any) return ''
      const pieces = parsed.parts.map((p) => {
        const name = (v) => nameOf(key, v)
        if (p.all && p.step > 1) return `every ${p.step}${ordinalSuffix(p.step)} ${unit}`
        if (p.step > 1) return `every ${p.step}${ordinalSuffix(p.step)} ${unit} from ${name(p.from)} through ${name(p.to)}`
        if (p.from !== p.to) return `every ${unit} from ${name(p.from)} through ${name(p.to)}`
        return name(p.from)
      })
      const plain = parsed.parts.every((p) => p.step === 1 && p.from === p.to)
      return plain ? `${plural && parsed.parts.length > 1 ? plural : unit} ${list(pieces)}` : list(pieces)
    }
    const ordinalSuffix = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
    const describe = (cron) => {
      if (cron.reboot) return 'At every reboot.'
      const f = cron.fields
      const parts = []
      const single = (p) => p.parts.length === 1 && p.parts[0].step === 1 && p.parts[0].from === p.parts[0].to
      if (single(f.minute) && single(f.hour)) {
        parts.push(`At ${two(f.hour.parts[0].from)}:${two(f.minute.parts[0].from)}`)
      } else {
        const m = f.minute.any ? 'every minute' : describeField('minute', f.minute, 'minute', 'minutes')
        parts.push(`At ${m}`)
        if (!f.hour.any) parts.push(`past ${describeField('hour', f.hour, 'hour', 'hours')}`)
      }
      const dom = describeField('dom', f.dom, 'day-of-month', 'days-of-month')
      const dow = f.dow.any ? '' : describeField('dow', f.dow, 'day', 'days').replace(/^days? /, '')
      if (dom && dow) parts.push(`on ${dom} and on ${dow} (either matches)`)
      else if (dom) parts.push(`on ${dom}`)
      else if (dow) parts.push(`on ${dow}`)
      if (!f.month.any) parts.push(`in ${describeField('month', f.month, 'month', 'months').replace(/^months? /, '')}`)
      return `${parts.join(' ')}.`
    }
    // Next runs: walk days, then hours, then minutes, matching the sets.
    const nextRuns = (cron, count = 5) => {
      if (cron.reboot) return []
      const f = cron.fields
      const runs = []
      const now = new Date()
      let day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const dayMatches = (d) => {
        const monthOk = f.month.values.has(d.getMonth() + 1)
        if (!monthOk) return false
        const domOk = f.dom.values.has(d.getDate())
        const dowOk = f.dow.values.has(d.getDay())
        if (f.dom.any && f.dow.any) return true
        if (f.dom.any) return dowOk
        if (f.dow.any) return domOk
        return domOk || dowOk // both restricted: cron runs when either matches
      }
      const hours = [...f.hour.values].sort((a, b) => a - b)
      const minutes = [...f.minute.values].sort((a, b) => a - b)
      for (let i = 0; i < 366 * 5 && runs.length < count; i += 1) {
        if (dayMatches(day)) {
          for (const h of hours) {
            for (const m of minutes) {
              const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
              if (t > now) {
                runs.push(t)
                if (runs.length >= count) break
              }
            }
            if (runs.length >= count) break
          }
        }
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      }
      return runs
    }
    const render = () => {
      try {
        const cron = parseCron(box.value)
        if (!cron) {
          out.textContent = ''
          return
        }
        out.className = 'tool-output'
        out.replaceChildren()
        out.append(el('div', '', describe(cron)))
        if (cron.command) out.append(el('div', 'notes', `Runs: ${cron.command}`))
        const runs = nextRuns(cron)
        if (runs.length) {
          const title = el('div', 'notes', 'Next runs (local time):')
          out.append(title)
          const ul = el('ul', 'usage-list')
          runs.forEach((d) => ul.append(el('li', '', d.toLocaleString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))))
          out.append(ul)
        } else if (!cron.reboot) {
          out.append(el('div', 'notes', 'No run in the next five years (impossible date?).'))
        }
      } catch (err) {
        fail(out, err.message)
      }
    }
    box.addEventListener('input', render)
    window.__cronDescribe = (line) => describe(parseCron(line)) // smoke tests
  }

  // ── Regex interpreter and tester ───────────────────────────────────
  {
    const card = tool(
      'Regex interpreter',
      'See what a pattern means, piece by piece, and try it against text. JavaScript syntax; grep -P (PCRE) reads the same, grep -E (POSIX) lacks \\d, \\w, \\s and lookarounds.',
    )
    const pattern = input('pattern, e.g. ^(\\d{1,3}\\.){3}\\d{1,3}$')
    const flags = input('flags: g i m s', 'g')
    const row = el('div', 'tool-row')
    row.append(labelled('Pattern', pattern), labelled('Flags', flags))
    const text = el('textarea')
    text.placeholder = 'Text to test against…'
    text.spellcheck = false
    card.append(row, labelled('Test text', text))
    const breakdown = output(card)
    const matches = output(card)

    const CLASS_WORDS = {
      d: 'a digit (0-9)',
      D: 'anything but a digit',
      w: 'a word character (letter, digit or _)',
      W: 'anything but a word character',
      s: 'whitespace',
      S: 'anything but whitespace',
      b: 'a word boundary',
      B: 'not a word boundary',
      n: 'a newline',
      r: 'a carriage return',
      t: 'a tab',
      f: 'a form feed',
      v: 'a vertical tab',
      0: 'a NUL byte',
    }
    // Reads the pattern into [{ depth, token, meaning }] lines.
    const explain = (src) => {
      const lines = []
      let depth = 0
      let i = 0
      const push = (token, meaning) => lines.push({ depth, token, meaning })
      const quantifier = () => {
        const m = src.slice(i).match(/^(\*|\+|\?|\{(\d+)(,(\d*))?\})(\?)?/)
        if (!m) return ''
        i += m[0].length
        const lazy = m[5] ? ', as few as possible' : ''
        if (m[1] === '*') return `, zero or more times${lazy}`
        if (m[1] === '+') return `, one or more times${lazy}`
        if (m[1] === '?') return `, optionally${lazy}`
        if (m[3] === undefined) return `, exactly ${m[2]} times`
        if (m[4] === '') return `, ${m[2]} or more times${lazy}`
        return `, ${m[2]} to ${m[4]} times${lazy}`
      }
      const escapeMeaning = (ch, rest) => {
        if (CLASS_WORDS[ch]) return CLASS_WORDS[ch]
        if (/[1-9]/.test(ch)) return `what group ${ch} matched (back-reference)`
        if (ch === 'x') return `the character with hex code ${rest.slice(0, 2)}`
        if (ch === 'u') return `the Unicode character ${rest.slice(0, 4)}`
        if (ch === 'k') return 'what a named group matched (back-reference)'
        return `the literal character "${ch}"`
      }
      while (i < src.length) {
        const ch = src[i]
        if (ch === '\\') {
          const next = src[i + 1] || ''
          const rest = src.slice(i + 2)
          let token = `\\${next}`
          let width = 2
          if (next === 'x') width = 4
          else if (next === 'u') width = rest.startsWith('{') ? rest.indexOf('}') + 3 : 6
          else if (next === 'k' && rest.startsWith('<')) width = rest.indexOf('>') + 3
          token = src.slice(i, i + width)
          i += width
          push(token, escapeMeaning(next, rest) + quantifier())
          continue
        }
        if (ch === '[') {
          let j = i + 1
          if (src[j] === '^') j += 1
          if (src[j] === ']') j += 1
          while (j < src.length && src[j] !== ']') {
            if (src[j] === '\\') j += 1
            j += 1
          }
          const token = src.slice(i, j + 1)
          const negated = token.startsWith('[^')
          const body = token.slice(negated ? 2 : 1, -1)
          const items = []
          let k = 0
          while (k < body.length) {
            let item = body[k]
            if (item === '\\') {
              item = body.slice(k, k + 2)
              k += 2
            } else k += 1
            if (body[k] === '-' && k + 1 < body.length) {
              let end = body[k + 1]
              if (end === '\\') end = body.slice(k + 1, k + 3)
              items.push(`${item} through ${end}`)
              k += 1 + end.length
            } else if (item.startsWith('\\') && CLASS_WORDS[item[1]]) items.push(CLASS_WORDS[item[1]])
            else items.push(`"${item}"`)
          }
          i = j + 1
          push(token, `${negated ? 'any character except' : 'one of'}: ${items.join(', ')}${quantifier()}`)
          continue
        }
        if (ch === '(') {
          let token = '('
          let meaning = 'start of a capturing group'
          if (src.startsWith('(?:', i)) {
            token = '(?:'
            meaning = 'start of a group (not captured)'
          } else if (src.startsWith('(?=', i)) {
            token = '(?='
            meaning = 'followed by (lookahead, not consumed)'
          } else if (src.startsWith('(?!', i)) {
            token = '(?!'
            meaning = 'not followed by (negative lookahead)'
          } else if (src.startsWith('(?<=', i)) {
            token = '(?<='
            meaning = 'preceded by (lookbehind)'
          } else if (src.startsWith('(?<!', i)) {
            token = '(?<!'
            meaning = 'not preceded by (negative lookbehind)'
          } else if (src.startsWith('(?<', i)) {
            const end = src.indexOf('>', i)
            token = src.slice(i, end + 1)
            meaning = `start of a capturing group named "${src.slice(i + 3, end)}"`
          }
          i += token.length
          push(token, meaning)
          depth += 1
          continue
        }
        if (ch === ')') {
          depth = Math.max(0, depth - 1)
          i += 1
          push(')', `end of group${quantifier()}`)
          continue
        }
        if (ch === '|') {
          i += 1
          push('|', 'or')
          continue
        }
        if (ch === '^') {
          i += 1
          push('^', 'start of the text (or line, with the m flag)')
          continue
        }
        if (ch === '$') {
          i += 1
          push('$', 'end of the text (or line, with the m flag)')
          continue
        }
        if (ch === '.') {
          i += 1
          push('.', `any character except a newline (any character at all with the s flag)${quantifier()}`)
          continue
        }
        // A run of literal characters; a quantifier applies to the last one.
        let j = i
        while (j < src.length && !/[\\\[\](){}|^$.*+?]/.test(src[j])) j += 1
        if (j === i) {
          i += 1
          push(ch, 'the literal character')
          continue
        }
        const run = src.slice(i, j)
        i = j
        const q = quantifier()
        if (q && run.length > 1) {
          push(run.slice(0, -1), `the text "${run.slice(0, -1)}"`)
          push(run.slice(-1), `the character "${run.slice(-1)}"${q}`)
        } else push(run, `the text "${run}"${q}`)
      }
      return lines
    }
    const render = () => {
      const src = pattern.value
      if (!src) {
        breakdown.textContent = ''
        matches.textContent = ''
        return
      }
      let re
      try {
        re = new RegExp(src, flags.value.replace(/[^gimsuy]/g, ''))
      } catch (err) {
        fail(breakdown, err.message)
        matches.textContent = ''
        return
      }
      breakdown.className = 'tool-output'
      breakdown.replaceChildren()
      const table = el('table', 'terms-table')
      explain(src).forEach(({ depth, token, meaning }) => {
        const tr = el('tr')
        const td = el('td')
        td.style.paddingLeft = `${0.5 + depth * 1.2}rem`
        td.append(el('code', '', token))
        tr.append(td, el('td', '', meaning))
        table.append(tr)
      })
      breakdown.append(table)
      matches.className = 'tool-output'
      matches.replaceChildren()
      const subject = text.value
      if (!subject) return
      const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      const found = [...subject.matchAll(global)]
      if (!found.length) {
        matches.append(el('div', 'notes', 'No match.'))
        return
      }
      matches.append(el('div', 'notes', `${found.length} match${found.length === 1 ? '' : 'es'}:`))
      const pre = el('pre', 'cmd')
      let last = 0
      found.forEach((m) => {
        if (m[0] === '') return
        pre.append(document.createTextNode(subject.slice(last, m.index)))
        pre.append(el('mark', '', m[0]))
        last = m.index + m[0].length
      })
      pre.append(document.createTextNode(subject.slice(last)))
      matches.append(pre)
      if (found.some((m) => m.length > 1 || m.groups)) {
        const t = el('table', 'terms-table')
        found.slice(0, 50).forEach((m, n) => {
          const tr = el('tr')
          tr.append(el('td', '', `#${n + 1}`))
          const groups = m.groups
            ? Object.entries(m.groups).map(([k, v]) => `${k} = ${v ?? ''}`)
            : m.slice(1).map((v, k) => `${k + 1} = ${v ?? ''}`)
          tr.append(el('td', '', groups.join(' · ')))
          t.append(tr)
        })
        matches.append(t)
      }
    }
    ;[pattern, flags, text].forEach((c) => c.addEventListener('input', render))
    window.__regexExplain = (src) => explain(src) // smoke tests
  }

  // ── Help harvester ─────────────────────────────────────────────────
  {
    const card = tool(
      'Help harvester',
      'Makes a script that dumps the help of a command and every subcommand it lists (net → net computer → …) into one text file. Paste that file into the Man page importer and pick a section to make it a command.',
    )
    const shell = el('select')
    ;[
      ['cmd', 'CMD-style tool (run in PowerShell): net, netsh, wmic, sc…'],
      ['powershell', 'PowerShell cmdlets: Get-Help -Full for a name, wildcard or module'],
      ['bash', 'Bash: --help, -h or the man page for a command and its subcommands'],
    ].forEach(([value, label]) => {
      const o = el('option', '', label)
      o.value = value
      shell.append(o)
    })
    const base = input('base command, e.g. net', 'net')
    const depth = input('levels deep (1-3)', '2')
    const row = el('div', 'tool-row')
    row.append(labelled('Shell', shell), labelled('Command', base), labelled('Depth', depth))
    card.append(row)
    const actions = el('div', 'tool-row')
    const pre = el('pre', 'cmd')
    const code = el('code')
    pre.append(code)
    actions.append(copyButton(() => code.textContent))
    card.append(actions, pre)
    const q = (s) => `'${String(s).replace(/'/g, "''")}'` // PowerShell single-quoted
    const bq = (s) => `'${String(s).replace(/'/g, "'\\''")}'` // Bash single-quoted
    const scripts = {
      cmd: (b, d) =>
        [
          '# Spell Book help harvester: CMD-style tools (run this in PowerShell)',
          '# Dumps "<cmd> /?" (or help / -h / --help) for the base command and every',
          '# subcommand its help lists, the given number of levels deep.',
          `$Base  = ${q(b)}`,
          `$Depth = ${d}`,
          '$Out   = "$env:TEMP\\spellbook-help.txt"',
          '$Seen  = @{}',
          "$Skip  = '^(usage|syntax|options?|examples?|commands?|where|note|notes|the|for|and|or|to|is|are|with|this|that)$'",
          "Set-Content -Path $Out -Value '' -Encoding UTF8",
          'function Get-HelpText([string]$Command) {',
          "  foreach ($suffix in @(' /?', ' help', ' -h', ' --help')) {",
          '    try { $text = (cmd /c "$Command$suffix 2>&1" | Out-String) } catch { $text = \'\' }',
          '    if ($text.Trim().Length -gt 40) { return $text }',
          '  }',
          "  return ''",
          '}',
          'function Dump([string]$Command, [int]$Level) {',
          '  if ($Seen.ContainsKey($Command) -or $Level -gt $Depth) { return }',
          '  $Seen[$Command] = $true',
          '  $text = Get-HelpText $Command',
          '  if (-not $text) { return }',
          '  Add-Content -Path $Out -Encoding UTF8 -Value "##### SPELLBOOK: CMD | $Command #####`r`n$text"',
          "  $last = ($Command -split ' ')[-1]",
          '  $subs = @()',
          '  # "NET ACCOUNTS" style: the base word followed by a subcommand',
          '  foreach ($m in [regex]::Matches($text, "(?im)\\b$([regex]::Escape($last))\\s+([A-Za-z][A-Za-z0-9-]{1,30})\\b")) { $subs += $m.Groups[1].Value }',
          '  # "  computer     Lists…" style: a word at the line start, then two spaces',
          "  foreach ($m in [regex]::Matches($text, '(?m)^\\s{1,12}([A-Za-z][A-Za-z0-9-]{1,30})\\s{2,}\\S')) { $subs += $m.Groups[1].Value }",
          '  $subs = $subs | ForEach-Object { $_.ToLower() } | Where-Object { $_ -notmatch $Skip -and $_ -ne $last.ToLower() } | Select-Object -Unique | Select-Object -First 40',
          '  foreach ($s in $subs) { Dump "$Command $s" ($Level + 1) }',
          '}',
          'Dump $Base 0',
          'Write-Host "Wrote $Out ($($Seen.Count) sections). Open it, copy everything, and paste it into Spell Book > Tools > Man page importer."',
        ].join('\n'),
      powershell: (b) =>
        [
          '# Spell Book help harvester: PowerShell cmdlets',
          '# Dumps Get-Help -Full for every command matching $Name (a cmdlet, a wildcard',
          '# such as Get-Net*) or, when $Module is set, every command of that module.',
          `$Name   = ${q(b)}`,
          "$Module = ''",
          '$Out    = "$env:TEMP\\spellbook-help.txt"',
          "Set-Content -Path $Out -Value '' -Encoding UTF8",
          '$cmds = if ($Module) { Get-Command -Module $Module } else { Get-Command -Name $Name -ErrorAction SilentlyContinue }',
          '$count = 0',
          'foreach ($c in $cmds | Sort-Object Name -Unique) {',
          "  try { $text = (Get-Help $c.Name -Full -ErrorAction Stop | Out-String -Width 200) } catch { $text = '' }",
          '  if ($text.Trim().Length -lt 40) { continue }',
          '  Add-Content -Path $Out -Encoding UTF8 -Value "##### SPELLBOOK: PowerShell | $($c.Name) #####`r`n$text"',
          '  $count++',
          '}',
          'Write-Host "Wrote $Out ($count sections). Open it, copy everything, and paste it into Spell Book > Tools > Man page importer."',
        ].join('\n'),
      bash: (b, d) =>
        [
          '#!/bin/bash',
          '# Spell Book help harvester: Bash',
          '# Dumps "<cmd> --help" (or -h, or the man page) for the base command and every',
          '# subcommand its help lists, the given number of levels deep.',
          `BASE=${bq(b)}`,
          `DEPTH=${d}`,
          'OUT="${TMPDIR:-/tmp}/spellbook-help.txt"',
          'declare -A SEEN',
          ': > "$OUT"',
          'help_text() {',
          '  local text',
          '  text=$($1 --help 2>&1); [ ${#text} -gt 40 ] && { printf \'%s\' "$text"; return; }',
          '  text=$($1 -h 2>&1); [ ${#text} -gt 40 ] && { printf \'%s\' "$text"; return; }',
          '  man ${1%% *} 2>/dev/null | col -b',
          '}',
          'dump() {',
          '  local cmd="$1" level=$2 text subs s',
          '  [[ -n "${SEEN[$cmd]}" || $level -gt $DEPTH ]] && return',
          '  SEEN[$cmd]=1',
          '  text=$(help_text "$cmd")',
          '  [ -z "$text" ] && return',
          "  printf '##### SPELLBOOK: Bash | %s #####\\n%s\\n' \"$cmd\" \"$text\" >> \"$OUT\"",
          "  subs=$(printf '%s\\n' \"$text\" | grep -oE '^ {1,12}[a-z][a-z0-9-]{1,30} {2,}' | tr -d ' ' | grep -vxE 'usage|options?|examples?|commands?|where|note|notes' | sort -u | head -40)",
          '  for s in $subs; do dump "$cmd $s" $((level + 1)); done',
          '}',
          'dump "$BASE" 0',
          'echo "wrote $OUT (${#SEEN[@]} sections). Paste its contents into Spell Book > Tools > Man page importer."',
        ].join('\n'),
    }
    const render = () => {
      const d = Math.min(3, Math.max(1, Number(depth.value) || 1))
      const b = base.value.trim() || (shell.value === 'powershell' ? 'Get-Process' : shell.value === 'bash' ? 'git' : 'net')
      code.textContent = scripts[shell.value](b, d)
    }
    ;[shell, base, depth].forEach((c) => {
      c.addEventListener('input', render)
      c.addEventListener('change', render)
    })
    render()
  }
})()
