/*
 * "Save as" menu on each code block in the Compendium: turns the block's text
 * into a new Spell Book command, script or term.
 *
 * Loaded after notes.js (window.NotesEditor). It adds a small select to every
 * .note-code-head (notes.js redraws the heads, so a MutationObserver puts it
 * back). Choosing an item opens the Spell Book's own New Command / Script /
 * Term window through openEntryModalWithHooks, filled in from the block: the
 * text becomes the command, the script body or the term definition, and the
 * block's language (Auto is guessed first) becomes the platform or language.
 * Nothing is saved until you press Save there, and the note is not changed.
 * Works on sealed notes too, since it only reads them. Styles: css/notes-codesave.css.
 */
;(() => {
  const api = window.NotesEditor
  if (!api || typeof openEntryModalWithHooks !== 'function') return
  const { editor } = api

  const NAMES = {
    bash: 'Bash',
    powershell: 'PowerShell',
    batch: 'Batch',
    python: 'Python',
    sql: 'SQL',
  }

  function openFrom(kind, text, lang) {
    const name = NAMES[lang] || ''
    const modal = {
      command: {
        entry: {
          id: '',
          title: '',
          platform: name,
          command: text,
          tags: [],
          description: '',
          variables: [],
          variableDetails: [],
          example: '',
          notes: '',
        },
        heading: ['modal-title', 'New Command'],
      },
      script: {
        entry: { id: '', name: '', language: name, tags: [], body: text, notes: '' },
        heading: ['script-modal-title', 'New Script'],
        hide: 'btn-script-delete',
      },
      term: {
        entry: { id: '', term: '', category: '', tags: [], definition: text, notes: '' },
        heading: ['term-modal-title', 'New Term'],
        hide: 'btn-term-delete',
      },
    }[kind]
    // An entry without an id is saved as a new one; the editors only word
    // their heading and Delete button for an existing entry, so fix those.
    openEntryModalWithHooks(kind, {}, modal.entry)
    document.getElementById(modal.heading[0]).textContent = modal.heading[1]
    if (modal.hide) document.getElementById(modal.hide).hidden = true
  }

  function addMenu(head) {
    if (head.querySelector('.note-code-save')) return
    const select = document.createElement('select')
    select.className = 'note-code-save'
    select.setAttribute('aria-label', 'Save this code to the Spell Book')
    select.title = 'Save this code as a new command, script or term'
    select.innerHTML = `
      <option value="">Save as…</option>
      <option value="command">Command</option>
      <option value="script">Script</option>
      <option value="term">Term</option>`
    // notes.js treats input events inside a code block as edits.
    select.addEventListener('input', (e) => e.stopPropagation())
    select.addEventListener('change', () => {
      const kind = select.value
      select.value = ''
      if (!kind) return
      const block = select.closest('pre.note-code')
      const text = block.querySelector('.note-code-input').value
      const lang = window.NoteCodeLang
        ? window.NoteCodeLang.resolve(block.dataset.lang, text)
        : block.dataset.lang
      openFrom(kind, text, lang)
    })
    const anchor = head.querySelector('.note-code-lang')
    if (anchor) anchor.after(select)
    else head.prepend(select)
  }

  const addAll = () => editor.querySelectorAll('.note-code-head').forEach(addMenu)
  new MutationObserver(addAll).observe(editor, { childList: true, subtree: true })
  addAll()
})()
