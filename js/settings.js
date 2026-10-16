// ─── Settings ─────────────────────────────────────────────────────────
const SETTINGS_KEY = 'cmdref_settings_v1'
// The default colors live in styles.css: :root holds the dark theme and
// :root[data-mode='light'] the light one. Only the colors you change are saved
// here, as overrides on top of those defaults.
const THEME_KEYS = [
  'bg',
  'surface',
  'surface2',
  'border',
  'text',
  'muted',
  'accent',
  'win',
  'lin',
  'ws',
  'rs',
  'kb',
  'ar',
]
const MODE_KEY = 'spellbook_mode_v1'

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

// The default colors for the current mode, read straight from the stylesheet.
// Any colors applied from settings are lifted off while reading.
function readCssDefaults() {
  document.documentElement.dataset.mode = loadMode()
  const style = document.documentElement.style
  const applied = THEME_KEYS.map((key) => [
    key,
    style.getPropertyValue(`--${key}`),
  ])
  applied.forEach(([key]) => style.removeProperty(`--${key}`))
  const computed = getComputedStyle(document.documentElement)
  const defaults = Object.fromEntries(
    THEME_KEYS.map((key) => [
      key,
      computed.getPropertyValue(`--${key}`).trim(),
    ]),
  )
  applied.forEach(([key, value]) => {
    if (value) style.setProperty(`--${key}`, value)
  })
  return defaults
}

const sameColor = (a, b) => normalizeHex(a) === normalizeHex(b)

// Colors you changed from the current mode's defaults: { key: '#rrggbb' }.
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
    const defaults = readCssDefaults()
    return Object.fromEntries(
      THEME_KEYS.filter(
        (key) =>
          normalizeHex(saved[key]) && !sameColor(saved[key], defaults[key]),
      ).map((key) => [key, normalizeHex(saved[key])]),
    )
  } catch {
    return {}
  }
}

// Every theme color as currently shown: CSS defaults plus your overrides.
function effectiveTheme() {
  return { ...readCssDefaults(), ...loadSettings() }
}

// Applies overrides only; every other color falls back to the stylesheet.
function applyTheme(overrides = loadSettings()) {
  const style = document.documentElement.style
  document.documentElement.dataset.mode = loadMode()
  THEME_KEYS.forEach((key) => {
    if (overrides[key]) style.setProperty(`--${key}`, overrides[key])
    else style.removeProperty(`--${key}`)
  })
}

function saveSettings(overrides) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(overrides))
}

// Fills the color pickers from a theme. A theme color without a picker on the
// page (for example one for a removed quick filter) is skipped.
function fillColorInputs(theme = effectiveTheme()) {
  THEME_KEYS.forEach((key) => {
    const input = document.getElementById(`color-${key}`)
    if (input && theme[key]) {
      input.value = theme[key]
      if (input.syncHex) input.syncHex()
    }
  })
}

function openSettings() {
  fillColorInputs()
  if (typeof renderDataFileStatus === 'function') renderDataFileStatus()
  applyCodeTheme(loadCodeTheme())
  renderSyntaxColorSettings()
  showSettingsTab('appearance')
  const position = document.querySelector(
    `input[name='controls-position'][value='${loadControlsPosition()}']`,
  )
  if (position) position.checked = true
  renderCategoryColorSettings()
  document.getElementById('settings-modal').classList.add('open')
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open')
}
document.getElementById('btn-settings').addEventListener('click', openSettings)
document
  .getElementById('btn-settings-close')
  .addEventListener('click', closeSettings)
document.getElementById('btn-settings-reset').addEventListener('click', () => {
  saveSettings({})
  applyTheme({})
  fillColorInputs()
})

// Clicking outside the window does not close it; use Done (or Esc).
// A hex box beside every theme color picker.
document.querySelectorAll('.color-setting').forEach((input) => {
  const pair = document.createElement('span')
  pair.className = 'cat-color-controls'
  input.replaceWith(pair)
  pair.append(input, attachHexField(input))
})
document.querySelectorAll('.color-setting').forEach((input) =>
  input.addEventListener('input', () => {
    const theme = loadSettings()
    // A color that matches the stylesheet default is not stored as an override.
    if (sameColor(input.value, readCssDefaults()[input.dataset.key])) {
      delete theme[input.dataset.key]
    } else {
      theme[input.dataset.key] = input.value
    }
    applyTheme(theme)
    saveSettings(theme)
  }),
)

// ─── Light / dark mode ────────────────────────────────────────────────
// The button in the navigation bar shows the mode you would switch to: a sun
// while in dark mode, a crescent moon while in light mode. Switching uses the
// new mode's stylesheet colors (a custom accent color is kept).
function updateModeButton() {
  const button = document.getElementById('btn-mode')
  if (!button) return
  const next = loadMode() === 'light' ? 'dark' : 'light'
  const label = `Switch to ${next} mode`
  button.title = label
  button.setAttribute('aria-label', label)
  button.dataset.mode = loadMode()
}

function setMode(mode) {
  const accent = loadSettings().accent
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {}
  // The new mode's colors come from the stylesheet; only the accent you chose
  // (if any) is carried over.
  const overrides = accent ? { accent } : {}
  saveSettings(overrides)
  applyTheme(overrides)
  fillColorInputs()
  updateModeButton()
  // The code theme's defaults can differ between modes.
  clearSyntaxOverrides()
  renderSyntaxColorSettings()
}

document
  .getElementById('btn-mode')
  .addEventListener('click', () =>
    setMode(loadMode() === 'light' ? 'dark' : 'light'),
  )

// ─── Code block theme ─────────────────────────────────────────────────
// The theme colors themselves are in styles.css (:root[data-code-theme=...]).
const CODE_THEME_KEY = 'spellbook_code_theme_v1'
const CODE_THEMES = [
  'default',
  'midnight',
  'terminal',
  'solarized',
  'dracula',
  'monokai',
  'paper',
]

function loadCodeTheme() {
  try {
    const saved = localStorage.getItem(CODE_THEME_KEY)
    return CODE_THEMES.includes(saved) ? saved : 'default'
  } catch {
    return 'default'
  }
}

