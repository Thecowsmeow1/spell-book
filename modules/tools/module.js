/*
 * The Tools page: one tool at a time, picked from a list (tools-layout.js), and
 * each of which can be turned off. The tools:
 *   powershell/  PowerShell help and completion, from imported help or the
 *                lists ps-export.ps1 builds
 *   bash/        Linux commands, from imported manuals
 *   man-import.js  the Man page importer
 *   tools.js     a number converter, crontab and regex interpreters and the
 *                help harvester (ported from spell-book-hk)
 * See js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'tools',
  title: 'Tools',
  tooltip: 'PowerShell, Bash, man page importer, number converter, crontab and regex interpreters, help harvester',
  routes: ['tools'],
  css: ['tools.css', 'powershell/ps.css', 'bash/bash.css'],
  scripts: [
    'tools.js',
    'tools-help.js',
    'man-import.js',
    // Each card goes to the top of the list, so Bash's is made first.
    'bash/bash-card.js',
    'powershell/ps-card.js',
    'powershell/ps-parse.js',
    'powershell/ps-complete.js',
    'powershell/ps.js',
    'bash/bash-parse.js',
    'bash/bash-complete.js',
    'bash/bash.js',
    'tools-layout.js',
    'tools-tour.js',
  ],
  html: `<div class="tools-grid" id="tools-grid"></div>`,
})
