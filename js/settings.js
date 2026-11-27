/*
 * Settings controller.
 *
 * Reads and writes appearance preferences in localStorage, then reflects
 * them into CSS custom properties and data attributes. The HTML controls are
 * declared in index.html; js/core/util.js provides normalizeHex() and
 * downloadFile(). Each tab adds its own Settings tab (settingsSection) and
 * hears spellbook:settings-open and spellbook:settings-reset.
 */
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
  // Temporarily remove inline overrides so computed styles reveal the active
  // stylesheet defaults for the current light/dark mode.
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
    // Restore the user's overrides before returning; callers should observe no
    // visible flash while defaults are being inspected.
    if (value) style.setProperty(`--${key}`, value)
  })
  return defaults
}

const sameColor = (a, b) => normalizeHex(a) === normalizeHex(b)

// Colors you changed from the current mode's defaults: { key: '#rrggbb' }.
function loadSettings() {
  // Discard invalid values and values equal to the stylesheet default. This
  // keeps localStorage small and allows future CSS default changes to apply.
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
  // Removing an absent override is important: it exposes the stylesheet value
  // again instead of leaving an old inline color stuck on the root element.
  const style = document.documentElement.style
  document.documentElement.dataset.mode = loadMode()
  THEME_KEYS.forEach((key) => {
    if (overrides[key]) style.setProperty(`--${key}`, overrides[key])
    else style.removeProperty(`--${key}`)
  })
  // Buttons darken on hover: follow a chosen accent instead of the default blue.
  if (overrides.accent) style.setProperty('--accent-hover', `color-mix(in srgb, ${overrides.accent}, #000 15%)`)
  else style.removeProperty('--accent-hover')
  // For anything that follows the colors (a game on the Games tab).
  document.dispatchEvent(new CustomEvent('spellbook:theme'))
}

