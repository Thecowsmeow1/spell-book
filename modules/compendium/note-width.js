/*
 * Note width (Compendium): Expand on, the note's text fills the editor pane
 * (fits the screen). Expand off, the text is a column against the left, of a
 * width you set by dragging its right edge (double-click for the default).
 * One setting for every note, saved in this browser. Controls: the Expand
 * button at the end of the note toolbar, and Settings → Compendium.
 */
;(function () {
  const KEY = 'spellbook_note_width_v1'
  const DEFAULT_WIDTH = 820
  const MIN_WIDTH = 360
  const MAX_WIDTH = 3000
  const pane = document.getElementById('notes-editor-pane')
  const editor = document.getElementById('notes-editor')
  const button = document.getElementById('notes-expand')
  if (!pane || !editor) return

  // Settings → Compendium (SpellBook.settingsSection draws it at once, so the
  // radios below are found).
  window.SpellBook.settingsSection({
    id: 'compendium-note-width',
    tab: 'compendium',
    label: 'Compendium',
    order: 40,
    render(section) {
      section.innerHTML = `
        <div class="settings-data-section">
          <h3>Notes</h3>
          <fieldset class="layout-options">
            <legend>Note width</legend>
            <label><input name="note-width" type="radio" value="expand"/> Expand to fit the screen</label>
            <label><input name="note-width" type="radio" value="fixed"/> Set width</label>
            <label class="note-width-px"><input id="note-width-px" max="3000" min="360" step="10" type="number"/> px</label>
            <span class="form-hint">The same as the ↔ Expand button at the end of the note
              toolbar. With a set width, the note's text is a column on the left: drag its
              right edge to resize it, or double-click the edge for the default.</span>
          </fieldset>
        </div>`
    },
  })

  const clampWidth = (w) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(w) || DEFAULT_WIDTH)))

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
      return { expand: saved.expand !== false, width: clampWidth(saved.width) }
    } catch {
      return { expand: true, width: DEFAULT_WIDTH }
    }
  }
  let state = load()

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {}
  }

  // The edge you drag: over the right side of the text column.
  const handle = document.createElement('div')
  handle.className = 'note-width-handle'
  handle.title = 'Drag to set the note width (double-click for the default)'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-label', 'Note width')
  pane.appendChild(handle)

  function placeHandle() {
    const shown = !state.expand && editor.offsetParent !== null && !pane.classList.contains('is-empty')
    handle.hidden = !shown
    if (!shown) return
    const box = editor.getBoundingClientRect()
    const own = pane.getBoundingClientRect()
    // Just right of the text (inside the padding, clear of the scrollbar).
    const textRight = box.left + editor.clientLeft + editor.clientWidth - parseFloat(getComputedStyle(editor).paddingRight)
    handle.style.top = `${Math.round(box.top - own.top)}px`
    handle.style.height = `${Math.round(box.height)}px`
    handle.style.left = `${Math.round(textRight - own.left + 6)}px`
  }

  function apply() {
    pane.classList.toggle('note-fixed-width', !state.expand)
    pane.style.setProperty('--note-width', `${state.width}px`)
    if (button) {
      button.setAttribute('aria-pressed', String(state.expand))
      button.title = state.expand
        ? 'Expand is on: the note fits the screen. Click to set your own width.'
        : 'Expand is off: drag the note’s right edge to set its width. Click to fit the note to the screen.'
    }
    document.querySelectorAll("input[name='note-width']").forEach((radio) => {
      radio.checked = radio.value === (state.expand ? 'expand' : 'fixed')
    })
    const input = document.getElementById('note-width-px')
    if (input && document.activeElement !== input) input.value = state.width
    if (input) input.disabled = state.expand
    placeHandle()
    // Floating bars placed from the text's position (table options).
    window.dispatchEvent(new Event('resize'))
  }

  function set(changes) {
    state = { ...state, ...changes, width: clampWidth(changes.width ?? state.width) }
    save()
    apply()
  }

  if (button) {
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', () => set({ expand: !state.expand }))
  }
  document.querySelectorAll("input[name='note-width']").forEach((radio) =>
    radio.addEventListener('change', () => radio.checked && set({ expand: radio.value === 'expand' })),
  )
  const input = document.getElementById('note-width-px')
  if (input) input.addEventListener('change', () => set({ width: input.valueAsNumber }))

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('note-width-resizing')
    const move = (ev) => {
      const box = editor.getBoundingClientRect()
      const textLeft = box.left + editor.clientLeft + parseFloat(getComputedStyle(editor).paddingLeft)
      // The padding is reckoned on the whole width, scrollbar included.
      const scrollbar = box.width - editor.clientWidth - 2 * editor.clientLeft
      // The column starts at the left: only its right edge moves.
      state.width = clampWidth(ev.clientX - 6 - textLeft + scrollbar)
      apply()
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('note-width-resizing')
      save()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  })
  handle.addEventListener('dblclick', () => set({ width: DEFAULT_WIDTH }))

  // The handle follows the editor as the window, the tree or the panes above
  // the note (tags, environment variables) change size.
  new ResizeObserver(placeHandle).observe(editor)
  new ResizeObserver(placeHandle).observe(pane)
  window.addEventListener('resize', placeHandle)

  window.NoteWidth = {
    reset() {
      try {
        localStorage.removeItem(KEY)
      } catch {}
      state = load()
      apply()
    },
  }
  apply()
})()