function applyCodeTheme(name) {
  if (name === 'default') delete document.documentElement.dataset.codeTheme
  else document.documentElement.dataset.codeTheme = name
  const select = document.getElementById('code-theme')
  if (select) select.value = name
}

function setCodeTheme(name) {
  const theme = CODE_THEMES.includes(name) ? name : 'default'
  try {
    if (theme === 'default') localStorage.removeItem(CODE_THEME_KEY)
    else localStorage.setItem(CODE_THEME_KEY, theme)
  } catch {}
  clearSyntaxOverrides()
  applyCodeTheme(theme)
  renderSyntaxColorSettings()
}

document
  .getElementById('code-theme')
  .addEventListener('change', (e) => setCodeTheme(e.target.value))

// ─── Settings tabs ────────────────────────────────────────────────────
function showSettingsTab(name) {
  document.querySelectorAll('.settings-tab').forEach((tab) => {
    const active = tab.dataset.tab === name
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name
  })
}

document
  .querySelectorAll('.settings-tab')
  .forEach((tab) =>
    tab.addEventListener('click', () => showSettingsTab(tab.dataset.tab)),
  )

// ─── Options section default ──────────────────────────────────────────
document.querySelectorAll("input[name='options-default']").forEach((radio) => {
  radio.checked =
    radio.value === (optionsDefaultOpen() ? 'expanded' : 'collapsed')
  radio.addEventListener('change', () => {
    try {
      localStorage.setItem(OPTIONS_OPEN_KEY, radio.value)
    } catch {}
    renderDetail()
  })
})

// ─── Fonts ────────────────────────────────────────────────────────────
// Each part of the page can use its own font. Only the typeface changes, and
// only from a fixed list of common fonts (each ends in a generic family, so
// the page still works when a font is not installed). Code and scratch pad
// text are limited to fixed-width fonts.
const FONTS_KEY = 'spellbook_fonts_v1'
const TEXT_FONTS = [
  ['system', 'System UI', "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ['segoe', 'Segoe UI', "'Segoe UI', system-ui, sans-serif"],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
  ['verdana', 'Verdana', 'Verdana, Geneva, sans-serif'],
  ['tahoma', 'Tahoma', 'Tahoma, Geneva, sans-serif'],
  ['trebuchet', 'Trebuchet MS', "'Trebuchet MS', Helvetica, sans-serif"],
  ['calibri', 'Calibri', "Calibri, Candara, 'Segoe UI', sans-serif"],
  ['georgia', 'Georgia', "Georgia, 'Times New Roman', serif"],
  ['times', 'Times New Roman', "'Times New Roman', Times, serif"],
  ['palatino', 'Palatino', "'Palatino Linotype', Palatino, serif"],
  ['mono', 'Monospace', "ui-monospace, Consolas, 'Courier New', monospace"],
]
const MONO_FONTS = [
  ['cascadia', 'Cascadia Code', "'Cascadia Code', Consolas, monospace"],
  ['consolas', 'Consolas', "Consolas, 'Courier New', monospace"],
  ['fira', 'Fira Code', "'Fira Code', Consolas, monospace"],
  ['jetbrains', 'JetBrains Mono', "'JetBrains Mono', Consolas, monospace"],
  ['sourcecode', 'Source Code Pro', "'Source Code Pro', Consolas, monospace"],
  ['menlo', 'Menlo / Monaco', 'Menlo, Monaco, Consolas, monospace'],
  ['lucida', 'Lucida Console', "'Lucida Console', Consolas, monospace"],
  ['courier', 'Courier New', "'Courier New', Courier, monospace"],
  ['monospace', 'Browser monospace', 'monospace'],
]
// [key, label, CSS variable, choices]
const FONT_SECTIONS = [
  ['nav', 'Navigation bar', '--font-nav', TEXT_FONTS],
  ['controls', 'Control bar', '--font-controls', TEXT_FONTS],
  ['table', 'Table', '--font-table', TEXT_FONTS],
  ['detail', 'Detail pane', '--font-detail', TEXT_FONTS],
  ['windows', 'Windows (Add / Edit, Settings)', '--font-windows', TEXT_FONTS],
  ['code', 'Code blocks and fields', '--mono', MONO_FONTS],
  ['scratch', 'Scratch pad', '--font-scratch', MONO_FONTS],
]

function loadFonts() {
  try {
    const data = JSON.parse(localStorage.getItem(FONTS_KEY))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

function saveFonts(choices) {
  try {
    if (Object.keys(choices).length) {
      localStorage.setItem(FONTS_KEY, JSON.stringify(choices))
    } else {
      localStorage.removeItem(FONTS_KEY)
    }
  } catch {}
}

function applyFonts() {
  const choices = loadFonts()
  const style = document.documentElement.style
  FONT_SECTIONS.forEach(([key, , variable, fonts]) => {
    const font = fonts.find(([id]) => id === choices[key])
    if (font) style.setProperty(variable, font[2])
    else style.removeProperty(variable)
  })
}

function renderFontSettings() {
  const host = document.getElementById('font-settings')
  const choices = loadFonts()
  host.replaceChildren()
  FONT_SECTIONS.forEach(([key, label, , fonts]) => {
    const row = document.createElement('label')
    row.className = 'font-row'
    row.append(label)
    const select = document.createElement('select')
    const standard = document.createElement('option')
    standard.value = ''
    standard.textContent = 'Default'
    select.append(standard)
    fonts.forEach(([id, name, stack]) => {
      const option = document.createElement('option')
      option.value = id
      option.textContent = name
      option.style.fontFamily = stack
      select.append(option)
    })
    select.value = fonts.some(([id]) => id === choices[key]) ? choices[key] : ''
    select.addEventListener('change', () => {
      const next = loadFonts()
      if (select.value) next[key] = select.value
      else delete next[key]
      saveFonts(next)
      applyFonts()
    })
    row.append(select)
    host.append(row)
  })
}

document.getElementById('btn-fonts-reset').addEventListener('click', () => {
  saveFonts({})
  applyFonts()
  renderFontSettings()
})
applyFonts()
renderFontSettings()

// ─── Syntax colors ────────────────────────────────────────────────────
// The code theme (styles.css) supplies the defaults. Colors you change are
// saved as overrides on top of it and applied to the page as CSS variables.
const SYNTAX_COLORS_KEY = 'spellbook_syntax_colors_v1'
const SYNTAX_FIELDS = [
  ['code-bg', 'Background'],
  ['code-fg', 'Plain text'],
  ['code-border', 'Border'],
  ['tok-comment', 'Comments'],
  ['tok-string', 'Strings'],
  ['tok-variable', 'Variables'],
  ['tok-keyword', 'Keywords'],
  ['tok-function', 'Commands & cmdlets'],
  ['tok-number', 'Numbers'],
  ['tok-flag', 'Flags & parameters'],
  ['tok-placeholder', 'Placeholders'],
  ['tok-operator', 'Operators'],
]
const SYNTAX_KEYS = SYNTAX_FIELDS.map(([key]) => key)

// The current code theme's own colors, read from the stylesheet. Any
// overrides are lifted off while reading.
function readSyntaxDefaults() {
  const style = document.documentElement.style
  const applied = SYNTAX_KEYS.map((key) => [
    key,
    style.getPropertyValue(`--${key}`),
  ])
  applied.forEach(([key]) => style.removeProperty(`--${key}`))
  const computed = getComputedStyle(document.documentElement)
  const defaults = Object.fromEntries(
    SYNTAX_KEYS.map((key) => [
      key,
      normalizeHex(computed.getPropertyValue(`--${key}`).trim()),
    ]),
  )
  applied.forEach(([key, value]) => {
    if (value) style.setProperty(`--${key}`, value)
  })
  return defaults
}

function loadSyntaxOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNTAX_COLORS_KEY)) || {}
    const defaults = readSyntaxDefaults()
    return Object.fromEntries(
      SYNTAX_KEYS.filter(
        (key) =>
          normalizeHex(saved[key]) && !sameColor(saved[key], defaults[key]),
      ).map((key) => [key, normalizeHex(saved[key])]),
    )
  } catch {
    return {}
  }
}

