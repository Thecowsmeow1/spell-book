/*
 * The Games tab: the list of games (games-list.js) and the player.
 *
 * A game runs in a sandboxed frame (scripts only), so it can't read or change
 * Spell Book's data, open windows or leave the page; it also can't use the
 * browser's storage. The game stays as it is while you visit other tabs;
 * ← Games closes it. #/games/<folder> opens a game straight away.
 *
 * Saving: a game keeps its scores (any JSON, up to 200 KB) in the data file,
 * under spellbook_games_v1, by talking to Spell Book with postMessage:
 *
 *   // When the game has loaded, Spell Book sends what it saved last time
 *   // (null the first time) and the app's colors:
 *   addEventListener('message', (e) => {
 *     if (e.data && e.data.spellbook === 'hello') {
 *       e.data.data     // what the game saved, or null
 *       e.data.theme    // { mode, bg, surface, surface2, border, text, muted, accent, font }
 *     }
 *   })
 *   // Save (replaces what was saved before):
 *   parent.postMessage({ spellbook: 'save', data: { wins: 3 } }, '*')
 *   // Ask again (answered with another 'hello'):
 *   parent.postMessage({ spellbook: 'load' }, '*')
 *
 * A game opened on its own, outside Spell Book, just doesn't hear back.
 */
;(() => {
  const SpellBook = window.SpellBook
  const SAVE_KEY = 'spellbook_games_v1'
  const MAX_SAVE = 200 * 1024
  const FOLDER = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

  const games = (Array.isArray(window.SPELLBOOK_GAMES) ? window.SPELLBOOK_GAMES : [])
    .filter((game) => game && typeof game.folder === 'string' && FOLDER.test(game.folder) && !game.folder.includes('..'))
    .map((game) => ({
      folder: game.folder,
      title: String(game.title || game.folder.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())),
      description: String(game.description || ''),
    }))
  const find = (folder) => games.find((game) => game.folder === folder) || null

  const library = document.getElementById('games-library')
  const grid = document.getElementById('games-grid')
  const player = document.getElementById('games-player')
  const wrap = document.getElementById('games-frame-wrap')
  const titleEl = document.getElementById('games-player-title')
  let current = null // the game being played
  let frame = null

  // ─── Saved scores ───────────────────────────────────────────────────
  function readSaves() {
    try {
      const saves = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')
      return saves && typeof saves === 'object' && !Array.isArray(saves) ? saves : {}
    } catch {
      return {}
    }
  }
  function writeSave(folder, data) {
    let text
    try {
      text = JSON.stringify(data === undefined ? null : data)
    } catch {
      return 'The game sent something that can’t be saved as JSON.'
    }
    if (text.length > MAX_SAVE) return `The game’s save is larger than ${MAX_SAVE / 1024} KB.`
    const saves = readSaves()
    if (JSON.stringify(saves[folder] === undefined ? null : saves[folder]) === text) return ''
    saves[folder] = JSON.parse(text)
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saves))
    } catch (error) {
      return error.message || String(error)
    }
    return ''
  }

  // The app's colors, so a game can match them.
  function theme() {
    const style = getComputedStyle(document.documentElement)
    const value = (name) => style.getPropertyValue(`--${name}`).trim()
    const out = { mode: document.documentElement.dataset.mode || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') }
    ;['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent'].forEach((name) => (out[name] = value(name)))
    out.font = getComputedStyle(document.body).fontFamily
    return out
  }
  function hello() {
    if (!frame || !frame.contentWindow || !current) return
    const saved = readSaves()[current.folder]
    frame.contentWindow.postMessage({ spellbook: 'hello', game: current.folder, data: saved === undefined ? null : saved, theme: theme() }, '*')
  }

  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || !current) return
    const message = e.data
    if (!message || typeof message !== 'object') return
    if (message.spellbook === 'save') {
      const problem = writeSave(current.folder, message.data)
      if (problem) {
        console.warn(`Game "${current.folder}": ${problem}`)
        frame.contentWindow.postMessage({ spellbook: 'error', message: problem }, '*')
      }
    } else if (message.spellbook === 'load') {
      hello()
    }
  })

  // ─── The list ───────────────────────────────────────────────────────
  // An original icon: a die showing five.
  const dieIcon = () =>
    `<svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><g fill="currentColor" stroke="none"><circle cx="8.3" cy="8.3" r="1.4"/><circle cx="15.7" cy="8.3" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="8.3" cy="15.7" r="1.4"/><circle cx="15.7" cy="15.7" r="1.4"/></g></svg>`

  function renderList() {
    grid.replaceChildren()
    if (!games.length) {
      const empty = document.createElement('p')
      empty.className = 'games-empty'
      empty.textContent = 'No games yet. Put a game’s folder in modules/games/ and add it to games-list.js.'
      grid.append(empty)
      return
    }
    games.forEach((game) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'games-card'
      card.dataset.game = game.folder
      card.title = `Play ${game.title}`
      card.innerHTML = `<span class="games-card-icon">${dieIcon()}</span><span class="games-card-text"><strong></strong><span></span></span><span class="games-card-play">Play</span>`
      card.querySelector('strong').textContent = game.title
      card.querySelector('.games-card-text span').textContent = game.description
      card.addEventListener('click', () => play(game.folder))
      grid.append(card)
    })
  }

  // ─── Playing ────────────────────────────────────────────────────────
  function play(folder) {
    const game = find(folder)
    if (!game) return showList()
    if (!current || current.folder !== game.folder || !frame) {
      current = game
      frame = document.createElement('iframe')
      frame.className = 'games-frame'
      frame.title = game.title
      // Scripts only: no access to Spell Book, its storage, popups or the top page.
      frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock')
      frame.setAttribute('allow', 'fullscreen')
      frame.addEventListener('load', () => {
        hello()
        frame.focus()
      })
      frame.src = `modules/games/${encodeURIComponent(game.folder)}/index.html`
      wrap.replaceChildren(frame)
    }
    titleEl.textContent = game.title
    library.hidden = true
    player.hidden = false
    window.scheduleLocationCheck && window.scheduleLocationCheck()
  }
  function showList() {
    current = null
    frame = null
    wrap.replaceChildren()
    player.hidden = true
    library.hidden = false
    window.scheduleLocationCheck && window.scheduleLocationCheck()
  }

  document.getElementById('games-back').addEventListener('click', showList)
  document.getElementById('games-restart').addEventListener('click', () => {
    if (!current) return
    const folder = current.folder
    frame = null
    play(folder)
  })
  document.getElementById('games-fullscreen').addEventListener('click', () => {
    if (wrap.requestFullscreen) wrap.requestFullscreen().then(() => frame && frame.focus()).catch(() => {})
  })

  // #/games/<folder> opens a game.
  SpellBook.route(/^games\/([^/]+)\/?$/, {
    page: 'games',
    open: (match) => play(decodeURIComponent(match[1])),
  })
  // Back and Forward (js/core/router.js).
  SpellBook.places('games', {
    current: () => ({ game: current ? current.folder : '' }),
    exists: (place) => !place.game || Boolean(find(place.game)),
    describe: (place) => (place.game && find(place.game) ? `“${find(place.game).title}”` : 'the list of games'),
    open: (place) => (place.game ? play(place.game) : showList()),
  })
  // Tell the game when Spell Book's colors change.
  document.addEventListener('spellbook:theme', hello)

  renderList()
  SpellBook.provide('games', { list: () => games.map((game) => ({ ...game })), play, showList })
})()
