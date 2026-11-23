/*
 * Import / Export Manager (header button "Import / Export").
 *
 * One window for everything that can leave or enter Spell Book: commands,
 * scripts, terms, Compendium tomes, the three kinds of colors, and groups of
 * settings. Export saves what is ticked into one .json file (or CSV files for
 * commands, scripts and terms). Import reads that file, or an older commands,
 * scripts, terms or theme file, and applies the ticked parts.
 *
 * The window itself handles the appearance, the code theme and groups of
 * settings (js/settings.js). Everything else is a part that a tab adds with
 * SpellBook.transferPart (js/core/pages.js), so a tab that isn't installed
 * just isn't listed:
 *   id        the part's key in the export file ("commands", "tomes", …)
 *   title, unit, sub, order
 *   section   'Content' (the default) or 'Colors'
 *   list()    [{ id, label, sub }]: what can be ticked for export; without
 *             it the part is one tick box
 *   export(ids)     the data to write: ids is a Set of ticked ids, or true
 *   accept(data)    import: the part's data from a file, checked (may throw);
 *                   null to skip it
 *   describe(data)  { sub, items?: [{ id, label, sub }] } for the import list
 *   apply(data, picked, { fileName })  brings it in (picked: a Set of
 *             describe ids, or true); returns a few words for the summary, or
 *             { note, wait }: wait is a promise for work that goes on after
 *             this window closes (Spells' Import Manager), and settings,
 *             which reload the page, wait for it
 *   csv       { name, write(data) }: the part can be exported as a CSV file
 *
 * Other export formats come from SpellBook.exportFormat({ id, label, parts,
 * write(parts) }): `parts` names the parts it takes (others are greyed out
 * when it's chosen), and write gets { partId: data } and returns
 * { name, blob } to download. The Compendium's "Markdown (.zip)" is one.
 *   readFile(name, text)  another kind of file the part reads (CSV, .txt,
 *             a plain list): returns { partId: data } or null
 */
