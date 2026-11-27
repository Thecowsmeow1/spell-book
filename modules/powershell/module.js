/*
 * The PowerShell page: type a command and get completions for what can come
 * next (cmdlets, parameters, values), with the cmdlet's help beside them. The
 * commands come from ps-data-5.js and ps-data-7.js, built from this
 * computer's PowerShell by ps-export.ps1; ps.js loads them the first time the
 * tab is shown. Nothing is run; only the version filter is saved. See js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'powershell',
  title: 'PowerShell',
  tooltip: 'PowerShell cmdlets: help, parameters and autocompletion',
  routes: ['powershell'],
  css: ['ps.css'],
  scripts: ['ps-complete.js', 'ps.js'],
  html: `
    <div class="ps-bar">
      <span class="ps-prompt" aria-hidden="true">Find</span>
      <input type="search" id="ps-search" aria-controls="ps-options" aria-label="Find a command" placeholder="Find a command by name, alias or what it does, such as network adapter" autocomplete="off" spellcheck="false" />
      <select id="ps-version" aria-label="PowerShell version"></select>
    </div>
    <div class="ps-bar">
      <span class="ps-prompt" aria-hidden="true">PS&gt;</span>
      <input type="text" id="ps-input" role="combobox" aria-controls="ps-options" aria-expanded="true" aria-autocomplete="list" aria-label="PowerShell command" placeholder="Build a command: start typing a cmdlet, such as Get-Child, then press Tab" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="button" class="btn secondary" id="ps-copy">Copy</button>
      <button type="button" class="btn secondary" id="ps-clear">Clear</button>
    </div>
    <p class="ps-hint" id="ps-hint" role="status"></p>
    <div class="ps-body">
      <div class="ps-options" id="ps-options" role="listbox" aria-label="What can come next"></div>
      <article class="ps-help" id="ps-help"></article>
    </div>
    <p class="ps-muted" id="ps-source"></p>`,
})