function applySyntaxOverrides(overrides = loadSyntaxOverrides()) {
  const style = document.documentElement.style
  SYNTAX_KEYS.forEach((key) => {
    if (overrides[key]) style.setProperty(`--${key}`, overrides[key])
    else style.removeProperty(`--${key}`)
  })
}

function saveSyntaxOverrides(overrides) {
  try {
    if (Object.keys(overrides).length) {
      localStorage.setItem(SYNTAX_COLORS_KEY, JSON.stringify(overrides))
    } else {
      localStorage.removeItem(SYNTAX_COLORS_KEY)
    }
  } catch {}
}

// Every syntax color as currently shown: theme defaults plus your overrides.
function effectiveSyntax() {
  return { ...readSyntaxDefaults(), ...loadSyntaxOverrides() }
}

function clearSyntaxOverrides() {
  saveSyntaxOverrides({})
  applySyntaxOverrides({})
}

function renderSyntaxColorSettings() {
  const container = document.getElementById('syntax-colors')
  if (!container) return
  const colors = effectiveSyntax()
  const grid = document.createElement('div')
  grid.className = 'settings-grid'
  SYNTAX_FIELDS.forEach(([key, label]) => {
    const row = document.createElement('label')
    const text = document.createElement('span')
    text.textContent = label
    const controls = document.createElement('span')
    controls.className = 'cat-color-controls'
    const input = document.createElement('input')
    input.type = 'color'
    input.value = colors[key] || '#000000'
    input.addEventListener('input', () => {
      const overrides = loadSyntaxOverrides()
      if (sameColor(input.value, readSyntaxDefaults()[key])) {
        delete overrides[key]
      } else {
        overrides[key] = input.value
      }
      saveSyntaxOverrides(overrides)
      applySyntaxOverrides(overrides)
    })
    controls.append(input, attachHexField(input))
    row.append(text, controls)
    grid.appendChild(row)
  })
  container.replaceChildren(grid)
}

// Applies a code theme plus syntax colors (used by imports).
function applySyntaxColors(codeTheme, colors) {
  if (codeTheme !== undefined) setCodeTheme(codeTheme) // also clears overrides
  const defaults = readSyntaxDefaults()
  const overrides = {}
  SYNTAX_KEYS.forEach((key) => {
    const hex = normalizeHex((colors && colors[key]) || '')
    if (hex && !sameColor(hex, defaults[key])) overrides[key] = hex
  })
  saveSyntaxOverrides(overrides)
  applySyntaxOverrides(overrides)
  renderSyntaxColorSettings()
}

document.getElementById('btn-syntax-reset').addEventListener('click', () => {
  clearSyntaxOverrides()
  renderSyntaxColorSettings()
})

document.getElementById('btn-syntax-export').addEventListener('click', () => {
  downloadFile(
    'spellbook-code-theme.json',
    JSON.stringify(
      {
        app: 'spellbook-syntax-colors',
        version: 1,
        codeTheme: loadCodeTheme(),
        colors: effectiveSyntax(),
      },
      null,
      2,
    ) + '\n',
    'application/json;charset=utf-8',
  )
})

const syntaxImportFile = document.getElementById('syntax-import-file')
document.getElementById('btn-syntax-import').addEventListener('click', () => {
  syntaxImportFile.value = ''
  syntaxImportFile.click()
})
syntaxImportFile.addEventListener('change', async () => {
  const file = syntaxImportFile.files && syntaxImportFile.files[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data || typeof data !== 'object' || !data.colors) {
      throw new Error('This is not a code theme file.')
    }
    applySyntaxColors(
      CODE_THEMES.includes(data.codeTheme) ? data.codeTheme : undefined,
      data.colors,
    )
  } catch (err) {
    alert('Code theme import failed: ' + err.message)
  }
})

// ─── Appearance theme and category colors (per-tab import / export) ───
// Export All Themes (the pinned bar) saves everything; these save one tab each.
// The Code Blocks tab has its own Export Code Theme / Import Code Theme.
function applyAppearanceTheme(data) {
  const before = loadMode()
  try {
    localStorage.setItem(MODE_KEY, data.mode === 'light' ? 'light' : 'dark')
  } catch {}
  // Colors equal to the stylesheet defaults are not stored as overrides.
  const defaults = readCssDefaults()
  const overrides = {}
  THEME_KEYS.forEach((key) => {
    const hex = normalizeHex((data.colors && data.colors[key]) || '')
    if (hex && !sameColor(hex, defaults[key])) overrides[key] = hex
  })
  saveSettings(overrides)
  applyTheme(overrides)
  fillColorInputs()
  updateModeButton()
  // The code theme's default colors differ between light and dark.
  if (loadMode() !== before) {
    clearSyntaxOverrides()
    renderSyntaxColorSettings()
  }
}