// ─── Theme presets ────────────────────────────────────────────────────
// Each preset sets the seven Application Theme colors, with a dark and a
// light version; the light / dark button switches between them. Default is
// the stylesheet's own colors. Changing any color by hand makes it Custom.
// Category colors (badges and filters) are left as they are.
const PRESET_KEYS = ['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent']
const THEME_PRESETS = [
  { id: 'default', name: 'Default' },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: { bg: '#0b0b10', surface: '#15151d', surface2: '#1f1f2a', border: '#2c2c3a', text: '#e6e6ef', muted: '#9090a6', accent: '#8b5cf6' },
    light: { bg: '#f4f3f8', surface: '#ffffff', surface2: '#ebe9f3', border: '#d3d0e0', text: '#1d1b29', muted: '#5f5b72', accent: '#7c3aed' },
  },
  {
    id: 'forest',
    name: 'Forest',
    dark: { bg: '#0d1410', surface: '#142019', surface2: '#1c2c23', border: '#28392e', text: '#e3ece5', muted: '#8fa596', accent: '#16a34a' },
    light: { bg: '#f2f6f2', surface: '#ffffff', surface2: '#e4ede6', border: '#c7d6cb', text: '#18241c', muted: '#536457', accent: '#15803d' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    dark: { bg: '#071318', surface: '#0e1f27', surface2: '#152b35', border: '#1f3a46', text: '#e0f0f4', muted: '#86a8b4', accent: '#0891b2' },
    light: { bg: '#f0f7f9', surface: '#ffffff', surface2: '#e0eef2', border: '#c3dbe2', text: '#102a33', muted: '#4e6a74', accent: '#0e7490' },
  },
  {
    id: 'ember',
    name: 'Ember',
    dark: { bg: '#14100d', surface: '#1f1814', surface2: '#2a211b', border: '#3a2e25', text: '#f0e7df', muted: '#a8978a', accent: '#d4691c' },
    light: { bg: '#faf6f1', surface: '#ffffff', surface2: '#f1e8de', border: '#dccdbd', text: '#2a1f17', muted: '#6e5d4f', accent: '#c2410c' },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    dark: { bg: '#130f1a', surface: '#1d1726', surface2: '#282033', border: '#372c45', text: '#ede6f3', muted: '#a093b0', accent: '#db2777' },
    light: { bg: '#faf5f8', surface: '#ffffff', surface2: '#f2e8ef', border: '#dfccd9', text: '#2a1a26', muted: '#6b5566', accent: '#be185d' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    dark: { bg: '#121212', surface: '#1c1c1c', surface2: '#262626', border: '#343434', text: '#e8e8e8', muted: '#9a9a9a', accent: '#607d8b' },
    light: { bg: '#f5f5f5', surface: '#ffffff', surface2: '#ebebeb', border: '#d4d4d4', text: '#1f1f1f', muted: '#5c5c5c', accent: '#475569' },
  },
]

// A preset's colors in the current mode.
function presetColors(preset) {
  if (!preset.dark) {
    const defaults = readCssDefaults()
    return Object.fromEntries(PRESET_KEYS.map((key) => [key, defaults[key]]))
  }
  return preset[loadMode()]
}

// The preset the current colors match, or 'custom'.
function currentPreset() {
  const theme = effectiveTheme()
  const match = THEME_PRESETS.find((preset) => {
    const colors = presetColors(preset)
    return PRESET_KEYS.every((key) => sameColor(theme[key], colors[key]))
  })
  return match ? match.id : 'custom'
}

function applyPreset(id) {
  const preset = THEME_PRESETS.find((p) => p.id === id)
  if (!preset) return
  // Category colors you set are kept; the preset's colors replace the rest.
  const overrides = loadSettings()
  PRESET_KEYS.forEach((key) => delete overrides[key])
  const defaults = readCssDefaults()
  const colors = presetColors(preset)
  PRESET_KEYS.forEach((key) => {
    if (!sameColor(colors[key], defaults[key])) overrides[key] = normalizeHex(colors[key])
  })
  saveSettings(overrides)
  applyTheme(overrides)
  fillColorInputs()
}

// The preset cards above the color pickers, drawn in the current mode.
function renderThemePresets() {
  const box = document.getElementById('theme-presets')
  if (!box) return
  const current = currentPreset()
  box.replaceChildren(
    ...THEME_PRESETS.map((preset) => {
      const colors = presetColors(preset)
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'theme-preset'
      card.dataset.preset = preset.id
      card.setAttribute('role', 'radio')
      card.setAttribute('aria-checked', String(preset.id === current))
      const swatch = document.createElement('span')
      swatch.className = 'theme-preset-swatch'
      swatch.style.background = colors.bg
      swatch.style.borderColor = colors.border
      const panel = document.createElement('span')
      panel.className = 'theme-preset-panel'
      panel.style.background = colors.surface
      panel.style.borderColor = colors.border
      const line = document.createElement('span')
      line.className = 'theme-preset-line'
      line.style.background = colors.text
      const muted = document.createElement('span')
      muted.className = 'theme-preset-line short'
      muted.style.background = colors.muted
      const dot = document.createElement('span')
      dot.className = 'theme-preset-accent'
      dot.style.background = colors.accent
      panel.append(line, muted, dot)
      swatch.append(panel)
      const name = document.createElement('span')
      name.className = 'theme-preset-name'
      name.textContent = preset.name
      card.append(swatch, name)
      return card
    }),
  )
  const custom = document.getElementById('theme-preset-custom')
  if (custom) custom.hidden = current !== 'custom'
}

document.getElementById('theme-presets')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-preset]')
  if (card) applyPreset(card.dataset.preset)
})

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
  renderThemePresets()
}

function openSettings() {
  // Rebuild dynamic controls each time the modal opens so imported data and
  // external changes are reflected immediately.
  fillColorInputs()
  if (typeof renderDataFileStatus === 'function') renderDataFileStatus()
  applyCodeTheme(loadCodeTheme())
  renderSyntaxColorSettings()
  showSettingsTab('layout')
  // Modules refresh their own sections (Spells: layout and category colors).
  document.dispatchEvent(new CustomEvent('spellbook:settings-open'))
  document.getElementById('settings-modal').classList.add('open')
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open')
}
document.getElementById('btn-settings').addEventListener('click', openSettings)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings()
})
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
    // Each picker updates only its own override, preserving the other colors
    // already saved by the user.
    const theme = loadSettings()
    // A color that matches the stylesheet default is not stored as an override.
    if (sameColor(input.value, readCssDefaults()[input.dataset.key])) {
      delete theme[input.dataset.key]
    } else {
      theme[input.dataset.key] = input.value
    }
    applyTheme(theme)
    saveSettings(theme)
    renderThemePresets()
  }),
)

// ─── Light / dark mode ────────────────────────────────────────────────
// Settings → Layout & Theme has a choice of Dark mode (crescent moon) and
// Light mode (sun); the one in use is marked. Switching uses the new mode's
// stylesheet colors (a custom accent color is kept).
function updateModeButton() {
  const mode = loadMode()
  document.querySelectorAll('#mode-choice [data-mode-choice]').forEach((option) => {
    const on = option.dataset.modeChoice === mode
    option.classList.toggle('active', on)
    option.setAttribute('aria-checked', String(on))
    option.tabIndex = on ? 0 : -1
  })
}

