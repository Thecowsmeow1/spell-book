/*
 * Spells' part of Settings: a "Spells" tab (SpellBook.settingsSection) with
 * the page's layout (control bar, table and details, table pane, scratch
 * pad), the quick filters, the Options default and the category colors, plus
 * Clear Local Commands. Moved here from js/settings.js so Settings works
 * without Spells. It answers the core's spellbook:settings-open (refresh the
 * controls) and spellbook:settings-reset (Clear Settings) events.
 */
const SPELLS_SETTINGS_HTML = `
<div class="settings-data-section">
<h3>Layout</h3>
<fieldset class="layout-options">
<legend>Control bar position</legend>
<label><input name="controls-position" type="radio" value="top"/><img alt="" class="layout-preview" loading="lazy" src="icons/Rows-Layout.png"/>
                Top</label>
<label><input name="controls-position" type="radio" value="left"/><img alt="" class="layout-preview" loading="lazy" src="icons/2L1R-Layout-%20thick.png"/>
                Left</label>
<label><input name="controls-position" type="radio" value="right"/><img alt="" class="layout-preview" loading="lazy" src="icons/2L1R-Layout-thick-mirrored.png"/>
                Right</label>
</fieldset>
<fieldset class="layout-options">
<legend>Table and details</legend>
<label><input name="panes-layout" type="radio" value="stacked"/><img alt="" class="layout-preview" loading="lazy" src="icons/Rows-Layout.png"/>
                Table above details</label>
<label><input name="panes-layout" type="radio" value="side"/><img alt="" class="layout-preview" loading="lazy" src="icons/Side-Layout.png"/> Table
                beside details</label>
</fieldset>
<fieldset class="layout-options">
<legend>Long text in the table</legend>
<label><input name="wrap-cells" type="radio" value="cut"/>
                Cut off at one line</label>
<label><input name="wrap-cells" type="radio" value="wrap"/>
                Wrap</label>
<span class="form-hint">Descriptions, definitions and script previews in the table pane. Wrap shows all of the text over as many lines as it needs.</span>
</fieldset>
<fieldset class="layout-options">
<legend>Scratch pad</legend>
<label><input name="scratch-visible" type="radio" value="show"/>
                Show</label>
<label><input name="scratch-visible" type="radio" value="hide"/>
                Hide</label>
<span class="form-hint">The note area under the Spell Book's detail pane. Its text
                is kept while it's hidden.</span>
</fieldset>
<fieldset class="layout-options">
<legend>Quick filters</legend>
<label><input name="filter-selection" type="radio" value="multiple"/>
                Select several at once</label>
<label><input name="filter-selection" type="radio" value="single"/>
                Select one at a time</label>
<span class="form-hint">Applies to the Command, Script and Term filter buttons.
                Several at once shows entries matching any selected filter, such as
                PowerShell + CMD.</span>
</fieldset>
<fieldset class="layout-options">
<legend>Options in the detail pane</legend>
<label><input name="options-default" type="radio" value="expanded"/>
                Expanded</label>
<label><input name="options-default" type="radio" value="collapsed"/>
                Collapsed</label>
<span class="form-hint">Whether the Options section starts open. You can still open or
                close it for any command.</span>
</fieldset>
<fieldset class="layout-options">
<legend>Table pane location</legend>
<label><input name="table-dock" type="radio" value="main"/> In the
                main area</label>
<label><input name="table-dock" type="radio" value="control"/> In the
                control bar</label>
<span class="form-hint">"In the control bar" puts the table pane under the sections,
                with a draggable divider, and the detail pane fills the rest. It
                takes effect when the control bar is on the left or right.</span>
</fieldset>
</div>
<div class="settings-data-section">
<h3>Individual Category Colors</h3>
<p class="form-hint">Set a distinct color for each command platform, script language, or term category. These colors apply to both badges and filter buttons.</p>
<p class="form-hint">Save or load these colors with <strong>Import / Export</strong> in the top bar.</p>
<div id="category-colors"></div>
</div>
<div class="settings-data-section">
<h3>Local Data</h3>
<div class="settings-data-actions">
<button class="btn secondary" id="btn-clear-commands" type="button">Clear Local Commands</button>
</div>
<p class="form-hint">Clears this browser's commands. The bundled JSON files fill them in again on the next HTTP(S) load; on <code>file://</code>, use Restore From File.</p>
</div>
`
window.SpellBook.settingsSection({
  id: 'spells',
  label: 'Spells',
  order: 10,
  render(section) {
    section.innerHTML = SPELLS_SETTINGS_HTML
  },
})

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

