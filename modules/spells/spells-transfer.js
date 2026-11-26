/*
 * Spells' parts of Import / Export (js/transfer.js): commands, scripts, terms
 * and the category colors. Moved here from js/transfer.js so Import / Export
 * works without Spells.
 *
 * Commands, scripts and terms are not applied in the Import / Export window:
 * they go to the Import Manager (spells.js), which shows what is new or
 * changed for each item, one list after another. apply() returns a promise
 * (wait) that settles when the queue reaches it, so settings, which reload the
 * page, are applied last.
 *
 * Also here: Spells' groups of saved settings (SpellBook.settingGroup).
 * Also read here: CSV files, a .txt file that sets window.SPELLBOOK_COMMANDS,
 * and a plain JSON list of commands, scripts or terms.
 */
;(() => {
  const SpellBook = window.SpellBook
  const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`

  const isCommand = (c) => c && typeof c === 'object' && c.id && c.title && (c.platform || c.os) && typeof c.command === 'string'
  const isScript = (s) => s && typeof s.name === 'string' && typeof s.body === 'string'
  const isTerm = (t) => t && typeof t.term === 'string' && typeof t.definition === 'string'

  function listPart(list, isOk, label, clean) {
    if (!Array.isArray(list) || !list.every(isOk)) throw new Error(`The ${label} in this file are missing required fields.`)
    return list.map(clean)
  }

  // Starts the Import Manager once the Import / Export window has queued
  // everything (unless it is already showing a list).
  let kickScheduled = false
  function kick() {
    if (kickScheduled) return
    kickScheduled = true
    queueMicrotask(() => {
      kickScheduled = false
      if (!importSession) nextInImportQueue()
    })
  }

  const KINDS = [
    {
      id: 'commands',
      title: 'Commands',
      unit: 'command',
      order: 10,
      all: () => commands,
      item: (c) => ({ id: c.id, label: c.title, sub: c.platform }),
      isOk: isCommand,
      clean: (c) => cleanImportedCommand(c),
      toCsv: (list) => commandsToCsv(list),
    },
    {
      id: 'scripts',
      title: 'Scripts',
      unit: 'script',
      order: 11,
      all: () => scripts,
      item: (s) => ({ id: s.id, label: s.name, sub: s.language }),
      isOk: isScript,
      clean: (s) => cleanImportedScript(s),
      toCsv: (list) => scriptsToCsv(list),
    },
    {
      id: 'terms',
      title: 'Terms',
      unit: 'term',
      order: 12,
      all: () => terms,
      item: (t) => ({ id: t.id, label: t.term, sub: t.category }),
      isOk: isTerm,
      clean: (t) => cleanImportedTerm(t),
      toCsv: (list) => termsToCsv(list),
    },
  ]
  const kind = (id) => KINDS.find((k) => k.id === id)
  const read = (id, list) => {
    const k = kind(id)
    return { [id]: listPart(list, k.isOk, id, k.clean) }
  }

  // Files that aren't Spell Book export files.
  function readFile(name, text) {
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
      return read('commands', JSON.parse(match[1]))
    }
    const data = JSON.parse(text)
    if (!Array.isArray(data)) return null
    const first = data[0] || {}
    if ('command' in first) return read('commands', data)
    if ('body' in first) return read('scripts', data)
    if ('definition' in first) return read('terms', data)
    throw new Error('This list is not commands, scripts or terms.')
  }

  KINDS.forEach((k, i) => {
    SpellBook.transferPart({
      id: k.id,
      title: k.title,
      unit: k.unit,
      order: k.order,
      list: () => k.all().map(k.item),
      export: (ids) => k.all().filter((item) => ids.has(item.id)),
      accept: (data) => (data ? listPart(data, k.isOk, k.id, k.clean) : null),
      describe: (list) => ({ sub: `${plural(list.length, k.unit)} in the file. You review each one before it is applied.` }),
      apply(list, picked, { fileName } = {}) {
        importQueue.push({ kind: k.id, fileName, incoming: list })
        const wait = new Promise((resolve) => importQueue.push({ run: resolve }))
        kick()
        return { wait }
      },
      csv: { name: k.id, write: k.toCsv },
      // One reader is enough: it handles all three kinds.
      readFile: i === 0 ? readFile : undefined,
    })
  })

  // Saved settings that Import / Export copies in groups (the ids are the
  // ones older export files use).
  ;[
    {
      id: 'layout',
      title: 'Layout and panes',
      sub: 'control bar position, pane sizes, folded sections, scratch pad size',
      order: 10,
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
        'spellbook_options_open_v1',
        'spellbook_wrap_cells_v1',
      ],
    },
    {
      id: 'columns',
      title: 'Columns and filters',
      sub: 'hidden columns, column widths, hidden or renamed filters, section names',
      order: 60,
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
      order: 70,
      keys: ['spellbook_custom_os_v1', 'spellbook_custom_langs_v1', 'spellbook_custom_categories_v1'],
    },
    { id: 'scratch', title: 'Scratch pad text', sub: 'what is typed in the scratch pad', order: 80, keys: ['spellbook_scratchpad_text_v1'] },
  ].forEach((group) => SpellBook.settingGroup(group))

  SpellBook.transferPart({
    id: 'categoryColors',
    section: 'Colors',
    title: 'Category colors',
    sub: 'platform, language and category colors',
    order: 20,
    export: () => getCategoryColors(),
    accept: (data) => (data && typeof data === 'object' && !Array.isArray(data) ? data : null),
    describe: () => ({ sub: 'Replaces yours.' }),
    apply(colors) {
      replaceCategoryColors(colors)
      renderCategoryColorSettings()
      return 'category colors'
    },
  })
})()
