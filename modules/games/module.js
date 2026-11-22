/*
 * The Games page: HTML games played inside Spell Book. Each game is a folder
 * in modules/games/ with an index.html, listed in games-list.js. games.js
 * draws the list and plays a game in a sandboxed frame; it explains how a
 * game can keep its scores in the data file. Tic-Tac-Toe comes with it.
 * See js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'games',
  title: 'Games',
  tooltip: 'HTML games, each in its own folder in modules/games',
  routes: ['games'],
  css: ['games.css'],
  scripts: ['games-list.js', 'games.js', 'games-tour.js'],
  html: `
    <div class="games-library" id="games-library">
      <div class="games-head">
        <h2>Games</h2>
        <p class="form-hint">Each game is a folder in <code>modules/games/</code> with an <code>index.html</code>, listed in <code>modules/games/games-list.js</code>.</p>
      </div>
      <div class="games-grid" id="games-grid"></div>
    </div>
    <div class="games-player" id="games-player" hidden>
      <div class="games-player-bar">
        <button class="btn sm secondary" id="games-back" type="button" title="Back to the list of games">← Games</button>
        <h2 class="games-player-title" id="games-player-title"></h2>
        <button class="btn sm secondary" id="games-restart" type="button" title="Start the game again (its saved scores are kept)">Restart</button>
        <button class="btn sm secondary" id="games-fullscreen" type="button" title="Play in full screen (Esc leaves)">Full Screen</button>
      </div>
      <div class="games-frame-wrap" id="games-frame-wrap"></div>
    </div>`,
})