// Reads a chosen JSON file, checks it, and hands it to `apply`.
function importThemeFile(input, label, isValid, apply) {
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object' || !isValid(data)) {
        throw new Error(
          `This is not ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label} file.`,
        )
      }
      apply(data)
    } catch (err) {
      alert(
        `${label[0].toUpperCase()}${label.slice(1)} import failed: ${err.message}`,
      )
    }
  })
}

function wireThemeFileButton(buttonId, inputId) {
  const input = document.getElementById(inputId)
  document.getElementById(buttonId).addEventListener('click', () => {
    input.value = ''
    input.click()
  })
  return input
}

document
  .getElementById('btn-appearance-export')
  .addEventListener('click', () => {
    downloadFile(
      'spellbook-appearance-theme.json',
      JSON.stringify(
        {
          app: 'spellbook-appearance-theme',
          version: 1,
          mode: loadMode(),
          colors: effectiveTheme(),
        },
        null,
        2,
      ) + '\n',
      'application/json;charset=utf-8',
    )
  })
importThemeFile(
  wireThemeFileButton('btn-appearance-import', 'appearance-import-file'),
  'appearance theme',
  (data) => data.colors && typeof data.colors === 'object',
  applyAppearanceTheme,
)

document
  .getElementById('btn-categories-export')
  .addEventListener('click', () => {
    downloadFile(
      'spellbook-category-colors.json',
      JSON.stringify(
        {
          app: 'spellbook-category-colors',
          version: 1,
          categoryColors: getCategoryColors(),
        },
        null,
        2,
      ) + '\n',
      'application/json;charset=utf-8',
    )
  })
importThemeFile(
  wireThemeFileButton('btn-categories-import', 'categories-import-file'),
  'category colors',
  (data) => data.categoryColors && typeof data.categoryColors === 'object',
  (data) => {
    replaceCategoryColors(data.categoryColors)
    renderCategoryColorSettings()
  },
)

// ─── Theme import / export ────────────────────────────────────────────
// A theme file holds the mode, every theme color and every category color.
document.getElementById('btn-theme-export').addEventListener('click', () => {
  const theme = {
    app: 'spellbook-theme',
    version: 1,
    mode: loadMode(),
    colors: effectiveTheme(),
    categoryColors: getCategoryColors(),
    codeTheme: loadCodeTheme(),
    syntaxColors: effectiveSyntax(),
  }
  downloadFile(
    'spellbook-theme.json',
    JSON.stringify(theme, null, 2) + '\n',
    'application/json;charset=utf-8',
  )
})

const themeImportFile = document.getElementById('theme-import-file')
document.getElementById('btn-theme-import').addEventListener('click', () => {
  themeImportFile.value = ''
  themeImportFile.click()
})
themeImportFile.addEventListener('change', async () => {
  const file = themeImportFile.files && themeImportFile.files[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (
      !data ||
      typeof data !== 'object' ||
      !data.colors ||
      typeof data.colors !== 'object'
    ) {
      throw new Error('This is not a Spell Book theme file.')
    }
    applyAppearanceTheme(data)
    replaceCategoryColors(data.categoryColors)
    applySyntaxColors(data.codeTheme, data.syntaxColors)
    renderCategoryColorSettings()
  } catch (err) {
    alert('Theme import failed: ' + err.message)
  }
})

// ─── Control bar position ─────────────────────────────────────────────
const LAYOUT_KEY = 'spellbook_layout_v1'
const CONTROLS_POSITIONS = ['left', 'top', 'right']

function loadControlsPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}').controls
    return CONTROLS_POSITIONS.includes(saved) ? saved : 'top'
  } catch {
    return 'top'
  }
}

function applyControlsPosition(position) {
  document.getElementById('page-spellbook').dataset.controls = position
  if (typeof applyTableDock === 'function') applyTableDock()
  if (typeof updateLayoutButtons === 'function') updateLayoutButtons()
  if (typeof placeScratchpad === 'function') placeScratchpad()
  // The table / detail split depends on the available height.
  if (window.restoreSplitHeight) window.restoreSplitHeight()
}

function setControlsPosition(position) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ controls: position }))
  } catch {}
  const radio = document.querySelector(
    `input[name='controls-position'][value='${position}']`,
  )
  if (radio) radio.checked = true
  applyControlsPosition(position)
}

document
  .querySelectorAll('[data-controls-pos]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      setControlsPosition(button.dataset.controlsPos),
    ),
  )

document.querySelectorAll("input[name='controls-position']").forEach((radio) =>
  radio.addEventListener('change', () => {
    if (radio.checked) setControlsPosition(radio.value)
  }),
)

// ─── Linked data file ─────────────────────────────────────────────────
// The last problem from a button here, shown in the status line (and the
// console) so a failure is never silent.
let dataFileMessage = ''

function describeDataFile(state) {
  if (!state.supported) {
    if (!window.isSecureContext) {
      return 'File linking needs a secure page: open Spell Book from localhost, https, or a file:// address in Chrome or Edge.'
    }
    return 'This browser has no file linking (File System Access API). Use Chrome or Edge; in Brave it is off by default (brave://flags/#file-system-access-api).'
  }
  if (!state.name) {
    return 'Not linked. Your data is kept only in this browser.'
  }
  let text = `Linked to "${state.name}".`
  if (state.permission !== 'granted') {
    text += ' The browser needs your permission again: click Reconnect.'
  } else if (state.lastSaved) {
    text += ` Last saved ${state.lastSaved.toLocaleTimeString()}.`
  } else {
    text += state.autosave ? ' Autosave is on.' : ' Autosave is off.'
  }
  if (state.lastError) text += ` ${state.lastError}`
  if (dataFileMessage) text += ` ${dataFileMessage}`
  return text
}