// ─── Quick filter selection ───────────────────────────────────────────
const filterSelectionRadios = document.querySelectorAll(
  "input[name='filter-selection']",
)
function syncFilterSelectionRadios() {
  filterSelectionRadios.forEach((radio) => {
    radio.checked =
      radio.value === (multiFilterEnabled() ? 'multiple' : 'single')
  })
}
filterSelectionRadios.forEach((radio) => {
  radio.addEventListener('change', () =>
    setMultiFilterEnabled(radio.value === 'multiple'),
  )
})
syncFilterSelectionRadios()

// ─── Long text in the table ───────────────────────────────────────────
// setWrapCells() and wrapCellsOn() live in spells.js, which also applies the saved choice.
const wrapCellsRadios = document.querySelectorAll("input[name='wrap-cells']")
function syncWrapCells() {
  wrapCellsRadios.forEach((radio) => {
    radio.checked = radio.value === (wrapCellsOn() ? 'wrap' : 'cut')
  })
}
wrapCellsRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    setWrapCells(radio.value === 'wrap')
    syncWrapCells()
  })
})
syncWrapCells()

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
  // Settings → Layout & Theme → Scratch pad
  document.querySelectorAll("input[name='scratch-visible']").forEach((radio) => {
    radio.checked = radio.value === (visible ? 'show' : 'hide')
  })
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
  document.querySelectorAll("input[name='scratch-visible']").forEach((radio) => {
    radio.addEventListener('change', () => setScratchVisible(radio.value === 'show'))
  })
}

// ─── Local data ───────────────────────────────────────────────────────
document
  .getElementById('btn-clear-commands')
  .addEventListener('click', async () => {
    if (
      !confirm(
        "Clear the browser's saved Spell Book commands?\n\nYour data/*.json files will not be changed. On HTTP(S), bundled JSON can seed a fresh browser; on file://, use Restore From File.",
      )
    )
      return
    localStorage.removeItem('spellbook_commands_v1')
    localStorage.removeItem('spellbook_trash_v1')
    localStorage.removeItem('spellbook_import_baseline_v1')
    if (window.DataFile) await window.DataFile.flush()
    location.reload()
  })

// ─── Settings window ──────────────────────────────────────────────────
document.addEventListener('spellbook:settings-open', () => {
  const position = document.querySelector(
    `input[name='controls-position'][value='${loadControlsPosition()}']`,
  )
  if (position) position.checked = true
  renderCategoryColorSettings()
})

// Clear Settings: Spells' layout, filters, sections and category colors.
document.addEventListener('spellbook:settings-reset', () => {
  localStorage.removeItem(LAYOUT_KEY)
  resetSectionNames()
  localStorage.removeItem('spellbook_hidden_filters_v1')
  localStorage.removeItem('spellbook_hidden_columns_v1')
  localStorage.removeItem('spellbook_modal_size_v1')
  setMultiFilterEnabled(true)
  syncFilterSelectionRadios()
  setWrapCells(false)
  syncWrapCells()
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
  const topRadio = document.querySelector("input[name='controls-position'][value='top']")
  if (topRadio) topRadio.checked = true
  clearCategoryColors()
  renderCategoryColorSettings()
})

applyControlsPosition(loadControlsPosition())
restoreControlsWidth()
window.restoreControlsWidth = restoreControlsWidth
applyPanesLayout(loadPanesLayout())
applyTableDock()
placeScratchpad()
applyScratchpad()
