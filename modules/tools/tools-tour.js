/*
 * The Tools tutorial (js/core/tutorial.js): offered the first time the tab
 * is shown, and from the Tutorial button in the top bar. The Man page importer step is skipped when
 * it isn't there (it needs Spells).
 */
;(() => {
  // A tool's card, by its heading.
  const card = (title) => () =>
    [...document.querySelectorAll('#tools-grid .tool')].find((c) => {
      const heading = c.querySelector('h2')
      return heading && heading.textContent.trim() === title
    }) || null

  window.SpellBook.tutorial({
    id: 'tools',
    page: 'tools',
    title: 'Tools',
    intro: 'Tools holds small helpers for everyday work. Nothing here is saved, except the commands the Man page importer makes.',
    steps: [
      {
        title: 'Tools',
        text: 'A few helpers, each in its own card. Type into one and its answer updates as you go.',
      },
      {
        target: card('Man page importer'),
        title: 'Man page importer',
        text: 'Paste a man page or <code>--help</code> output and pick a section. It becomes a new command with its fields marked, ready to save in Spells.',
      },
      {
        target: card('Number converter'),
        title: 'Number converter',
        text: 'Decimal, hexadecimal, octal and binary: type in any box and the others follow.',
      },
      {
        target: card('Crontab interpreter'),
        title: 'Crontab interpreter',
        text: 'Paste a schedule to read it in plain English and see when it runs next.',
      },
      {
        target: card('Regex interpreter'),
        title: 'Regex interpreter',
        text: 'See what a regular expression means, piece by piece, and try it on your own text.',
      },
      {
        target: card('Help harvester'),
        title: 'Help harvester',
        text: 'Makes a script that collects the help of a command and all its subcommands into one file, for the Man page importer.',
      },
    ],
  })
})()
