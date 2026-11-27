/*
 * The Bash tool's card on the Tools page: the elements bash.js works with.
 * Put first in the list of tools. Loaded before bash.js and tools-layout.js.
 */
;(() => {
  const T = window.SpellBookTools
  const grid = document.getElementById('tools-grid')
  if (!T || !grid) return
  const card = T.tool(
    'Bash',
    'Import Linux manuals, then find a command and build it with completions. Nothing is run.',
  )
  card.classList.add('tool-full', 'tool-bash')
  card.insertAdjacentHTML('beforeend', `
    <div class="bash-bar">
      <span class="bash-prompt" aria-hidden="true">Find</span>
      <input type="search" id="bash-search" aria-controls="bash-options" aria-label="Find a command" placeholder="Find an imported command by name or what it does" autocomplete="off" spellcheck="false" />
      <button type="button" class="btn" id="bash-import-toggle" aria-expanded="false" aria-controls="bash-import">Import manuals</button>
    </div>
    <div class="bash-bar">
      <span class="bash-prompt" aria-hidden="true">$</span>
      <input type="text" id="bash-input" role="combobox" aria-controls="bash-options" aria-expanded="true" aria-autocomplete="list" aria-label="Bash command" placeholder="Build a command: start typing its name, then press Tab" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="button" class="btn secondary" id="bash-copy">Copy</button>
      <button type="button" class="btn secondary" id="bash-clear">Clear</button>
    </div>
    <p class="bash-hint" id="bash-hint" role="status"></p>
    <section class="bash-import" id="bash-import" hidden aria-label="Import manuals">
      <p>Paste a manual or upload text files. To make one on a Linux computer:</p>
      <pre>man ls > ls.txt
man ls grep tar > several.txt
curl --help all > curl.txt
help cd > cd.txt</pre>
      <textarea id="bash-text" aria-label="Manual or help text" spellcheck="false" placeholder="Paste man, --help or help output here"></textarea>
      <div class="bash-import-row">
        <label>Command name <input type="text" id="bash-name" placeholder="only if it isn’t found" autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="btn" id="bash-add">Add pasted text</button>
        <label class="btn secondary bash-file">Upload text files…<input type="file" id="bash-files" accept=".txt,.text,.man,text/plain" multiple /></label>
      </div>
      <p class="bash-result" id="bash-result" role="status"></p>
      <h3 id="bash-count">Imported</h3>
      <ul id="bash-imported"></ul>
    </section>
    <div class="bash-body" id="bash-body">
      <div class="bash-options" id="bash-options" role="listbox" aria-label="What can come next"></div>
      <article class="bash-help" id="bash-help"></article>
    </div>`)
  grid.prepend(card)
})()