async function renderDataFileStatus() {
  const status = document.getElementById('datafile-status')
  if (!status || !window.DataFile) return
  const state = await window.DataFile.getState()
  const linked = Boolean(state.name)
  status.textContent = describeDataFile(state)
  const set = (id, enabled) => {
    document.getElementById(id).disabled = !enabled
  }
  set('btn-datafile-new', state.supported)
  set('btn-datafile-open', state.supported)
  set('btn-datafile-save', linked)
  set('btn-datafile-load', linked)
  set('btn-datafile-unlink', linked)
  set('datafile-autosave', linked)
  document.getElementById('btn-datafile-reconnect').hidden =
    !linked || state.permission === 'granted'
  document.getElementById('datafile-autosave').checked = state.autosave
}

// A cancelled file picker is not an error.
const dataFileAction = (run) => async () => {
  dataFileMessage = ''
  try {
    await run()
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      console.error('Data file:', err)
      dataFileMessage = `Problem: ${err.name ? err.name + ': ' : ''}${err.message || err}`
      alert(dataFileMessage)
    }
  }
  renderDataFileStatus()
}

// Download Backup / Restore From File work without the File System Access API.
if (window.DataFile) {
  document
    .getElementById('btn-datafile-download')
    .addEventListener('click', () => {
      downloadFile(
        'spellbook-data.js',
        window.DataFile.exportScript(),
        'text/javascript;charset=utf-8',
      )
    })
  const restoreFile = document.getElementById('datafile-restore-file')
  document
    .getElementById('btn-datafile-restore')
    .addEventListener('click', () => {
      restoreFile.value = ''
      restoreFile.click()
    })
  restoreFile.addEventListener('change', async () => {
    const file = restoreFile.files && restoreFile.files[0]
    if (!file) return
    try {
      const text = await file.text()
      if (
        !confirm(
          `Replace the data saved in this browser with the contents of "${file.name}"?`,
        )
      ) {
        return
      }
      window.DataFile.importText(text)
      location.reload()
    } catch (err) {
      alert('Restore failed: ' + (err.message || err))
    }
  })
}

if (window.DataFile) {
  window.DataFile.onChange(renderDataFileStatus)

  document.getElementById('btn-datafile-new').addEventListener(
    'click',
    dataFileAction(async () => {
      await window.DataFile.linkNew()
    }),
  )

  document.getElementById('btn-datafile-open').addEventListener(
    'click',
    dataFileAction(async () => {
      const { name, data } = await window.DataFile.linkExisting()
      if (
        data &&
        confirm(
          `Load the data in "${name}"?\n\nOK replaces the data saved in this browser with the file's. Cancel keeps this browser's data and writes it into the file instead.`,
        )
      ) {
        window.DataFile.apply(data)
        location.reload()
        return
      }
      await window.DataFile.save()
    }),
  )

  document.getElementById('btn-datafile-reconnect').addEventListener(
    'click',
    dataFileAction(async () => {
      await window.DataFile.reconnect()
    }),
  )

  document.getElementById('btn-datafile-save').addEventListener(
    'click',
    dataFileAction(async () => {
      if (!(await window.DataFile.save())) {
        const state = await window.DataFile.getState()
        throw new Error(state.lastError || 'The data file could not be saved.')
      }
    }),
  )

  document.getElementById('btn-datafile-load').addEventListener(
    'click',
    dataFileAction(async () => {
      if (
        !confirm(
          "Replace the data saved in this browser with the linked file's?",
        )
      ) {
        return
      }
      await window.DataFile.loadNow()
      location.reload()
    }),
  )

  document.getElementById('btn-datafile-unlink').addEventListener(
    'click',
    dataFileAction(async () => {
      if (!confirm('Unlink the data file? The file itself is not deleted.')) {
        return
      }
      await window.DataFile.unlink()
    }),
  )

  document.getElementById('datafile-autosave').addEventListener(
    'change',
    dataFileAction(async () => {
      const on = document.getElementById('datafile-autosave').checked
      window.DataFile.setAutosave(on)
      if (on) await window.DataFile.save() // write the current data right away
    }),
  )
}

// ─── Side control bar width ───────────────────────────────────────────
// With the control bar on the left or right, drag its inner edge to change its
// width (arrow keys work too; double-click resets). The sections inside wrap
// to fit whatever width it has.
const CONTROLS_WIDTH_KEY = 'spellbook_controls_width_v1'
const CONTROLS_MIN_WIDTH = 240

function setControlsWidth(px, persist = true) {
  const page = document.getElementById('page-spellbook')
  if (!page.clientWidth) return // the Spell Book page is not showing
  const max = Math.max(
    CONTROLS_MIN_WIDTH,
    Math.min(640, page.clientWidth - 320),
  )
  const width = Math.round(Math.min(Math.max(px, CONTROLS_MIN_WIDTH), max))
  page.style.setProperty('--controls-width', `${width}px`)
  if (persist) {
    try {
      localStorage.setItem(CONTROLS_WIDTH_KEY, String(width))
    } catch {}
  }
}

function resetControlsWidth() {
  document
    .getElementById('page-spellbook')
    .style.removeProperty('--controls-width')
  try {
    localStorage.removeItem(CONTROLS_WIDTH_KEY)
  } catch {}
}

function restoreControlsWidth() {
  try {
    const saved = Number.parseFloat(localStorage.getItem(CONTROLS_WIDTH_KEY))
    if (saved > 0) setControlsWidth(saved, false)
  } catch {}
}

{
  const resizer = document.getElementById('controls-resizer')
  const page = document.getElementById('page-spellbook')
  const sideLeft = () => page.dataset.controls === 'left'
  const currentWidth = () =>
    document.querySelector('#page-spellbook > header').offsetWidth

  resizer.addEventListener('pointerdown', (e) => {
    resizer.setPointerCapture(e.pointerId)
    resizer.classList.add('dragging')
    document.body.style.userSelect = 'none'
  })
  resizer.addEventListener('pointermove', (e) => {
    if (!resizer.hasPointerCapture(e.pointerId)) return
    const rect = page.getBoundingClientRect()
    setControlsWidth(
      sideLeft() ? e.clientX - rect.left : rect.right - e.clientX,
    )
  })
  const endDrag = (e) => {
    if (resizer.hasPointerCapture(e.pointerId)) {
      resizer.releasePointerCapture(e.pointerId)
    }
    resizer.classList.remove('dragging')
    document.body.style.userSelect = ''
  }
  resizer.addEventListener('pointerup', endDrag)
  resizer.addEventListener('pointercancel', endDrag)
  resizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 80 : 20
    const grow = (e.key === 'ArrowRight') === sideLeft()
    setControlsWidth(currentWidth() + (grow ? step : -step))
  })
  resizer.addEventListener('dblclick', resetControlsWidth)
  // Keep a saved width valid when the window shrinks.
  window.addEventListener('resize', () => {
    if (page.style.getPropertyValue('--controls-width')) {
      setControlsWidth(currentWidth(), false)
    }
  })
}