function setMode(mode) {
  // A preset switches to its own version for the new mode.
  const preset = currentPreset()
  // Switching modes intentionally carries only the accent override. Every
  // other color belongs to the new mode's stylesheet defaults.
  const accent = loadSettings().accent
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {}
  // The new mode's colors come from the stylesheet; only the accent you chose
  // (if any) is carried over.
  const overrides = accent ? { accent } : {}
  saveSettings(overrides)
  applyTheme(overrides)
  if (preset !== 'custom') applyPreset(preset)
  fillColorInputs()
  updateModeButton()
  // The code theme's defaults can differ between modes.
  clearSyntaxOverrides()
  renderSyntaxColorSettings()
}

document.getElementById('mode-choice').addEventListener('click', (e) => {
  const option = e.target.closest('[data-mode-choice]')
  if (option && option.dataset.modeChoice !== loadMode()) setMode(option.dataset.modeChoice)
})
// Arrow keys move between the two, as in any radio group.
document.getElementById('mode-choice').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  const next = loadMode() === 'light' ? 'dark' : 'light'
  setMode(next)
  const option = document.querySelector(`#mode-choice [data-mode-choice="${next}"]`)
  if (option) option.focus()
})

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
  // The data attribute selects a CSS theme block in styles.css; the select is
  // updated too so programmatic imports and visible controls stay aligned.
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
  // Tabs and panels use the same data name. Updating both the visual class and
  // aria-selected/hidden keeps keyboard and screen-reader state synchronized.
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

// Tabs that modules add (SpellBook.settingsSection, js/core/pages.js), placed
// before Data & Backups in `order`. A section is drawn as soon as it is
// registered, so the module's script can wire its controls right after.
// Sections with the same `tab` share one tab, in the order registered.
const moduleSettingsTabs = new Map() // tab name -> { order, tab, panel }
function addSettingsSection(def) {
  const dataTab = document.querySelector('.settings-tab[data-tab="data"]')
  const dataPanel = document.querySelector('.settings-panel[data-panel="data"]')
  if (!def || !dataTab || !dataPanel) return
  const name = `module-${def.tab || def.id}`
  let entry = moduleSettingsTabs.get(name)
  if (!entry) {
    const order = def.order ?? 100
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'settings-tab'
    tab.dataset.tab = name
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', 'false')
    tab.textContent = def.label || def.id
    tab.addEventListener('click', () => showSettingsTab(name))
    const panel = document.createElement('div')
    panel.className = 'settings-panel'
    panel.dataset.panel = name
    panel.hidden = true
    const after = [...moduleSettingsTabs.values()].find((other) => other.order > order)
    ;(after ? after.tab : dataTab).before(tab)
    ;(after ? after.panel : dataPanel).before(panel)
    entry = { order, tab, panel }
    moduleSettingsTabs.set(name, entry)
  }
  const section = document.createElement('div')
  section.dataset.section = def.id
  entry.panel.append(section)
  try {
    if (def.render) def.render(section)
  } catch (error) {
    console.error(`Settings section "${def.id}":`, error)
  }
}
window.SpellBook.contributions('settings').forEach(addSettingsSection)
{
  const register = window.SpellBook.settingsSection
  window.SpellBook.settingsSection = (def) => {
    register(def)
    addSettingsSection(def)
  }
}

// ─── Back and Forward buttons ─────────────────────────────────────────
// Shown by default; stored as 'hidden' only when turned off. Hiding them only
// hides the buttons: the history is still kept, so turning them back on works.
const NAV_HISTORY_KEY = 'spellbook_nav_history_v1'
const navHistoryRadios = document.querySelectorAll("input[name='nav-history']")
function navHistoryShown() {
  try {
    return localStorage.getItem(NAV_HISTORY_KEY) !== 'hidden'
  } catch {
    return true
  }
}
function applyNavHistory() {
  const shown = navHistoryShown()
  document.querySelector('.nav-history').hidden = !shown
  navHistoryRadios.forEach((radio) => {
    radio.checked = radio.value === (shown ? 'show' : 'hide')
  })
}
navHistoryRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    try {
      if (radio.value === 'show') localStorage.removeItem(NAV_HISTORY_KEY)
      else localStorage.setItem(NAV_HISTORY_KEY, 'hidden')
    } catch {}
    applyNavHistory()
  })
})
applyNavHistory()

