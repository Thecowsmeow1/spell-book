/*
 * Spells: commands, scripts and terms, with the control bar, the table, the
 * detail pane and the scratch pad. Its behaviour is in spells.js, its part of
 * Settings in spells-settings.js. Other tabs use it through the "spells"
 * service and cope without it, so it can be taken out of modules/modules.js
 * like any tab. See js/core/pages.js.
 *
 * The page id stays "spellbook" (#page-spellbook, data-page="spellbook"), as
 * the Compendium's stays "notes", so styles and saved places keep working.
 */
SpellBook.module({
  id: 'spellbook',
  title: 'Spells',
  tooltip: 'Commands, scripts and terms',
  routes: ['spells'],
  css: ['entry-tables.css'],
  scripts: ['spells.js', 'spells-settings.js', 'spells-transfer.js', 'entry-tables.js', 'spells-tour.js'],
  // A new browser starts with the bundled examples (index.html).
  seeds: ['commands', 'scripts', 'terms'].map((name) => ({
    key: `spellbook_${name}_v1`,
    json: `data/${name}.json`,
    script: `data/${name}.js`,
    global: `SPELLBOOK_${name.toUpperCase()}`,
  })),
  html: `<!-- Primary Spell Book page: filters and CRUD controls are in the header;
          the table, selected-item detail, and scratch pad are in .main. -->
<div class="page spellbook-page" data-controls="top" id="page-spellbook">
<div aria-label="Resize the control bar" aria-orientation="vertical" class="controls-resizer" id="controls-resizer" role="separator" tabindex="0" title="Drag to resize (double-click to reset)"></div>
<header>
<div class="control-sections" id="control-sections">
<div class="header-left">
<div class="sidebar-count" id="sidebar-count">
<div class="count-row">
<span id="command-total">0 commands</span>
<span aria-label="Changes since last import" class="command-changes">
<span class="added" id="added-command-count">+0</span>
<span class="deleted" id="deleted-command-count">-0</span>
</span>
</div>
<div class="count-row">
<span id="script-total">0 scripts</span>
<span aria-label="Changes since the last import" class="command-changes">
<span class="added" id="added-script-count">+0</span>
<span class="deleted" id="deleted-script-count">-0</span>
</span>
</div>
<div class="count-row">
<span id="term-total">0 terms</span>
<span aria-label="Changes since the last import" class="command-changes">
<span class="added" id="added-term-count">+0</span>
<span class="deleted" id="deleted-term-count">-0</span>
</span>
</div>
</div>
<div aria-label="Legacy layout controls" class="layout-switch" hidden="">
<span aria-label="Control bar position" class="layout-seg" role="group">
<button class="btn secondary sm" data-controls-pos="left" title="Control bar on the left" type="button">
                  Left
                </button>
<button class="btn secondary sm" data-controls-pos="top" title="Control bar on top" type="button">
                  Top
                </button>
<button class="btn secondary sm" data-controls-pos="right" title="Control bar on the right" type="button">
                  Right
                </button>
</span>
<button class="btn secondary sm" id="btn-panes" title="Put the table and the details side by side" type="button">
                Side by side
              </button>
<button class="btn secondary sm" id="btn-dock" title="Put the table pane in the control bar" type="button">
                Dock table
              </button>
<button class="btn secondary sm" id="btn-scratch" title="Hide the scratch pad" type="button">
                Hide scratch pad
              </button>
</div>
</div>
<!-- Commands controls: btn-add opens the editor; filters are rendered by spells.js. Import and export are in the header (js/transfer.js). -->
<div class="controls-section" id="commands-panel">
<div class="section-head">
<span class="section-heading"><button aria-controls="commands-panel" aria-expanded="true" class="section-toggle" id="toggle-commands" title="Fold this section away" type="button">
                  ▾</button><span class="section-title" data-section="commands" id="title-commands" tabindex="0" title="Double-click to rename (or press F2)">Commands</span></span>
<span class="section-actions"><button class="btn sm" id="btn-add" title="Add a new command (A)">
                  + New Command
                </button>
<button class="btn secondary sm" id="btn-filters-edit-commands" title="Rename or remove quick filters" type="button">
                  Edit
                </button>
</span>
</div>
<div class="filters" id="filters"></div>
</div>
<!-- Scripts controls: spells.js owns the form and list. -->
<div class="controls-section scripts-section" id="scripts-panel">
<div class="section-head">
<span class="section-heading"><button aria-controls="scripts-panel" aria-expanded="true" class="section-toggle" id="toggle-scripts" title="Fold this section away" type="button">
                  ▾</button><span class="section-title" data-section="scripts" id="title-scripts" tabindex="0" title="Double-click to rename (or press F2)">Scripts</span></span>
<span class="section-actions">
<button class="btn sm" id="btn-script-new" type="button">
                  + New Script
                </button>
<button class="btn secondary sm" id="btn-filters-edit-scripts" title="Rename or remove quick filters" type="button">
                  Edit
                </button>
</span>
</div>
<div class="filters scripts-filters" id="scripts-list"></div>
</div>
<!-- Terms controls: spells.js owns the form and list. -->
<div class="controls-section terms-section" id="terms-panel">
<div class="section-head">
<span class="section-heading"><button aria-controls="terms-panel" aria-expanded="true" class="section-toggle" id="toggle-terms" title="Fold this section away" type="button">
                  ▾</button><span class="section-title" data-section="terms" id="title-terms" tabindex="0" title="Double-click to rename (or press F2)">Terms</span></span>
<span class="section-actions">
<button class="btn sm" id="btn-term-new" type="button">
                  + New Term
                </button>
<button class="btn secondary sm" id="btn-filters-edit-terms" title="Rename or remove quick filters" type="button">
                  Edit
                </button>
</span>
</div>
<div class="filters terms-filters" id="terms-list"></div>
</div>
</div>
<div aria-label="Resize the sections and the table pane" aria-orientation="horizontal" class="dock-splitter" hidden="" id="dock-splitter" role="separator" tabindex="0" title="Drag to resize (double-click to reset)"></div>
</header>
<!-- Shared search/tag/column controls; spells.js reads these ids and redraws
         the list without navigating away from the current page. -->
<div class="filter-bar">
<div class="search-wrap">
<input autocomplete="off" id="search" placeholder="Search commands, descriptions, use cases…" title="Search commands (/)" type="search"/>
</div>
<div class="tag-filter-wrap">
<label for="tag-filter">Tag</label>
<input autocomplete="off" id="tag-filter" placeholder="Filter by tags, comma separated…" type="text"/>
</div>
<div class="active-tags" hidden="" id="active-tags"></div>
<button class="btn secondary sm columns-button" hidden="" id="btn-columns" title="Show or hide table columns" type="button">
          Columns
        </button>
<div class="tag-suggestions" hidden="" id="tag-suggestions"></div>
</div>
<!-- Main work area: cmd-list is generated by spells.js; detail and scratch
         controls are populated or persisted by spells.js. -->
<div class="main">
<div class="table-wrap" id="cmd-list"></div>
<div aria-label="Resize table and output" aria-orientation="horizontal" class="splitter" id="splitter" role="separator" tabindex="0" title="Drag to resize (double-click to reset)"></div>
<div class="detail-column" id="detail-column">
<main class="detail" id="detail">
<div class="empty-state">
              Select a command from the list or use search.
            </div>
</main>
<div aria-label="Resize the scratch pad" aria-orientation="horizontal" class="scratch-splitter" id="scratch-splitter" role="separator" tabindex="0" title="Drag to resize (double-click to reset)"></div>
<section aria-label="Scratch pad" class="scratchpad" id="scratchpad">
<div class="scratchpad-head">
<span class="scratchpad-title">Scratch pad</span>
<span class="scratchpad-actions">
<button class="btn secondary sm" id="btn-scratch-copy" title="Copy the scratch pad text" type="button">
                  Copy
                </button>
<button class="btn secondary sm" id="btn-scratch-clear" title="Erase the scratch pad" type="button">
                  Clear
                </button>
</span>
</div>
<textarea id="scratchpad-text" placeholder="Jot anything here: commands in progress, notes, pasted output. It is saved as you type." spellcheck="false"></textarea>
</section>
</div>
</div>
</div>`,
  // The Add / Edit windows for commands, scripts and terms, the Import
  // Manager and the Create New chooser.
  modals: `
<!-- Script modal: btn-script-new opens it; spells.js saves/deletes/copies the
          record and persists it under spellbook_scripts_v1. -->
<div class="modal-overlay" id="script-modal">
<div class="modal resizable-modal">
<h2 id="script-modal-title">New Script</h2>
<form id="script-form">
<input id="script-id" type="hidden"/>
<div class="form-group">
<label for="script-name">Name *</label>
<input id="script-name" placeholder="e.g. Disk cleanup" required="" type="text"/>
</div>
<div class="form-group">
<label for="script-language">Language *</label>
<input id="script-language" required="" placeholder="PowerShell, Bash, Python…" type="text"/>
<datalist id="script-languages">
<option value="PowerShell"></option>
<option value="Bash"></option>
<option value="Python"></option>
<option value="Batch"></option>
<option value="SQL"></option>
</datalist>
</div>
<div class="form-group">
<label for="script-tags">Tags</label>
<div data-input-id="script-tags" id="script-tags-box"></div>
</div>
<div class="form-group">
<label for="script-body">Script *</label>
<textarea class="script-body" id="script-body" placeholder="Paste or write the script here…" required="" spellcheck="false"></textarea>
</div>
<div class="form-group">
<label for="script-notes">Notes</label>
<textarea id="script-notes" placeholder="Anything worth remembering…"></textarea>
</div>
<div class="modal-actions">
<button class="btn danger" hidden="" id="btn-script-delete" type="button">
              Delete
            </button>
<button class="btn secondary" id="btn-script-copy" type="button">
              Copy
            </button>
<button class="btn secondary" id="btn-script-cancel" type="button">
              Cancel
            </button>
<button class="btn" type="submit">Save</button>
</div>
</form>
</div>
</div>
<!-- Term modal: btn-term-new opens it; spells.js saves/deletes/copies the
          record and persists it under spellbook_terms_v1. -->
<div class="modal-overlay" id="term-modal">
<div class="modal resizable-modal">
<h2 id="term-modal-title">New Term</h2>
<form id="term-form">
<input id="term-id" type="hidden"/>
<div class="form-group">
<label for="term-name">Term *</label>
<input id="term-name" placeholder="e.g. Kerberoasting" required="" type="text"/>
</div>
<div class="form-group">
<label for="term-category">Category *</label>
<input id="term-category" required="" placeholder="e.g. Active Directory" type="text"/>
<datalist id="term-categories"></datalist>
</div>
<div class="form-group">
<label for="term-tags">Tags</label>
<div data-input-id="term-tags" id="term-tags-box"></div>
</div>
<div class="form-group">
<label for="term-definition">Definition *</label>
<textarea id="term-definition" placeholder="What this term means…" required=""></textarea>
</div>
<div class="form-group">
<label for="term-notes">Notes</label>
<textarea id="term-notes" placeholder="Anything worth remembering…"></textarea>
</div>
<div class="modal-actions">
<button class="btn danger" hidden="" id="btn-term-delete" type="button">
              Delete
            </button>
<button class="btn secondary" id="btn-term-copy" type="button">
              Copy
            </button>
<button class="btn secondary" id="btn-term-cancel" type="button">
              Cancel
            </button>
<button class="btn" type="submit">Save</button>
</div>
</form>
</div>
</div>
<!-- Command editor: spells.js validates the form, builds placeholder metadata,
          then saves the command in spellbook_commands_v1. -->
<div class="modal-overlay" id="modal">
<div class="modal resizable-modal">
<h2 id="modal-title">New Command</h2>
<form id="cmd-form">
<input id="edit-id" type="hidden"/>
<div class="form-group">
<label for="f-title">Title *</label>
<input id="f-title" placeholder="e.g. Remote WMIC Query" required="" type="text"/>
</div>
<div class="form-group">
<label for="f-platform">Platform / Tool *</label>
<input id="f-platform" type="text" required="" autocomplete="off" placeholder="e.g. PowerShell, Bash, GRUB…"/><datalist id="command-platform-suggestions"></datalist>
</div>
<div class="form-group">
<label for="f-tags">Tags</label>
<div data-input-id="f-tags" id="f-tags-box"></div>
<div class="form-hint">
              Type a tag and press Enter or a comma. Existing tags are suggested
              as you type, and every tag becomes available in the Tag filter.
            </div>
</div>
<div class="form-group">
<label for="f-desc">Description / Use Case</label>
<textarea id="f-desc" placeholder="What this command is for…"></textarea>
</div>
<div class="form-group">
<label for="f-cmd">Command Template *</label>
<textarea id="f-cmd" placeholder="Use &lt;placeholder&gt; for variables
e.g. nmap &lt;-sV | -sn | -sT&gt; &lt;target&gt; [-p &lt;ports&gt;] [--script &lt;nse_script&gt; [--script-args &lt;script_args&gt;]] [-oN &lt;output_file&gt;]" required=""></textarea>
<div class="form-hint">
              Use &lt;name&gt; for required placeholders and [name] for optional
              placeholders. Both become editable fields; optional placeholders
              are omitted from the generated command until populated. All
              placeholders must NOT contain whitespace (e.g. spaces, tabs,
              etc.), e.g. use "&lt;variable_name&gt;", NOT "&lt;variable
              name&gt;" For dropdown lists, use &lt;option1 | option2 |
              option3&gt; syntax
            </div>
</div>
<div class="form-group">
<label for="var-add-first">Variables</label>
<div class="var-editor" id="var-editor"></div>
<div class="var-editor-actions">
<button class="btn secondary sm" id="btn-var-add" type="button">
                + Add variable
              </button>
<button class="btn secondary sm" id="btn-var-add-option" title="A man page style option such as -a, --all or -w, --width=COLS" type="button">
                + Add option
              </button>
<button class="btn secondary sm" id="btn-var-paste" title="Paste the OPTIONS section of a man page or --help output" type="button">
                Paste man page options…
              </button>
<button class="btn secondary sm" id="btn-var-detect" title="Add a variable for every placeholder found in the command template" type="button">
                Add from template
              </button>
</div>
<div class="var-paste" hidden="" id="var-paste">
<textarea id="var-paste-text" placeholder="Paste the OPTIONS section of a man page or --help output, for example:

       -a, --all
              do not ignore entries starting with .
       -w, --width=COLS
              set output width to COLS" rows="8" spellcheck="false"></textarea>
<div class="var-paste-actions">
<button class="btn sm" id="btn-var-paste-add" type="button">
                  Add options
                </button>
<button class="btn secondary sm" id="btn-var-paste-cancel" type="button">
                  Cancel
                </button>
<span class="var-paste-message" id="var-paste-message"></span>
</div>
</div>
<div class="form-hint" id="var-paste-note"></div>
<datalist id="var-info-labels">
<option value="Required?"></option>
<option value="Position?"></option>
<option value="Default value"></option>
<option value="Accept pipeline input?"></option>
<option value="Accept wildcard characters?"></option>
</datalist>
<div class="form-hint">
              Give each variable a type, a description and any extra information
              (required, position, default value…). Insert puts it into the
              command template at the cursor, as &lt;name&gt; or the optional
              [name]. Variables you leave out here are still picked up from the
              template.
            </div>
</div>
<div class="form-group">
<label for="f-example">Example (optional)</label>
<textarea id="f-example" placeholder="Concrete example with real values"></textarea>
</div>
<div class="form-group">
<label for="f-notes">Notes / Tips</label>
<textarea id="f-notes" placeholder="Aliases, gotchas, related commands…"></textarea>
</div>
<div class="modal-actions">
<button class="btn secondary" id="btn-cancel" type="button">
              Cancel
            </button>
<button class="btn" id="btn-save" type="submit">Save</button>
</div>
</form>
</div>
</div>
<div class="modal-overlay" id="import-manager">
<section aria-labelledby="im-title" aria-modal="true" class="modal import-manager has-sticky-actions" role="dialog">
<h2 id="im-title">Import Manager</h2>
<p class="im-file" id="im-file"></p>
<div class="im-tabs" id="im-tabs" role="tablist"></div>
<div class="im-toolbar">
<span class="im-hint" id="im-hint"></span>
<span class="im-tools" id="im-tools">
<button class="btn secondary sm" id="im-select-all" type="button">
              Select all
            </button>
<button class="btn secondary sm" id="im-select-none" type="button">
              Select none
            </button>
</span>
</div>
<div class="im-list" id="im-list"></div>
<div class="modal-actions sticky-actions">
<span class="im-note" id="im-note"></span>
<button class="btn secondary" id="im-cancel" type="button">
            Cancel
          </button>
<button class="btn" id="im-apply" type="button">Apply</button>
</div>
</section>
</div>
<div class="modal-overlay" id="quick-create-modal" role="dialog" aria-modal="true" aria-labelledby="quick-create-title">
<div class="modal" style="max-width:380px">
<h2 id="quick-create-title">Create New</h2>
<p class="form-hint">Choose an item, or press C, S, or T.</p>
<div class="quick-create-choices">
<button class="btn secondary" type="button" data-create-kind="commands">Command <kbd>C</kbd></button>
<button class="btn secondary" type="button" data-create-kind="scripts">Script <kbd>S</kbd></button>
<button class="btn secondary" type="button" data-create-kind="terms">Term <kbd>T</kbd></button>
</div>
<button class="btn secondary" id="quick-create-cancel" type="button">Cancel</button>
</div></div>
`,
})
