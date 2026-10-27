/*
 * Callout boxes for the Notes page: a shaded "info" section with an icon.
 *
 * Loaded after notes.js, which exposes window.NotesEditor. The box is saved in
 * the note as <div class="note-callout" data-callout="info">; notes.js sanitize()
 * keeps that one shape. The toolbar button is added here, not in index.html: it
 * inserts an empty box at the caret, or removes the box the caret is in (the
 * text inside stays). Styles live in css/notes-callouts.css.
 */
;(() => {
  const api = window.NotesEditor
  const hr = document.querySelector('#notes-toolbar [data-cmd="insertHorizontalRule"]')
  if (!api || !hr) return

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'notes-tool'
  button.id = 'notes-callout'
  button.title = 'Info box: insert at the cursor, or click again inside one to remove it'
  button.setAttribute('aria-label', 'Info box')
  button.innerHTML =
    '<svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>'
  hr.after(button)

  button.addEventListener('click', () => {
    api.restoreSelection()
    const box = api.enclosing('.note-callout')
    if (box) {
      const range = document.createRange()
      range.selectNodeContents(box)
      const contents = range.extractContents()
      box.replaceWith(contents)
      api.afterEdit()
      return
    }
    api.replaceCaretBlock(
      '<div class="note-callout" data-callout="info"><p><br></p></div><p><br></p>',
    )
    const added = [...api.editor.querySelectorAll('.note-callout p')].find(
      (p) => !p.textContent && p.parentElement.nextElementSibling,
    )
    if (added) {
      const selection = getSelection()
      selection.selectAllChildren(added)
      selection.collapseToStart()
      added.scrollIntoView({ block: 'nearest' })
    }
    api.afterEdit()
  })

  // Show the button as active while the caret is inside a box.
  document.addEventListener('selectionchange', () => {
    button.classList.toggle('active', Boolean(api.enclosing('.note-callout')))
  })
})()
