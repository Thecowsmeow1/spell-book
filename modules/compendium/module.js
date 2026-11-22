/*
 * The Compendium: tomes of notes in a tree, with a rich text editor, template
 * sections, sealed tomes and environment variables. notes.js drives the page;
 * the other scripts add to it. The page id stays "notes" (#page-notes), its
 * address #/compendium (#/notes still works). See js/core/pages.js.
 */
SpellBook.module({
  id: 'notes',
  title: 'Compendium',
  routes: ['compendium', 'notes'],
  css: ['notes.css', 'notes-blocks.css', 'notes-callouts.css', 'sealed-tomes.css', 'note-vars.css', 'note-templates.css', 'note-blocks.css', 'notes-codesave.css', 'note-files.css'],
  scripts: ['notes-codelang.js', 'notes.js', 'notes-callouts.js', 'notes-codesave.js', 'note-blocks.js', 'sealed-tomes.js', 'note-vars.js', 'note-files.js', 'note-templates.js', 'note-width.js', 'note-branch.js', 'notes-markdown.js', 'note-select.js', 'compendium-tour.js'],
  html: `<!-- Notes page: a CherryTree style node tree and rich text editor. notes.js
          owns everything here and saves to spellbook_notes_v1. -->
<section class="page notes-page" hidden="" id="page-notes">
<div class="notes-tabbar">
<div aria-label="Tomes" class="notes-tabs" id="notes-tabs" role="tablist"></div>
<button class="notes-tab notes-tab-add" id="notes-add-tome" title="Start a new tome: a separate tree of notes" type="button">+ Tome</button>
</div>
<div class="notes-body" id="notes-body">
<aside aria-label="Note tree" class="notes-tree-pane">
<!-- Search first, then the node buttons just above the tree. -->
<div class="notes-search-row">
<input aria-label="Search notes" class="notes-tree-search" id="notes-tree-search" placeholder="Search this tome…" type="search"/>
<button aria-pressed="false" class="notes-star-filter" id="notes-star-filter" title="Show only starred notes" type="button">☆</button>
<button aria-label="Show archived notes" aria-pressed="false" class="notes-star-filter notes-archive-filter" id="notes-archive-filter" title="Show archived notes too" type="button"><svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg></button>
</div>
<div class="notes-tag-box">
<div class="tag-filter-wrap">
<label for="notes-tag-filter">Tag</label>
<input autocomplete="off" id="notes-tag-filter" placeholder="Show notes with these tags…" title="Show only the notes carrying every chosen tag" type="text"/>
</div>
<div class="active-tags" hidden="" id="notes-active-tags"></div>
<div class="tag-suggestions notes-tag-suggestions" hidden="" id="notes-tag-suggestions"></div>
</div>
<div aria-label="Search scope" class="notes-scope" role="group">
<button aria-pressed="false" class="notes-scope-btn" id="notes-scope-tomes" title="Search and show every tome in the Compendium" type="button">All tomes</button>
<button aria-pressed="true" class="notes-scope-btn active" id="notes-scope-all" title="Search and show every note in this tome" type="button">This tome</button>
<button aria-pressed="false" class="notes-scope-btn" id="notes-scope-branch" title="Search and show only the selected node and its subnodes" type="button">This branch</button>
</div>
<div class="notes-scope-label" hidden="" id="notes-scope-label">
<span id="notes-scope-path"></span>
<button aria-label="Search the whole tome" class="notes-scope-clear" id="notes-scope-clear" title="Search the whole tome" type="button">×</button>
</div>
<div class="notes-tree-tools">
<button class="btn sm" id="notes-add-node" title="Add a node after the selected one" type="button">+ Node</button>
<button class="btn secondary sm" id="notes-add-child" title="Add a node inside the selected one" type="button">+ Subnode</button>
<button class="btn secondary sm" id="notes-add-template" title="Add a node made from a note preset after the selected one" type="button"><svg aria-hidden="true" class="btn-icon" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="5" r="2.5"></circle><path d="M10 7.5 9.5 12h5L14 7.5"></path><rect height="4" rx="1" width="16" x="4" y="12"></rect><path d="M5 20h14"></path></svg>From Preset</button>
<button class="btn secondary sm" id="notes-delete-node" title="Delete the selected node and everything inside it (Delete key)" type="button">Delete</button>
</div>
<ul aria-label="Notes" class="notes-tree" id="notes-tree" role="tree"></ul>
<!-- Select & Export (note-select.js): a wide button that opens its list beside the tree. -->
<div class="note-select-bar" id="notes-select-bar"></div>
<!-- The Compendium's count: every note in every tome, and how many were
     added and deleted since the last import (notes.js showNoteTotal). -->
<div class="count-row notes-count" hidden="">
<span id="note-total" title="Notes in the Compendium, in all tomes">0 notes</span>
<span aria-label="Changes since the last import" class="command-changes" title="Added and deleted since the last import">
<span class="added" id="added-note-count">+0</span>
<span class="deleted" id="deleted-note-count">-0</span>
</span>
</div>
</aside>
<div aria-label="Resize the note tree" aria-orientation="vertical" class="notes-splitter" id="notes-splitter" role="separator" tabindex="0" title="Drag to resize (double-click to reset)"></div>
<div class="notes-editor-pane" id="notes-editor-pane">
<div class="notes-empty" id="notes-empty">
<p>This tome is empty.</p>
<button class="btn" id="notes-empty-add" type="button">+ Add your first node</button>
</div>
<div class="notes-title-row">
<button class="notes-star notes-title-star" id="notes-title-star" type="button"></button>
<input aria-label="Node name" class="notes-title" id="notes-title" placeholder="Node name" type="text"/>
</div>
<div aria-label="Tags" class="entry-tags notes-tags" hidden="" id="notes-tags"></div>
<div class="notes-sealed-bar" hidden="" id="notes-sealed-bar" role="status">
<svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><path d="M2.5 7.5V5.2L4 3h16l1.5 2.2v2.3z"></path><path d="M4 7.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7.5"></path><rect height="3.5" rx="0.8" width="6" x="9" y="11"></rect></svg>
<span id="notes-sealed-text"></span>
<button class="btn secondary sm" id="notes-unseal" type="button">Unarchive</button>
</div>
<div aria-controls="notes-editor" aria-label="Text formatting" class="notes-toolbar" id="notes-toolbar" role="toolbar">
<button aria-label="Undo" class="notes-tool" data-cmd="undo" title="Undo (Ctrl+Z)" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path></svg></button>
<button aria-label="Redo" class="notes-tool" data-cmd="redo" title="Redo (Ctrl+Y)" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="m15 14 5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h3"></path></svg></button>
<span class="notes-tool-sep"></span>
<select aria-label="Paragraph style" class="notes-format" id="notes-format" title="Paragraph style">
<option value="p">Normal</option>
<option value="h1">Heading 1</option>
<option value="h2">Heading 2</option>
<option value="h3">Heading 3</option>
<option value="pre">Code block</option>
<option value="blockquote">Quote</option>
</select>
<select aria-label="Font" class="notes-format notes-font" id="notes-font" title="Font of the selected text">
<option value="">Default font</option>
<option value="'Segoe UI', system-ui, sans-serif" style="font-family: 'Segoe UI', system-ui, sans-serif">Segoe UI</option>
<option value="Arial, Helvetica, sans-serif" style="font-family: Arial, Helvetica, sans-serif">Arial</option>
<option value="Verdana, Geneva, sans-serif" style="font-family: Verdana, Geneva, sans-serif">Verdana</option>
<option value="Tahoma, Geneva, sans-serif" style="font-family: Tahoma, Geneva, sans-serif">Tahoma</option>
<option value="Georgia, 'Times New Roman', serif" style="font-family: Georgia, 'Times New Roman', serif">Georgia</option>
<option value="'Times New Roman', Times, serif" style="font-family: 'Times New Roman', Times, serif">Times New Roman</option>
<option value="Consolas, monospace" style="font-family: Consolas, monospace">Consolas</option>
<option value="'Cascadia Code', Consolas, monospace" style="font-family: 'Cascadia Code', Consolas, monospace">Cascadia Code</option>
<option value="'Courier New', Courier, monospace" style="font-family: 'Courier New', Courier, monospace">Courier New</option>
</select>
<select aria-label="Font size" class="notes-format notes-size" id="notes-size" title="Size of the selected text, in pixels">
<option value="">Size</option>
<option value="10px">10</option>
<option value="11px">11</option>
<option value="12px">12</option>
<option value="14px">14</option>
<option value="16px">16</option>
<option value="18px">18</option>
<option value="20px">20</option>
<option value="24px">24</option>
<option value="28px">28</option>
<option value="32px">32</option>
<option value="40px">40</option>
<option value="48px">48</option>
</select>
<span class="notes-tool-sep"></span>
<button aria-label="Bold" class="notes-tool" data-cmd="bold" title="Bold (Ctrl+B)" type="button"><b>B</b></button>
<button aria-label="Italic" class="notes-tool" data-cmd="italic" title="Italic (Ctrl+I)" type="button"><i>I</i></button>
<button aria-label="Underline" class="notes-tool" data-cmd="underline" title="Underline (Ctrl+U)" type="button"><u>U</u></button>
<button aria-label="Strikethrough" class="notes-tool" data-cmd="strikeThrough" title="Strikethrough" type="button"><s>S</s></button>
<button aria-label="Superscript" class="notes-tool notes-script-tool" data-cmd="superscript" title="Superscript (Ctrl+.)" type="button">x<sup>2</sup></button>
<button aria-label="Subscript" class="notes-tool notes-script-tool" data-cmd="subscript" title="Subscript (Ctrl+,)" type="button">x<sub>2</sub></button>
<button aria-label="Inline code" class="notes-tool" id="notes-inline-code" title="Inline code: a short piece of code inside a sentence" type="button"><code>&lt;/&gt;</code></button>
<button aria-label="Code block" class="notes-tool" id="notes-code-block" title="Code block: several lines of code with syntax colors" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><rect height="16" rx="2" width="18" x="3" y="4"></rect><path d="m7 9 3 3-3 3"></path><path d="M12 15h5"></path></svg></button>
<span class="notes-color-group"><button aria-label="Text color" class="notes-tool notes-color" id="notes-fore-apply" title="Text color: color the selected text" type="button"><span aria-hidden="true">A</span><span aria-hidden="true" class="notes-color-bar" id="notes-fore-bar"></span></button><label class="notes-tool notes-color-pick" title="Choose the text color"><svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewbox="0 0 24 24" width="14"><path d="m6 9 6 6 6-6"></path></svg><input aria-label="Choose the text color" id="notes-fore" type="color" value="#f87171"/></label></span>
<span class="notes-color-group"><button aria-label="Highlight" class="notes-tool notes-color" id="notes-back-apply" title="Highlight the selected text (click again on highlighted text to remove it)" type="button"><span aria-hidden="true" class="notes-color-hl" id="notes-back-bar">A</span></button><label class="notes-tool notes-color-pick" title="Choose the highlight color"><svg aria-hidden="true" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewbox="0 0 24 24" width="14"><path d="m6 9 6 6 6-6"></path></svg><input aria-label="Choose the highlight color" id="notes-back" type="color" value="#a16207"/></label></span>
<button aria-label="Clear formatting" class="notes-tool" data-cmd="removeFormat" title="Clear formatting" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M5 5h14"></path><path d="M12 5 9 19"></path><path d="m15 14 5 5"></path><path d="m20 14-5 5"></path></svg></button>
<span class="notes-tool-sep"></span>
<button aria-label="Bulleted list" class="notes-tool" data-cmd="insertUnorderedList" title="Bulleted list" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M9 6h11M9 12h11M9 18h11"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path></svg></button>
<button aria-label="Numbered list" class="notes-tool" data-cmd="insertOrderedList" title="Numbered list" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M10 6h10M10 12h10M10 18h10"></path><path d="M4 4h1v5"></path><path d="M3.5 15.5c.5-1 2.5-1 2.5.3 0 1-2.5 1.7-2.5 3.2h2.5"></path></svg></button>
<button aria-label="Decrease indent" class="notes-tool" data-cmd="outdent" title="Decrease indent" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M11 6h9M11 12h9M11 18h9"></path><path d="m7 8-4 4 4 4"></path></svg></button>
<button aria-label="Increase indent" class="notes-tool" data-cmd="indent" title="Increase indent" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M11 6h9M11 12h9M11 18h9"></path><path d="m3 8 4 4-4 4"></path></svg></button>
<span class="notes-tool-sep"></span>
<button aria-label="Align left" class="notes-tool" data-cmd="justifyLeft" title="Align left" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M4 6h16M4 12h10M4 18h13"></path></svg></button>
<button aria-label="Align center" class="notes-tool" data-cmd="justifyCenter" title="Align center" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M4 6h16M7 12h10M6 18h12"></path></svg></button>
<button aria-label="Align right" class="notes-tool" data-cmd="justifyRight" title="Align right" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M4 6h16M10 12h10M7 18h13"></path></svg></button>
<span class="notes-tool-sep"></span>
<button aria-label="Insert link" class="notes-tool" id="notes-link" title="Insert link (Ctrl+K). Ctrl+click a link in a note to open it." type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"></path><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"></path></svg></button>
<button aria-label="Insert table" class="notes-tool" id="notes-table" title="Insert table" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><rect height="16" rx="1" width="18" x="3" y="4"></rect><path d="M3 10h18M3 15h18M9 4v16M15 4v16"></path></svg></button>
<button aria-label="Insert image" class="notes-tool" id="notes-image" title="Insert image. You can also paste or drop images, alone or with copied text. Click an image to resize it." type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><rect height="16" rx="2" width="18" x="3" y="4"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-9 9"></path></svg></button>
<button aria-label="Attach file" class="notes-tool" id="notes-attach" title="Attach a file (a PDF, a scan, a log…). You can also drop or paste files that aren’t pictures. Click an attachment to open or download it." type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M15 7v9.5a3.5 3.5 0 0 1-7 0V5.5a2.5 2.5 0 0 1 5 0V16a1 1 0 0 1-2 0V8" transform="rotate(40 12 12)"></path></svg></button>
<button aria-label="Insert horizontal line" class="notes-tool" data-cmd="insertHorizontalRule" title="Insert horizontal line" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M3 12h18"></path></svg></button>
<span class="notes-tool-sep"></span>
<button aria-label="Insert variable (Alt+V)" class="btn sm btn-icon-only" id="notes-insert-var" title="Insert Variable: put a variable at the cursor (Alt+V). It shows the value set in Variables above the note." type="button"><svg aria-hidden="true" class="btn-icon" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><path d="M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3"></path><path d="M16 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3"></path><path d="m10 10 4 4M14 10l-4 4"></path></svg></button>
<!-- Insert Template (note-blocks.js) goes before Insert Variable. The Spells group is offered by the Spells tab: notes.js hides it when Spells is not installed. -->
<span class="notes-spells-group" id="notes-spells-group" role="group" aria-label="From the Spells tab">
<span class="notes-spells-label" title="These come from the Spells tab, and only show when it is installed">Spells</span>
<button class="btn sm" data-insert="command" title="Search your commands or build a new one, and put it in this note (Alt+C)" type="button">Insert Command</button>
<button class="btn sm" data-insert="script" title="Search your scripts or write a new one, and put it in this note (Alt+S)" type="button">Insert Script</button>
<button class="btn sm" data-insert="term" title="Search your terms or add a new one, and link it at the cursor (Alt+T)" type="button">Insert Term</button>
</span>
<span class="notes-tool-sep"></span>
<button aria-label="Expand note" aria-pressed="true" class="notes-tool notes-expand" id="notes-expand" type="button"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M3 12h18"></path><path d="m7 8-4 4 4 4"></path><path d="m17 8 4 4-4 4"></path></svg></button>
</div>
<div aria-controls="notes-editor" aria-label="Table" class="notes-table-tools" hidden="" id="notes-table-tools" role="toolbar">
<span class="notes-table-tools-label">Table:</span>
<button aria-pressed="false" class="btn secondary sm notes-table-toggle" data-table-action="expand" title="On: the table fills the note's width and its columns fit their text. Off: drag column borders to set their widths." type="button">Expand</button>
<span class="notes-tool-sep"></span>
<button class="btn secondary sm" data-table-action="row-above" type="button">+ Row above</button>
<button class="btn secondary sm" data-table-action="row-below" type="button">+ Row below</button>
<button class="btn secondary sm" data-table-action="col-left" type="button">+ Column left</button>
<button class="btn secondary sm" data-table-action="col-right" type="button">+ Column right</button>
<button class="btn secondary sm" data-table-action="del-row" type="button">Delete row</button>
<button class="btn secondary sm" data-table-action="del-col" type="button">Delete column</button>
<button class="btn secondary sm" data-table-action="del-table" type="button">Delete table</button>
</div>
<div aria-label="Search matches in this note" class="notes-find-bar" hidden="" id="notes-find-bar" role="toolbar">
<span aria-live="polite" id="notes-find-status"></span>
<button aria-label="Previous match" class="notes-tool" id="notes-find-prev" title="Previous match (Shift+Enter in the search box)" type="button">↑</button>
<button aria-label="Next match" class="notes-tool" id="notes-find-next" title="Next match (Enter in the search box)" type="button">↓</button>
</div>
<div aria-label="Note text" aria-multiline="true" class="notes-editor" contenteditable="true" id="notes-editor" role="textbox" spellcheck="false"></div>
<div class="notes-status">
<span class="notes-path" id="notes-path"></span>
<span id="notes-words"></span>
<span aria-live="polite" id="notes-saved"></span>
</div>
</div>
</div>
</section>`,
  modals: `<!-- Insert Command / Script / Term dialog: notes.js searches the loaded entries,
          and its New button opens the same editor the Spell Book page uses. -->
<div aria-labelledby="notes-cmd-heading" aria-modal="true" class="modal-overlay" id="notes-cmd-modal" role="dialog">
<div class="modal notes-cmd-dialog">
<h2 id="notes-cmd-heading">Insert Command</h2>
<div class="notes-cmd-search-row">
<input aria-controls="notes-cmd-results" aria-label="Search commands" id="notes-cmd-search" type="search"/>
<button class="btn" id="notes-cmd-new" type="button">+ New Command</button>
</div>
<div aria-label="Results" class="notes-cmd-results" id="notes-cmd-results" role="listbox"></div>
<div class="modal-actions">
<span class="form-hint notes-cmd-count" id="notes-cmd-count"></span>
<button class="btn secondary" id="notes-cmd-cancel" type="button">Cancel</button>
</div>
</div>
</div>
<!-- Notes confirm/input dialog: replaces window.confirm and prompt, which some
          browsers and embedded panes answer "no" to without showing anything. -->
<div aria-labelledby="notes-ask-title" aria-modal="true" class="modal-overlay" id="notes-ask" role="alertdialog">
<div class="modal notes-ask-dialog">
<h2 id="notes-ask-title"></h2>
<p class="notes-ask-message" id="notes-ask-message"></p>
<div id="notes-ask-extra"></div>
<input aria-labelledby="notes-ask-title" class="notes-ask-input" hidden="" id="notes-ask-input" type="text"/>
<p class="notes-ask-error" id="notes-ask-error"></p>
<div class="modal-actions">
<button class="btn secondary" id="notes-ask-cancel" type="button">Cancel</button>
<button class="btn" id="notes-ask-ok" type="button">OK</button>
</div>
</div>
</div>`,
})
