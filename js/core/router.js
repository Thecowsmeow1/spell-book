/*
 * Page switching and the Back / Forward buttons (core).
 *
 * The address picks the page: #/<route>/… goes to the module whose routes
 * include <route> (js/core/pages.js); #/ and anything unknown go to the home
 * page: the first tab in modules/modules.js.
 *
 * Modules plug in with:
 *   SpellBook.route(/^command\/(.+)$/, { page: 'spellbook', open: (match) => … })
 *     An address of its own that isn't a page route (links to one entry).
 *   SpellBook.places('notes', {
 *     current: () => ({ tomeId, nodeId }),  // what is shown, for Back / Forward
 *     exists: (place) => true,              // still there? (skipped if not)
 *     describe: (place) => '“My note”',     // for the buttons' tooltips
 *     open: (place) => …,                   // show it again
 *     leave: () => …,                       // about to show another page
 *   })
 *   A page without places is recorded as just the page.
 *
 * Globals kept for the existing scripts: currentPage (the shown module's id),
 * showPage(), scheduleLocationCheck(). A page hears `spellbook:page` events
 * ({ page, previous }) when the shown page changes.
 */
let currentPage = null

;(() => {
  const SpellBook = window.SpellBook
  const routes = []
  const placeHooks = new Map()

  const pageTitle = (id) => {
    const page = SpellBook.page(id)
    return page ? page.title : id
  }
  const homePage = () => {
    const pages = SpellBook.pages()
    return (pages[0] || { id: '' }).id
  }

  window.showPage = function showPage() {
    const route = location.hash.replace(/^#\/?/, '')
    let special = null
    for (const r of routes) {
      const match = route.match(r.pattern)
      if (match && SpellBook.page(r.page)) {
        special = { ...r, match }
        break
      }
    }
    const module = special ? SpellBook.page(special.page) : SpellBook.pageFor(route)
    const previous = currentPage
    currentPage = module ? module.id : homePage()
    SpellBook.pages().forEach(({ id }) => {
      const page = document.getElementById(`page-${id}`)
      if (page) page.hidden = id !== currentPage
    })
    document.querySelectorAll('.nav-link').forEach((link) => {
      const active = link.dataset.page === currentPage
      link.classList.toggle('active', active)
      if (active) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    })
    document.title = `${pageTitle(currentPage)} – Spell Book`
    // Modules hear which page is shown (and which one was left).
    document.dispatchEvent(new CustomEvent('spellbook:page', { detail: { page: currentPage, previous } }))
    if (special && special.open) {
      try {
        special.open(special.match)
      } catch (error) {
        console.error(error)
      }
    }
    scheduleLocationCheck()
  }

  // ─── Back and Forward ───────────────────────────────────────────────
  // The app's own history of what you looked at (an entry, a note, a page).
  // Choosing an entry or a note doesn't change the address, so the browser's
  // Back can't do this. Kept for the visit only.
  let backStack = []
  let forwardStack = []
  let shownLocation = null
  let locationCheck = null
  let restoringLocation = false
  const BACK_LIMIT = 50

  function currentLocation() {
    if (!currentPage) return null
    const hooks = placeHooks.get(currentPage)
    if (!hooks || !hooks.current) return { page: currentPage }
    const place = hooks.current()
    return place ? { page: currentPage, ...place } : null
  }
  const sameLocation = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // Called by anything that may change what's shown. Runs once after the
  // current task, so the in-between steps of one navigation aren't recorded.
  // Going somewhere new (not by Back or Forward) clears the Forward history,
  // as in a browser.
  window.scheduleLocationCheck = function scheduleLocationCheck() {
    if (locationCheck) return
    locationCheck = setTimeout(() => {
      locationCheck = null
      const now = currentLocation()
      if (!now) return
      if (!restoringLocation && shownLocation && !sameLocation(now, shownLocation)) {
        backStack.push(shownLocation)
        if (backStack.length > BACK_LIMIT) backStack.shift()
        forwardStack = []
      }
      restoringLocation = false
      shownLocation = now
      updateHistoryButtons()
    }, 0)
  }

  function locationExists(loc) {
    if (!SpellBook.page(loc.page)) return false
    const hooks = placeHooks.get(loc.page)
    try {
      return !hooks || !hooks.exists || Boolean(hooks.exists(loc))
    } catch {
      return false
    }
  }

  function describeLocation(loc) {
    const hooks = placeHooks.get(loc.page)
    const text = hooks && hooks.describe ? hooks.describe(loc) : ''
    return text || `the ${pageTitle(loc.page)} page`
  }

  function updateHistoryButtons() {
    ;[
      [backStack, 'btn-back', 'Back'],
      [forwardStack, 'btn-forward', 'Forward'],
    ].forEach(([stack, id, label]) => {
      // Skip places that no longer exist, such as a deleted command.
      while (stack.length && !locationExists(stack[stack.length - 1])) stack.pop()
      const button = document.getElementById(id)
      if (!button) return
      const target = stack[stack.length - 1]
      button.disabled = !target
      button.title = target ? `${label} to ${describeLocation(target)}` : label
      button.setAttribute('aria-label', button.title)
    })
  }

  // Shows a page, telling the one being left first.
  function goToPage(id) {
    if (currentPage === id) return
    const leaving = placeHooks.get(currentPage)
    if (leaving && leaving.leave) leaving.leave()
    history.pushState(null, '', SpellBook.href(id))
    window.showPage()
  }

  // Shows a recorded place without recording the move itself.
  function showLocation(target) {
    restoringLocation = true
    goToPage(target.page)
    const hooks = placeHooks.get(target.page)
    if (hooks && hooks.open) hooks.open(target)
    scheduleLocationCheck()
  }

  // Moves one step through history: from one stack to the other.
  function stepHistory(from, to) {
    updateHistoryButtons()
    const target = from.pop()
    if (!target) return
    if (shownLocation) to.push(shownLocation)
    showLocation(target)
  }
  document.getElementById('btn-back').addEventListener('click', () => stepHistory(backStack, forwardStack))
  document.getElementById('btn-forward').addEventListener('click', () => stepHistory(forwardStack, backStack))

  window.addEventListener('hashchange', window.showPage)
  // Once every module's scripts have loaded, show the page again so each
  // module hears which page is open and special addresses are handled.
  document.addEventListener('spellbook:ready', window.showPage)

  Object.assign(SpellBook, {
    route(pattern, def) {
      if (pattern instanceof RegExp && def && def.page) routes.push({ pattern, ...def })
    },
    places(page, hooks) {
      if (page && hooks) placeHooks.set(page, hooks)
    },
    // Shows a page by id (leaving the current one properly).
    goTo: goToPage,
    currentPage: () => currentPage,
  })

  window.showPage()
})()
