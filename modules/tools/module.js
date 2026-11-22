/*
 * The Tools page: the Man page importer (man-import.js), a number converter,
 * a crontab interpreter, a regex interpreter and tester, and the help harvester
 * (tools.js, ported from spell-book-hk). Nothing here is saved except the
 * commands the importer creates. See js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'tools',
  title: 'Tools',
  tooltip: 'Man page importer, number converter, crontab and regex interpreters, help harvester',
  routes: ['tools'],
  css: ['tools.css'],
  scripts: ['tools.js', 'man-import.js', 'tools-tour.js'],
  html: `<div class="tools-grid" id="tools-grid"></div>`,
})
