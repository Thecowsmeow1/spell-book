/*
 * The PowerShell tool's card on the Tools page: the elements ps.js works with.
 * Put first in the list of tools. Loaded before ps.js and tools-layout.js.
 */
;(() => {
  const T = window.SpellBookTools
  const grid = document.getElementById('tools-grid')
  if (!T || !grid) return
  const card = T.tool(
    'PowerShell',
    'Find a cmdlet, then build it with completions and its help beside you. Nothing is run.',
  )
  card.classList.add('tool-full', 'tool-ps')
  card.insertAdjacentHTML('beforeend', `
    <div class="ps-bar">
      <span class="ps-prompt" aria-hidden="true">Find</span>
      <input type="search" id="ps-search" aria-controls="ps-options" aria-label="Find a command" placeholder="Find a command by name, alias or what it does, such as network adapter" autocomplete="off" spellcheck="false" />
      <select id="ps-version" aria-label="PowerShell version" hidden></select>
      <button type="button" class="btn" id="ps-import-toggle" aria-expanded="false" aria-controls="ps-import">Import help</button>
      <button type="button" class="btn secondary" id="ps-manage-toggle" aria-expanded="false" aria-controls="ps-manage">Manage commands</button>
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
    <section class="ps-manage" id="ps-manage" hidden aria-label="Manage commands">
      <div class="ps-manage-row">
        <select id="ps-manage-show" aria-label="Which commands"><option value="listed">Listed commands</option><option value="deleted">Deleted commands</option></select>
        <select id="ps-manage-module" aria-label="Module"></select>
        <input type="search" id="ps-manage-filter" aria-label="Filter by name" placeholder="Filter by name" autocomplete="off" spellcheck="false" />
      </div>
      <div class="ps-manage-row">
        <button type="button" class="btn secondary sm" id="ps-manage-all">Select all shown</button>
        <button type="button" class="btn secondary sm" id="ps-manage-none">Clear selection</button>
        <button type="button" class="btn sm" id="ps-manage-apply">Delete selected</button>
        <span class="ps-muted" id="ps-manage-note" role="status"></span>
      </div>
      <div class="ps-manage-list" id="ps-manage-list"></div>
      <p class="ps-muted">Tick commands one by one, Shift+click to tick a range, or pick a module and select all of it. Deleted commands can be restored here.</p>
    </section>
    <div class="ps-body" id="ps-body">
      <div class="ps-options" id="ps-options" role="listbox" aria-label="What can come next"></div>
      <article class="ps-help" id="ps-help"></article>
    </div>
    <p class="ps-muted" id="ps-source"></p>`)
  grid.prepend(card)
})()
