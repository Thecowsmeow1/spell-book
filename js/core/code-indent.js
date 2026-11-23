/*
 * Tab and Shift+Tab in the code editors, as in VS Code:
 *   - Tab types a tab character (replacing a selection within one line).
 *   - Tab with a selection over several lines indents each of them with a tab
 *     (empty lines are left alone); the selection keeps covering them.
 *   - Shift+Tab takes one level of indent (a tab, or up to 4 spaces) off the
 *     line at the cursor or every selected line. On a line with no indent it
 *     does nothing, so the browser's Shift+Tab moves to the field before.
 * Changes go through execCommand('insertText'), so Ctrl+Z undoes each one
 * and the syntax-colored views (which follow the input event) keep up.
 *
 * The code editors: the command template (#f-cmd), its example (#f-example),
 * the script body (#script-body) and code blocks in notes (.note-code-input).
 * Tabs show 4 columns wide (css/base.css).
 */
;(() => {
  const EDITORS = '#f-cmd, #f-example, #script-body, .note-code-input'

  // Where the lines touched by the selection start and end. A selection that
  // ends right after a line break doesn't take in the line after it.
  function lineSpan(value, start, end) {
    const from = value.lastIndexOf('\n', start - 1) + 1
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end
    const next = value.indexOf('\n', last)
    return { from, to: next < 0 ? value.length : next }
  }

  // One level of indent off the start of a line: its length (0 for none).
  const indentOf = (line) => (line.startsWith('\t') ? 1 : (line.match(/^ {1,4}/) || [''])[0].length)

  function replace(area, from, to, text, selStart, selEnd) {
    area.setSelectionRange(from, to)
    if (text) document.execCommand('insertText', false, text)
    else document.execCommand('delete')
    area.setSelectionRange(selStart, selEnd)
  }

  function keydown(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return
    const area = e.target
    if (!area.matches || !area.matches(EDITORS) || area.readOnly || area.disabled) return
    const { value, selectionStart: start, selectionEnd: end } = area
    const severalLines = start !== end && value.slice(start, end).includes('\n')

    if (!e.shiftKey && !severalLines) {
      e.preventDefault()
      document.execCommand('insertText', false, '\t')
      return
    }

    const { from, to } = lineSpan(value, start, end)
    const lines = value.slice(from, to).split('\n')
    let changed
    let first = 0
    if (e.shiftKey) {
      const cuts = lines.map(indentOf)
      if (!cuts.some(Boolean)) return
      changed = lines.map((line, i) => line.slice(cuts[i]))
      first = -Math.min(cuts[0], start - from)
    } else {
      changed = lines.map((line) => (line ? `\t${line}` : line))
      first = lines[0] ? 1 : 0
    }
    e.preventDefault()
    const text = changed.join('\n')
    const delta = text.length - (to - from)
    // The cursor or selection moves with its text; a selection that started
    // at the start of a line keeps starting there.
    const selStart = start === from && start !== end ? from : Math.max(from, start + first)
    const selEnd = start === end ? selStart : Math.max(selStart, end + delta)
    replace(area, from, to, text, selStart, selEnd)
  }

  // Capture, so this runs before the code blocks' own key handling in notes.
  document.addEventListener('keydown', keydown, true)
})()
