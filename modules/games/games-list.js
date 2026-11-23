/*
 * The games on the Games tab, in order. Each one is a folder in
 * modules/games/ that holds an index.html (and anything else the game needs,
 * linked by relative paths).
 *
 * To add a game: put its folder here, next to tic-tac-toe, and add a line:
 *   { folder: 'my-game', title: 'My Game', description: 'One line about it.' }
 * Only `folder` is needed; the title defaults to the folder's name.
 *
 * Browsers can't list a folder's files, so a game shows only once it is in
 * this list. games.js explains how a game can save its scores.
 */
window.SPELLBOOK_GAMES = [
  {
    folder: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    description: 'Three in a row against the computer, at three levels.',
  },
]