;(() => {
  const FORMAT = 'spellbook-export'
  const $ = (id) => document.getElementById(id)
  const esc = (value) => escapeHtml(String(value === undefined || value === null ? '' : value))

  // Settings kept as raw browser-storage values, in groups the person can pick.
  // The core has the tab order and the fonts; each tab adds its own with SpellBook.settingGroup
  // (Spells: layout, columns and filters, custom lists, scratch pad text).
  // Sealed-note variables are left out on purpose: they can hold secrets.
  const CORE_GROUPS = [
    { id: 'tabs', title: 'Tabs', sub: 'the order of the tabs in the navigation bar, and which are turned off', keys: ['spellbook_tab_order_v1', 'spellbook_tabs_off_v1'], order: 5 },
    { id: 'fonts', title: 'Fonts', sub: 'the font choices in Settings', keys: ['spellbook_fonts_v1'], order: 50 },
  ]
  const settingGroups = () => {
    const extra = window.SpellBook ? window.SpellBook.contributions('settingGroups') : []
    return [...CORE_GROUPS, ...extra.filter((g) => Array.isArray(g.keys))].sort((x, y) => (x.order ?? 100) - (y.order ?? 100))
  }

  const moduleParts = () => (window.SpellBook ? window.SpellBook.contributions('transfer') : [])
  const partsIn = (section) => moduleParts().filter((part) => (part.section || 'Content') === section)
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  // ─── Export side ───────────────────────────────────────────────────
  // The formats in the Format list: one .json file, CSV files when a part
  // can write them, and any a tab adds (SpellBook.exportFormat) whose parts
  // are here.
  const extraFormats = () =>
    (window.SpellBook ? window.SpellBook.contributions('exportFormats') : []).filter(
      (f) => typeof f.write === 'function' && (f.parts || []).some((id) => moduleParts().some((p) => p.id === id)),
    )
  const chosenFormat = () => extraFormats().find((f) => `x:${f.id}` === $('tm-format').value) || null
  // Whether a group can go into the chosen format.
  function fits(group) {
    const value = $('tm-format').value
    if (value === 'csv') return Boolean(group.csv)
    const format = chosenFormat()
    return format ? format.parts.includes(group.id) : true
  }
  function fillFormats(groups) {
    const select = $('tm-format')
    const was = select.value
    const options = [['json', 'One file (.json)']]
    if (groups.some((group) => group.csv)) options.push(['csv', 'CSV files (commands, scripts, terms)'])
    extraFormats().forEach((f) => options.push([`x:${f.id}`, f.label || f.id]))
    select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')
    select.value = options.some(([value]) => value === was) ? was : 'json'
  }

  // Each group: id, title, section, items (individually pickable) or none.
  function exportGroups() {
    const asGroup = (part) => ({
      id: part.id,
      section: part.section || 'Content',
      title: part.title || part.id,
      unit: part.unit,
      sub: part.sub,
      items: part.list ? part.list() : undefined,
      csv: Boolean(part.csv),
    })
    const groups = [
      ...partsIn('Content').map(asGroup),
      { id: 'appearance', section: 'Colors', title: 'Appearance', sub: 'light or dark mode and the application colors' },
      ...partsIn('Colors').map(asGroup),
      { id: 'codeTheme', section: 'Colors', title: 'Code block theme', sub: 'the chosen code theme and its syntax colors' },
      ...settingGroups().map((g) => ({ id: `settings:${g.id}`, section: 'Settings', title: g.title, sub: g.sub })),
    ]
    return groups
  }

  // Everything is held as { groupId: Set of item ids | true }.
  let exportPick = {}
  const exportOpen = new Set()

  function resetExportPick() {
    exportPick = {}
    exportOpen.clear()
  }

  function groupCount(group) {
    if (!group.items) return exportPick[group.id] ? 1 : 0
    return (exportPick[group.id] || new Set()).size
  }

  function renderExport() {
    const groups = exportGroups()
    fillFormats(groups)
    let section = ''
    const html = groups
      .map((group) => {
        const head = group.section !== section ? `<h3 class="tm-section">${esc(group.section)}</h3>` : ''
        section = group.section
        const csvOnly = !fits(group) // not in the chosen format: greyed out
        const picked = groupCount(group)
        const total = group.items ? group.items.length : 1
        const all = group.items ? picked === total && total > 0 : Boolean(picked)
        const some = group.items && picked > 0 && picked < total
        const open = exportOpen.has(group.id)
        const unit = group.unit || group.title.toLowerCase().replace(/s$/, '')
        const sub = group.items
          ? `${picked} of ${total} ${total === 1 ? unit : unit + 's'} ticked`
          : group.sub
        const rows =
          group.items && open
            ? `<div class="tm-items">${
                group.items.length
                  ? group.items
                      .map(
                        (item) =>
                          `<label class="tm-item"><input type="checkbox" data-group="${esc(group.id)}" data-item="${esc(item.id)}" ${
                            (exportPick[group.id] || new Set()).has(item.id) ? 'checked' : ''
                          } /> <span class="tm-item-name">${esc(item.label)}</span><span class="tm-item-sub">${esc(item.sub)}</span></label>`,
                      )
                      .join('')
                  : '<div class="im-empty">Nothing here yet.</div>'
              }</div>`
            : ''
        return `${head}
          <div class="tm-group ${csvOnly ? 'tm-off' : ''}">
            <div class="tm-row">
              <label class="tm-main"><input type="checkbox" class="tm-group-check" data-group="${esc(group.id)}" ${all ? 'checked' : ''} ${csvOnly ? 'disabled' : ''} data-some="${some ? '1' : ''}" />
                <span class="tm-title">${esc(group.title)}</span>
                <span class="tm-sub">${esc(sub)}</span></label>
              ${group.items && group.items.length ? `<button type="button" class="btn secondary sm tm-toggle" data-open="${esc(group.id)}" aria-expanded="${open}">${open ? 'Hide items' : 'Choose items'}</button>` : ''}
            </div>
            ${rows}
          </div>`
      })
      .join('')
    $('tm-export-list').innerHTML = html
    $('tm-export-list').querySelectorAll('[data-some="1"]').forEach((box) => (box.indeterminate = true))
    updateGo()
  }

  function setGroup(group, on) {
    if (group.items) exportPick[group.id] = on ? new Set(group.items.map((i) => i.id)) : new Set()
    else exportPick[group.id] = on
  }

  // The parts to write, from what is ticked.
  function buildExport() {
    const parts = {}
    const take = (id) => exportPick[id]
    moduleParts().forEach((part) => {
      const ids = take(part.id)
      if (part.list ? ids && ids.size : ids) parts[part.id] = part.export(ids)
    })
    if (take('appearance')) parts.appearance = { mode: loadMode(), colors: effectiveTheme() }
    if (take('codeTheme')) parts.codeTheme = { codeTheme: loadCodeTheme(), colors: effectiveSyntax() }
    settingGroups().forEach((group) => {
      if (!take(`settings:${group.id}`)) return
      const values = {}
      group.keys.forEach((key) => {
        try {
          const value = localStorage.getItem(key)
          if (value !== null) values[key] = value
        } catch {}
      })
      parts.settings = parts.settings || {}
      parts.settings[group.id] = values
    })
    return parts
  }

  // Ticked parts that the chosen format takes.
  function tickedCount() {
    return exportGroups().reduce((n, g) => n + (groupCount(g) && fits(g) ? 1 : 0), 0)
  }

  async function doExport() {
    const parts = buildExport()
    const format = chosenFormat()
    if (format) {
      const picked = {}
      format.parts.forEach((id) => {
        if (parts[id]) picked[id] = parts[id]
      })
      const out = await format.write(picked)
      if (out && out.blob) downloadFile(out.name, out.blob, out.blob.type || 'application/octet-stream')
      return
    }
    if ($('tm-format').value === 'csv') {
      const stamp = (base) => window.DataFile.backupName(base, 'csv')
      moduleParts().forEach((part) => {
        if (part.csv && parts[part.id]) downloadFile(stamp(part.csv.name || part.id), part.csv.write(parts[part.id]), 'text/csv;charset=utf-8')
      })
      return
    }
    const file = { app: FORMAT, version: 1, exportedAt: new Date().toISOString(), parts }
    downloadFile(
      window.DataFile.backupName('spellbook-export', 'json'),
      JSON.stringify(file, null, 2) + '\n',
      'application/json;charset=utf-8',
    )
  }

  // ─── Import side ───────────────────────────────────────────────────
  let incoming = null // { fileName, parts }
  let importPick = {} // { partId: true | Set of tome ids }

  // Turns a chosen file into { partId: data, appearance?, codeTheme?, settings? }.
  function parseImport(name, text) {
    const lower = name.toLowerCase()
    // Other kinds of file (CSV, .txt, a plain list) are read by the parts.
    const fromParts = () => {
      for (const part of moduleParts()) {
        if (!part.readFile) continue
        const found = part.readFile(name, text)
        if (found && Object.keys(found).length) return found
      }
      return null
    }
    if (!lower.endsWith('.json')) {
      const found = fromParts()
      if (found) return found
      throw new Error('Nothing in this file is something Spell Book can import.')
    }
    const data = JSON.parse(text)
    if (Array.isArray(data)) {
      const found = fromParts()
      if (found) return found
      throw new Error('This list is not something Spell Book can import.')
    }
    if (!data || typeof data !== 'object') throw new Error('This file is not a Spell Book file.')
    const parts = {}
    // A part's data, if that part is installed.
    const offer = (id, value) => {
      const part = moduleParts().find((each) => each.id === id)
      if (!part || value === undefined || value === null) return
      const accepted = part.accept(value)
      if (accepted) parts[id] = accepted
    }
    if (data.app === FORMAT) {
      const p = data.parts || {}
      moduleParts().forEach((part) => offer(part.id, p[part.id]))
      if (p.appearance && p.appearance.colors) parts.appearance = p.appearance
      if (p.codeTheme && p.codeTheme.colors) parts.codeTheme = p.codeTheme
      if (p.settings && typeof p.settings === 'object') {
        // Read by key, not by the group it was saved under, so a key that has
        // moved to another tab's group (or a file from an older version) still
        // lands in the right place. Keys no installed group knows are skipped.
        const values = {}
        Object.values(p.settings).forEach((group) => {
          if (group && typeof group === 'object') Object.assign(values, group)
        })
        const known = {}
        settingGroups().forEach((g) => {
          const clean = {}
          g.keys.forEach((key) => {
            if (typeof values[key] === 'string') clean[key] = values[key]
          })
          if (Object.keys(clean).length) known[g.id] = clean
        })
        if (Object.keys(known).length) parts.settings = known
      }
    } else if (data.app === 'spellbook-theme') {
      if (data.colors) parts.appearance = { mode: data.mode, colors: data.colors }
      offer('categoryColors', data.categoryColors)
      if (data.syntaxColors) parts.codeTheme = { codeTheme: data.codeTheme, colors: data.syntaxColors }
    } else if (data.app === 'spellbook-appearance-theme' || (data.colors && !data.app)) {
      parts.appearance = { mode: data.mode, colors: data.colors }
    } else if (data.app === 'spellbook-category-colors' || data.categoryColors) {
      offer('categoryColors', data.categoryColors)
    } else if (data.app === 'spellbook-syntax-colors') {
      parts.codeTheme = { codeTheme: data.codeTheme, colors: data.colors }
    }
    if (!Object.keys(parts).length) throw new Error('Nothing in this file is something Spell Book can import.')
    return parts
  }

  function importRows() {
    const p = incoming.parts
    const rows = []
    const partRows = (section) =>
      partsIn(section).forEach((part) => {
        if (p[part.id] === undefined) return
        const shown = part.describe(p[part.id])
        rows.push({ id: part.id, title: part.title || part.id, sub: shown.sub, items: shown.items })
      })
    partRows('Content')
    if (p.appearance) rows.push({ id: 'appearance', title: 'Appearance', sub: 'light or dark mode and the application colors. Replaces yours.' })
    partRows('Colors')
    if (p.codeTheme) rows.push({ id: 'codeTheme', title: 'Code block theme', sub: 'the code theme and its syntax colors. Replaces yours.' })
    if (p.settings) {
      settingGroups().forEach((g) => {
        if (p.settings[g.id]) rows.push({ id: `settings:${g.id}`, title: g.title, sub: `${g.sub}. The page reloads to apply it.` })
      })
    }
    return rows
  }

  function renderImport() {
    const list = $('tm-import-list')
    if (!incoming) {
      list.innerHTML = ''
      updateGo()
      return
    }
    list.innerHTML = importRows()
      .map((row) => {
        const picked = importPick[row.id]
        const open = exportOpen.has(`in:${row.id}`)
        const items = row.items
        const all = items ? picked && picked.size === items.length : Boolean(picked)
        const some = items && picked && picked.size > 0 && picked.size < items.length
        return `<div class="tm-group">
          <div class="tm-row">
            <label class="tm-main"><input type="checkbox" class="tm-group-check" data-in-group="${esc(row.id)}" ${all ? 'checked' : ''} data-some="${some ? '1' : ''}" />
              <span class="tm-title">${esc(row.title)}</span><span class="tm-sub">${esc(row.sub)}</span></label>
            ${items ? `<button type="button" class="btn secondary sm tm-toggle" data-in-open="${esc(row.id)}" aria-expanded="${open}">${open ? 'Hide items' : 'Choose items'}</button>` : ''}
          </div>
          ${
            items && open
              ? `<div class="tm-items">${items
                  .map(
                    (item) =>
                      `<label class="tm-item"><input type="checkbox" data-in-group="${esc(row.id)}" data-in-item="${esc(item.id)}" ${picked && picked.has(item.id) ? 'checked' : ''} /> <span class="tm-item-name">${esc(item.label)}</span><span class="tm-item-sub">${esc(item.sub)}</span></label>`,
                  )
                  .join('')}</div>`
              : ''
          }
        </div>`
      })
      .join('')
    list.querySelectorAll('[data-some="1"]').forEach((box) => (box.indeterminate = true))
    updateGo()
  }

  function importCount() {
    return Object.values(importPick).filter((v) => (v instanceof Set ? v.size : v)).length
  }

  function applyImport() {
    const { parts, fileName } = incoming
    const pick = importPick
    const on = (id) => (pick[id] instanceof Set ? pick[id].size > 0 : Boolean(pick[id]))
    const notes = []

    const waits = []
    const applyPart = (part) => {
      if (!on(part.id) || parts[part.id] === undefined) return
      const result = part.apply(parts[part.id], pick[part.id], { fileName })
      const note = result && typeof result === 'object' ? result.note : result
      if (note) notes.push(note)
      if (result && result.wait) waits.push(result.wait)
    }

    // Colors first: a mode change resets the syntax colors, so the code theme follows it.
    if (on('appearance')) {
      applyAppearanceTheme(parts.appearance)
      notes.push('appearance')
    }
    partsIn('Colors').forEach(applyPart)
    if (on('codeTheme')) {
      const theme = parts.codeTheme
      applySyntaxColors(CODE_THEMES.includes(theme.codeTheme) ? theme.codeTheme : undefined, theme.colors)
      notes.push('code theme')
    }
    closeTransfer()
    partsIn('Content').forEach(applyPart)

    // Settings reload the page, so they wait for the parts still at work
    // (Spells' Import Manager goes through its lists one after another).
    const chosenGroups = settingGroups().filter((g) => on(`settings:${g.id}`) && parts.settings && parts.settings[g.id])
    if (chosenGroups.length) {
      Promise.all(waits).then(() => {
        chosenGroups.forEach((g) => {
          Object.entries(parts.settings[g.id]).forEach(([key, value]) => {
            try {
              localStorage.setItem(key, value)
            } catch {}
          })
        })
        if (window.DataFile) window.DataFile.reload()
        else location.reload()
      })
    }
    return notes
  }

  // ─── Window ────────────────────────────────────────────────────────
  let tab = 'export'

  function updateGo() {
    const exporting = tab === 'export'
    const count = exporting ? tickedCount() : importCount()
    $('tm-go').textContent = exporting ? 'Export' : 'Import'
    $('tm-go').disabled = count === 0
    $('tm-format-label').hidden = !exporting
    $('tm-note').textContent = count ? `${plural(count, 'part')} selected` : exporting ? 'Nothing ticked' : incoming ? 'Nothing ticked' : ''
  }

  function showTab(next) {
    tab = next
    document.querySelectorAll('[data-tm-tab]').forEach((button) => {
      const active = button.dataset.tmTab === tab
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    $('tm-export-pane').hidden = tab !== 'export'
    $('tm-import-pane').hidden = tab !== 'import'
    if (tab === 'export') renderExport()
    else renderImport()
  }

  function openTransfer(start = 'export') {
    resetExportPick()
    incoming = null
    importPick = {}
    $('tm-file-name').textContent = 'No file chosen'
    $('transfer-manager').classList.add('open')
    showTab(start)
  }

  function closeTransfer() {
    $('transfer-manager').classList.remove('open')
  }

  $('btn-transfer').addEventListener('click', () => openTransfer())
  $('tm-close').addEventListener('click', closeTransfer)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('transfer-manager').classList.contains('open')) closeTransfer()
  })
  $('tm-tabs').addEventListener('click', (e) => {
    const button = e.target.closest('[data-tm-tab]')
    if (button) showTab(button.dataset.tmTab)
  })
  $('tm-format').addEventListener('change', renderExport)
  $('tm-go').addEventListener('click', () => (tab === 'export' ? doExport() : applyImport()))

  $('tm-export-list').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-open]')
    if (toggle) {
      const id = toggle.dataset.open
      exportOpen.has(id) ? exportOpen.delete(id) : exportOpen.add(id)
      renderExport()
    }
  })
  $('tm-export-list').addEventListener('change', (e) => {
    const box = e.target
    if (!box.matches('input[type="checkbox"]')) return
    const group = exportGroups().find((g) => g.id === box.dataset.group)
    if (!group) return
    if (box.dataset.item !== undefined) {
      const set = exportPick[group.id] || (exportPick[group.id] = new Set())
      box.checked ? set.add(box.dataset.item) : set.delete(box.dataset.item)
    } else {
      setGroup(group, box.checked)
    }
    renderExport()
  })

  $('tm-choose-file').addEventListener('click', () => {
    $('tm-file').value = ''
    $('tm-file').click()
  })
  $('tm-file').addEventListener('change', async () => {
    const file = $('tm-file').files && $('tm-file').files[0]
    if (!file) return
    try {
      const parts = parseImport(file.name, await file.text())
      incoming = { fileName: file.name, parts }
      importPick = {}
      $('tm-file-name').textContent = file.name
      importRows().forEach((row) => (importPick[row.id] = row.items ? new Set(row.items.map((i) => i.id)) : true))
      renderImport()
    } catch (err) {
      incoming = null
      importPick = {}
      $('tm-file-name').textContent = 'No file chosen'
      renderImport()
      alert('Import failed: ' + err.message)
    }
  })
  $('tm-import-list').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-in-open]')
    if (toggle) {
      const id = `in:${toggle.dataset.inOpen}`
      exportOpen.has(id) ? exportOpen.delete(id) : exportOpen.add(id)
      renderImport()
    }
  })
  $('tm-import-list').addEventListener('change', (e) => {
    const box = e.target
    if (!box.matches('input[type="checkbox"]')) return
    const row = importRows().find((r) => r.id === box.dataset.inGroup)
    if (!row) return
    if (box.dataset.inItem !== undefined) {
      const set = importPick[row.id] instanceof Set ? importPick[row.id] : (importPick[row.id] = new Set())
      box.checked ? set.add(box.dataset.inItem) : set.delete(box.dataset.inItem)
    } else if (row.items) {
      importPick[row.id] = box.checked ? new Set(row.items.map((i) => i.id)) : new Set()
    } else {
      importPick[row.id] = box.checked
    }
    renderImport()
  })

  window.TransferManager = { open: openTransfer, parseImport }
})()
