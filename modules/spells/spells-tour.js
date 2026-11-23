/*
 * The Spells tutorial (js/core/tutorial.js): offered the first time the tab
 * is shown, and from the Tutorial button in the top bar.
 */
window.SpellBook.tutorial({
  id: 'spells',
  page: 'spellbook',
  title: 'Spells',
  intro: 'Spells holds your commands, scripts and terms: find one fast, fill in its values and copy it.',
  steps: [
    {
      title: 'Spells',
      text: 'Three kinds of entry live here: <b>commands</b> (templates you fill in and copy), <b>scripts</b> and <b>terms</b> (a glossary). Each can have tags and notes.',
    },
    {
      target: '#commands-panel',
      title: 'Commands',
      text: 'Filters by platform or tool. Click one to show only those commands. <b>Edit</b> renames, hides or reorders the filters, and <b>+ New Command</b> adds a command.',
    },
    {
      target: '#scripts-panel',
      title: 'Scripts',
      text: 'Scripts, filtered by language. <b>+ New Script</b> adds one.',
    },
    {
      target: '#terms-panel',
      title: 'Terms',
      text: 'Your glossary, sorted into categories. <b>+ New Term</b> adds one.',
    },
    {
      target: '#search',
      title: 'Search',
      text: 'Searches titles, commands, descriptions and notes. Press <kbd>/</kbd> anywhere to jump here.',
    },
    {
      target: '#tag-filter',
      title: 'Tags',
      text: 'Type tags to show only the entries that carry them.',
    },
    {
      target: '#cmd-list',
      title: 'The list',
      text: 'Everything that matches. Click an entry to open it; <kbd>↑</kbd> and <kbd>↓</kbd> move through the list. <b>Columns</b> chooses what the table shows.',
    },
    {
      target: '#detail',
      title: 'Details',
      text: 'The chosen entry. A command template has fields such as <code>&lt;host&gt;</code>: type their values and copy the finished command. <b>Edit</b> and <b>Delete</b> sit at the top and the bottom.',
      // Show a real entry rather than an empty pane.
      before() {
        if (!document.querySelector('#detail .empty-state')) return
        const row = document.querySelector('#cmd-list tr[data-id]')
        if (row) row.click()
      },
    },
    {
      target: '#sidebar-count',
      title: 'Counts',
      text: 'How many entries you have, and how many were added (+) or deleted (−) since your last import.',
    },
    {
      target: () => {
        const button = document.getElementById('btn-scratch')
        return button && button.parentElement
      },
      title: 'Layout and the scratch pad',
      text: 'These buttons show the <b>scratch pad</b> (a notepad for building commands), swap the table and details around, or dock the table in the control bar. Settings → <b>Spells</b> has more layout choices and the category colors.',
    },
    {
      title: 'Shortcuts',
      text: '<kbd>A</kbd> adds a command, script or term. <kbd>/</kbd> searches. <kbd>Esc</kbd> closes any window. Deleted entries go to <b>Trash</b>, where you can restore them.',
    },
  ],
})
