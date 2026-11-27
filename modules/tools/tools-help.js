/*
 * Context help for the Crontab and Regex interpreters: a line about whatever
 * the cursor is in, examples to try, and a quick reference whose entries can
 * be clicked into the box. Added to the cards tools.js makes, so it loads
 * after tools.js and before tools-layout.js. Nothing is saved.
 */
;(() => {
  const T = window.SpellBookTools
  const grid = document.getElementById('tools-grid')
  if (!T || !grid) return
  const { el } = T
  const cardCalled = (title) =>
    [...grid.querySelectorAll(':scope > .tool')].find((c) => c.querySelector('h2').textContent.trim() === title)

  const chip = (text, title, onClick) => {
    const button = el('button', 'tool-chip', text)
    button.type = 'button'
    if (title) button.title = title
    button.addEventListener('click', onClick)
    return button
  }
  const examples = (list, use) => {
    const row = el('div', 'tool-examples')
    row.append(el('span', 'tool-help-label', 'Try:'), ...list.map((example) => chip(example.name, example.value, () => use(example))))
    return row
  }
  // Puts text into a box and tells the tool it changed.
  const fill = (box, value, from = 0, to = box.value.length) => {
    box.value = box.value.slice(0, from) + value + box.value.slice(to)
    box.focus()
    const caret = from + value.length
    box.setSelectionRange(caret, caret)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }
  // Runs when the text or the cursor in a box may have changed.
  const follow = (box, update) => ['input', 'click', 'keyup', 'focus', 'select'].forEach((type) => box.addEventListener(type, update))

  // A quick reference: groups of [written, meaning]; clicking writes it.
  const reference = (title, groups, insert) => {
    const details = el('details', 'tool-reference')
    details.append(el('summary', '', title))
    const columns = el('div', 'tool-reference-columns')
    groups.forEach(([heading, rows]) => {
      const group = el('div')
      group.append(el('h3', '', heading))
      const list = el('dl')
      rows.forEach(([written, meaning, value]) => {
        const term = el('dt')
        const text = value === undefined ? written : value
        term.append(text === null ? el('code', '', written) : chip(written, 'Put this in the box', () => insert(text)))
        list.append(term, el('dd', '', meaning))
      })
      group.append(list)
      columns.append(group)
    })
    details.append(columns)
    return details
  }

  // ─── Crontab ────────────────────────────────────────────────────────
  const cron = cardCalled('Crontab interpreter')
  if (cron) {
    const box = cron.querySelector('input')
    const FIELDS = [
      { name: 'Minute', range: '0-59', help: 'The minute of the hour. */15 is every 15 minutes; 0,30 is on the hour and half past.' },
      { name: 'Hour', range: '0-23', help: 'The hour, on a 24-hour clock. 9-17 is 9 AM to 5 PM; */6 is every six hours from midnight.' },
      { name: 'Day of month', range: '1-31', help: 'The date. 1 is the first; 1,15 is the 1st and 15th. If Day of week is also set, a day matching either one runs.' },
      { name: 'Month', range: '1-12 or JAN-DEC', help: 'The month, by number or three-letter name. */3 is January, April, July and October.' },
      { name: 'Day of week', range: '0-7 or SUN-SAT', help: '0 and 7 are both Sunday. MON-FRI is weekdays. If Day of month is also set, a day matching either one runs.' },
    ]
    const strip = el('div', 'cron-fields')
    const cells = FIELDS.map((field, i) => {
      const cell = el('button', 'cron-field')
      cell.type = 'button'
      cell.title = `Go to the ${field.name.toLowerCase()} field`
      const value = el('code')
      cell.append(value, el('span', 'cron-field-name', field.name), el('span', 'cron-field-range', field.range))
      // Selects that field in the box, filling in * up to it.
      cell.addEventListener('click', () => {
        if (box.value.trim().startsWith('@')) return
        const parts = box.value.trim().split(/\s+/).filter(Boolean)
        while (parts.length <= i) parts.push('*')
        fill(box, parts.join(' '))
        const start = parts.slice(0, i).reduce((n, part) => n + part.length + 1, 0)
        box.setSelectionRange(start, start + parts[i].length)
        update()
      })
      strip.append(cell)
      return { cell, value }
    })
    const hint = el('p', 'tool-context')
    hint.setAttribute('role', 'status')

    function update() {
      const text = box.value
      const words = [...text.matchAll(/\S+/g)]
      const special = words[0] && words[0][0].startsWith('@')
      const caret = box.selectionStart ?? text.length
      // The word the cursor is in, or the one about to be typed.
      let at = words.findIndex((w) => caret <= w.index + w[0].length)
      if (at < 0) at = /\s$/.test(text) || !words.length ? words.length : words.length - 1
      cells.forEach(({ cell, value }, i) => {
        value.textContent = special ? '–' : words[i] ? words[i][0] : '·'
        cell.classList.toggle('current', !special && at === i && document.activeElement === box)
        cell.disabled = Boolean(special)
      })
      hint.textContent = special
        ? '@hourly, @daily (or @midnight), @weekly, @monthly and @yearly (or @annually) stand for all five fields. @reboot runs once at startup.'
        : at < 5
          ? `${FIELDS[at].name} (${FIELDS[at].range}): ${FIELDS[at].help}`
          : 'After the five fields comes the command to run.'
    }
    follow(box, update)
    box.addEventListener('blur', update)

    const row = box.closest('.tool-row')
    row.after(
      strip,
      hint,
      examples(
        [
          { name: 'Every 5 minutes', value: '*/5 * * * *' },
          { name: 'Daily at 2:30 AM', value: '30 2 * * *' },
          { name: 'Weekdays at 9', value: '0 9 * * MON-FRI' },
          { name: 'Sundays at midnight', value: '0 0 * * 0' },
          { name: '1st of the month', value: '0 0 1 * *' },
          { name: 'At startup', value: '@reboot' },
        ],
        (example) => fill(box, example.value),
      ),
    )
    // Symbols replace the field the cursor is in.
    const insert = (text) => fill(box, text, box.selectionStart ?? box.value.length, box.selectionEnd ?? box.value.length)
    cron.append(
      reference(
        'Quick reference',
        [
          [
            'Symbols',
            [
              ['*', 'every value'],
              [',', 'a list: 1,15,30'],
              ['-', 'a range: 9-17'],
              ['/', 'steps: */10 is every tenth value'],
            ],
          ],
          [
            'Combined',
            [
              ['9-17/2', 'every second hour from 9 to 17', null],
              ['MON,WED,FRI', 'three days of the week', null],
              ['5/15', 'from 5, every 15th: 5, 20, 35, 50', null],
            ],
          ],
          [
            'Shortcuts',
            [
              ['@hourly', '0 * * * *'],
              ['@daily', '0 0 * * *'],
              ['@weekly', '0 0 * * 0'],
              ['@monthly', '0 0 1 * *'],
              ['@yearly', '0 0 1 1 *'],
            ],
          ],
        ],
        (text) => (text.startsWith('@') ? fill(box, text) : insert(text)),
      ),
    )
    update()
  }

  // ─── Regex ──────────────────────────────────────────────────────────
  const regex = cardCalled('Regex interpreter')
  if (regex) {
    const [pattern, flags] = regex.querySelectorAll('.tool-row input')
    const subject = regex.querySelector('textarea')
    const FLAGS = {
      g: 'g finds every match, not just the first',
      i: 'i ignores upper and lower case',
      m: 'm makes ^ and $ match at each line',
      s: 's lets . match newlines too',
      u: 'u reads the pattern as full Unicode',
      y: 'y matches only where the last match ended',
    }
    const hint = el('p', 'tool-context')
    hint.setAttribute('role', 'status')

    // What the cursor is in, from the interpreter's own reading of the pattern.
    function update() {
      if (document.activeElement === flags) {
        const on = [...flags.value].filter((f) => FLAGS[f]).map((f) => FLAGS[f])
        const unknown = [...flags.value].filter((f) => !FLAGS[f] && f.trim())
        hint.textContent = [
          on.length ? `On: ${on.join('; ')}.` : `Flags: ${Object.values(FLAGS).slice(0, 4).join('; ')}.`,
          unknown.length ? `Not a flag here: ${unknown.join(' ')}.` : '',
        ].join(' ')
        return
      }
      const source = pattern.value
      if (!source) {
        hint.textContent = 'Type a pattern, or try an example. This line explains the part your cursor is in.'
        return
      }
      let part = null
      try {
        new RegExp(source, flags.value.replace(/[^gimsuy]/g, ''))
      } catch {
        hint.textContent = 'This pattern isn’t complete yet: see the message below.'
        return
      }
      try {
        let from = 0
        const caret = pattern.selectionStart ?? source.length
        for (const line of window.__regexExplain(source)) {
          const start = source.indexOf(line.token, from)
          if (start < 0 || start >= Math.max(caret, 1)) break
          from = start + line.token.length
          part = line
        }
      } catch {}
      hint.replaceChildren()
      if (part) hint.append('At the cursor: ', el('code', '', part.token), ` ${part.meaning}`)
    }
    follow(pattern, update)
    follow(flags, update)

    const row = pattern.closest('.tool-row')
    row.after(
      hint,
      examples(
        [
          { name: 'IPv4 address', value: '\\b(\\d{1,3}\\.){3}\\d{1,3}\\b', text: 'Failed login from 192.168.1.20 port 52144\nGateway 10.0.0.1 is up' },
          { name: 'Email address', value: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', text: 'Contact admin@example.com or help.desk@example.org' },
          { name: 'Date (YYYY-MM-DD)', value: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', text: 'Created 2026-01-15, changed 2026-02-03' },
          { name: 'Lines with “error”', value: '^.*error.*$', flags: 'gim', text: 'ok\nERROR disk full\nfine\nan error occurred' },
        ],
        (example) => {
          flags.value = example.flags || 'g'
          subject.value = example.text
          fill(pattern, example.value)
        },
      ),
    )
    // Entries are written at the cursor in the pattern.
    const insert = (text) => fill(pattern, text, pattern.selectionStart ?? pattern.value.length, pattern.selectionEnd ?? pattern.value.length)
    // Below the results, so opening it doesn't push them down.
    regex.append(
      reference(
        'Quick reference',
        [
          [
            'Characters',
            [
              ['.', 'any character but a newline'],
              ['\\d', 'a digit (\\D: not a digit)'],
              ['\\w', 'a letter, digit or _ (\\W: not)'],
              ['\\s', 'whitespace (\\S: not)'],
              ['[abc]', 'one of a, b or c'],
              ['[^abc]', 'anything but a, b or c'],
              ['[a-z]', 'a range'],
              ['\\.', 'a real dot: \\ escapes a symbol'],
            ],
          ],
          [
            'How many',
            [
              ['*', 'zero or more'],
              ['+', 'one or more'],
              ['?', 'zero or one'],
              ['{3}', 'exactly 3'],
              ['{2,5}', '2 to 5'],
              ['*?', 'as few as possible'],
            ],
          ],
          [
            'Position and groups',
            [
              ['^', 'start of the text or line'],
              ['$', 'end of the text or line'],
              ['\\b', 'edge of a word'],
              ['(…)', 'a group you can read back', '()'],
              ['(?:…)', 'a group that isn’t kept', '(?:)'],
              ['(?<name>…)', 'a named group', '(?<name>)'],
              ['a|b', 'a or b', '|'],
              ['(?=…)', 'followed by', '(?=)'],
              ['(?!…)', 'not followed by', '(?!)'],
            ],
          ],
        ],
        insert,
      ),
    )
    update()
  }
})()