// ─── Page width ───────────────────────────────────────────────────────
// The widest the whole app gets, against its left side (css/base.css,
// [data-page-width]). Stored in pixels; nothing is stored for the full window.
const PAGE_WIDTH_KEY = 'spellbook_page_width_v1'
const PAGE_WIDTHS = ['1920', '1600', '1366']
const pageWidthSelect = document.getElementById('page-width')
function savedPageWidth() {
  try {
    const saved = localStorage.getItem(PAGE_WIDTH_KEY)
    return PAGE_WIDTHS.includes(saved) ? saved : 'full'
  } catch {
    return 'full'
  }
}
function applyPageWidth() {
  const width = savedPageWidth()
  const root = document.documentElement
  root.toggleAttribute('data-page-width', width !== 'full')
  if (width === 'full') root.style.removeProperty('--page-width')
  else root.style.setProperty('--page-width', `${width}px`)
  pageWidthSelect.value = width
  // Panes sized to the window measure again.
  window.dispatchEvent(new Event('resize'))
  // Tabs that measure what they draw (Spells' table columns) draw it again.
  document.dispatchEvent(new CustomEvent('spellbook:page-width'))
}
pageWidthSelect.addEventListener('change', () => {
  try {
    if (pageWidthSelect.value === 'full') localStorage.removeItem(PAGE_WIDTH_KEY)
    else localStorage.setItem(PAGE_WIDTH_KEY, pageWidthSelect.value)
  } catch {}
  applyPageWidth()
})
applyPageWidth()
window.SpellBook.settingGroup({
  id: 'pageWidth',
  title: 'Page width',
  sub: 'the widest the page gets',
  order: 12,
  keys: [PAGE_WIDTH_KEY],
})

// ─── Tabs on and off ──────────────────────────────────────────────────
// A checkbox per tab (js/core/pages.js setTabOn). A tab turned on that wasn't
// loaded at start needs a reload; the Reload Now button offers it.
function renderTabSwitches() {
  const list = document.getElementById('tab-switches')
  if (!list || !window.SpellBook.tabs) return
  const tabs = window.SpellBook.tabs()
  const onCount = tabs.filter((tab) => tab.on).length
  list.replaceChildren(
    ...tabs.map((tab) => {
      const label = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = tab.on
      // The last tab on can't be turned off.
      box.disabled = tab.on && onCount === 1
      box.addEventListener('change', () => {
        window.SpellBook.setTabOn(tab.id, box.checked)
        renderTabSwitches()
      })
      const name = document.createElement('span')
      name.textContent = tab.title
      label.append(box, name)
      if (tab.tooltip) label.title = tab.tooltip
      if (box.disabled) label.title = 'One tab always stays on.'
      if (tab.on && !tab.loaded) {
        const note = document.createElement('span')
        note.className = 'tab-switch-note'
        note.textContent = 'shows after a reload'
        label.append(note)
      }
      return label
    }),
  )
  document.getElementById('tab-switches-reload').hidden = !tabs.some((tab) => tab.on && !tab.loaded)
}
document.getElementById('tab-switches-reload-btn').addEventListener('click', () => location.reload())
document.addEventListener('spellbook:tabs', renderTabSwitches)
document.addEventListener('spellbook:ready', renderTabSwitches)
renderTabSwitches()

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
  // A missing choice removes the inline variable and falls back to the CSS
  // stack, which is why Reset Fonts does not need a second default list.
  const choices = loadFonts()
  const style = document.documentElement.style
  FONT_SECTIONS.forEach(([key, , variable, fonts]) => {
    const font = fonts.find(([id]) => id === choices[key])
    if (font) style.setProperty(variable, font[2])
    else style.removeProperty(variable)
  })
}

function renderFontSettings() {
  // This panel is generated from FONT_SECTIONS so adding one supported area or
  // font family updates the UI from a single data structure.
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
  // Code-theme defaults live in CSS just like app colors. Temporarily remove
  // syntax overrides so an import can distinguish defaults from custom values.
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
  // Recreate the small color grid from SYNTAX_FIELDS; this also refreshes the
  // displayed values after a theme switch or reset.
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

// ─── Linked data file ─────────────────────────────────────────────────
// The last problem from a button here, shown in the status line (and the
// console) so a failure is never silent.
// The buttons btn-datafile-* are bound in this section and delegate file I/O
// to window.DataFile; this module owns only the settings UI and confirmations.
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
        window.DataFile.backupName('spellbook-data', 'json'),
        window.DataFile.exportText(),
        'application/json;charset=utf-8',
      )
      if (window.DataFile.markBackedUp) window.DataFile.markBackedUp()
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
      window.DataFile.reload()
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
        window.DataFile.reload()
        return
      }
      await window.DataFile.save({ ask: true, verify: true })
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
      if (!(await window.DataFile.save({ ask: true, verify: true }))) {
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
      window.DataFile.reload()
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
      if (on) await window.DataFile.save({ ask: true }) // write the current data right away
    }),
  )
}

