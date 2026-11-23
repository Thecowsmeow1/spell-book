/*
 * Small helpers every tab may use (core). Classic-script globals, so the
 * existing code keeps calling them by name.
 */

// Text made safe to put inside HTML (and inside a quoted attribute).
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Lowercased, de-duplicated tags from an array or a comma/semicolon string.
function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;]/)
  return [
    ...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean)),
  ]
}

// Saves text as a file through the browser's download.
function downloadFile(fileName, contents, type) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Hex color fields ────────────────────────────────────────────────
// The browser's own color picker may open in RGB or HSL, so each color input
// gets a plain "#rrggbb" box beside it. Both stay in sync; typing a valid hex
// value (3 or 6 digits) updates the color.
function normalizeHex(value) {
  let v = String(value).trim().toLowerCase()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : ''
}

// Returns the hex text box; the caller places it. `colorInput.syncHex()` must
// be called after setting colorInput.value from code.
function attachHexField(colorInput) {
  const text = document.createElement('input')
  text.type = 'text'
  text.className = 'hex-input'
  text.maxLength = 7
  text.spellcheck = false
  text.autocomplete = 'off'
  text.setAttribute('aria-label', 'Hex color')
  const sync = () => {
    text.value = colorInput.value
  }
  colorInput.syncHex = sync
  sync()
  colorInput.addEventListener('input', sync)
  text.addEventListener('input', () => {
    const hex = normalizeHex(text.value)
    if (!hex) return
    // Wait for the full 6 digits (or a complete 3-digit shorthand on blur).
    if (hex.length === 7 && text.value.replace('#', '').length === 6) {
      colorInput.value = hex
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  text.addEventListener('blur', () => {
    const hex = normalizeHex(text.value)
    if (hex && hex !== colorInput.value) {
      colorInput.value = hex
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
    sync() // put back the last valid color if the text was incomplete
  })
  return text
}
