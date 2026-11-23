/*
 * Attachments in notes: the paperclip button, files dropped or pasted into a
 * note, and the chips that stand for them.
 *
 * A chip (notes.js fileShell) holds only the file's id, name, size and type;
 * the file is kept by js/core/attachments.js (this browser, the attachments
 * folder, the database server). Click a chip, in a tome, Branch view or the
 * Archive, for Open (PDFs, pictures and text files), Download and, in a note
 * you can edit, Remove. A chip whose file this browser doesn't have is drawn
 * dashed. Chips can't go in archived notes, cards, code blocks or template
 * fields. Styles: note-files.css.
 */
;(() => {
  const api = window.NotesEditor
  const files = window.Attachments
  if (!api || !files || !api.insertFiles) return
  const editor = api.editor

  // ─── Attaching ──────────────────────────────────────────────────────
  // Stores the files, then puts a chip for each at the remembered caret.
  async function attach(list) {
    const node = api.selectedNode()
    if (!node || api.isSealed(node.id)) return
    const tooBig = list.filter((file) => file.size > files.MAX_SIZE)
    const metas = []
    const failed = []
    for (const file of list) {
      if (file.size > files.MAX_SIZE) continue
      try {
        metas.push(await files.add(file))
      } catch (err) {
        failed.push(`${file.name}: ${err.message || err}`)
      }
    }
    if (metas.length && api.selectedId() === node.id && !api.insertFiles(metas)) {
      failed.push('Attachments can’t go in a card, a code block or a template field. Put the caret in the note’s text and try again.')
    }
    if (tooBig.length || failed.length) {
      const lines = []
      if (tooBig.length)
        lines.push(`Larger than ${files.formatSize(files.MAX_SIZE)}, so not attached: ${tooBig.map((file) => file.name).join(', ')}.`)
      lines.push(...failed)
      api.ask({ title: 'Not attached', message: lines.join(' '), alertOnly: true })
    }
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.hidden = true
  document.body.appendChild(input)
  const button = document.getElementById('notes-attach')
  if (button) {
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', () => {
      const node = api.selectedNode()
      if (!node || api.isSealed(node.id)) return
      api.rememberSelection()
      input.click()
    })
  }
  input.addEventListener('change', () => {
    const list = [...input.files]
    input.value = ''
    if (list.length) attach(list)
  })

  // ─── Clicking a chip ────────────────────────────────────────────────
  const editable = (chip) => editor.contains(chip) && !api.isSealed(api.selectedId())
  async function openChip(chip) {
    const { attachment: id, name, type } = chip.dataset
    const result = await files.open(id, name, type)
    if (result === 'missing') missingMessage(name)
  }
  async function downloadChip(chip) {
    if (!(await files.download(chip.dataset.attachment, chip.dataset.name))) missingMessage(chip.dataset.name)
  }
  function missingMessage(name) {
    api.ask({
      title: 'File not found',
      message: `This browser doesn’t have “${name}”. If it was attached in another browser, choose the attachments folder that holds it in Settings → Data → Attachments (or open Spell Book from the database server it was saved to).`,
      alertOnly: true,
    })
  }
  function removeChip(chip) {
    // Through the editor, so Ctrl+Z brings it back.
    api.selectWhole(chip)
    document.execCommand('delete')
    api.afterEdit()
  }
  document.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('.note-file[data-attachment]')
    if (!chip) return
    e.preventDefault()
    const box = chip.getBoundingClientRect()
    const { name, type } = chip.dataset
    const items = []
    if (files.canOpen(name, type)) items.push(['Open', () => openChip(chip)])
    items.push(['Download', () => downloadChip(chip)])
    if (editable(chip)) items.push(null, ['Remove', () => removeChip(chip)])
    api.openMenu(box.left, box.bottom + 4, items)
  })

  // ─── Chips whose file isn't here ────────────────────────────────────
  let timer = null
  function markMissing() {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const chips = [...document.querySelectorAll('.note-file[data-attachment]')]
      const known = new Map()
      for (const chip of chips) {
        const id = chip.dataset.attachment
        if (!known.has(id)) known.set(id, await files.has(id))
        const missing = !known.get(id)
        chip.classList.toggle('is-missing', missing)
        chip.title = missing
          ? `${chip.dataset.name}: not in this browser yet (see Settings → Data → Attachments)`
          : `${chip.dataset.name}: click to open or download`
      }
    }, 250)
  }
  files.onChange(markMissing)
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches('.note-file') || n.querySelector('.note-file'))))) markMissing()
  }).observe(document.body, { childList: true, subtree: true })
  markMissing()

  window.NoteFiles = { attach }
})()
