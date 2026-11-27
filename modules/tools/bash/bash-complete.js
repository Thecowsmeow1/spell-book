/*
 * Works out what can come next in a Bash command line (modules/tools/bash), from the
 * imported manuals. No page code here:
 *   window.SpellBookBash.create(commands)  → { find, search, complete }
 * with commands as SpellBookBashParse.parse() returns them.
 *
 * It follows pipelines, ; && || ( ), VAR=value and sudo in front, subcommands,
 * grouped short options (-la) and --option=value. It runs nothing, so it can't
 * suggest files or other values.
 */
window.SpellBookBash = {
  create(commands) {
    const LIMIT = 200
    const lower = (s) => String(s).toLowerCase()
    const byName = new Map(commands.map((c) => [c.name, c]))
    const find = (name) => byName.get(name) || null

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
          if (ch === '\\' && quote === '"' && i + 1 < text.length) word.text += text[(i += 1)]
          else if (ch === quote) quote = ''
          continue
        }
        if (ch === '"' || ch === "'" || ch === '\\') {
          if (!word) word = { text: '', start: i }
          word.text += ch
          if (ch === '\\') word.text += text[(i += 1)] || ''
          else quote = ch
        } else if (ch === '\n' || ch === '|' || ch === ';' || ch === '&') {
          end()
          words = []
        } else if (/\s/.test(ch)) {
          end()
        } else if (ch === '(') {
          end()
          outer.push(words)
          words = []
        } else if (ch === ')') {
          end()
          words = outer.pop() || []
        } else {
          if (!word) word = { text: '', start: i }
          word.text += ch
        }
      }
      const partial = word || { text: '', start: text.length }
      // VAR=value, sudo and its switches come before the command.
      while (words.length && (/^[A-Za-z_]\w*=/.test(words[0].text) || words[0].text === 'sudo')) {
        const sudo = words.shift().text === 'sudo'
        while (sudo && words.length && words[0].text.startsWith('-')) words.shift()
      }
      return { words, partial }
    }

    const optionOf = (command, name) => command.options.find((o) => o.names.includes(name))
    const takesValue = (option) => Boolean(option && option.argument && !option.optional)

    // Which options are used and whether one still wants its value.
    function read(command, args) {
      const used = new Set()
      let waiting = null
      for (const { text } of args) {
        if (waiting) {
          waiting = null
          continue
        }
        if (!text.startsWith('-') || text === '-' || text === '--') continue
        const bare = text.split('=')[0]
        let option = optionOf(command, bare)
        if (!option && /^-[^-]/.test(text)) {
          // -la, or -n5 with the value attached.
          for (let i = 1; i < text.length; i += 1) {
            const one = optionOf(command, `-${text[i]}`)
            if (!one) break
            used.add(one)
            if (takesValue(one)) {
              if (i === text.length - 1) waiting = one
              break
            }
          }
          continue
        }
        if (!option) continue
        used.add(option)
        if (takesValue(option) && !text.includes('=')) waiting = option
      }
      return { used, waiting }
    }

    const firstLine = (text) => String(text || '').split('\n')[0]

    function optionItems(command, used, typed) {
      const items = []
      command.options.forEach((option, order) => {
        if (used.has(option)) return
        // The name that matches what is typed, short before long.
        const name = option.names.find((n) => n.startsWith(typed || '-'))
        const loose = !name && typed.length > 2 && option.names.find((n) => n.includes(typed.replace(/^-+/, '')))
        if (!name && !loose) return
        const label = name || loose
        const others = option.names.filter((n) => n !== label)
        const joins = option.argument && label.startsWith('--') && option.optional
        items.push({
          kind: 'option',
          label,
          insert: joins ? `${label}=` : label,
          open: Boolean(joins),
          aliases: others,
          note: [option.argument, firstLine(option.description)].filter(Boolean).join(' · '),
          option,
          rank: label === typed ? 0 : name ? 1 : 2,
          order,
        })
      })
      return items.sort((a, b) => a.rank - b.rank || a.order - b.order)
    }

    function commandItems(typed) {
      return commands
        .map((c) => ({
          kind: 'command',
          label: c.name,
          insert: c.name,
          note: c.summary,
          command: c,
          rank: c.name === typed ? 0 : c.name.startsWith(typed) ? 1 : c.name.includes(typed) ? 2 : -1,
        }))
        .filter((item) => item.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    }

    // The Find box: by name, then by words in what a command and its options do.
    function search(query) {
      const words = lower(query).split(/\s+/).filter(Boolean)
      const found = []
      if (words.length) {
        for (const c of commands) {
          const holds = (text) => words.every((w) => lower(text).includes(w))
          let rank = -1
          if (c.name === words.join(' ')) rank = 0
          else if (holds(c.name)) rank = 1
          else if (holds(`${c.name} ${c.summary}`)) rank = 2
          else if (holds(`${c.name} ${c.summary} ${c.description}`)) rank = 3
          else if (holds([c.name, c.summary, ...c.options.map((o) => `${o.names.join(' ')} ${o.description}`), ...c.subcommands.map((s) => `${s.name} ${s.description}`)].join(' '))) rank = 4
          if (rank >= 0) found.push({ kind: 'command', label: c.name, insert: c.name, note: c.summary, command: c, rank })
        }
      }
      found.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      return { command: null, option: null, total: found.length, items: found.slice(0, LIMIT) }
    }

    return {
      find,
      search,
      complete(line, cursor = line.length) {
        const { words, partial } = segment(line.slice(0, cursor))
        const rest = line.slice(cursor).match(/^[^\s|;&()]*/)[0]
        const typed = partial.text
        const result = { command: null, option: null, items: [], hint: '', start: partial.start, end: cursor + rest.length, atCommand: !words.length }
        const done = (items, hint) => ({ ...result, hint, total: items.length, items: items.slice(0, LIMIT) })

        if (!words.length) return done(commandItems(typed), 'Pick a command, or search for one in the Find box.')

        // "git commit" is a command of its own when its manual is imported.
        const two = words.length > 1 ? find(`${words[0].text} ${words[1].text}`) : null
        const command = two || find(words[0].text)
        if (!command) return done([], `${words[0].text} hasn’t been imported. Add its manual with Import manuals.`)
        result.command = command
        const args = words.slice(two ? 2 : 1)

        if (typed.startsWith('-')) {
          const equals = typed.indexOf('=')
          if (equals > 0) {
            result.option = optionOf(command, typed.slice(0, equals))
            const name = result.option ? result.option.argument : ''
            return done([], name ? `Type a value (${name}).` : 'Type a value.')
          }
          const { used } = read(command, args)
          const items = optionItems(command, used, typed)
          // After -l, more one-letter switches can join it: -la.
          if (/^-[^-]+$/.test(typed)) {
            const letters = [...typed.slice(1)].map((l) => optionOf(command, `-${l}`))
            if (letters.every((o) => o && !o.argument)) {
              command.options.forEach((option) => {
                const short = option.names.find((n) => /^-[^-]$/.test(n))
                if (!short || letters.includes(option) || used.has(option)) return
                items.push({
                  kind: 'option',
                  label: typed + short[1],
                  insert: typed + short[1],
                  note: `adds ${short} · ${firstLine(option.description)}`,
                  option,
                })
              })
            }
          }
          result.option = optionOf(command, typed)
          return done(items, command.options.length ? 'Pick an option.' : 'No options were read from this manual.')
        }

        const { used, waiting } = read(command, args)
        if (waiting) {
          result.option = waiting
          return done([], `Type a value for ${waiting.names.join(', ')} (${waiting.argument}), then a space.`)
        }
        const subs = command.subcommands
          .filter((s) => !args.length && s.name.startsWith(typed))
          .map((s) => {
            const own = find(`${command.name} ${s.name}`)
            return { kind: 'subcommand', label: s.name, insert: s.name, note: s.description || (own && own.summary) || '', command: own }
          })
        // Subcommands with a manual of their own, even if this one lists none.
        if (!args.length) {
          commands
            .filter((c) => c.name.startsWith(`${command.name} ${typed}`))
            .forEach((c) => {
              const label = c.name.slice(command.name.length + 1)
              if (!subs.some((s) => s.label === label)) subs.push({ kind: 'subcommand', label, insert: label, note: c.summary, command: c })
            })
        }
        if (typed) return done(subs, subs.length ? 'Pick a subcommand.' : 'Type the value, then a space. Type - for options.')
        const items = [...subs, ...optionItems(command, used, '')]
        return done(items, items.length ? 'Pick what comes next, or type a value.' : 'Type a value.')
      },
    }
  },
}