// ─── Table / details arrangement ──────────────────────────────────────
const PANES_KEY = 'spellbook_panes_v1'

function loadPanesLayout() {
  try {
    return JSON.parse(localStorage.getItem(PANES_KEY) || '{}').layout === 'side'
      ? 'side'
      : 'stacked'
  } catch {
    return 'stacked'
  }
}

// Dock table / Side by side buttons: labels, tooltips and availability.
function updateLayoutButtons() {
  const page = document.getElementById('page-spellbook')
  document.querySelectorAll('[data-controls-pos]').forEach((button) => {
    const on = button.dataset.controlsPos === page.dataset.controls
    button.classList.toggle('active', on)
    button.setAttribute('aria-pressed', String(on))
  })
  const docked = page.dataset.tableDock === 'control'
  const dock = document.getElementById('btn-dock')
  if (dock) {
    dock.textContent = docked ? 'Undock table' : 'Dock table'
    dock.title = docked
      ? 'Put the table pane back in the main area'
      : 'Put the table pane in the control bar (the control bar moves to the left if it is on top)'
  }
  const panes = document.getElementById('btn-panes')
  if (panes) {
    // The table and details are not side by side while the table is docked.
    panes.disabled = docked
    if (docked)
      panes.title = 'Not available while the table is in the control bar'
  }
}

function applyPanesLayout(layout) {
  const page = document.getElementById('page-spellbook')
  page.dataset.panes = layout
  const radio = document.querySelector(
    `input[name='panes-layout'][value='${layout}']`,
  )
  if (radio) radio.checked = true
  const button = document.getElementById('btn-panes')
  if (button) {
    button.textContent = layout === 'side' ? 'Stacked' : 'Side by side'
    button.title =
      layout === 'side'
        ? 'Put the table above the details'
        : 'Put the table and the details side by side'
  }
  updateLayoutButtons()
  // The saved size depends on the arrangement.
  if (window.restoreSplitHeight) window.restoreSplitHeight()
  // The table pane shows as cards when it sits beside the details.
  if (typeof renderList === 'function') renderList()
}

function setPanesLayout(layout) {
  try {
    if (layout === 'side') {
      localStorage.setItem(PANES_KEY, JSON.stringify({ layout }))
    } else {
      localStorage.removeItem(PANES_KEY)
    }
  } catch {}
  applyPanesLayout(layout)
}

document.querySelectorAll("input[name='panes-layout']").forEach((radio) =>
  radio.addEventListener('change', () => {
    if (radio.checked) setPanesLayout(radio.value)
  }),
)
document
  .getElementById('btn-panes')
  .addEventListener('click', () =>
    setPanesLayout(loadPanesLayout() === 'side' ? 'stacked' : 'side'),
  )

// ─── Table pane in the control bar ────────────────────────────────────
// With the control bar on the left or right, the table pane can live inside it,
// under the sections, with a draggable divider between them; the detail pane
// then fills the main area.
const TABLE_DOCK_KEY = 'spellbook_table_dock_v1'
const DOCK_SPLIT_KEY = 'spellbook_dock_split_v1'

function loadTableDock() {
  try {
    return localStorage.getItem(TABLE_DOCK_KEY) === 'control'
      ? 'control'
      : 'main'
  } catch {
    return 'main'
  }
}

// What is actually in effect: the control bar must be on a side.
function effectiveTableDock() {
  const page = document.getElementById('page-spellbook')
  const sideBar = ['left', 'right'].includes(page.dataset.controls)
  return loadTableDock() === 'control' && sideBar ? 'control' : 'main'
}

function applyTableDock() {
  const page = document.getElementById('page-spellbook')
  const header = page.querySelector(':scope > header')
  const main = page.querySelector('.main')
  const table = document.getElementById('cmd-list')
  const dockSplitter = document.getElementById('dock-splitter')
  const mainSplitter = document.getElementById('splitter')
  const dock = effectiveTableDock()
  const radio = document.querySelector(
    `input[name='table-dock'][value='${loadTableDock()}']`,
  )
  if (radio) radio.checked = true
  if (page.dataset.tableDock === dock) {
    updateLayoutButtons()
    return
  }
  page.dataset.tableDock = dock
  table.style.flexBasis = ''
  if (dock === 'control') {
    dockSplitter.hidden = false
    header.append(dockSplitter, table)
    restoreDockSplit()
  } else {
    dockSplitter.hidden = true
    header.append(dockSplitter) // stays in the header, hidden
    main.insertBefore(table, mainSplitter)
    document.getElementById('control-sections').style.flexBasis = ''
    if (window.restoreSplitHeight) window.restoreSplitHeight()
  }
  updateLayoutButtons()
  placeScratchpad() // keep it last in the control bar
  renderList() // lay the table out for its new width
}

function setDockSplit(px, persist = true) {
  const header = document.querySelector('#page-spellbook > header')
  const sections = document.getElementById('control-sections')
  if (!header.clientHeight) return
  const max = header.clientHeight - 8 - 120
  const height = Math.round(Math.min(Math.max(px, 120), Math.max(120, max)))
  sections.style.flexBasis = `${height}px`
  if (persist) {
    try {
      localStorage.setItem(DOCK_SPLIT_KEY, String(height))
    } catch {}
  }
}

function restoreDockSplit() {
  const sections = document.getElementById('control-sections')
  sections.style.flexBasis = ''
  try {
    const saved = Number.parseFloat(localStorage.getItem(DOCK_SPLIT_KEY))
    if (saved > 0) setDockSplit(saved, false)
  } catch {}
}

