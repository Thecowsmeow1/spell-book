/*
 * Works out what can come next in a PowerShell command line (modules/powershell).
 * No page code here: window.SpellBookPS.create(data) returns complete(line,
 * cursor), from the data ps-export.ps1 writes.
 *
 * It follows the common cases: pipelines, ; ( ) { }, "$x = …", aliases,
 * shortened parameter names, -Name:value, positional values and parameter
 * sets. It doesn't evaluate anything, so it can't suggest paths, process names
 * or other values that only a running PowerShell knows.
 */
window.SpellBookPS = {
  // One list from the 5.1 and 7 data. Whatever only one version has is marked
  // with it: command.only, command.aliasOnly[alias], parameter.only,
  // parameter.vOnly[value] and set.only. Where both have help, 7's is shown.
  merge(five, seven) {
    const lower = (s) => String(s).toLowerCase()
    // Both versions' names, without case: [name, in5, in7].
    const pair = (a, b) => {
      const map = new Map()
      b.forEach((name) => map.set(lower(name), [name, null, name]))
      a.forEach((name) => {
        const known = map.get(lower(name))
        if (known) known[1] = name
        else map.set(lower(name), [name, name, null])
      })
      return [...map.values()]
    }
    const only = (a, b) => (a && b ? undefined : a ? '5.1' : '7')
    const marks = (entries) => Object.fromEntries(entries.filter(([, a, b]) => !a || !b).map(([name, a, b]) => [name, only(a, b)]))

    const one = (a, b) => {
      const names = pair(Object.keys(a.params), Object.keys(b.params))
      const canonical = new Map(names.map(([name]) => [lower(name), name]))
      const params = {}
      names.forEach(([name, in5, in7]) => {
        const p5 = in5 && a.params[in5]
        const p7 = in7 && b.params[in7]
        const values = pair(p5?.v || [], p7?.v || [])
        const merged = { ...(p5 || {}), ...(p7 || {}), only: only(p5, p7) }
        const aliases = pair(p5?.a || [], p7?.a || []).map((x) => x[0])
        if (aliases.length) merged.a = aliases
        if (values.length) merged.v = values.map((x) => x[0])
        if (p5 && p7) merged.vOnly = marks(values)
        params[name] = merged
      })
      // Sets that are the same in both are listed once.
      const sets = new Map()
      ;[[a, '5.1'], [b, '7']].forEach(([command, version]) =>
        command.sets.forEach((set) => {
          const p = set.p.map(([name, ...rest]) => [canonical.get(lower(name)) || name, ...rest])
          const key = JSON.stringify([set.n, p])
          if (sets.has(key)) delete sets.get(key).only
          else sets.set(key, { ...set, p, only: version })
        }),
      )
      const aliases = pair(a.a, b.a)
      return {
        n: b.n,
        m: b.m || a.m,
        s: b.s || a.s,
        d: b.d || a.d,
        u: b.u || a.u,
        a: aliases.map((x) => x[0]),
        aliasOnly: marks(aliases),
        ex: b.ex.length ? b.ex : a.ex,
        sets: [...sets.values()],
        params,
      }
    }

    const index = (data) => new Map(data.commands.map((c) => [lower(c.n), c]))
    const in5 = index(five)
    const in7 = index(seven)
    const commands = [...new Set([...in5.keys(), ...in7.keys()])].sort().map((key) => {
      const a = in5.get(key)
      const b = in7.get(key)
      return a && b ? one(a, b) : { ...(a || b), only: only(a, b) }
    })
    return { common: pair(five.common, seven.common).map((x) => x[0]), commands }
  },

  create(data) {
    const LIMIT = 200
    const lower = (s) => String(s).toLowerCase()
    const byName = new Map(data.commands.map((c) => [lower(c.n), c]))
    const byAlias = new Map()
    data.commands.forEach((c) => c.a.forEach((a) => byAlias.set(lower(a), c)))
    const find = (name) => byName.get(lower(name)) || byAlias.get(lower(name)) || null

    // The words of the command the cursor is in, up to the cursor.
    function segment(text) {
      let words = []
      let word = null
      let quote = ''
      const outer = []
      const end = () => {
        if (word) words.push(word)
        word = null
      }
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i]
        if (quote) {
          word.text += ch
          if (ch === '`' && quote === '"' && i + 1 < text.length) word.text += text[(i += 1)]
          else if (ch === quote) quote = ''
          continue
        }
        if (ch === '"' || ch === "'") {
          if (!word) word = { text: '', start: i }
          word.text += ch
          quote = ch
        } else if (/\s/.test(ch)) {
          end()
          if (ch === '\n') words = []
        } else if (ch === '|' || ch === ';' || ch === '&') {
          end()
          words = []
        } else if (ch === '(' || ch === '{') {
          end()
          // The brackets stand for one value of the outer command.
          outer.push([...words, { text: '(…)', start: i }])
          words = []
        } else if (ch === ')' || ch === '}') {
          end()
          words = outer.pop() || []
        } else {
          if (!word) word = { text: '', start: i }
          word.text += ch
        }
      }
      const partial = word || { text: '', start: text.length }
      if (words.length >= 2 && words[0].text.startsWith('$') && words[1].text === '=') words = words.slice(2)
      return { words, partial }
    }

    // A parameter by its name, alias or an unambiguous start of its name.
    function parameter(command, typed) {
      const want = lower(typed)
      const names = [...Object.keys(command.params), ...data.common]
      const exact =
        names.find((n) => lower(n) === want) ||
        Object.keys(command.params).find((n) => (command.params[n].a || []).some((a) => lower(a) === want))
      if (exact) return exact
      const starts = names.filter((n) => lower(n).startsWith(want))
      return starts.length === 1 ? starts[0] : null
    }

    const isParameter = (text) => /^-[A-Za-z?]/.test(text)
    const takesValue = (command, name) => {
      const p = command.params[name]
      if (p) return !p.sw
      return !['Verbose', 'Debug', 'WhatIf', 'Confirm', 'UseTransaction'].includes(name)
    }

    // Which parameters are used, which still wants a value, which sets fit.
    function read(command, args) {
      const used = new Set()
      const unknown = []
      let waiting = null
      let positionals = 0
      for (const { text } of args) {
        if (isParameter(text)) {
          const [typed, ...rest] = text.slice(1).split(':')
          const name = parameter(command, typed)
          waiting = null
          if (!name) unknown.push(`-${typed}`)
          else {
            used.add(name)
            if (!rest.length && takesValue(command, name)) waiting = name
          }
        } else if (waiting) {
          // "a, b": the list goes on after a comma.
          if (!text.endsWith(',')) waiting = null
        } else {
          positionals += 1
        }
      }
      const own = [...used].filter((n) => command.params[n])
      let sets = command.sets.filter((s) => own.every((n) => s.p.some((p) => p[0] === n)))
      const conflict = !sets.length
      if (conflict) sets = command.sets
      // Positional values fill the default set's places, in order.
      const set = sets.find((s) => s.def) || sets[0]
      const places = set ? set.p.filter((p) => p[2] >= 0 && !used.has(p[0])).sort((a, b) => a[2] - b[2]) : []
      const filled = new Set(places.slice(0, positionals).map((p) => p[0]))
      return { used, unknown, waiting, sets, conflict, filled, nextPlace: places[positionals]?.[0] || null }
    }

    const quoteValue = (value) => (/\s/.test(value) ? `'${value.replace(/'/g, "''")}'` : value)

    function valueItems(command, name, typed) {
      const p = command.params[name]
      const want = lower(typed.replace(/^['"]/, ''))
      // The common -…Action parameters all take the same preferences.
      const preferences = /Action$/.test(name) && data.common.includes(name)
        ? ['SilentlyContinue', 'Stop', 'Continue', 'Inquire', 'Ignore']
        : []
      return ((p ? p.v : preferences) || [])
        .filter((v) => lower(v).startsWith(want))
        .map((v) => ({ kind: 'value', label: v, insert: quoteValue(v), note: `value for -${name}`, param: name, only: p?.vOnly?.[v] || p?.only }))
    }

    function parameterItems(command, state, typed) {
      const want = lower(typed)
      const inSets = new Map()
      state.sets.forEach((s) =>
        s.p.forEach(([name, mandatory, position]) => {
          const known = inSets.get(name) || { mandatory: 0, position: -1 }
          inSets.set(name, {
            mandatory: known.mandatory + (mandatory ? 1 : 0),
            position: position >= 0 && known.position < 0 ? position : known.position,
          })
        }),
      )
      const rank = (name) => {
        const p = command.params[name]
        // As in PowerShell, a whole alias wins: -r is -Recurse, not -ReadOnly.
        if ((p?.a || []).some((a) => lower(a) === want)) return -0.5
        if (lower(name).startsWith(want)) return 0
        if ((p?.a || []).some((a) => lower(a).startsWith(want))) return 1
        return lower(name).includes(want) ? 2 : -1
      }
      const own = [...inSets.keys()]
        .filter((name) => !state.used.has(name) && !state.filled.has(name) && command.params[name])
        .map((name) => {
          const info = inSets.get(name)
          const p = command.params[name]
          return {
            kind: 'parameter',
            label: `-${name}`,
            insert: `-${name}`,
            param: name,
            required: info.mandatory === state.sets.length,
            position: info.position,
            note: p.sw ? 'switch' : p.t,
            only: p.only,
            aliases: (p.a || []).map((a) => `-${a}`),
            rank: rank(name),
          }
        })
        .filter((item) => item.rank !== -1)
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            Number(b.required) - Number(a.required) ||
            (a.position < 0 ? 99 : a.position) - (b.position < 0 ? 99 : b.position) ||
            a.label.localeCompare(b.label),
        )
      // Common parameters last, and only the ones this command has no namesake of.
      const common = data.common
        .filter((name) => !state.used.has(name) && !command.params[name] && lower(name).startsWith(want))
        .filter((name) => !['WhatIf', 'Confirm', 'UseTransaction'].includes(name) || command.params[name])
        .map((name) => ({ kind: 'parameter', label: `-${name}`, insert: `-${name}`, param: name, note: 'common' }))
      return [...own, ...common]
    }

    const aliasNames = (c) => c.a.map((a) => (c.aliasOnly?.[a] ? `${a} (${c.aliasOnly[a]} only)` : a))

    // Commands whose name or alias holds what has been typed.
    function commandItems(typed) {
      const want = lower(typed)
      const found = []
      for (const c of data.commands) {
        const name = lower(c.n)
        let rank = -1
        if (!want) rank = 3
        else if (name === want || c.a.some((a) => lower(a) === want)) rank = 0
        else if (name.startsWith(want)) rank = 1
        else if (name.includes(want)) rank = 2
        if (rank >= 0) found.push({ kind: 'command', label: c.n, insert: c.n, note: c.s || c.m, aliases: aliasNames(c), only: c.only, command: c, rank })
        // Aliases that start with what's typed are choices of their own.
        if (want) {
          c.a
            .filter((a) => lower(a).startsWith(want))
            .forEach((a) =>
              found.push({
                kind: 'command',
                label: a,
                insert: a,
                note: `alias for ${c.n}`,
                only: c.aliasOnly?.[a] || c.only,
                command: c,
                rank: lower(a) === want ? -1 : 1.5,
              }),
            )
        }
      }
      return found.sort((a, b) => a.rank - b.rank)
    }

    // The Find box: by name or alias, then by words in what a command does.
    function search(query) {
      const words = lower(query).split(/\s+/).filter(Boolean)
      const want = words.join('-')
      const found = []
      if (words.length) {
        for (const c of data.commands) {
          const name = lower(c.n)
          const holds = (text) => words.every((w) => text.includes(w))
          let rank = -1
          if (name === want || c.a.some((a) => lower(a) === want)) rank = 0
          else if (name.startsWith(want)) rank = 1
          else if (holds(name)) rank = 2
          else if (holds(`${name} ${lower(c.s)}`)) rank = 3
          else if (holds(`${name} ${lower(c.s)} ${lower(c.d)}`)) rank = 4
          if (rank >= 0) found.push({ kind: 'command', label: c.n, insert: c.n, note: c.s || c.m, aliases: aliasNames(c), only: c.only, command: c, rank })
        }
      }
      found.sort((a, b) => a.rank - b.rank)
      return { command: null, param: null, total: found.length, items: found.slice(0, LIMIT) }
    }

    return {
      aliasNames,
      search,
      find,
      // line: the whole input; cursor: where the caret is.
      // Returns { command, param, items, total, hint, start, end }: insert an
      // item's text in place of line.slice(start, end).
      complete(line, cursor = line.length) {
        const { words, partial } = segment(line.slice(0, cursor))
        const rest = line.slice(cursor).match(/^[^\s|;(){}]*/)[0]
        const result = { command: null, param: null, items: [], hint: '', start: partial.start, end: cursor + rest.length, atCommand: !words.length }
        const done = (items) => ({ ...result, total: items.length, items: items.slice(0, LIMIT) })
        const command = words.length ? find(words[0].text) : null

        if (!command) {
          if (words.length) {
            result.hint = `${words[0].text} isn’t a command in this list. The Find box searches what commands do.`
            return done([])
          }
          result.hint = 'Pick a command, or search for one in the Find box.'
          return done(commandItems(partial.text))
        }

        result.command = command
        const state = read(command, words.slice(1))
        const warnings = []
        if (state.unknown.length) warnings.push(`${command.n} has no parameter ${state.unknown.join(', ')}.`)
        if (state.conflict) warnings.push('These parameters can’t be used together.')
        const say = (text) => (result.hint = [...warnings, text].join(' '))
        const typed = partial.text

        if (isParameter(typed) || typed === '-') {
          const colon = typed.indexOf(':')
          if (colon > 0) {
            const name = parameter(command, typed.slice(1, colon))
            result.param = name
            result.start += colon + 1
            say(name ? `Value for -${name}.` : '')
            return done(name ? valueItems(command, name, typed.slice(colon + 1)) : [])
          }
          const items = parameterItems(command, state, typed.slice(1))
          result.param = parameter(command, typed.slice(1))
          say('Pick a parameter.')
          return done(items)
        }

        // After a comma, only the last value is being typed.
        const comma = typed.lastIndexOf(',')
        const value = comma >= 0 ? typed.slice(comma + 1) : typed
        if (comma >= 0) result.start += comma + 1
        const name = state.waiting || (typed ? state.nextPlace : null)

        if (name) {
          const p = command.params[name]
          result.param = name
          const items = valueItems(command, name, value)
          say(
            items.length
              ? `Pick a value for -${name}.`
              : `Type a value for -${name} (${p ? p.t : 'value'}).`,
          )
          return done(items)
        }
        if (typed) {
          say('This command takes no more values by position. Type - for parameters.')
          return done([])
        }
        const items = parameterItems(command, state, '')
        if (state.nextPlace) {
          result.param = state.nextPlace
          const values = valueItems(command, state.nextPlace, '')
          say(`Type a value for -${state.nextPlace}, or pick a parameter.`)
          return done([...values, ...items])
        }
        say(items.length ? 'Pick a parameter.' : 'Nothing more to add.')
        return done(items)
      },
    }
  },
}
