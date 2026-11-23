/*
 * Unsaved changes: the number beside Save in the top bar.
 *
 * It counts what changed since this browser's data last matched a saved copy
 * (a save to the linked file or the database, a downloaded backup, or a file
 * loaded in; js/core/datafile.js onSaved). Changes are counted by entry, not by
 * keystroke: a command edited five times is one change, a deleted note is
 * one, a setting changed is one.
 *
 * Every saved value (a spellbook_ key, as in the data file) is split into
 * units, each with a fingerprint; a unit added, removed or different from the
 * saved copy is one change.
 *   - A module tells how to split its values and what to call them:
 *       SpellBook.trackChanges({ key: 'spellbook_notes_v1', label: 'Notes',
 *                                units: (text) => Map(unit id -> text) })
 *   - Otherwise a list of objects with ids counts each object (commands,
 *     scripts, terms…), and any other value counts as one Setting.
 *   - Bookkeeping that follows from other changes isn't counted (the Back /
 *     Forward history, the "since last import" baselines, the Trash bins
 *     spellbook_trash_*: a deleted command or note already counts once, under
 *     Commands or Notes).
 *
 * The saved copy's fingerprints are kept in this browser only
 * (spellbook_saved_baseline_v1, out of the data file), so the count survives
 * a reload: with a linked file or the database it is reset at start when
 * they have everything; without one, it counts since the last backup.
 */
;(() => {
  const BASE_KEY = 'spellbook_saved_baseline_v1'
  const QUIET = [
    /^spellbook_nav_history_v1$/,
    /^spellbook_baseline_/,
    /^spellbook_import_baseline_v1$/,
    /^spellbook_trash_/,
    /^spellbook_saved_baseline_v1$/,
    /^spellbook_remote_/,
  ]
  const isQuiet = (key) => QUIET.some((re) => re.test(key))
  const trackers = new Map()
  const LABELS = {
    spellbook_commands_v1: 'Commands',
    spellbook_scripts_v1: 'Scripts',
    spellbook_terms_v1: 'Terms',
  }

  function hash(text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return `${(h >>> 0).toString(36)}.${text.length}`
  }

  // Map(unit id -> fingerprint) for one saved value.
  function unitsOf(key, text) {
    const out = new Map()
    if (typeof text !== 'string') return out
    const tracker = trackers.get(key)
    if (tracker) {
      try {
        tracker.units(text).forEach((value, id) => out.set(String(id), hash(typeof value === 'string' ? value : JSON.stringify(value))))
        return out
      } catch {}
    }
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed) && parsed.length) {
        const ids = parsed.map((o) => (o && typeof o === 'object' ? o.id : undefined))
        if (ids.every((id) => typeof id === 'string' || typeof id === 'number') && new Set(ids.map(String)).size === ids.length) {
          parsed.forEach((o) => out.set(String(o.id), hash(JSON.stringify(o))))
          return out
        }
      }
    } catch {}
    out.set('*', hash(text))
    return out
  }
  const labelOf = (key) => (trackers.get(key) || {}).label || LABELS[key] || 'Settings'

  function currentFingerprints() {
    const data = window.DataFile && window.DataFile.currentData ? window.DataFile.currentData() : {}
    const out = {}
    Object.entries(data).forEach(([key, text]) => {
      if (!isQuiet(key)) out[key] = Object.fromEntries(unitsOf(key, text))
    })
    return out
  }

  function readBase() {
    try {
      const base = JSON.parse(localStorage.getItem(BASE_KEY))
      return base && typeof base.keys === 'object' ? base : null
    } catch {
      return null
    }
  }
  function writeBase(keys, how) {
    const base = { savedAt: new Date().toISOString(), how, keys }
    if (window.DataFile && window.DataFile.setLocal) window.DataFile.setLocal(BASE_KEY, JSON.stringify(base))
    return base
  }

  let base = null
  let summary = { total: 0, byLabel: {} }

  function count() {
    if (!base) return summary
    const now = currentFingerprints()
    const byLabel = {}
    let total = 0
    const keys = new Set([...Object.keys(now), ...Object.keys(base.keys)])
    keys.forEach((key) => {
      if (isQuiet(key)) return
      const a = base.keys[key] || {}
      const b = now[key] || {}
      let n = 0
      new Set([...Object.keys(a), ...Object.keys(b)]).forEach((id) => {
        if (a[id] !== b[id]) n++
      })
      if (!n) return
      const label = labelOf(key)
      // Settings count once per setting, whatever changed inside it.
      byLabel[label] = (byLabel[label] || 0) + (label === 'Settings' ? 1 : n)
      total += label === 'Settings' ? 1 : n
    })
    summary = { total, byLabel, since: base.savedAt, how: base.how }
    return summary
  }

  // ─── The count on Save ──────────────────────────────────────────────
  // The Save control (js/settings.js) owns the button's label and tooltip;
  // it asks describe() for the details and hears spellbook:unsaved.
  const HOW = { file: 'saved to the data file', database: 'saved to the database', backup: 'backed up', loaded: 'loaded' }
  function describe(s = summary || count()) {
    const parts = Object.entries(s.byLabel).map(([label, n]) => `${label}: ${n}`)
    const when = s.since ? new Date(s.since).toLocaleString() : ''
    if (!s.total) return when ? `Everything is saved: last ${HOW[s.how] || 'saved'} ${when}.` : 'Everything is saved.'
    const since = when ? ` since the data was last ${HOW[s.how] || 'saved'} (${when})` : ''
    return `${s.total} unsaved change${s.total === 1 ? '' : 's'}${since}\n${parts.join('\n')}`
  }
  function render() {
    const s = count()
    const badge = document.getElementById('unsaved-count')
    if (badge) {
      badge.textContent = s.total > 999 ? '999+' : String(s.total)
      badge.hidden = !s.total
    }
    document.dispatchEvent(new CustomEvent('spellbook:unsaved', { detail: s }))
  }

  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(render, 400)
  }

  // ─── Public ─────────────────────────────────────────────────────────
  window.SpellBook = window.SpellBook || {}
  window.SpellBook.trackChanges = (def) => {
    if (!def || typeof def.key !== 'string' || typeof def.units !== 'function') return
    trackers.set(def.key, { label: def.label || 'Settings', units: def.units })
    schedule()
  }
  window.SpellBook.unsaved = {
    summary: () => count(),
    describe: () => describe(),
    howLabel: (how) => HOW[how] || 'saved',
    refresh: render,
  }

  // ─── Wiring ─────────────────────────────────────────────────────────
  function start() {
    if (!window.DataFile || !window.DataFile.currentData) return
    base = readBase()
    // A linked file (or the database) that has everything: nothing unsaved.
    // Without either, the count runs since the last backup.
    window.DataFile.getState()
      .then((state) => {
        if (!base || (state.name && !window.DataFile.hasUnsaved())) base = writeBase(currentFingerprints(), base ? base.how || 'file' : 'loaded')
      })
      .catch(() => {
        if (!base) base = writeBase(currentFingerprints(), 'loaded')
      })
      .finally(render)
    window.DataFile.onDataChange(schedule)
    window.DataFile.onSaved((how) => {
      base = writeBase(currentFingerprints(), how)
      render()
    })
  }
  // After every module's scripts, so their trackChanges() are in.
  document.addEventListener('spellbook:ready', start, { once: true })
})()