function setTableDock(dock) {
  try {
    if (dock === 'control') localStorage.setItem(TABLE_DOCK_KEY, 'control')
    else localStorage.removeItem(TABLE_DOCK_KEY)
  } catch {}
  applyTableDock()
}

document.getElementById('btn-dock').addEventListener('click', () => {
  if (effectiveTableDock() === 'control') {
    setTableDock('main')
    return
  }
  // Docking needs the control bar on a side.
  const page = document.getElementById('page-spellbook')
  if (!['left', 'right'].includes(page.dataset.controls)) {
    setControlsPosition('left')
  }
  setTableDock('control')
})

document.querySelectorAll("input[name='table-dock']").forEach((radio) =>
  radio.addEventListener('change', () => {
    if (radio.checked) setTableDock(radio.value)
  }),
)

{
  const splitter = document.getElementById('dock-splitter')
  const sections = document.getElementById('control-sections')
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId)
    splitter.classList.add('dragging')
    document.body.style.userSelect = 'none'
  })
  splitter.addEventListener('pointermove', (e) => {
    if (!splitter.hasPointerCapture(e.pointerId)) return
    setDockSplit(e.clientY - sections.getBoundingClientRect().top)
  })
  const endDrag = (e) => {
    if (splitter.hasPointerCapture(e.pointerId)) {
      splitter.releasePointerCapture(e.pointerId)
    }
    splitter.classList.remove('dragging')
    document.body.style.userSelect = ''
  }
  splitter.addEventListener('pointerup', endDrag)
  splitter.addEventListener('pointercancel', endDrag)
  splitter.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const step = e.shiftKey ? 80 : 20
    setDockSplit(sections.offsetHeight + (e.key === 'ArrowUp' ? -step : step))
  })
  splitter.addEventListener('dblclick', () => {
    sections.style.flexBasis = ''
    try {
      localStorage.removeItem(DOCK_SPLIT_KEY)
    } catch {}
  })
}

// ─── Scratch pad ──────────────────────────────────────────────────────
// A free-form text area that is saved as you type. It sits at the bottom of the
// control bar when the control bar is on the left or right, and under the
// detail pane when the control bar is on top. A button under Dock table shows
// or hides it.
const SCRATCH_VISIBLE_KEY = 'spellbook_scratchpad_v1'
const SCRATCH_TEXT_KEY = 'spellbook_scratchpad_text_v1'

const scratchVisible = () => {
  try {
    return localStorage.getItem(SCRATCH_VISIBLE_KEY) !== 'hidden'
  } catch {
    return true
  }
}

// The scratch pad's height is remembered separately for the two places it can
// be: under the detail pane ("top") and in the control bar ("side").
const SCRATCH_HEIGHT_KEY = 'spellbook_scratch_height_v1'
const SCRATCH_MIN_HEIGHT = 96

const scratchPlace = () =>
  ['left', 'right'].includes(
    document.getElementById('page-spellbook').dataset.controls,
  )
    ? 'side'
    : 'top'

function loadScratchHeights() {
  try {
    const stored = JSON.parse(localStorage.getItem(SCRATCH_HEIGHT_KEY) || '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

function saveScratchHeight(place, height) {
  const heights = loadScratchHeights()
  if (height > 0) heights[place] = height
  else delete heights[place]
  try {
    if (Object.keys(heights).length) {
      localStorage.setItem(SCRATCH_HEIGHT_KEY, JSON.stringify(heights))
    } else {
      localStorage.removeItem(SCRATCH_HEIGHT_KEY)
    }
  } catch {}
}

// Uses the saved height for the current place (or the default).
function applyScratchHeight() {
  const pad = document.getElementById('scratchpad')
  const height = loadScratchHeights()[scratchPlace()]
  pad.style.flex = height > 0 ? `0 0 ${height}px` : ''
}

function setScratchHeight(px, persist = true) {
  const pad = document.getElementById('scratchpad')
  const room = pad.parentElement ? pad.parentElement.clientHeight : 0
  if (!room) return
  const height = Math.round(
    Math.min(
      Math.max(px, SCRATCH_MIN_HEIGHT),
      Math.max(SCRATCH_MIN_HEIGHT, room - 140),
    ),
  )
  pad.style.flex = `0 0 ${height}px`
  if (persist) saveScratchHeight(scratchPlace(), height)
}

function placeScratchpad() {
  const page = document.getElementById('page-spellbook')
  const pad = document.getElementById('scratchpad')
  const splitter = document.getElementById('scratch-splitter')
  if (!pad || !splitter) return
  const target =
    scratchPlace() === 'side'
      ? page.querySelector(':scope > header')
      : document.getElementById('detail-column')
  if (
    pad.parentElement !== target ||
    target.lastElementChild !== pad ||
    pad.previousElementSibling !== splitter
  ) {
    target.append(splitter, pad)
  }
  applyScratchHeight()
}

{
  const splitter = document.getElementById('scratch-splitter')
  const pad = document.getElementById('scratchpad')
  let dragStartY = 0
  let dragStartHeight = 0
  splitter.addEventListener('pointerdown', (e) => {
    dragStartY = e.clientY
    dragStartHeight = pad.offsetHeight
    splitter.setPointerCapture(e.pointerId)
    splitter.classList.add('dragging')
    document.body.style.userSelect = 'none'
  })
  splitter.addEventListener('pointermove', (e) => {
    if (!splitter.hasPointerCapture(e.pointerId)) return
    setScratchHeight(dragStartHeight + (dragStartY - e.clientY))
  })
  const endDrag = (e) => {
    if (splitter.hasPointerCapture(e.pointerId)) {
      splitter.releasePointerCapture(e.pointerId)
    }
    splitter.classList.remove('dragging')
    document.body.style.userSelect = ''
  }
  splitter.addEventListener('pointerup', endDrag)
  splitter.addEventListener('pointercancel', endDrag)
  splitter.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const step = e.shiftKey ? 80 : 20
    setScratchHeight(pad.offsetHeight + (e.key === 'ArrowUp' ? step : -step))
  })
  splitter.addEventListener('dblclick', () => {
    saveScratchHeight(scratchPlace(), 0)
    applyScratchHeight()
  })
  window.addEventListener('resize', () => {
    if (pad.style.flex) setScratchHeight(pad.offsetHeight, false)
  })
}

function applyScratchpad() {
  const pad = document.getElementById('scratchpad')
  const button = document.getElementById('btn-scratch')
  const visible = scratchVisible()
  pad.hidden = !visible
  document.getElementById('scratch-splitter').hidden = !visible
  if (button) {
    button.textContent = visible ? 'Hide scratch pad' : 'Show scratch pad'
    button.title = visible ? 'Hide the scratch pad' : 'Show the scratch pad'
    button.setAttribute('aria-pressed', String(visible))
  }
}

function setScratchVisible(visible) {
  try {
    if (visible) localStorage.removeItem(SCRATCH_VISIBLE_KEY)
    else localStorage.setItem(SCRATCH_VISIBLE_KEY, 'hidden')
  } catch {}
  applyScratchpad()
}

{
  const text = document.getElementById('scratchpad-text')
  try {
    text.value = localStorage.getItem(SCRATCH_TEXT_KEY) || ''
  } catch {}
  text.addEventListener('input', () => {
    try {
      if (text.value) localStorage.setItem(SCRATCH_TEXT_KEY, text.value)
      else localStorage.removeItem(SCRATCH_TEXT_KEY)
    } catch {}
  })
  const copy = document.getElementById('btn-scratch-copy')
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(text.value).then(() => {
      copy.textContent = 'Copied!'
      setTimeout(() => {
        copy.textContent = 'Copy'
      }, 1200)
    })
  })
  document.getElementById('btn-scratch-clear').addEventListener('click', () => {
    if (text.value && !confirm('Erase everything in the scratch pad?')) return
    text.value = ''
    text.dispatchEvent(new Event('input'))
    text.focus()
  })
  document
    .getElementById('btn-scratch')
    .addEventListener('click', () => setScratchVisible(!scratchVisible()))
}

