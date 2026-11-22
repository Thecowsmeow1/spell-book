/*
 * The ATT&CK matrix page (modules/attack), ported from spell-book-hk.
 *
 * One column per tactic, the techniques of attack-data.js in each; their
 * sub-techniques fold under them. The search narrows the cells by id, name,
 * description, platforms and your indicators and notes. A cell shows how many
 * entries of this book are tied to it: commands, scripts and terms tagged with
 * the technique id (T1003, T1003.001) or naming it in their text, and notes of
 * the Compendium doing the same. Clicking a technique opens it in the panel on
 * the right.
 *
 * Stored: only your indicators and notes, under spellbook_attack_notes_v1 as
 * { items: { T1003: { iocs, notes, tags, created, updated } }, custom: [] }
 * (spell-book-hk's format, so its backups carry over; techniques of your own
 * from there, in custom, are shown but not edited here). The MITRE text is
 * read from attack-data.js on every open, so a newer file replaces it and
 * keeps your additions. The key starts with spellbook_, so it is in the data
 * file and backups.
 *
 * Uses the Spells and Compendium services (SpellBook.service), each only
 * when that tab is there, and the core's currentPage.
 */
;(() => {
  const NOTES_KEY = 'spellbook_attack_notes_v1'
  const TECHNIQUE_ID = /\bT\d{4}(?:\.\d{3})?\b/gi
  const TAG_ID = /^T\d{4}(\.\d{3})?$/i
  const $ = (id) => document.getElementById(id)
  const same = (a, b) => String(a).toUpperCase() === String(b).toUpperCase()
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  const seed = window.SPELLBOOK_ATTACK && typeof window.SPELLBOOK_ATTACK === 'object' ? window.SPELLBOOK_ATTACK : null
  const tacticName = (short) => {
    const t = seed && (seed.tactics || []).find((x) => x.shortname === short)
    return t ? t.name : String(short || '')
  }

  // ─── Your additions ─────────────────────────────────────────────────
  function readNotes() {
    try {
      const stored = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')
      return {
        items: stored && typeof stored.items === 'object' && stored.items ? stored.items : {},
        custom: stored && Array.isArray(stored.custom) ? stored.custom : [],
      }
    } catch {
      return { items: {}, custom: [] }
    }
  }
  let notes = readNotes()
  function saveNotes() {
    try {
      if (!Object.keys(notes.items).length && !notes.custom.length) localStorage.removeItem(NOTES_KEY)
      else localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    } catch {
      alert('Could not save the ATT&CK notes: browser storage is unavailable or full.')
    }
  }
  const mineOf = (code) => notes.items[code] || notes.items[String(code).toUpperCase()] || null
  function updateMine(code, change) {
    const now = new Date().toISOString()
    const mine = { iocs: [], notes: '', tags: [], created: now, ...(mineOf(code) || {}) }
    change(mine)
    mine.updated = now
    if (!mine.iocs.length && !mine.notes && !(mine.tags || []).length) delete notes.items[code]
    else notes.items[code] = mine
    saveNotes()
  }

  // ─── Techniques ─────────────────────────────────────────────────────
  const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean)
  const technique = (raw, custom) => {
    const code = String(raw.code || raw.id || '').trim()
    return {
      code,
      name: String(raw.name || '').trim(),
      tactics: toList(raw.tactics || raw.tactic).map((t) => (custom ? t : tacticName(t))),
      sub: Boolean(raw.sub) || code.includes('.'),
      parent: raw.parent || (code.includes('.') ? code.split('.')[0] : ''),
      platforms: toList(raw.platforms),
      description: String(raw.description || ''),
      detection: String(raw.detection || ''),
      detections: Array.isArray(raw.detections) ? raw.detections : [],
      dataSources: toList(raw.dataSources),
      url: String(raw.url || ''),
      custom,
      own: custom ? raw : null,
    }
  }
  const techniques = (seed ? seed.techniques || [] : []).map((t) => technique(t, false))
  {
    const known = new Set(techniques.map((t) => t.code.toUpperCase()))
    notes.custom.forEach((raw) => {
      const t = technique(raw, true)
      if (t.code && t.name && !known.has(t.code.toUpperCase())) techniques.push(t)
    })
  }
  const byCode = new Map(techniques.map((t) => [t.code.toUpperCase(), t]))
  const subsOf = new Map()
  techniques.forEach((t) => {
    if (!t.parent) return
    const key = t.parent.toUpperCase()
    if (!subsOf.has(key)) subsOf.set(key, [])
    subsOf.get(key).push(t)
  })
  subsOf.forEach((list) => list.sort((a, b) => a.code.localeCompare(b.code)))
  const iocsOf = (t) => (t.custom ? toList(t.own.iocs) : []).concat((mineOf(t.code) || {}).iocs || [])
  const notesOf = (t) => [t.custom ? t.own.notes : '', (mineOf(t.code) || {}).notes].filter(Boolean).join('\n\n')

  // Tactic columns in matrix order, then any named only by a technique of your own.
  function tactics() {
    const list = seed ? [...(seed.tactics || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => t.name) : []
    techniques.forEach((t) => t.tactics.forEach((n) => {
      if (n && !list.some((x) => same(x, n))) list.push(n)
    }))
    return list
  }

  // ─── Entries of this book tied to a technique ──────────────────────
  // Rebuilt each time the page is drawn: the book may have changed since.
  let links = new Map()
  function scanLinks() {
    const map = new Map()
    const add = (code, link) => {
      const key = code.toUpperCase()
      if (!map.has(key)) map.set(key, [])
      const list = map.get(key)
      if (!list.some((l) => l.kind === link.kind && l.id === link.id)) list.push(link)
    }
    const scan = (link, tags, text) => {
      ;(tags || []).forEach((tag) => {
        if (TAG_ID.test(tag) || byCode.has(String(tag).toUpperCase())) add(String(tag), link)
      })
      for (const m of String(text || '').matchAll(TECHNIQUE_ID)) add(m[0], link)
    }
    const spells = window.SpellBook.service('spells')
    const listOf = (kind) => (spells ? spells.list(kind) : [])
    const book = [
      ['command', listOf('commands'), (c) => c.title, (c) => [c.title, c.description, c.notes, c.example, c.command]],
      ['script', listOf('scripts'), (s) => s.name, (s) => [s.name, s.description, s.notes, s.body]],
      ['term', listOf('terms'), (t) => t.term, (t) => [t.term, t.definition, t.notes]],
    ]
    book.forEach(([kind, list, title, text]) =>
      list.forEach((item) => scan({ kind, id: item.id, title: title(item) }, item.tags, text(item).join(' '))),
    )
    const compendium = window.SpellBook.service('compendium')
    if (compendium) {
      compendium.all().forEach((n) =>
        scan({ kind: 'note', id: n.nodeId, tomeId: n.tomeId, title: n.name }, n.tags, n.text),
      )
    }
    links = map
  }
  const linksFor = (code, withSubs = false) => {
    const own = links.get(code.toUpperCase()) || []
    if (!withSubs) return own
    const out = [...own]
    ;(subsOf.get(code.toUpperCase()) || []).forEach((s) =>
      (links.get(s.code.toUpperCase()) || []).forEach((l) => {
        if (!out.some((o) => o.kind === l.kind && o.id === l.id)) out.push(l)
      }),
    )
    return out
  }

  // Opens a linked entry where it lives; Back returns here.
  function openLink(link) {
    if (link.kind === 'note') {
      const compendium = window.SpellBook.service('compendium')
      if (compendium) compendium.open({ tomeId: link.tomeId, nodeId: link.id })
      return
    }
    const spells = window.SpellBook.service('spells')
    if (spells) spells.reveal(link.kind, link.id)
  }

  // ─── Matrix ─────────────────────────────────────────────────────────
  let selected = ''
  function render() {
    const host = $('attack-matrix')
    $('attack-version').textContent = seed
      ? `${seed.source || 'ATT&CK'} v${seed.version}${seed.modified ? ` (${String(seed.modified).slice(0, 10)})` : ''} · modules/attack/attack.py refreshes it`
      : 'No modules/attack/attack-data.js: run modules/attack/attack.py to build the matrix.'
    host.replaceChildren()
    if (!techniques.length) {
      host.append(el('div', 'attack-muted', 'No techniques. Build modules/attack/attack-data.js with modules/attack/attack.py (it downloads the MITRE STIX bundle, or reads one given with --source).'))
      return
    }
    scanLinks()
    const q = $('attack-search').value.trim().toLowerCase()
    const showSubs = $('attack-subs').checked
    const linkedOnly = $('attack-linked').checked
    const count = (t) => (links.get(t.code.toUpperCase()) || []).length
    const matches = (t) =>
      !q ||
      [t.code, t.name, t.description, t.platforms.join(' '), iocsOf(t).join(' '), notesOf(t)].join(' ').toLowerCase().includes(q)
    let shown = 0
    tactics().forEach((tactic) => {
      const all = techniques.filter((t) => !t.sub && t.tactics.some((n) => same(n, tactic)))
      const cells = all
        .map((t) => ({ t, subs: subsOf.get(t.code.toUpperCase()) || [] }))
        .filter(({ t, subs }) => (matches(t) || subs.some(matches)) && (!linkedOnly || count(t) || subs.some(count)))
        .sort((a, b) => a.t.name.localeCompare(b.t.name))
      const column = el('div', 'attack-column')
      const head = el('div', 'attack-tactic')
      head.append(el('span', '', tactic), el('span', 'attack-muted', `${cells.length}${cells.length !== all.length ? ` of ${all.length}` : ''}`))
      column.append(head)
      cells.forEach(({ t, subs }) => {
        const cell = el('div', `attack-cell${t.custom ? ' own' : ''}`)
        // The technique's count takes in its sub-techniques' entries.
        cell.append(techniqueButton(t, subs.length, linksFor(t.code, true).length, false))
        const subList = subs.filter((s) => (!q || matches(s) || matches(t)) && (!linkedOnly || count(s) || count(t)))
        if (subList.length && (showSubs || (q && !matches(t)) || subs.some((s) => same(s.code, selected)))) {
          const ul = el('ul', 'attack-subs')
          subList.forEach((s) => {
            const li = el('li')
            li.append(techniqueButton(s, 0, count(s), true))
            ul.append(li)
          })
          cell.append(ul)
        }
        column.append(cell)
        shown += 1
      })
      host.append(column)
    })
    if (!shown) host.prepend(el('div', 'attack-muted attack-empty', 'No technique matches.'))
  }

  function techniqueButton(t, subCount, linkCount, isSub) {
    const b = el('button', `attack-technique${isSub ? ' sub' : ''}${same(t.code, selected) ? ' focus' : ''}`)
    b.type = 'button'
    b.dataset.code = t.code
    const code = isSub && t.code.includes('.') ? `.${t.code.split('.')[1]}` : t.code
    b.innerHTML = `<code>${esc(code)}</code> ${esc(t.name)}${subCount ? ` <span class="attack-subcount" title="${subCount} sub-techniques">${subCount}</span>` : ''}${linkCount ? ` <span class="attack-linkcount" title="${linkCount} entr${linkCount === 1 ? 'y' : 'ies'} in this book">${linkCount}</span>` : ''}`
    b.title = t.description ? t.description.slice(0, 300) : t.name
    b.addEventListener('click', () => select(t.code))
    return b
  }

  function select(code) {
    selected = code
    document.querySelectorAll('#attack-matrix .attack-technique.focus').forEach((b) => b.classList.remove('focus'))
    const button = [...document.querySelectorAll('#attack-matrix .attack-technique')].find((b) => same(b.dataset.code, code))
    if (button) button.classList.add('focus')
    else render() // a sub-technique folded away: unfold it
    drawDetail()
    const now = [...document.querySelectorAll('#attack-matrix .attack-technique')].find((b) => same(b.dataset.code, code))
    if (now) now.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  // ─── Technique panel ────────────────────────────────────────────────
  function section(title) {
    const box = el('div', 'section')
    if (title) box.append(el('h3', '', title))
    return box
  }
  function techLink(t) {
    const b = el('button', 'link-btn', `${t.code} ${t.name}`)
    b.type = 'button'
    b.addEventListener('click', () => select(t.code))
    return b
  }

  const KIND_NAMES = { command: 'Commands', script: 'Scripts', term: 'Terms', note: 'Notes' }
  function drawDetail() {
    const host = $('attack-detail')
    const t = byCode.get(String(selected).toUpperCase())
    host.replaceChildren()
    host.hidden = !t
    if (!t) return

    const close = el('button', 'btn secondary sm attack-close', '×')
    close.type = 'button'
    close.title = 'Close (Esc)'
    close.addEventListener('click', () => {
      selected = ''
      drawDetail()
      render()
    })
    const h2 = el('h2')
    h2.append(el('code', '', t.code), ` ${t.name}`)
    if (t.custom) h2.append(' ', el('span', 'badge', 'own'))
    const head = el('div', 'attack-detail-head')
    head.append(h2, close)
    host.append(head)

    const labels = el('div', 'attack-labels')
    t.tactics.forEach((n) => labels.append(el('span', 'badge', n)))
    t.platforms.forEach((p) => labels.append(el('span', 'badge muted', p)))
    host.append(labels)

    const parent = t.parent ? byCode.get(t.parent.toUpperCase()) : null
    const subs = subsOf.get(t.code.toUpperCase()) || []
    if (parent || subs.length) {
      const family = section('')
      if (parent) family.append('Sub-technique of ', techLink(parent))
      if (subs.length) {
        family.append(el('div', 'attack-subhead', `Sub-techniques (${subs.length})`))
        const ul = el('ul', 'attack-list')
        subs.forEach((s) => {
          const li = el('li')
          li.append(techLink(s))
          ul.append(li)
        })
        family.append(ul)
      }
      host.append(family)
    }

    if (t.description) {
      const box = section('Description')
      box.append(el('div', 'attack-text', t.description))
      host.append(box)
    }

    if (t.detection || t.detections.length || t.dataSources.length) {
      const box = section('Detection')
      if (t.detection) box.append(el('div', 'attack-text', t.detection))
      t.detections.forEach((d) => {
        const details = el('details', 'attack-strategy')
        details.append(el('summary', '', `${d.id} ${d.name}`))
        ;(d.analytics || []).forEach((a) => {
          const item = el('div', 'attack-analytic')
          item.append(el('div', 'attack-subhead', `${a.id}${(a.platforms || []).length ? ` · ${a.platforms.join(', ')}` : ''}`))
          item.append(el('div', '', a.description || ''))
          if ((a.logs || []).length) item.append(el('div', 'attack-muted', `Log sources: ${a.logs.join(' · ')}`))
          details.append(item)
        })
        box.append(details)
      })
      if (t.dataSources.length) box.append(el('div', 'attack-muted', `Data sources: ${t.dataSources.join(', ')}`))
      host.append(box)
    }

    // Indicators: yours, stored; an own technique's from spell-book-hk shown too.
    const iocBox = section('Indicators, paths and commands')
    const iocHost = el('div')
    const drawIocs = () => {
      iocHost.replaceChildren()
      const fixed = t.custom ? toList(t.own.iocs) : []
      const mine = (mineOf(t.code) || {}).iocs || []
      if (!fixed.length && !mine.length) {
        iocHost.append(el('div', 'attack-muted', 'None yet. Add what this technique looks like here: paths, registry keys, command lines, event ids.'))
        return
      }
      const ul = el('ul', 'attack-list attack-ioc-list')
      const item = (text, index) => {
        const li = el('li')
        li.draggable = true
        li.title = 'Drag into a text box'
        li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', text))
        li.append(el('code', '', text))
        if (index != null) {
          const remove = el('button', 'link-btn row-remove', '×')
          remove.type = 'button'
          remove.title = 'Remove this indicator'
          remove.addEventListener('click', () => {
            updateMine(t.code, (m) => m.iocs.splice(index, 1))
            drawIocs()
          })
          li.append(' ', remove)
        }
        ul.append(li)
      }
      fixed.forEach((s) => item(s, null))
      mine.forEach((s, i) => item(s, i))
      iocHost.append(ul)
    }
    drawIocs()
    const form = el('form', 'attack-ioc-add')
    const input = el('input')
    input.type = 'text'
    input.placeholder = 'a path, registry key, command line, event id…'
    input.setAttribute('aria-label', 'New indicator')
    input.autocomplete = 'off'
    input.spellcheck = false
    const add = el('button', 'btn sm', 'Add')
    add.type = 'submit'
    form.append(input, add)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const value = input.value.trim()
      if (!value) return
      updateMine(t.code, (m) => m.iocs.push(value))
      input.value = ''
      drawIocs()
    })
    iocBox.append(iocHost, form)
    host.append(iocBox)

    // In this book
    const linkBox = section('In this book')
    const tied = linksFor(t.code, true)
    if (!tied.length) {
      linkBox.append(el('div', 'attack-muted', `Nothing tied to ${t.code} yet. Tag a command, script, term or note with ${t.code} (or write the id in its text) and it shows here.`))
    } else {
      Object.keys(KIND_NAMES).forEach((kind) => {
        const list = tied.filter((l) => l.kind === kind)
        if (!list.length) return
        linkBox.append(el('div', 'attack-subhead', `${KIND_NAMES[kind]} (${list.length})`))
        const ul = el('ul', 'attack-list')
        list.forEach((l) => {
          const li = el('li')
          const b = el('button', 'link-btn', l.title || l.id)
          b.type = 'button'
          b.addEventListener('click', () => openLink(l))
          li.append(b)
          ul.append(li)
        })
        linkBox.append(ul)
      })
    }
    host.append(linkBox)

    // Notes: yours, saved as you type.
    const noteBox = section('Notes')
    if (t.custom && t.own.notes) noteBox.append(el('div', 'attack-text', t.own.notes))
    const area = el('textarea', 'attack-notes')
    area.placeholder = 'Anything worth remembering about this technique…'
    area.setAttribute('aria-label', `Notes on ${t.code}`)
    area.value = (mineOf(t.code) || {}).notes || ''
    let timer = null
    const keep = () => {
      clearTimeout(timer)
      const value = area.value.trim()
      if (value !== ((mineOf(t.code) || {}).notes || '')) updateMine(t.code, (m) => (m.notes = value))
    }
    area.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(keep, 500)
    })
    area.addEventListener('blur', keep)
    noteBox.append(area)
    host.append(noteBox)

    if (t.url) {
      const src = el('div', 'attack-muted attack-source', 'Source: ')
      const a = el('a', '', t.url)
      a.href = t.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      src.append(a)
      host.append(src)
    }
    host.scrollTop = 0
  }

  // ─── Wiring ─────────────────────────────────────────────────────────
  {
    let timer = null
    $('attack-search').addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(render, 120)
    })
  }
  $('attack-subs').addEventListener('change', render)
  $('attack-linked').addEventListener('change', render)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || currentPage !== 'attack' || !selected) return
    if (document.querySelector('.modal-overlay.open')) return
    selected = ''
    drawDetail()
    render()
  })
  // Drawn when shown, so the counts follow what changed elsewhere; a backup
  // loaded meanwhile brings its own notes.
  document.addEventListener('spellbook:page', (e) => {
    if (e.detail.page !== 'attack') return
    notes = readNotes()
    render()
    drawDetail()
  })

  // Unsaved changes (js/core/unsaved.js): one per technique whose indicators or
  // notes changed.
  if (window.SpellBook && window.SpellBook.trackChanges) {
    window.SpellBook.trackChanges({
      key: NOTES_KEY,
      label: 'ATT&CK notes',
      units(text) {
        const data = JSON.parse(text) || {}
        const out = new Map(Object.entries(data.items || {}).map(([code, v]) => [code, JSON.stringify([v.iocs, v.notes, v.tags])]))
        ;(data.custom || []).forEach((t) => out.set(`own:${t.code || t.id}`, JSON.stringify(t)))
        return out
      },
    })
  }

  window.SpellBookAttack = { techniques: () => techniques, linksFor: (code) => (scanLinks(), linksFor(code, true)) }
})()
