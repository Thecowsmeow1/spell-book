/*
 * Tables in the Notes box of commands, scripts and terms (Spell Book page).
 *
 * Notes there are plain text. A block of lines written like
 *   | Name | Meaning |
 *   |------|---------|
 *   | b    | blocks  |
 * is shown as a table, and an "Insert table" button under each Notes box opens
 * a small grid (Tab moves cell to cell) that writes that text for you.
 *
 * Self-contained, no edits to app.js: it uses app.js's escapeHtml, adds the
 * button to #f-notes, #script-notes and #term-notes, and a MutationObserver on
 * #detail swaps the Notes text of the open entry for the rendered table. The
 * stored notes stay plain text, so import, export and search are unchanged.
 * Ported from the older Spellbook build. Styles: css/entry-tables.css.
 */
;(() => {
  const detail = document.getElementById('detail')
  if (!detail || typeof escapeHtml !== 'function') return

  const splitTableRow = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/(?<!\\)\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replace(/\\\|/g, '|').trim())
  const isTableLine = (line) => /(?<!\\)\|/.test(line)
  const isTableDivider = (line) =>
    isTableLine(line) &&
    splitTableRow(line).every((cell) => /^:?-+:?$/.test(cell))

  // Escaped HTML for a notes text, with table blocks drawn as <table>.
  function notesHtml(text) {
    const lines = String(text || '').split('\n')
    const parts = []
    let plain = []
    const flush = () => {
      if (plain.length) parts.push(escapeHtml(plain.join('\n')))
      plain = []
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (isTableLine(lines[i]) && isTableDivider(lines[i + 1] || '')) {
        flush()
        const head = splitTableRow(lines[i])
        const body = []
        i += 2
        while (i < lines.length && isTableLine(lines[i])) {
          body.push(splitTableRow(lines[i]))
          i += 1
        }
        i -= 1
        const cells = (row, tag) =>
          head
            .map((_, c) => `<${tag}>${escapeHtml(row[c] ?? '')}</${tag}>`)
            .join('')
        parts.push(
          `<table class="entry-table"><thead><tr>${cells(head, 'th')}</tr></thead><tbody>${body
            .map((row) => `<tr>${cells(row, 'td')}</tr>`)
            .join('')}</tbody></table>`,
        )
      } else {
        plain.push(lines[i])
      }
    }
    flush()
    // The newline next to a table would show as an extra blank line.
    return parts
      .join('\n')
      .replace(/\n(<table)/g, '$1')
      .replace(/(<\/table>)\n/g, '$1')
  }

  function tableToText(rows) {
    const cell = (v) =>
      String(v)
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()
    const lines = rows.map((row) => `| ${row.map(cell).join(' | ')} |`)
    lines.splice(1, 0, `| ${rows[0].map(() => '---').join(' | ')} |`)
    return lines.join('\n')
  }

  function attachTableEditor(textareaId) {
    const area = document.getElementById(textareaId)
    const bar = document.createElement('div')
    bar.className = 'table-editor-bar'
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'btn secondary sm'
    open.textContent = 'Insert table'
    open.title = 'Build a table cell by cell (Tab moves to the next cell)'
    const panel = document.createElement('div')
    panel.className = 'table-editor'
    panel.hidden = true
    bar.append(open)
    area.after(bar, panel)

    let rows = []
    // Adds the grid to the notes. Also runs when the form is saved with the
    // grid still open, so a table that was typed is never lost.
    const commit = () => {
      if (panel.hidden) return
      if (
        !rows.slice(1).some((row) => row.some((v) => v.trim())) &&
        !rows[0].some((v) => v.trim())
      ) {
        panel.hidden = true
        return
      }
      const text = tableToText(
        rows.filter((row, r) => r === 0 || row.some((v) => v.trim())),
      )
      let start = area.selectionStart ?? area.value.length
      let end = area.selectionEnd ?? start
      // Never split an existing table: a caret inside one moves to after it
      const lineStart = area.value.lastIndexOf('\n', start - 1) + 1
      const lineEnd = area.value.indexOf('\n', start)
      if (
        isTableLine(
          area.value.slice(lineStart, lineEnd < 0 ? undefined : lineEnd),
        )
      ) {
        let pos = lineEnd < 0 ? area.value.length : lineEnd
        while (pos < area.value.length) {
          const next = area.value.indexOf('\n', pos + 1)
          const line = area.value.slice(pos + 1, next < 0 ? undefined : next)
          if (!isTableLine(line)) break
          pos = next < 0 ? area.value.length : next
        }
        start = end = pos
      }
      const before = area.value.slice(0, start)
      const after = area.value.slice(end)
      const lead =
        before && !before.endsWith('\n\n')
          ? before.endsWith('\n')
            ? '\n'
            : '\n\n'
          : ''
      const trail = after && !after.startsWith('\n') ? '\n\n' : after ? '\n' : ''
      area.value = before + lead + text + trail + after
      area.dispatchEvent(new Event('input'))
      panel.hidden = true
      area.focus()
    }
    area.form?.addEventListener('submit', commit, true)

    const draw = (focus) => {
      panel.replaceChildren()
      const grid = document.createElement('div')
      grid.className = 'table-editor-grid'
      grid.style.gridTemplateColumns = `repeat(${rows[0].length}, minmax(6rem, 1fr))`
      rows.forEach((row, r) =>
        row.forEach((value, c) => {
          const input = document.createElement('input')
          input.type = 'text'
          input.value = value
          input.placeholder = r === 0 ? `Heading ${c + 1}` : ''
          input.className = r === 0 ? 'table-cell head' : 'table-cell'
          input.dataset.pos = `${r},${c}`
          input.addEventListener('input', () => (rows[r][c] = input.value))
          input.addEventListener('keydown', (e) => {
            // Enter would save the whole form, so it moves down a row instead
            if (e.key === 'Enter') {
              e.preventDefault()
              if (r === rows.length - 1) rows.push(row.map(() => ''))
              draw(`${r + 1},${c}`)
              return
            }
            // Tab in the very last cell starts a new row
            if (
              e.key === 'Tab' &&
              !e.shiftKey &&
              r === rows.length - 1 &&
              c === row.length - 1
            ) {
              e.preventDefault()
              rows.push(row.map(() => ''))
              draw(`${rows.length - 1},0`)
            }
          })
          grid.append(input)
        }),
      )
      const actions = document.createElement('div')
      actions.className = 'table-editor-actions'
      const button = (text, onClick, className = 'btn secondary sm') => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = className
        b.textContent = text
        b.addEventListener('click', onClick)
        return b
      }
      actions.append(
        button('+ Row', () => {
          rows.push(rows[0].map(() => ''))
          draw(`${rows.length - 1},0`)
        }),
        button('+ Column', () => {
          rows.forEach((row) => row.push(''))
          draw(`0,${rows[0].length - 1}`)
        }),
        button('− Row', () => {
          if (rows.length > 2) rows.pop()
          draw()
        }),
        button('− Column', () => {
          if (rows[0].length > 1) rows.forEach((row) => row.pop())
          draw()
        }),
        button('Insert', commit, 'btn sm'),
        button('Cancel', () => {
          panel.hidden = true
        }),
      )
      panel.append(grid, actions)
      if (focus) panel.querySelector(`[data-pos="${focus}"]`)?.focus()
    }
    open.addEventListener('click', () => {
      if (!panel.hidden) {
        panel.hidden = true
        return
      }
      rows = [
        ['', ''],
        ['', ''],
      ]
      panel.hidden = false
      draw('0,0')
    })
  }

  ;['f-notes', 'script-notes', 'term-notes'].forEach((id) => {
    if (document.getElementById(id)) attachTableEditor(id)
  })

  // Entry details draw their notes as plain text; draw any table in them.
  const NOTES_SELECTOR = '.notes, #script-notes-text, #term-notes-text'
  function drawNoteTables() {
    detail.querySelectorAll(NOTES_SELECTOR).forEach((el) => {
      if (el.dataset.tables) return
      el.dataset.tables = '1'
      const text = el.textContent
      if (!text.includes('|')) return
      const html = notesHtml(text)
      if (html.includes('<table')) el.innerHTML = html
    })
  }
  new MutationObserver(drawNoteTables).observe(detail, { childList: true, subtree: true })
  drawNoteTables()
})()
