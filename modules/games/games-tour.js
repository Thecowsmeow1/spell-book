/*
 * The Games tutorial (js/core/tutorial.js): offered the first time the tab
 * is shown, and from the Tutorial button in the top bar.
 */
;(() => {
  const firstCard = () => document.querySelector('#games-grid .games-card')

  window.SpellBook.tutorial({
    id: 'games',
    page: 'games',
    title: 'Games',
    intro: 'Games plays HTML games inside Spell Book. Tic-Tac-Toe comes with it, and you can add your own.',
    steps: [
      {
        target: firstCard,
        title: 'Pick a game',
        text: 'Click a game to play it. It keeps going while you visit other tabs; <strong>← Games</strong> closes it.',
      },
      {
        target: () => document.querySelector('#games-library .games-head .form-hint'),
        title: 'Add your own',
        text: 'Put a game’s folder, with an <code>index.html</code>, in <code>modules/games/</code> and add a line for it to <code>modules/games/games-list.js</code>. Games can keep their scores in the data file (<code>games.js</code> shows how).',
      },
      {
        title: 'Turning tabs off',
        text: 'Don’t need a tab right now? Turn it off in Settings → Layout &amp; Theme → Tabs, and back on any time.',
      },
    ],
  })
})()
