/*
 * Import / Export Manager (header button "Import / Export").
 *
 * One window for everything that can leave or enter Spell Book: commands,
 * scripts, terms, Compendium tomes, the three kinds of colors, and groups of
 * settings. Export saves what is ticked into one .json file (or CSV files for
 * commands, scripts and terms). Import reads that file, or an older commands,
 * scripts, terms or theme file, and applies the ticked parts.
 *
 * Commands, scripts and terms are not applied here: they go to the existing
 * Import Manager (app.js), which shows what is new or changed for each item.
 * Needs js/app.js, js/settings.js and js/notes.js, which load first.
 */
;(() => {
  const FORMAT = 'spellbook-export'
  const $ = (id) => document.getElementById(id)
  const esc = (value) => escapeHtml(String(value === undefined || value === null ? '' : value))

  // Settings kept as raw browser-storage values, in groups the person can pick.
  // Sealed-note variables are left out on purpose: they can hold secrets.
  const SETTING_GROUPS = [
    {
      id: 'layout',
      title: 'Layout and panes',
      sub: 'control bar position, pane sizes, folded sections, scratch pad size',
      keys: [
        'spellbook_layout_v1',
        'spellbook_panes_v1',
        'spellbook_split_v1',
        'spellbook_split_w_v1',
        'spellbook_dock_split_v1',
        'spellbook_table_dock_v1',
        'spellbook_controls_width_v1',
        'spellbook_scratch_height_v1',
        'spellbook_scratchpad_v1',
        'spellbook_collapsed_sections_v1',
        'spellbook_modal_size_v1',
        'spellbook_notes_pane_v1',
        'spellbook_options_open_v1',
      ],
    },
    { id: 'fonts', title: 'Fonts', sub: 'the font choices in Settings', keys: ['spellbook_fonts_v1'] },
    {
      id: 'columns',
      title: 'Columns and filters',
      sub: 'hidden columns, column widths, hidden or renamed filters, section names',
      keys: [
        'spellbook_hidden_columns_v1',
        'spellbook_column_widths_v1',
        'spellbook_hidden_filters_v1',
        'spellbook_filter_renames_v1',
        'spellbook_section_names_v1',
        'spellbook_multi_filter_v1',
      ],
    },
    {
      id: 'custom',
      title: 'Custom lists',
      sub: 'platforms, script languages and term categories you added',
      keys: ['spellbook_custom_os_v1', 'spellbook_custom_langs_v1', 'spellbook_custom_categories_v1'],
    },
    { id: 'scratch', title: 'Scratch pad text', sub: 'what is typed in the scratch pad', keys: ['spellbook_scratchpad_text_v1'] },
  ]

  const LIST_KINDS = ['commands', 'scripts', 'terms']
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  // ─── Export side ───────────────────────────────────────────────────
  // Each group: id, title, section, items (individually pickable) or none.
  function exportGroups() {
    const tomes = window.NotesIO ? window.NotesIO.list() : []
    const groups = [
      {
        id: 'commands',
        section: 'Content',
        title: 'Commands',
        items: commands.map((c) => ({ id: c.id, label: c.title, sub: c.platform })),
      },
      {
        id: 'scripts',
        section: 'Content',
        title: 'Scripts',
        items: scripts.map((s) => ({ id: s.id, label: s.name, sub: s.language })),
      },
      {
        id: 'terms',
        section: 'Content',
        title: 'Terms',
        items: terms.map((t) => ({ id: t.id, label: t.term, sub: t.category })),
      },
      {
        id: 'tomes',
        section: 'Content',
        title: 'Compendium',
        unit: 'tome',
        items: tomes.map((t) => ({
          id: t.id,
          label: t.name,
          sub: `${plural(t.notes, 'note')}${t.sealed ? ', sealed' : ''}`,
        })),
      },
      { id: 'appearance', section: 'Colors', title: 'Appearance', sub: 'light or dark mode and the application colors' },
      { id: 'categoryColors', section: 'Colors', title: 'Category colors', sub: 'platform, language and category colors' },
      { id: 'codeTheme', section: 'Colors', title: 'Code block theme', sub: 'the chosen code theme and its syntax colors' },
      ...SETTING_GROUPS.map((g) => ({ id: `settings:${g.id}`, section: 'Settings', title: g.title, sub: g.sub })),
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
    const csv = $('tm-format').value === 'csv'
    let section = ''
    const html = groups
      .map((group) => {
        const head = group.section !== section ? `<h3 class="tm-section">${esc(group.section)}</h3>` : ''
        section = group.section
        const csvOnly = csv && !LIST_KINDS.includes(group.id)
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
    const chosen = (list, key = 'id') => {
      const ids = take(list === commands ? 'commands' : list === scripts ? 'scripts' : 'terms')
      return ids && ids.size ? list.filter((item) => ids.has(item[key])) : null
    }
    const c = chosen(commands)
    if (c) parts.commands = c
    const s = chosen(scripts)
    if (s) parts.scripts = s
    const t = chosen(terms)
    if (t) parts.terms = t
    const tomeIds = take('tomes')
    if (tomeIds && tomeIds.size && window.NotesIO) parts.tomes = window.NotesIO.get(tomeIds)
    if (take('appearance')) parts.appearance = { mode: loadMode(), colors: effectiveTheme() }
    if (take('categoryColors')) parts.categoryColors = getCategoryColors()
    if (take('codeTheme')) parts.codeTheme = { codeTheme: loadCodeTheme(), colors: effectiveSyntax() }
    SETTING_GROUPS.forEach((group) => {
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

  function tickedCount() {
    return exportGroups().reduce((n, g) => n + (groupCount(g) ? 1 : 0), 0)
  }

  function doExport() {
    const parts = buildExport()
    if ($('tm-format').value === 'csv') {
      const stamp = (base) => window.DataFile.backupName(base, 'csv')
      if (parts.commands) downloadFile(stamp('commands'), commandsToCsv(parts.commands), 'text/csv;charset=utf-8')
      if (parts.scripts) downloadFile(stamp('scripts'), scriptsToCsv(parts.scripts), 'text/csv;charset=utf-8')
      if (parts.terms) downloadFile(stamp('terms'), termsToCsv(parts.terms), 'text/csv;charset=utf-8')
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

  const isCommand = (c) => c && typeof c === 'object' && c.id && c.title && (c.platform || c.os) && typeof c.command === 'string'
  const isScript = (s) => s && typeof s.name === 'string' && typeof s.body === 'string'
  const isTerm = (t) => t && typeof t.term === 'string' && typeof t.definition === 'string'

  function listPart(list, isOk, label, clean) {
    if (!Array.isArray(list) || !list.every(isOk)) throw new Error(`The ${label} in this file are missing required fields.`)
    return list.map(clean)
  }

  // Turns a chosen file into { commands?, scripts?, terms?, tomes?, appearance?, ... }.
  function parseImport(name, text) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.csv')) {
      const header = (text.split(/\r?\n/, 1)[0] || '').toLowerCase().split(',').map((s) => s.replace(/"/g, '').trim())
      if (header.includes('command')) return { commands: commandsFromCsv(text).map(cleanImportedCommand) }
      if (header.includes('body')) return { scripts: scriptsFromCsv(text).map(cleanImportedScript) }
      if (header.includes('definition')) return { terms: termsFromCsv(text).map(cleanImportedTerm) }
      throw new Error('This CSV file does not look like commands, scripts or terms.')
    }
    if (!lower.endsWith('.json')) {
      const match = text.match(/window\.SPELLBOOK_COMMANDS\s*=\s*([\s\S]*?)\s*;?\s*$/)
      if (!match) throw new Error('This .txt file does not define window.SPELLBOOK_COMMANDS.')
      return { commands: listPart(JSON.parse(match[1]), isCommand, 'commands', cleanImportedCommand) }
    }
    const data = JSON.parse(text)
    if (Array.isArray(data)) {
      const first = data[0] || {}
      if ('command' in first) return { commands: listPart(data, isCommand, 'commands', cleanImportedCommand) }
      if ('body' in first) return { scripts: listPart(data, isScript, 'scripts', cleanImportedScript) }
      if ('definition' in first) return { terms: listPart(data, isTerm, 'terms', cleanImportedTerm) }
      throw new Error('This list is not commands, scripts or terms.')
    }
    if (!data || typeof data !== 'object') throw new Error('This file is not a Spell Book file.')
    const parts = {}
    if (data.app === FORMAT) {
      const p = data.parts || {}
      if (p.commands) parts.commands = listPart(p.commands, isCommand, 'commands', cleanImportedCommand)
      if (p.scripts) parts.scripts = listPart(p.scripts, isScript, 'scripts', cleanImportedScript)
      if (p.terms) parts.terms = listPart(p.terms, isTerm, 'terms', cleanImportedTerm)
      if (Array.isArray(p.tomes) && p.tomes.length) parts.tomes = p.tomes
      if (p.appearance && p.appearance.colors) parts.appearance = p.appearance
      if (p.categoryColors && typeof p.categoryColors === 'object') parts.categoryColors = p.categoryColors
      if (p.codeTheme && p.codeTheme.colors) parts.codeTheme = p.codeTheme
      if (p.settings && typeof p.settings === 'object') {
        const known = {}
        SETTING_GROUPS.forEach((g) => {
          const values = p.settings[g.id]
          if (!values || typeof values !== 'object') return
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
      if (data.categoryColors) parts.categoryColors = data.categoryColors
      if (data.syntaxColors) parts.codeTheme = { codeTheme: data.codeTheme, colors: data.syntaxColors }
    } else if (data.app === 'spellbook-appearance-theme' || (data.colors && !data.app)) {
      parts.appearance = { mode: data.mode, colors: data.colors }
    } else if (data.app === 'spellbook-category-colors' || data.categoryColors) {
      parts.categoryColors = data.categoryColors
    } else if (data.app === 'spellbook-syntax-colors') {
      parts.codeTheme = { codeTheme: data.codeTheme, colors: data.colors }
    }
    if (!Object.keys(parts).length) throw new Error('Nothing in this file is something Spell Book can import.')
    return parts
  }

  function importRows() {
    const p = incoming.parts
    const rows = []
    const list = (id, title, items, unit) => {
      if (items) rows.push({ id, title, sub: `${plural(items.length, unit)} in the file. You review each one before it is applied.` })
    }
    list('commands', 'Commands', p.commands, 'command')
    list('scripts', 'Scripts', p.scripts, 'script')
    list('terms', 'Terms', p.terms, 'term')
    if (p.tomes) {
      rows.push({
        id: 'tomes',
        title: 'Compendium',
        sub: `${plural(p.tomes.length, 'tome')} in the file, added as new tabs.`,
        items: p.tomes.map((t, i) => ({ id: String(i), label: t.name || 'Untitled', sub: t.sealed ? 'sealed' : '' })),
      })
    }
    if (p.appearance) rows.push({ id: 'appearance', title: 'Appearance', sub: 'light or dark mode and the application colors. Replaces yours.' })
    if (p.categoryColors) rows.push({ id: 'categoryColors', title: 'Category colors', sub: 'Replaces yours.' })
    if (p.codeTheme) rows.push({ id: 'codeTheme', title: 'Code block theme', sub: 'the code theme and its syntax colors. Replaces yours.' })
    if (p.settings) {
      SETTING_GROUPS.forEach((g) => {
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

    // Colors first: a mode change resets the syntax colors, so the code theme follows it.
    if (on('appearance')) {
      applyAppearanceTheme(parts.appearance)
      notes.push('appearance')
    }
    if (on('categoryColors')) {
      replaceCategoryColors(parts.categoryColors)
      if (typeof renderCategoryColorSettings === 'function') renderCategoryColorSettings()
      notes.push('category colors')
    }
    if (on('codeTheme')) {
      const theme = parts.codeTheme
      applySyntaxColors(CODE_THEMES.includes(theme.codeTheme) ? theme.codeTheme : undefined, theme.colors)
      notes.push('code theme')
    }
    if (on('tomes') && window.NotesIO) {
      const chosen = parts.tomes.filter((_, i) => pick.tomes.has(String(i)))
      const added = window.NotesIO.add(chosen)
      notes.push(plural(added, 'tome'))
    }
    const settingGroups = SETTING_GROUPS.filter((g) => on(`settings:${g.id}`) && parts.settings && parts.settings[g.id])

    // Lists go to the Import Manager one after another; settings wait for them
    // because applying settings reloads the page.
    LIST_KINDS.forEach((kind) => {
      if (on(kind)) importQueue.push({ kind, fileName, incoming: parts[kind] })
    })
    if (settingGroups.length) {
      importQueue.push({
        run: () => {
          settingGroups.forEach((g) => {
            Object.entries(parts.settings[g.id]).forEach(([key, value]) => {
              try {
                localStorage.setItem(key, value)
              } catch {}
            })
          })
          location.reload()
        },
      })
    }
    closeTransfer()
    nextInImportQueue()
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
