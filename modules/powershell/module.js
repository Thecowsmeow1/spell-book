/*
 * The PowerShell page: type a command and get completions for what can come
 * next (cmdlets, parameters, values), with the cmdlet's help beside them. The
 * commands come from help text you paste or upload (saved under
 * spellbook_ps_help_v1, in the data file), and from ps-data-5.js and ps-data-7.js, built from this
 * computer's PowerShell by ps-export.ps1; ps.js loads them the first time the
 * tab is shown. Nothing is run. See js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'powershell',
  title: 'PowerShell',
  tooltip: 'PowerShell cmdlets: help, parameters and autocompletion',
  routes: ['powershell'],
  css: ['ps.css'],
  scripts: ['ps-parse.js', 'ps-complete.js', 'ps.js'],
  html: `
    <div class="ps-bar">
      <span class="ps-prompt" aria-hidden="true">Find</span>
      <input type="search" id="ps-search" aria-controls="ps-options" aria-label="Find a command" placeholder="Find a command by name, alias or what it does, such as network adapter" autocomplete="off" spellcheck="false" />
      <select id="ps-version" aria-label="PowerShell version" hidden></select>
      <button type="button" class="btn" id="ps-import-toggle" aria-expanded="false" aria-controls="ps-import">Import help</button>
    </div>
    <div class="ps-bar">
      <span class="ps-prompt" aria-hidden="true">PS&gt;</span>
      <input type="text" id="ps-input" role="combobox" aria-controls="ps-options" aria-expanded="true" aria-autocomplete="list" aria-label="PowerShell command" placeholder="Build a command: start typing a cmdlet, such as Get-Child, then press Tab" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="button" class="btn secondary" id="ps-copy">Copy</button>
      <button type="button" class="btn secondary" id="ps-clear">Clear</button>
    </div>
    <p class="ps-hint" id="ps-hint" role="status"></p>
    <section class="ps-import" id="ps-import" hidden aria-label="Import help">
      <p>Paste PowerShell help or upload text files. To make them, in PowerShell:</p>
      <pre>Get-Help Get-ChildItem -Full > gci.txt

'Get-ChildItem','Copy-Item','Get-Process' |
    ForEach-Object { Get-Help $_ -Full } > several.txt</pre>
      <p>Optional extras, pasted or uploaded the same way: <code>Get-Command Get-ChildItem -Syntax</code> adds lists of allowed values, and <code>Get-Alias</code> adds aliases.</p>
      <textarea id="ps-text" aria-label="PowerShell help text" spellcheck="false" placeholder="Paste Get-Help -Full output here"></textarea>
      <div class="ps-import-row">
        <button type="button" class="btn" id="ps-add">Add pasted text</button>
        <label class="btn secondary ps-file">Upload text files…<input type="file" id="ps-files" accept=".txt,.text,text/plain" multiple /></label>
      </div>
      <p class="ps-result" id="ps-result" role="status"></p>
      <h3 id="ps-count">Imported</h3>
      <ul id="ps-imported"></ul>
    </section>
    <div class="ps-body" id="ps-body">
      <div class="ps-options" id="ps-options" role="listbox" aria-label="What can come next"></div>
      <article class="ps-help" id="ps-help"></article>
    </div>
    <p class="ps-muted" id="ps-source"></p>`,
})
