/*
 * The Tools page's layout: a list of tools on the left, the chosen one on the
 * right. Drag a tool's dotted handle (or Ctrl+Shift+↑ / ↓) to reorder the
 * list; "Choose tools" under it turns tools on or off. Both are saved under
 * spellbook_tools_v1 as { off: [ids], order: [ids] } (so they are in the data
 * file). The tool
 * last open is remembered in this browser only. A tool's id comes from its
 * heading. Loaded after the scripts that make the cards.
 */
;(() => {
  const KEY = 'spellbook_tools_v1'
  const LAST_KEY = 'sb_tools_last' // not spellbook_: switching isn't a change to save
  const grid = document.getElementById('tools-grid')
  if (!grid) return
  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }
  // A line under each name in the list.
  const ABOUT = {
    powershell: 'Cmdlet help and completion',
    bash: 'Linux commands and options',
    'man-page-importer': 'Help text to a command',
    'number-converter': 'Decimal, hex, octal, binary',
    'crontab-interpreter': 'Schedules in plain English',
    'regex-interpreter': 'Explain and test patterns',
    'help-harvester': 'Collect a command’s help',
    'ftp-codes': 'FTP server replies',
    'http-codes': 'Web status codes',
    'smtp-codes': 'Mail server replies',
    'windows-event-codes': 'Security events by criticality',
  }

  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
      const list = (value) => (Array.isArray(value) ? value : [])
      return { off: new Set(list(saved.off)), order: list(saved.order) }
    } catch {
      return { off: new Set(), order: [] }
    }
  }
  const saved = read()
  const off = saved.off
  let order = saved.order // empty: the order the cards are made in
  let current = ''
  try {
    current = localStorage.getItem(LAST_KEY) || ''
  } catch {}
  function save() {
    try {
      if (off.size || order.length) localStorage.setItem(KEY, JSON.stringify({ off: [...off], order }))
      else localStorage.removeItem(KEY)
    } catch {}
  }

  const layout = el('div', 'tools-layout')
  const side = el('div', 'tools-side')
  const list = el('div', 'tools-list')
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-orientation', 'vertical')
  list.setAttribute('aria-label', 'Tools')

  const tools = [...grid.querySelectorAll(':scope > .tool')].map((card) => {
    const title = card.querySelector('h2').textContent.trim()
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const tab = el('button', 'tools-tab')
    tab.type = 'button'
    tab.id = `tools-tab-${id}`
    tab.setAttribute('role', 'tab')
    const name = el('span', 'tools-tab-name', title)
    name.prepend(window.SpellBook.reorderHandle('Drag to move this tool', { vertical: true }))
    tab.append(name, el('span', 'tools-tab-about', ABOUT[id] || ''))
    card.id = `tool-${id}`
    card.setAttribute('role', 'tabpanel')
    card.setAttribute('aria-labelledby', tab.id)
    tab.setAttribute('aria-controls', card.id)
    tab.addEventListener('click', () => open(id))
    list.append(tab)
    return { id, title, card, tab }
  })

  // ─── Choose tools ───────────────────────────────────────────────────
  const choose = el('details', 'tools-choose')
  const summary = el('summary', '', 'Choose tools')
  const choices = el('fieldset', 'tools-choices')
  choices.append(el('legend', '', 'Show these tools'))
  tools.forEach((t) => {
    const label = el('label')
    t.box = el('input')
    t.box.type = 'checkbox'
    t.box.addEventListener('change', () => {
      if (t.box.checked) off.delete(t.id)
      else off.add(t.id)
      save()
      apply()
    })
    label.append(t.box, el('span', '', t.title))
    t.choice = label
    choices.append(label)
  })
  const reset = el('button', 'btn secondary sm tools-reset-order', 'Default order')
  reset.type = 'button'
  reset.addEventListener('click', () => {
    order = []
    save()
    apply()
  })
  choose.append(summary, choices, reset)

  const none = el('p', 'tools-none', 'Every tool is turned off. Open “Choose tools” to turn one on.')
  side.append(list, choose)
  grid.before(layout)
  layout.append(side, grid)
  grid.append(none)

  // The tools in the saved order; any it doesn't name come after.
  const ordered = () => {
    const rank = (t) => {
      const i = order.indexOf(t.id)
      return i < 0 ? order.length + tools.indexOf(t) : i
    }
    return [...tools].sort((a, b) => rank(a) - rank(b))
  }
  const shown = () => ordered().filter((t) => !off.has(t.id))

  // Puts the list and the choices in order, moving only what is out of place
  // so a focused tool keeps the focus where it can.
  function arrange() {
    ordered().forEach((t, i) => {
      if (list.children[i] !== t.tab) list.insertBefore(t.tab, list.children[i] || null)
      // The choices' first child is their legend.
      if (choices.children[i + 1] !== t.choice) choices.insertBefore(t.choice, choices.children[i + 1] || null)
    })
    reset.hidden = !order.length
  }

  function apply() {
    arrange()
    const on = shown()
    // The tool open before, or else the first one on.
    const active = on.find((t) => t.id === current) || on[0] || null
    tools.forEach((t) => {
      const selected = t === active
      t.tab.hidden = off.has(t.id)
      t.tab.setAttribute('aria-selected', String(selected))
      t.tab.tabIndex = selected ? 0 : -1
      t.card.hidden = !selected
      t.box.checked = !off.has(t.id)
    })
    summary.textContent = on.length === tools.length ? 'Choose tools' : `Choose tools (${on.length} of ${tools.length})`
    none.hidden = on.length > 0
    announce()
  }

  // Tells the tool on screen that it is: spellbook:tool, detail.id.
  function announce() {
    const tool = tools.find((t) => !t.card.hidden)
    if (tool && window.SpellBook.currentPage() === 'tools') {
      document.dispatchEvent(new CustomEvent('spellbook:tool', { detail: { id: tool.id } }))
    }
  }
  document.addEventListener('spellbook:page', announce)

  function open(id) {
    current = id
    try {
      localStorage.setItem(LAST_KEY, id)
    } catch {}
    apply()
  }

  // ↑ ↓ Home End move through the list, opening each tool.
  list.addEventListener('keydown', (e) => {
    const on = shown()
    const at = on.findIndex((t) => t.tab === document.activeElement)
    const next = { ArrowUp: at - 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: on.length - 1 }[e.key]
    if (at < 0 || next === undefined) return
    e.preventDefault()
    const tool = on[(next + on.length) % on.length]
    open(tool.id)
    tool.tab.focus()
  })

  window.SpellBook.reorderable(list, {
    items: '.tools-tab:not([hidden])',
    id: (tab) => tab.getAttribute('aria-controls').replace(/^tool-/, ''),
    vertical: true,
    // ids: the tools that are on. Those that are off keep their places.
    move: (ids) => {
      const next = ordered().map((t) => t.id)
      let i = 0
      next.forEach((id, at) => !off.has(id) && (next[at] = ids[i++]))
      order = next
      save()
      apply()
    },
  })

  apply()

  // For the tutorial: opens a tool that is on.
  window.SpellBookTools.show = (id) => {
    if (!off.has(id)) open(id)
  }

  window.SpellBook.settingGroup({
    id: 'toolsShown',
    title: 'Tools tab',
    sub: 'which tools are shown, and their order',
    order: 92,
    keys: [KEY],
  })
  // Clear Settings: every tool on, in the first order.
  document.addEventListener('spellbook:settings-reset', () => {
    off.clear()
    order = []
    save()
    apply()
  })
})()