// The Save control in the top bar: one button that saves and shows the save
// state, and an arrow that opens a menu with Autosave and where things are
// saved. It saves the data file and every other place a tab adds with
// SpellBook.saveTarget (js/core/pages.js), such as the Compendium's Markdown
// folder; one Autosave switch covers them all. The data file's actions go
// through the Data tab's own buttons, so confirmation, permission and error
// handling stay in one place.
;(() => {
  const control = document.getElementById('save-control')
  const save = document.getElementById('btn-quick-save')
  const link = document.getElementById('btn-quick-link')
  const label = document.getElementById('save-label')
  if (!control || !save || !link || !label) return
  const click = (id) => document.getElementById(id).click()
  const unsaved = () => (window.SpellBook.unsaved ? window.SpellBook.unsaved.summary() : { total: 0, byLabel: {} })
  let state = null
  let menu = null

  // The other places to save, with their state now. Only linked ones count.
  //   { def, s: { linked, name, needsPermission, dirty, writing, lastWritten, error, status } }
  function targets({ all = false } = {}) {
    return window.SpellBook.contributions('saveTargets')
      .map((def) => {
        try {
          return { def, s: def.state() || {} }
        } catch (error) {
          console.error(error)
          return { def, s: {} }
        }
      })
      .filter((t) => all || t.s.linked)
  }

  // A short time for the bar: "3:42 PM" today, otherwise the date.
  function short(date) {
    if (!date || Number.isNaN(date.getTime())) return ''
    return date.toDateString() === new Date().toDateString()
      ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  // When the data last matched the file or database: this visit's last
  // write, or the saved record of the last one (js/core/unsaved.js).
  function lastSave(s, sum) {
    if (s && s.lastSaved) return s.lastSaved
    return sum.since && ['file', 'database'].includes(sum.how) ? new Date(sum.since) : null
  }

  // What the control shows. Modes:
  //   database   the database server saves every change itself
  //   blocked    autosave is on but the browser must be asked for
  //              permission again (after a restart), for the data file or
  //              another place: a click asks
  //   error      the last write failed
  //   auto       autosave on: Saving… / Autosaving… / Autosaved 3:42
  //   manual     saved places without autosave: Save / Saved 3:42
  //   unlinked   no data file: "Link a Data File" links one
  function mode(s, linkedTargets) {
    if (s && s.remote && s.remote.active) return 'database'
    const file = Boolean(s && s.name)
    // Without a data file there's nothing to save to (other places, such as
    // the Markdown folder, are copies), so the button links one.
    if (!file) return 'unlinked'
    const auto = Boolean(s && s.autosave)
    const fileBlocked = file && s.permission !== 'granted'
    if (auto && (fileBlocked || linkedTargets.some((t) => t.s.needsPermission))) return 'blocked'
    if ((file && s.lastError) || linkedTargets.some((t) => t.s.error)) return 'error'
    return auto ? 'auto' : 'manual'
  }

  function render() {
    const s = state || {}
    const tl = targets()
    const m = mode(state, tl)
    const file = Boolean(s.name)
    const sum = unsaved()
    const n = file || m === 'database' ? sum.total || 0 : 0
    const dirty = n > 0 || tl.some((t) => t.s.dirty)
    const saving = Boolean(s.saving) || tl.some((t) => t.s.writing)
    // The time everything was last saved: the oldest of the places'.
    const times = [file ? lastSave(s, sum) : null, ...tl.map((t) => t.s.lastWritten || null)].filter((d, i) => i > 0 || file)
    const last = times.length && times.every(Boolean) ? new Date(Math.min(...times.map((d) => d.getTime()))) : null
    const places = [file ? s.name : '', ...tl.map((t) => `${t.def.label} “${t.s.name}”`)].filter(Boolean).join(' and ')
    const details = file && window.SpellBook.unsaved ? window.SpellBook.unsaved.describe() : ''
    let text
    let tip
    if (m === 'database') {
      // A failed save (signed out, server down) shows until a save works.
      text = saving ? 'Saving…' : s.lastError ? 'Not saved' : 'Saved'
      tip = s.lastError
        ? `The last save to the database failed: ${s.lastError}
Your changes are kept in this browser.`
        : 'The database server saves every change as you make it.'
    } else if (m === 'blocked') {
      const need = [file && s.permission !== 'granted' ? s.name : '', ...tl.filter((t) => t.s.needsPermission).map((t) => `${t.def.label} “${t.s.name}”`)].filter(Boolean)
      text = 'Allow saving'
      tip = `Autosave can't write to ${need.join(' or ')} until the browser is given permission again. Click to allow it.`
    } else if (m === 'error') {
      const errors = [file && s.lastError ? `${s.name}: ${s.lastError}` : '', ...tl.filter((t) => t.s.error).map((t) => `${t.def.label}: ${t.s.error}`)].filter(Boolean)
      text = 'Not saved'
      tip = `The last save failed.\n${errors.join('\n')}\nClick to try again.`
    } else if (m === 'auto') {
      text = saving ? 'Saving…' : (file && s.pending) || dirty ? 'Autosaving…' : last ? `Autosaved ${short(last)}` : 'Autosave on'
      tip = `Autosave is on: changes are written to ${places} shortly after you make them.\nClick to save now.`
    } else if (m === 'manual') {
      // No time: somewhere hasn't been written yet (a folder just chosen).
      text = saving ? 'Saving…' : dirty || !last ? 'Save' : `Saved ${short(last)}`
      tip = `Click to save to ${places}. Autosave is off: turn it on from the arrow's menu.`
    } else {
      text = 'Link a Data File'
      tip = 'No data file is linked, so there is nothing to save to. Click to link one; the arrow beside it can create one or download a backup.'
    }
    label.textContent = text
    control.dataset.mode = m
    control.classList.toggle('db-failed', m === 'database' && Boolean(s.lastError))
    control.classList.toggle('is-saving', saving)
    control.classList.toggle('has-unsaved', dirty)
    save.title = `${details ? `${details}\n\n` : ''}${tip}`
    save.setAttribute('aria-label', `${text}${n && ['manual', 'error', 'blocked'].includes(m) ? ` (${n} unsaved change${n === 1 ? '' : 's'})` : ''}`)
    link.classList.toggle('needs-permission', (file && s.permission !== 'granted') || tl.some((t) => t.s.needsPermission))
    link.title =
      m === 'database'
        ? 'Database server, Autosave and backups'
        : file || tl.length
          ? `Saving to ${places}\nAutosave ${s.autosave ? 'on' : 'off'}, and more`
          : 'No data file linked: link or create one, Autosave and backups'
    link.setAttribute('aria-label', link.title.split('\n')[0])
    if (menu) fillMenu()
  }

  let request = 0
  async function refresh() {
    const mine = ++request
    try {
      const s = await window.DataFile.getState()
      if (mine !== request) return
      state = s
      render()
    } catch (error) {
      console.error('Could not read data-file status:', error)
    }
  }

  // Asks the browser for permission wherever it's needed. Each ask needs the
  // click, so the data file goes first, then each other place.
  async function allowAll() {
    if (state && state.name && state.permission !== 'granted') click('btn-datafile-reconnect')
    for (const t of targets().filter((x) => x.s.needsPermission)) {
      try {
        await t.def.allow()
      } catch (error) {
        console.error(error)
      }
    }
  }
  // Saves everywhere now.
  async function saveAll() {
    if (state && (state.name || (state.remote && state.remote.active))) click('btn-datafile-save')
    for (const t of targets()) {
      try {
        await t.def.save()
      } catch (error) {
        console.error(error)
      }
    }
  }

  save.addEventListener('click', () => {
    const m = mode(state, targets())
    if (m === 'blocked') return allowAll()
    if (m === 'unlinked') return linkFile()
    saveAll()
  })

  // ─── The menu ───────────────────────────────────────────────────────
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  function item(html, run, extra = {}) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `nav-menu-item${extra.className ? ` ${extra.className}` : ''}`
    button.setAttribute('role', extra.role || 'menuitem')
    button.innerHTML = html
    button.addEventListener('click', () => {
      if (!extra.keepOpen) closeMenu()
      run()
    })
    return button
  }
  const linkIcon = '<span class="nav-icon nav-icon-link" aria-hidden="true"></span>'
  const hr = () => document.createElement('hr')
  function headOf(html) {
    const head = document.createElement('div')
    head.className = 'nav-menu-head'
    head.innerHTML = html
    return head
  }

  function fillMenu() {
    const s = state || {}
    const all = targets({ all: true })
    const tl = all.filter((t) => t.s.linked)
    const m = mode(state, tl)
    const file = Boolean(s.name)
    const sum = unsaved()
    const last = lastSave(state, sum)
    const items = () => [...menu.querySelectorAll('.nav-menu-item')]
    const focused = items().indexOf(document.activeElement)
    menu.innerHTML = ''
    // The data file.
    if (m === 'database') {
      menu.append(headOf('<b>Database server</b><span>Every change is saved as you make it.</span>'))
    } else if (file) {
      menu.append(
        headOf(
          `<b>${esc(s.name)}</b>` +
            `<span>${last ? `Last saved ${esc(last.toLocaleString())}` : 'Not saved yet'}${sum.total ? ` · ${sum.total} unsaved` : ''}</span>` +
            (s.permission !== 'granted' ? '<span class="nav-menu-warn">The browser needs permission to write to it again.</span>' : '') +
            (s.lastError ? `<span class="nav-menu-warn">${esc(s.lastError)}</span>` : ''),
        ),
      )
    } else {
      menu.append(headOf('<b>No data file linked</b><span>Your data is kept in this browser only. Link or create a data file to save it.</span>'))
    }
    // Autosave: the same setting as Settings → Data & Backups, for the data
    // file and every other place. It's changed through that checkbox, so both
    // stay in step and turning it on writes at once.
    const usable = m === 'database' || file
    const on = m === 'database' || (usable && s.autosave)
    const sub =
      m === 'database'
        ? 'Always on with the database server'
        : !usable
          ? 'Link a data file to use it'
          : on
            ? 'Changes are written shortly after you make them'
            : 'Changes wait until you click Save'
    const auto = item(
      `<span class="nav-switch${on ? ' on' : ''}" aria-hidden="true"></span><span class="nav-menu-text">Autosave<small>${sub}</small></span>`,
      () => {
        if (m === 'database') return
        if (!usable) return linkFile()
        const box = document.getElementById('datafile-autosave')
        box.checked = !s.autosave
        box.dispatchEvent(new Event('change'))
      },
      { role: 'menuitemcheckbox', keepOpen: usable && m !== 'database', className: 'with-switch' },
    )
    auto.setAttribute('aria-checked', String(on))
    if (m === 'database') auto.setAttribute('aria-disabled', 'true')
    menu.append(auto)
    menu.append(hr())
    // Linking the data file.
    if (m !== 'database') {
      if (!s.supported) {
        const note = document.createElement('div')
        note.className = 'nav-menu-note'
        note.textContent = 'Linking a data file needs Chrome or Edge. Use Backup instead.'
        menu.append(note)
      } else if (file) {
        if (s.permission !== 'granted') {
          menu.append(item(`${linkIcon}Allow saving to ${esc(s.name)}`, () => click('btn-datafile-reconnect'), { className: 'with-icon' }))
        }
        menu.append(item(`${linkIcon}Link a different file…`, () => click('btn-datafile-open'), { className: 'with-icon' }))
        menu.append(item('Unlink', () => click('btn-datafile-unlink')))
      } else {
        menu.append(item(`${linkIcon}Link a data file…`, linkFile, { className: 'with-icon' }))
        menu.append(item('Create a data file…', () => click('btn-datafile-new')))
      }
    }
    // Backup: downloads a copy of everything (the Save button itself saves).
    menu.append(item('Backup', () => click('btn-datafile-download')))
    menu.append(
      item('Data file settings…', () => {
        click('btn-settings')
        showSettingsTab('data')
      }),
    )
    // Every other place to save (the Markdown folder…), linked or not.
    all.forEach(({ def, s: t }) => {
      menu.append(hr())
      const status = t.linked
        ? [
            `<span>${t.writing ? 'Writing…' : t.dirty ? 'Changes not written yet' : t.lastWritten ? `Last written ${esc(t.lastWritten.toLocaleString())}` : 'Linked'}</span>`,
            t.needsPermission ? `<span class="nav-menu-warn">${esc(t.status || 'The browser needs permission to write to it again.')}</span>` : '',
            t.error ? `<span class="nav-menu-warn">${esc(t.error)}</span>` : '',
          ].join('')
        : `<span>${esc(t.status || 'Not set up')}</span>`
      menu.append(headOf(`<b>${esc(def.label)}${t.name ? `: ${esc(t.name)}` : ''}</b>${status}`))
      if (t.linked && t.needsPermission) menu.append(item(`${linkIcon}Allow writing to ${esc(t.name || def.label)}`, () => def.allow(), { className: 'with-icon' }))
      else if (t.linked) menu.append(item('Write now', () => def.save()))
      if (def.open) menu.append(item(`${esc(def.label)} settings…`, () => def.open()))
    })
    if (focused >= 0 && items()[focused]) items()[focused].focus()
  }
  function linkFile() {
    if (state && !state.supported) {
      alert('File linking is unavailable in this browser. Use Save to download a backup instead.')
      return
    }
    click('btn-datafile-open')
  }

  function openMenu() {
    menu = document.createElement('div')
    menu.className = 'nav-menu save-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', 'Saving and Autosave')
    document.body.append(menu)
    fillMenu()
    const r = control.getBoundingClientRect()
    menu.style.top = `${r.bottom + 6}px`
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`
    link.setAttribute('aria-expanded', 'true')
    const first = menu.querySelector('.nav-menu-item')
    if (first) first.focus()
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('.nav-menu-item')]
      const at = items.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        items[e.key === 'Home' ? 0 : items.length - 1].focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(true)
      } else if (e.key === 'Tab') {
        closeMenu()
      }
    })
    setTimeout(() => document.addEventListener('pointerdown', outside, true))
    refresh()
  }
  function closeMenu(refocus) {
    if (!menu) return
    menu.remove()
    menu = null
    link.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (refocus) link.focus()
  }
  function outside(e) {
    if (menu && !menu.contains(e.target) && !link.contains(e.target)) closeMenu()
  }
  link.addEventListener('click', () => (menu ? closeMenu() : openMenu()))
  window.addEventListener('resize', () => closeMenu())

  document.addEventListener('spellbook:unsaved', render)
  // A place to save (the Markdown folder…) changed state.
  document.addEventListener('spellbook:save-target', render)
  document.addEventListener('spellbook:ready', render)
  if (window.DataFile) {
    window.DataFile.onChange(refresh)
    refresh()
  }
  // "Autosaved 3:42" becomes a date after midnight.
  setInterval(render, 60000)
})()

// ─── Local data controls ─────────────────────────────────────────────
document.getElementById('btn-clear-settings').addEventListener('click', () => {
  if (
    !confirm(
      'Clear saved appearance settings and restore the default theme?\n\nYour commands will not be changed.',
    )
  )
    return
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(MODE_KEY)
  setCodeTheme('default')
  clearSyntaxOverrides()
  localStorage.removeItem(NAV_HISTORY_KEY)
  applyNavHistory()
  localStorage.removeItem(PAGE_WIDTH_KEY)
  applyPageWidth()
  if (window.NoteWidth) window.NoteWidth.reset()
  window.SpellBook.setTabOrder(null)
  window.SpellBook.allTabsOn()
  applyTheme({})
  fillColorInputs()
  updateModeButton()
  // Each module resets its own settings (Spells: layout, filters, category
  // colors), listening for this event.
  document.dispatchEvent(new CustomEvent('spellbook:settings-reset'))
})

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (
    !confirm(
      'Reset ALL local Spell Book data?\n\nThis clears browser-saved commands and appearance settings. Your data/*.json files will not be changed.',
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
  localStorage.removeItem('spellbook_category_colors_v1')
  localStorage.removeItem('spellbook_layout_v1')
  localStorage.removeItem(CODE_THEME_KEY)
  localStorage.removeItem(SYNTAX_COLORS_KEY)
  localStorage.removeItem('spellbook_section_names_v1')
  localStorage.removeItem('spellbook_hidden_filters_v1')
  localStorage.removeItem('spellbook_filter_renames_v1')
  localStorage.removeItem('spellbook_hidden_columns_v1')
  localStorage.removeItem('spellbook_modal_size_v1')
  localStorage.removeItem('spellbook_scratchpad_v1')
  localStorage.removeItem('spellbook_scratch_height_v1')
  localStorage.removeItem('spellbook_scratchpad_text_v1')
  localStorage.removeItem('spellbook_collapsed_sections_v1')
  localStorage.removeItem('spellbook_note_width_v1')
  localStorage.removeItem('spellbook_note_branch_v1')
  localStorage.removeItem('spellbook_sealed_branch_v1')
  localStorage.removeItem('spellbook_sealed_list_width_v1')
  localStorage.removeItem('spellbook_note_bars_v1')
  localStorage.removeItem('spellbook_note_titles_v1')
  localStorage.removeItem('spellbook_select_pane_width_v1')
  localStorage.removeItem('spellbook_panes_v1')
  localStorage.removeItem('spellbook_table_dock_v1')
  localStorage.removeItem('spellbook_dock_split_v1')
  localStorage.removeItem('spellbook_split_v1')
  localStorage.removeItem('spellbook_split_w_v1')
  localStorage.removeItem('spellbook_controls_width_v1')
  if (window.DataFile) await window.DataFile.flush()
  location.reload()
})

applyTheme(loadSettings())
updateModeButton()
applyCodeTheme(loadCodeTheme())
// The sample block in Settings shows the chosen code theme with highlighting.
document.querySelectorAll('.code-preview').forEach((block) => {
  block.innerHTML = highlightCode(block.textContent, block.dataset.lang)
})
applySyntaxOverrides()