// ─── Local data controls ─────────────────────────────────────────────
document
  .getElementById('btn-clear-commands')
  .addEventListener('click', async () => {
    if (
      !confirm(
        "Clear the browser's saved Spell Book commands?\n\nYour data/commands.txt baseline and data/commands.js backup will not be changed. The page will reload from TXT when available, otherwise from JS.",
      )
    )
      return
    localStorage.removeItem('spellbook_commands_v1')
    localStorage.removeItem('spellbook_trash_v1')
    localStorage.removeItem('spellbook_import_baseline_v1')
    if (window.DataFile) await window.DataFile.flush()
    location.reload()
  })

document.getElementById('btn-clear-settings').addEventListener('click', () => {
  if (
    !confirm(
      'Clear saved appearance settings and restore the default theme?\n\nYour commands will not be changed.',
    )
  )
    return
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(MODE_KEY)
  localStorage.removeItem(LAYOUT_KEY)
  setCodeTheme('default')
  clearSyntaxOverrides()
  resetSectionNames()
  localStorage.removeItem('spellbook_hidden_filters_v1')
  localStorage.removeItem('spellbook_hidden_columns_v1')
  localStorage.removeItem('spellbook_modal_size_v1')
  localStorage.removeItem(SCRATCH_VISIBLE_KEY)
  localStorage.removeItem(SCRATCH_HEIGHT_KEY)
  applyScratchpad()
  applyScratchHeight()
  localStorage.removeItem('spellbook_collapsed_sections_v1')
  applyCollapsedSections()
  setPanesLayout('stacked')
  localStorage.removeItem('spellbook_table_dock_v1')
  localStorage.removeItem('spellbook_dock_split_v1')
  resetControlsWidth()
  applyControlsPosition('top')
  const topRadio = document.querySelector(
    "input[name='controls-position'][value='top']",
  )
  if (topRadio) topRadio.checked = true
  applyTheme({})
  fillColorInputs()
  updateModeButton()
  clearCategoryColors()
  renderCategoryColorSettings()
})

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (
    !confirm(
      'Reset ALL local Spell Book data?\n\nThis clears browser-saved commands and appearance settings. Your data/commands.txt baseline and data/commands.js backup will not be changed.',
    )
  )
    return
  localStorage.removeItem('spellbook_commands_v1')
  localStorage.removeItem('spellbook_trash_v1')
  localStorage.removeItem('spellbook_import_baseline_v1')
  localStorage.removeItem('spellbook_baseline_scripts_v1')
  localStorage.removeItem('spellbook_baseline_terms_v1')
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(MODE_KEY)
  localStorage.removeItem(CATEGORY_COLORS_KEY)
  localStorage.removeItem(LAYOUT_KEY)
  localStorage.removeItem(CODE_THEME_KEY)
  localStorage.removeItem(SYNTAX_COLORS_KEY)
  localStorage.removeItem('spellbook_section_names_v1')
  localStorage.removeItem('spellbook_hidden_filters_v1')
  localStorage.removeItem('spellbook_filter_renames_v1')
  localStorage.removeItem('spellbook_hidden_columns_v1')
  localStorage.removeItem('spellbook_modal_size_v1')
  localStorage.removeItem(SCRATCH_VISIBLE_KEY)
  localStorage.removeItem(SCRATCH_HEIGHT_KEY)
  localStorage.removeItem(SCRATCH_TEXT_KEY)
  localStorage.removeItem('spellbook_collapsed_sections_v1')
  localStorage.removeItem(PANES_KEY)
  localStorage.removeItem('spellbook_table_dock_v1')
  localStorage.removeItem('spellbook_dock_split_v1')
  localStorage.removeItem('spellbook_split_v1')
  localStorage.removeItem('spellbook_split_w_v1')
  localStorage.removeItem(CONTROLS_WIDTH_KEY)
  if (window.DataFile) await window.DataFile.flush()
  location.reload()
})

applyTheme(loadSettings())
applyControlsPosition(loadControlsPosition())
updateModeButton()
applyCodeTheme(loadCodeTheme())
// The sample block in Settings shows the chosen code theme with highlighting.
document.querySelectorAll('.code-preview').forEach((block) => {
  block.innerHTML = highlightCode(block.textContent, block.dataset.lang)
})
applySyntaxOverrides()
restoreControlsWidth()
window.restoreControlsWidth = restoreControlsWidth
applyPanesLayout(loadPanesLayout())
applyTableDock()
placeScratchpad()
applyScratchpad()
