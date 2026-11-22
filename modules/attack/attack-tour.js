/*
 * The ATT&CK tutorial (js/core/tutorial.js): offered the first time the tab
 * is shown, and from the Tutorial button in the top bar.
 */
window.SpellBook.tutorial({
  id: 'attack',
  page: 'attack',
  title: 'ATT&CK',
  intro: 'ATT&CK shows the MITRE ATT&CK Enterprise matrix, tied to your own commands, scripts, terms and notes.',
  steps: [
    {
      title: 'ATT&CK',
      text: 'The MITRE ATT&CK Enterprise matrix: what attackers do, by tactic. Your own entries show up on the techniques they’re tied to.',
    },
    {
      target: '#attack-search',
      title: 'Search',
      text: 'Find a technique by its id, name, description, or the indicators you added.',
    },
    {
      target: () => {
        const box = document.getElementById('attack-subs')
        return box && box.closest('label') && box.closest('label').parentElement
      },
      title: 'What to show',
      text: 'Show the sub-techniques under each technique, or only the techniques something in your book is tied to.',
    },
    {
      target: '#attack-matrix',
      title: 'The matrix',
      text: 'Tactics across the top, techniques below them. A blue number counts your entries tied to that technique. To tie one, tag it or a note with the id, such as <code>T1003</code>.',
    },
    {
      target: () => document.querySelector('#attack-matrix .attack-cell'),
      title: 'A technique',
      text: 'Click one to open it: its description, MITRE’s detection advice, your own indicators and notes, and what in your book is tied to it.',
    },
  ],
})
