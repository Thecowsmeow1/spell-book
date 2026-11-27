/*
 * The Tools tutorial (js/core/tutorial.js): offered the first time the tab
 * is shown, and from the Tutorial button in the top bar. The Man page importer step is skipped when
 * it isn't there (it needs Spells).
 */
;(() => {
  // A step's tool: opened first, then lit up. A tool that is turned off stays
  // hidden, so its step is skipped.
  const tool = (id) => ({
    before: () => window.SpellBookTools.show && window.SpellBookTools.show(id),
    target: `#tool-${id}`,
  })

  window.SpellBook.tutorial({
    id: 'tools',
    page: 'tools',
    title: 'Tools',
    intro: 'Tools holds small helpers for everyday work. Nothing here is saved, except the commands the Man page importer makes.',
    steps: [
      {
        title: 'Tools',
        text: 'A few helpers: pick one in the list on the left. Type into it and its answer updates as you go. <b>Choose tools</b> hides the ones you don’t use.',
      },
      {
        ...tool('powershell'),
        title: 'PowerShell',
        text: '<b>Find</b> a cmdlet, then build it in the <b>PS&gt;</b> box: Tab steps through what can come next. <b>Import help</b> adds commands.',
      },
      {
        ...tool('bash'),
        title: 'Bash',
        text: 'The same for Linux commands, from the manuals you add with <b>Import manuals</b>.',
      },
      {
        ...tool('man-page-importer'),
        title: 'Man page importer',
        text: 'Paste a man page or <code>--help</code> output and pick a section. It becomes a new command with its fields marked, ready to save in Spells.',
      },
      {
        ...tool('number-converter'),
        title: 'Number converter',
        text: 'Decimal, hexadecimal, octal and binary: type in any box and the others follow.',
      },
      {
        ...tool('crontab-interpreter'),
        title: 'Crontab interpreter',
        text: 'Paste a schedule to read it in plain English and see when it runs next.',
      },
      {
        ...tool('regex-interpreter'),
        title: 'Regex interpreter',
        text: 'See what a regular expression means, piece by piece, and try it on your own text.',
      },
      {
        ...tool('help-harvester'),
        title: 'Help harvester',
        text: 'Makes a script that collects the help of a command and all its subcommands into one file, for the Man page importer.',
      },
    ],
  })
})()
