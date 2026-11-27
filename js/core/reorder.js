/*
 * Drag to reorder, by a small handle (core). Used for the tabs in the
 * navigation bar (their order is saved as spellbook_tab_order_v1, see
 * js/core/pages.js), for the Compendium's tome tabs and for the Tools tab's
 * list.
 *
 *   const grip = SpellBook.reorderHandle('Drag to move this tab')
 *     A handle to put in each item when it is drawn.
 *   SpellBook.reorderable(container, {
 *     items: '.nav-link',            // what can be moved
 *     id: (el) => el.dataset.page,   // each one's id
 *     move: (ids) => …,              // the new order, after a drop
 *     vertical: false,               // true for a list down the page
 *   })
 *
 * Pointer events, not HTML drag and drop, so it doesn't mix with dragging a
 * note onto a tome's tab. A short click on the handle is an ordinary click.
 * Escape cancels a drag. Keyboard: Ctrl+Shift+Left / Right (Up / Down in a
 * vertical list) moves the focused item one place.
 */
;(() => {
  const SpellBook = window.SpellBook
  const KEY_HINT = 'Ctrl+Shift+← / →'

  function reorderHandle(title, { vertical = false } = {}) {
    const grip = document.createElement('span')
    grip.className = 'reorder-handle'
    grip.setAttribute('aria-hidden', 'true')
    grip.title = `${title} (or ${vertical ? 'Ctrl+Shift+↑ / ↓' : KEY_HINT})`
    return grip
  }

  function reorderable(container, { items, id, move, vertical = false }) {
    const point = (e) => (vertical ? e.clientY : e.clientX)
    const [earlier, later] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    const all = () => [...container.querySelectorAll(items)]
    let drag = null
    let swallowClick = false

    const clearMark = () =>
      container.querySelectorAll('.reorder-before, .reorder-after').forEach((el) => el.classList.remove('reorder-before', 'reorder-after'))

    function finish(apply) {
      if (!drag) return
      const d = drag
      drag = null
      clearMark()
      d.item.classList.remove('reorder-dragging')
      document.body.classList.remove('reordering')
      document.removeEventListener('keydown', onEscape, true)
      if (!d.moved) return
      // The click that follows the drop isn't a click on the item.
      swallowClick = true
      setTimeout(() => (swallowClick = false), 0)
      if (!apply || !d.target) return
      const moving = id(d.item)
      const ids = all().map(id).filter((each) => each !== moving)
      ids.splice(ids.indexOf(id(d.target)) + (d.after ? 1 : 0), 0, moving)
      move(ids)
    }
    function onEscape(e) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    }

    container.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.reorder-handle')
      const item = grip && grip.closest(items)
      if (!item || e.button !== 0 || !container.contains(item)) return
      e.preventDefault()
      grip.setPointerCapture(e.pointerId)
      drag = { item, start: point(e), moved: false, target: null, after: false }
      document.addEventListener('keydown', onEscape, true)
    })
    container.addEventListener('pointermove', (e) => {
      if (!drag) return
      if (!drag.moved && Math.abs(point(e) - drag.start) < 4) return
      drag.moved = true
      drag.item.classList.add('reorder-dragging')
      document.body.classList.add('reordering')
      clearMark()
      // Before the first item whose middle is past the pointer, or after the
      // last one.
      const others = all().filter((el) => el !== drag.item)
      let target = others.find((el) => {
        const box = el.getBoundingClientRect()
        return point(e) < (vertical ? box.top + box.height / 2 : box.left + box.width / 2)
      })
      let after = false
      if (!target && others.length) {
        target = others[others.length - 1]
        after = true
      }
      drag.target = target || null
      drag.after = after
      if (target) target.classList.add(after ? 'reorder-after' : 'reorder-before')
    })
    container.addEventListener('pointerup', () => finish(true))
    container.addEventListener('pointercancel', () => finish(false))
    container.addEventListener(
      'click',
      (e) => {
        if (!swallowClick) return
        swallowClick = false
        e.preventDefault()
        e.stopPropagation()
      },
      true,
    )
    // Ahead of the container's own arrow keys (the tome tabs use them).
    container.addEventListener(
      'keydown',
      (e) => {
        if (!e.ctrlKey || !e.shiftKey || e.altKey || (e.key !== earlier && e.key !== later)) return
        const item = e.target.closest(items)
        if (!item) return
        e.preventDefault()
        e.stopPropagation()
        const ids = all().map(id)
        const moving = id(item)
        const from = ids.indexOf(moving)
        const to = from + (e.key === later ? 1 : -1)
        if (to < 0 || to >= ids.length) return
        ids.splice(from, 1)
        ids.splice(to, 0, moving)
        move(ids)
        const again = all().find((el) => id(el) === moving)
        if (again) again.focus()
      },
      true,
    )
  }

  Object.assign(SpellBook, { reorderHandle, reorderable })

  // The navigation bar's tabs.
  const nav = document.querySelector('.nav-links')
  if (nav) {
    nav.querySelectorAll('.nav-link').forEach((link) => {
      link.draggable = false
      link.prepend(reorderHandle('Drag to move this tab; the first one opens at #/'))
    })
    // Tabs turned off (hidden) keep their place among the others.
    reorderable(nav, {
      items: '.nav-link:not([hidden])',
      id: (link) => link.dataset.page,
      move: (ids) => {
        const all = SpellBook.tabs().map((tab) => tab.id)
        const order = ids.slice()
        all.forEach((id, i) => {
          if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id)
        })
        SpellBook.setTabOrder(order)
      },
    })
  }
})()
