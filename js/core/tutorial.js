/*
 * Tutorials and first-start prompts (core).
 *
 * A tab adds a tour of itself:
 *   SpellBook.tutorial({
 *     id: 'compendium',          // names its first-start tracker (below)
 *     page: 'notes',             // the module whose page it tours
 *     title: 'The Compendium',
 *     intro: 'Your notebook: …', // shown in the first-start prompt
 *     steps: [
 *       { target: '#notes-tabs', title: 'Tomes', text: 'Each tome …' },
 *       { title: 'Done', text: '…' },  // no target: a card in the middle
 *     ],
 *   })
 * A step's target is a CSS selector or a function returning an element. A
 * step whose element isn't on the screen (a hidden pane, a tab that isn't
 * installed) is skipped. `before()` runs first, to open what the step shows.
 * Text may hold simple HTML (<b>, <kbd>, <code>).
 *
 * The tour dims the page and lights up one element at a time, with a card
 * beside it: Back, Next, End tour. Arrow keys and Enter move, Escape ends.
 *
 * First start: the first time a tab with a tour is shown, a prompt offers
 * its tutorial, to skip it, or (for someone who has used Spell Book before)
 * to link their data file. Each tab has its own tracker in the data file,
 * spellbook_first_start_<id>_v1 ('tutorial' or 'skipped'), so it asks once
 * per tab, and a linked file that already has the tracker never asks. No
 * prompt is shown while a data file is linked: its data is the person's,
 * not a first start.
 *
 * The Tutorial button in the top bar (#btn-tutorial) runs the tour of
 * whichever tab is open; on a tab without one it's greyed out.
 * Settings → Data & Backups can show the first-start prompts again.
 */
