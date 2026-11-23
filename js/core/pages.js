/*
 * Page modules: every tab in the navigation bar (Spell Book, Compendium,
 * Tools, …) is a folder in modules/, listed in modules/modules.js.
 *
 * A module's folder holds a module.js that describes the page, plus its own
 * scripts and stylesheets:
 *
 *   SpellBook.module({
 *     id: 'tools',                 // the page's id: #page-tools, data-page="tools"
 *     title: 'Tools',              // the tab's label and the window title
 *     tooltip: 'Number converter, …',
 *     routes: ['tools'],           // addresses: #/tools (the first is the tab's link)
 *     css: ['tools.css'],          // paths inside the module's folder
 *     scripts: ['tools.js'],       // loaded in order, after the shared scripts
 *     html: `<div>…</div>`,        // the page's markup
 *     modals: `<div class="modal-overlay">…</div>`, // optional dialogs
 *     seeds: [{ key, json, script, global }],  // optional: what a new browser
 *       starts with (index.html): the JSON file, or the .js file that sets
 *       window[global] where JSON can't be fetched (file://)
 *   })
 *
 * `html` is wrapped in <section class="page <id>-page" id="page-<id>" hidden>
 * unless it already is the page element (an element with id="page-<id>").
 * Markup is written in module.js rather than an .html file so the app keeps
 * working when opened straight from disk (file://), where pages can't be
 * fetched.
 *
 * Startup (index.html): load the modules' module.js files, mount() their
 * markup and styles, load the shared scripts (js/core/*, js/settings.js), then
 * each module's scripts, then ready(). js/core/router.js switches pages from
 * the routes registered here; a page hears `spellbook:page` events (detail.page)
 * when the shown page changes.
 *
 * Services: what one module offers the others, so no module has to reach
 * into another's globals. A module provides it once; others look it up when
 * they need it, and cope when it isn't there (that module was removed):
 *   SpellBook.provide('spells', { list, find, badge, edit, reveal, … })
 *   const spells = SpellBook.service('spells')   // null without Spells
 *
 * Contributions: parts of shared windows that a module adds. Register them
 * while the module's scripts load (before spellbook:ready):
 *   SpellBook.settingsSection({ id, tab, label, order, render(section) })
 *     A section in Settings, in a tab of the module's own (sections with the
 *     same `tab` share one; `label` names it). render() fills the section
 *     at once, so the module can wire its controls next (js/settings.js).
 *   SpellBook.transferPart({ id, title, unit, list, export, accept, describe, apply, csv, readFile })
 *     A part of Import / Export (js/transfer.js explains each function).
 *   SpellBook.exportFormat({ id, label, parts, write(parts) })
 *     Another format for Import / Export's Format list, for the parts it
 *     names (the Compendium's Markdown .zip; js/transfer.js explains it).
 *   SpellBook.settingGroup({ id, title, sub, keys, order })
 *     Saved settings (browser-storage keys) that Import / Export can copy as
 *     one group. Keep the id once used: export files name groups by it.
 *   SpellBook.saveTarget({ id, label, order, state, save, allow, open })
 *     Another place the Save button saves to, beside the data file. (None
 *     use it now; the Compendium's live Markdown folder did until entry 60.) state() returns { linked, name,
 *     needsPermission, dirty, writing, lastWritten, error, status };
 *     save() writes now; allow() asks the browser for permission again;
 *     open() shows its own settings. Autosave covers it: write on its own
 *     only while DataFile.autosaveOn(), else wait for save(). Send
 *     `spellbook:save-target` on document when its state changes
 *     (js/settings.js draws the Save button).
 *   SpellBook.tagSource({ id, tags })
 *     Tags in use on this tab, suggested by the tag editor (js/core/tags.js).
 *   Also, in their own files: SpellBook.trash.section (js/core/trash.js),
 *   SpellBook.trackChanges (js/core/unsaved.js), SpellBook.places and
 *   SpellBook.route (js/core/router.js).
 */
