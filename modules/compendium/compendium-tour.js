/*
 * The Compendium tutorial (js/core/tutorial.js): offered the first time the
 * tab is shown, and from the Tutorial button in the top bar. Steps about Spells' cards are skipped
 * when Spells isn't installed (their buttons are hidden).
 */
window.SpellBook.tutorial({
  id: 'compendium',
  page: 'notes',
  title: 'The Compendium',
  intro: 'The Compendium is your notebook: notes in trees, with your commands and scripts in them.',
  steps: [
    {
      title: 'The Compendium',
      text: 'Notes with formatting, code, tables and images, kept in trees. Everything you type is saved as you go.',
    },
    {
      target: '#notes-tabs',
      title: 'Tomes',
      text: 'Each tome is its own tree of notes. Click a tab to switch, double-click to rename, right-click for more. Drag the dotted handle to reorder them.',
    },
    {
      target: '#notes-add-tome',
      title: 'New tome',
      text: '<b>+ Tome</b> starts another tree.',
    },
    {
      target: '#notes-star-filter',
      title: 'Stars',
      text: 'Star your favorite notes with the ☆ at the end of a note’s row (or right-click → <b>Star</b>). This ★ button then shows only starred notes.',
    },
    {
      target: '#notes-archive-filter',
      title: 'Archived notes',
      text: 'Archived branches (right-click → <b>Archive Branch</b>) are locked and hidden from the tree. This archive button shows them too. An archived tome is only in the <b>Archive</b> tab.',
    },
    {
      target: '#notes-select-bar',
      title: 'Select & Export',
      text: '<b>Select &amp; Export</b> opens an export list beside the tree. Click <b>＋</b> beside notes from any search, tome or Archive to add them, drag them into order, preview the export with the branch button, then <b>Export…</b> them as one Markdown file or a .zip.',
    },
    {
      target: '.notes-tab-sealed',
      title: 'Archive',
      text: 'Archived notes are read-only (right-click a tome’s tab or a note to archive it). This tab shows them as clean pages, for a better reading experience.',
    },
    {
      target: () => {
        const button = document.getElementById('notes-add-node')
        return button && button.parentElement
      },
      title: 'Adding notes',
      text: '<b>+ Node</b> adds a note after the selected one, <b>+ Subnode</b> inside it, and <b>From Preset</b> (the stamp) starts from a note preset. <b>Delete</b> sends a note to Trash.',
    },
    {
      target: '#notes-tree',
      title: 'The tree',
      text: 'Drag a note to move it, or onto a tome’s tab to move it to that tome. Right-click a note for more, such as Duplicate (<kbd>Ctrl+D</kbd>).',
    },
    {
      target: '#notes-tree-search',
      title: 'Search',
      text: 'Search this tome, this branch or all tomes. The tag box below narrows it to notes with those tags.',
    },
    {
      target: '#notes-toolbar',
      title: 'Writing',
      text: 'Headings, fonts, colors, code blocks, tables, images, links and callouts.',
    },
    {
      target: () =>
        [...document.querySelectorAll('#notes-toolbar button')].find((b) => /Insert Command/.test(b.textContent)) || null,
      title: 'Commands in notes',
      text: '<b>Insert Command</b>, <b>Script</b> and <b>Term</b> put one of your entries in the note as a live card, with its values filled in from the note.',
    },
    {
      target: '#notes-insert-block',
      title: 'Templates and variables',
      text: 'The table button (<b>Insert Template</b>, <kbd>Alt+P</kbd>) adds a ready-made table. The <b>{x}</b> button (<b>Insert Variable</b>, <kbd>Alt+V</kbd>) adds a value from the note’s Variables, such as a target’s address.',
    },
    {
      target: '.env-panel',
      title: 'Variables',
      text: 'Values for this note and the notes under it. Variables and command cards in the note use them.',
    },
    {
      target: '#notes-expand',
      title: 'Note width',
      text: 'Fit the note to the screen, or set a width by dragging the text’s right edge.',
    },
    {
      target: '#notes-branch',
      title: 'Whole branch',
      text: 'The branch button at the right end of a note’s name shows it and every note inside it on one page, each with its name, tags and Variables. Click any of them to edit it there.',
    },
  ],
})