;(() => {
  const SpellBook = window.SpellBook
  const tours = new Map()
  const keyFor = (id) => `spellbook_first_start_${id}_v1`
  const seen = (id) => {
    try {
      return localStorage.getItem(keyFor(id)) !== null
    } catch {
      return true
    }
  }
  const mark = (id, value) => {
    try {
      if (value === null) localStorage.removeItem(keyFor(id))
      else if (!seen(id) || value === 'tutorial') localStorage.setItem(keyFor(id), value)
    } catch {}
  }
  const el = (tag, className, html) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (html !== undefined) node.innerHTML = html
    return node
  }
  // While a tour or the prompt is up, keys go to its card only: Tab, Enter
  // and Space work its buttons, and the page's shortcuts (A, /, Escape
  // closing a window) stay quiet. onKey gets the rest. Returns the listener,
  // added to document; remove it with removeEventListener(…, true).
  function keyTrap(card, onKey) {
    const listener = (e) => {
      if (e.key === 'Tab') {
        const buttons = [...card.querySelectorAll('button:not([hidden]):not(:disabled)')]
        const at = buttons.indexOf(document.activeElement)
        const next = buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]
        if (next) next.focus()
      } else if ((e.key === 'Enter' || e.key === ' ') && card.contains(e.target)) {
        e.stopPropagation()
        return
      } else {
        onKey(e)
      }
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('keydown', listener, true)
    return listener
  }
  // After the page has redrawn (or 60 ms, in a tab the browser isn't
  // drawing).
  const nextFrame = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
      setTimeout(resolve, 60)
    })

  // ─── The tour ───────────────────────────────────────────────────────
  let active = null

  function visible(node) {
    if (!node || !node.isConnected) return false
    const box = node.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden'
  }
  function resolve(step) {
    if (!step.target) return null
    try {
      return typeof step.target === 'function' ? step.target() : document.querySelector(step.target)
    } catch {
      return null
    }
  }

  // Runs steps one after another; resolves when the tour ends.
  // Resolves with how it ended (see end()).
  function play(steps, { title = '' } = {}) {
    end('')
    return new Promise((done) => {
      const layer = el('div', 'tour-layer')
      const spot = el('div', 'tour-spot')
      const card = el('div', 'tour-card')
      card.setAttribute('role', 'dialog')
      card.setAttribute('aria-modal', 'true')
      card.setAttribute('aria-labelledby', 'tour-card-title')
      card.innerHTML = `
        <div class="tour-count"></div>
        <h3 id="tour-card-title"></h3>
        <div class="tour-text"></div>
        <div class="tour-actions">
          <button type="button" class="btn secondary sm tour-end">End tour</button>
          <span class="tour-gap"></span>
          <button type="button" class="btn secondary sm tour-back">Back</button>
          <button type="button" class="btn sm tour-next">Next</button>
        </div>`
      layer.append(spot, card)
      document.body.append(layer)
      const state = { steps, index: -1, layer, spot, card, target: null, done, title, busy: false }
      active = state

      card.querySelector('.tour-end').addEventListener('click', () => end('ended'))
      card.querySelector('.tour-back').addEventListener('click', () => go(state.index - 1, -1))
      card.querySelector('.tour-next').addEventListener('click', () => go(state.index + 1, 1))
      layer.addEventListener('click', (e) => {
        // Clicks outside the card do nothing (the page is dimmed).
        if (!card.contains(e.target)) e.stopPropagation()
      })
      state.place = () => place(state)
      window.addEventListener('resize', state.place)
      state.onKey = keyTrap(card, (e) => {
        if (e.key === 'Escape') end('ended')
        else if (e.key === 'ArrowRight') go(state.index + 1, 1)
        else if (e.key === 'ArrowLeft') go(state.index - 1, -1)
      })
      // Leave out steps that can't show (a hidden pane, a tab that isn't
      // installed), so the count is right. Steps on another page, or that
      // open something first, are checked when they come up.
      const onPage = (step) => !step.page || step.page === SpellBook.currentPage()
      state.steps = steps.filter((step) => !step.target || step.before || !onPage(step) || visible(resolve(step)))
      go(0, 1)
    })

    async function go(index, direction) {
      const state = active
      if (!state) return
      // A key pressed while a step is still opening counts once it's shown.
      if (state.busy) {
        state.queued = (state.queued || 0) + direction
        return
      }
      state.busy = true
      try {
        let i = index
        while (i >= 0 && i < state.steps.length) {
          const step = state.steps[i]
          if (step.page && SpellBook.page(step.page) && SpellBook.currentPage() !== step.page) SpellBook.goTo(step.page)
          if (step.before) {
            try {
              step.before()
            } catch (error) {
              console.error(error)
            }
          }
          await nextFrame()
          if (active !== state) return
          const target = resolve(step)
          if (!step.target || visible(target)) {
            show(state, i, target)
            return
          }
          i += direction
        }
        // Ran off either end: Back on the first step stays put.
        if (i >= state.steps.length) end('done')
      } finally {
        state.busy = false
        const queued = state.queued || 0
        state.queued = queued - Math.sign(queued)
        if (queued && active === state) go(state.index + Math.sign(queued), Math.sign(queued))
      }
    }
  }

  function show(state, index, target) {
    const step = state.steps[index]
    state.index = index
    state.target = target
    const { card } = state
    const left = state.steps.length
    card.querySelector('.tour-count').textContent = `${state.title ? `${state.title} · ` : ''}${index + 1} of ${left}`
    card.querySelector('#tour-card-title').textContent = step.title || ''
    card.querySelector('.tour-text').innerHTML = step.text || ''
    card.querySelector('.tour-back').disabled = index === 0
    const last = index === state.steps.length - 1
    card.querySelector('.tour-next').textContent = last ? 'Done' : 'Next'
    card.querySelector('.tour-end').hidden = last
    if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    place(state)
    card.querySelector('.tour-next').focus()
  }

  // Lights up the target and puts the card beside it, on the screen.
  function place(state) {
    const { spot, card, layer, target } = state
    const pad = 6
    const gap = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    layer.classList.toggle('tour-centered', !target)
    if (!target) {
      spot.hidden = true
      card.style.left = `${Math.max(8, (vw - card.offsetWidth) / 2)}px`
      card.style.top = `${Math.max(8, (vh - card.offsetHeight) / 2.5)}px`
      return
    }
    spot.hidden = false
    const box = target.getBoundingClientRect()
    const top = Math.max(0, box.top - pad)
    const left = Math.max(0, box.left - pad)
    const bottom = Math.min(vh, box.bottom + pad)
    const right = Math.min(vw, box.right + pad)
    Object.assign(spot.style, { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px` })
    const w = card.offsetWidth
    const h = card.offsetHeight
    const clampX = (x) => Math.min(Math.max(8, x), vw - w - 8)
    const clampY = (y) => Math.min(Math.max(8, y), vh - h - 8)
    let x
    let y
    if (vh - bottom >= h + gap) {
      x = clampX(left)
      y = bottom + gap
    } else if (top >= h + gap) {
      x = clampX(left)
      y = top - gap - h
    } else if (vw - right >= w + gap) {
      x = right + gap
      y = clampY(top)
    } else if (left >= w + gap) {
      x = left - gap - w
      y = clampY(top)
    } else {
      // A big target: the card sits inside it, at the bottom.
      x = clampX(left + (right - left - w) / 2)
      y = clampY(bottom - h - gap)
    }
    card.style.left = `${x}px`
    card.style.top = `${y}px`
  }

  // how: 'done' (the last step), 'ended' (End tour, Escape) or '' (replaced).
  function end(how) {
    const state = active
    if (!state) return
    active = null
    window.removeEventListener('resize', state.place)
    document.removeEventListener('keydown', state.onKey, true)
    state.layer.remove()
    state.done(how)
  }

  // ─── Tours ──────────────────────────────────────────────────────────
  function tutorial(def) {
    if (!def || typeof def.id !== 'string' || !Array.isArray(def.steps)) return
    tours.set(def.id, def)
  }
  const tourFor = (page) => [...tours.values()].find((t) => t.page === page) || null

  // Runs a tab's tour, on its own page.
  async function start(id) {
    const tour = tours.get(id)
    if (!tour) return
    closePrompt()
    // The tab's page first, drawn, so its steps can be checked.
    if (tour.page && SpellBook.page(tour.page)) {
      SpellBook.goTo(tour.page)
      await nextFrame()
    }
    const steps = tour.steps.map((s) => ({ page: tour.page, ...s }))
    await play(steps, { title: tour.title })
    mark(id, 'tutorial')
  }

  // ─── First-start prompt ─────────────────────────────────────────────
  let prompt = null
  let promptKeys = null
  function closePrompt() {
    if (prompt) prompt.remove()
    prompt = null
    if (promptKeys) document.removeEventListener('keydown', promptKeys, true)
    promptKeys = null
  }

  async function showPrompt(tour) {
    if (prompt || active) return
    let canLink = false
    try {
      canLink = Boolean(window.DataFile && (await window.DataFile.getState()).supported)
    } catch {}
    // The tab may have changed while that was asked.
    if (prompt || active || tour.page !== SpellBook.currentPage()) return
    const layer = el('div', 'tour-layer tour-centered')
    const card = el('div', 'tour-card tour-prompt')
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    card.setAttribute('aria-labelledby', 'tour-prompt-title')
    card.innerHTML = `
      <div class="tour-count">First start</div>
      <h3 id="tour-prompt-title"></h3>
      <div class="tour-text"></div>
      <div class="tour-actions">
        <button type="button" class="btn tour-take">Take the tutorial</button>
        <button type="button" class="btn secondary tour-skip">Skip</button>
      </div>
      <div class="tour-returning">
        <span>Used Spell Book before?</span>
        <button type="button" class="btn secondary sm tour-link"></button>
      </div>`
    card.querySelector('h3').textContent = `Welcome to ${tour.title.replace(/^The /, 'the ')}`
    card.querySelector('.tour-text').innerHTML =
      `<p>${tour.intro || ''}</p>`
    const link = card.querySelector('.tour-link')
    link.textContent = canLink ? 'Link my data file' : 'Restore from a backup file'
    link.title = canLink
      ? 'Link your spellbook-data.json: your entries, notes, settings and these first-start choices come back'
      : 'This browser cannot link files; load a backup (Settings → Data & Backups)'
    layer.append(card)
    document.body.append(layer)
    prompt = layer
    card.querySelector('.tour-take').focus()
    card.querySelector('.tour-take').addEventListener('click', () => start(tour.id))
    card.querySelector('.tour-skip').addEventListener('click', () => {
      mark(tour.id, 'skipped')
      closePrompt()
    })
    link.addEventListener('click', () => {
      // The file's data replaces this browser's and the page reloads; its
      // trackers decide whether anything is asked again.
      closePrompt()
      if (canLink) document.getElementById('btn-datafile-open').click()
      else document.getElementById('btn-datafile-restore').click()
    })
    // Escape closes it for now; it asks again next time.
    promptKeys = keyTrap(card, (e) => e.key === 'Escape' && closePrompt())
  }

  // Asks on a tab's first showing, once nothing else is in the way.
  // A check asked for while one is running runs again once it's done (the
  // page may have changed in between).
  let checking = false
  let recheck = false
  async function maybePrompt() {
    if (checking) {
      recheck = true
      return
    }
    if (prompt || active) return
    const tour = tourFor(SpellBook.currentPage())
    if (!tour || seen(tour.id)) return
    checking = true
    try {
      await new Promise((r) => setTimeout(r, 400))
      if (document.querySelector('.modal-overlay.open')) return
      if (tour.page !== SpellBook.currentPage()) return
      const state = window.DataFile ? await window.DataFile.getState() : {}
      if (state.name) return
      await showPrompt(tour)
    } catch (error) {
      console.error(error)
    } finally {
      checking = false
      if (recheck) {
        recheck = false
        maybePrompt()
      }
    }
  }
  document.addEventListener('spellbook:page', maybePrompt)
  document.addEventListener('spellbook:ready', () => setTimeout(maybePrompt, 0))

  // ─── The top bar's Tutorial button ──────────────────────────────────
  // One button; it tours the open tab.
  const tutorialBtn = document.getElementById('btn-tutorial')
  function updateButton() {
    if (!tutorialBtn) return
    const tour = tourFor(SpellBook.currentPage())
    tutorialBtn.disabled = !tour
    const label = tour ? `Tutorial: a tour of ${tour.title.replace(/^The /, 'the ')}` : 'This tab has no tutorial'
    tutorialBtn.title = label
    tutorialBtn.setAttribute('aria-label', label)
  }
  if (tutorialBtn)
    tutorialBtn.addEventListener('click', () => {
      const tour = tourFor(SpellBook.currentPage())
      if (tour && !active) start(tour.id)
    })
  document.addEventListener('spellbook:ready', updateButton)
  document.addEventListener('spellbook:page', () => setTimeout(updateButton, 0))

  // Settings → Data & Backups: ask again on each tab.
  const clear = document.getElementById('btn-clear-settings')
  if (clear) {
    const again = el('button', 'btn secondary', 'Show First-Start Prompts Again')
    again.type = 'button'
    again.id = 'btn-tutorial-prompts'
    again.title = 'Each tab offers its tutorial again the next time it’s shown'
    again.addEventListener('click', () => {
      tours.forEach((t) => mark(t.id, null))
      document.getElementById('btn-settings-close').click()
      maybePrompt()
    })
    clear.before(again)
  }

  Object.assign(SpellBook, {
    tutorial,
    startTutorial: (id) => start(id),
  })
})()