;(() => {
  const modules = []
  const services = new Map()
  const slots = new Map()
  const contribute = (slot, def) => {
    if (!def || typeof def.id !== 'string') return
    const list = slots.get(slot) || []
    slots.set(slot, [...list.filter((d) => d.id !== def.id), def])
  }
  let loadingFolder = null

  // The tabs' order: modules/modules.js, unless the person has dragged them
  // (js/core/reorder.js), saved as a list of ids. Tabs not in that list (a
  // module added later) come after, in modules.js order. Scripts still load
  // in modules.js order.
  const TAB_ORDER_KEY = 'spellbook_tab_order_v1'
  function savedOrder() {
    try {
      const list = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || 'null')
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }
  function ordered(list = active()) {
    const order = savedOrder()
    const rank = (m) => {
      const i = order.indexOf(m.id)
      return i < 0 ? order.length + modules.indexOf(m) : i
    }
    return list.slice().sort((a, b) => rank(a) - rank(b))
  }

  // Tabs turned off in Settings → Layout & Theme, saved as a list of ids. A
  // tab that is off at start isn't loaded at all (its markup, styles and
  // scripts are left out, and the other tabs cope as if it were removed);
  // one turned off while Spell Book is open is hidden at once and left out
  // from the next start. Its data stays in the data file. At least one tab
  // stays on.
  const OFF_KEY = 'spellbook_tabs_off_v1'
  function savedOff() {
    try {
      const list = JSON.parse(localStorage.getItem(OFF_KEY) || 'null')
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }
  let loaded = null // the modules loaded this time, set by mount()
  const isOff = (m) => savedOff().includes(m.id)
  // Loaded and not turned off. Before mount(), every module that isn't off.
  function active() {
    const list = modules.filter((m) => !isOff(m))
    const shown = loaded ? list.filter((m) => loaded.includes(m)) : list
    // Everything off (an edited data file): the first one listed stays on.
    if (shown.length || !modules.length) return shown
    return loaded ? loaded.slice(0, 1) : modules.slice(0, 1)
  }
  // Hides the tabs and pages that were turned off after they loaded.
  function applyOff() {
    const nav = document.querySelector('.nav-links')
    const on = active()
    ;(loaded || []).forEach((m) => {
      const off = !on.includes(m)
      const link = nav && nav.querySelector(`.nav-link[data-page="${CSS.escape(m.id)}"]`)
      if (link) link.hidden = off
      const page = document.getElementById(`page-${m.id}`)
      if (page && off) page.hidden = true
    })
    if (nav) nav.classList.toggle('single-tab', on.length === 1)
  }
  // Puts the navigation bar's links in the current order.
  function arrangeNav() {
    const nav = document.querySelector('.nav-links')
    if (!nav) return
    ordered(modules).forEach((m) => {
      const link = nav.querySelector(`.nav-link[data-page="${CSS.escape(m.id)}"]`)
      if (link) nav.append(link)
    })
    applyOff()
    document.dispatchEvent(new CustomEvent('spellbook:tabs'))
  }

  const SpellBook = {
    // Called by a module's module.js.
    module(def) {
      if (!def || typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
        console.error('Spell Book module without a valid id', def)
        return
      }
      if (modules.some((m) => m.id === def.id)) {
        console.error(`Spell Book module "${def.id}" is listed twice`)
        return
      }
      modules.push({
        title: def.id,
        routes: [def.id],
        css: [],
        scripts: [],
        html: '',
        modals: '',
        ...def,
        folder: loadingFolder,
      })
    },

    // Loads modules/<folder>/module.js, which registers the module.
    async load(folder, loadScript) {
      loadingFolder = folder
      try {
        await loadScript(`modules/${folder}/module.js`)
      } finally {
        loadingFolder = null
      }
    },

    // In tab order: the first is the home page (#/). Tabs that are off
    // aren't included.
    pages: () => ordered(),
    // Every module listed, on or off, in tab order: { id, title, tooltip,
    // on, loaded } for Settings.
    tabs: () =>
      ordered(modules).map((m) => ({
        id: m.id,
        title: m.title,
        tooltip: m.tooltip || '',
        on: !isOff(m) || active().includes(m),
        loaded: !loaded || loaded.includes(m),
      })),
    // Turns a tab on or off (see OFF_KEY). Returns false when it would turn
    // the last tab off. A tab turned on that isn't loaded shows after a reload.
    setTabOn(id, on) {
      const m = modules.find((each) => each.id === id)
      if (!m) return false
      const off = savedOff().filter((each) => each !== id && modules.some((other) => other.id === each))
      if (!on) {
        if (!modules.some((other) => other !== m && !off.includes(other.id) && (!loaded || loaded.includes(other)))) return false
        off.push(id)
      }
      try {
        if (off.length) localStorage.setItem(OFF_KEY, JSON.stringify(off))
        else localStorage.removeItem(OFF_KEY)
      } catch {}
      arrangeNav()
      // Showing a tab that just went: go to the first one left.
      if (!on && typeof currentPage !== 'undefined' && currentPage === id) {
        if (location.hash.replace(/^#\/?/, '')) location.hash = '#/'
        else if (window.showPage) window.showPage()
      }
      return true
    },
    // Every tab back on (Clear Settings).
    allTabsOn() {
      try {
        localStorage.removeItem(OFF_KEY)
      } catch {}
      arrangeNav()
    },
    // A new tab order (a list of module ids), saved for this browser and the
    // data file. Without ids, back to modules/modules.js.
    setTabOrder(ids) {
      try {
        if (Array.isArray(ids) && ids.length) localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(ids))
        else localStorage.removeItem(TAB_ORDER_KEY)
      } catch {}
      arrangeNav()
    },
    page: (id) => active().find((m) => m.id === id) || null,
    // The module whose routes include the first part of an address
    // ('' is the home page).
    pageFor(route) {
      const first = String(route || '').split('/')[0]
      return active().find((m) => m.routes.includes(first)) || null
    },
    // Every module's seeds, on or off, so one turned on later has its examples.
    allSeeds: () => modules.flatMap((m) => m.seeds || []),
    href: (id) => {
      const m = SpellBook.page(id)
      return m ? `#/${m.routes[0] || ''}` : '#/'
    },
    path: (m, file) => `modules/${m.folder}/${file}`,

    // Puts every module's tab, page, dialogs and stylesheets in the document.
    mount() {
      const nav = document.querySelector('.nav-links')
      const pagesEnd = document.getElementById('pages-end')
      const modalsEnd = document.getElementById('modals-end')
      loaded = active()
      ordered().forEach((m) => {
        m.css.forEach((file) => {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = SpellBook.path(m, file)
          document.head.append(link)
        })
        if (nav) {
          const a = document.createElement('a')
          a.className = 'nav-link'
          a.dataset.page = m.id
          a.href = SpellBook.href(m.id)
          a.textContent = m.title
          if (m.tooltip) a.title = m.tooltip
          nav.append(a)
        }
        const holder = document.createElement('template')
        holder.innerHTML = m.html.trim()
        const first = holder.content.firstElementChild
        const isPage = holder.content.querySelector(`#page-${CSS.escape(m.id)}`)
        let page
        if (isPage) {
          page = holder.content
        } else {
          page = document.createElement('section')
          page.className = `page ${m.id}-page`
          page.id = `page-${m.id}`
          page.hidden = true
          page.append(holder.content)
        }
        pagesEnd.before(page)
        if (first === null && !m.html.trim()) console.warn(`Module "${m.id}" has no markup`)
        if (m.modals) {
          const dialogs = document.createElement('template')
          dialogs.innerHTML = m.modals.trim()
          modalsEnd.before(dialogs.content)
        }
      })
    },

    // Loads each module's scripts in turn. A module that fails to load is
    // reported and skipped; the other pages still work.
    async loadScripts(loadScript) {
      for (const m of modules.filter((each) => (loaded || active()).includes(each))) {
        for (const file of m.scripts) {
          try {
            await loadScript(SpellBook.path(m, file))
          } catch (error) {
            console.error(`Module "${m.id}": ${error.message}`)
          }
        }
      }
    },

    provide(name, api) {
      if (typeof name !== 'string' || !api) return
      if (services.has(name)) console.warn(`Spell Book service "${name}" was provided twice`)
      services.set(name, api)
    },
    service: (name) => services.get(name) || null,
    services: () => [...services.keys()],

    settingsSection: (def) => contribute('settings', def),
    transferPart: (def) => contribute('transfer', def),
    tagSource: (def) => contribute('tags', def),
    settingGroup: (def) => contribute('settingGroups', def),
    saveTarget: (def) => contribute('saveTargets', def),
    exportFormat: (def) => contribute('exportFormats', def),
    // Every contribution to one slot, in `order` (then as registered).
    contributions: (slot) =>
      (slots.get(slot) || []).map((d, i) => [d, i]).sort((a, b) => (a[0].order ?? 100) - (b[0].order ?? 100) || a[1] - b[1]).map(([d]) => d),

    ready() {
      document.dispatchEvent(new CustomEvent('spellbook:ready'))
    },
  }

  window.SpellBook = SpellBook
})()
