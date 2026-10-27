# Spell Book developer notes

This file explains where the application behavior lives. The application is intentionally a static browser app: open `index.html` directly, or serve this folder over HTTP when browser file permissions are needed.

## File map

- `index.html`: page structure, controls, modal forms, embedded README text, and script loading order.
- `styles.css`: all layout, colors, responsive rules, modal styles, code-theme variables, and generated-list styles.
- `js/app.js`: primary controller. Loads command data, owns commands/scripts/terms state, wires buttons, renders lists/details, handles import/export, and coordinates modals.
- `js/settings.js`: appearance settings, light/dark mode, code themes, fonts, category colors, layout controls, and linked-data settings UI. It calls functions exposed by `app.js` and `datafile.js`.
- `js/notes.js`: Compendium page (the `notes` page in code). Tome tabs, node tree, rich text editor, HTML sanitizer, and the Insert Command dialog. Saves to `spellbook_notes_v1` as `{ version: 2, tomes: [{ id, name, sealed, nodes, selectedId }], tomeId }`, and the tree width to `spellbook_notes_pane_v1`; the version 1 shape `{ nodes, selectedId }` is read as a single tome. `nodes` and `selectedId` in the module always point at the open tome (`useTome()`). A node or tome with `sealed: true` is read-only along with everything inside it: `sealOf()` finds the seal, `markDirty()` saves nothing in a sealed note, and tree actions check `listLocked()`. Command and script cards are stored as `div[data-command-id]` or `div[data-script-id]`, and term links as `a[data-term-id]`, with a text snapshot in `data-*` attributes; they are redrawn from the live entry when a note opens, and the snapshot is what shows if the entry is gone. A command card's field values live in its own `data-values` JSON, so they belong to that card in that note. The search box can be pinned to one node and its subnodes through `searchScopeId`, or widened to every tome with `searchAllTomes`; neither is saved. In "All tomes" each tree item carries `data-tome`, and `openNode()` switches tome before selecting. Search matches in the open note are painted with the CSS Custom Highlight API, so they never touch the note's HTML; `refreshMatches()` must run after anything that changes the note's text. The command template, example and script fields get live syntax colors from `attachCodeHighlighting()` in `app.js`: a colored copy behind a textarea with transparent text, redrawn on input and on any `.value` assignment. Code blocks are stored as `<pre data-lang="…">text</pre>` and drawn by `drawCodeBlock()` as a highlighted copy with a transparent textarea over it; `serializeEditor()` reads the textarea back. A card's **Edit** button opens the Spell Book's own edit window through `openEntryModalWithHooks(kind, hooks, existing)`. `window.NoteLinks.find(kind, id)` scans the saved notes for the "Linked in n notes" section that `renderNoteLinks()` in `app.js` draws. Every stored or pasted HTML string goes through `sanitize()`, because notes can arrive from shared data files.
- `js/notes-callouts.js`, `css/notes-callouts.css`: the Info box button in the Compendium toolbar. A box is saved as `div.note-callout[data-callout="info"]`; `sanitize()` in `notes.js` keeps only that shape. Uses `window.NotesEditor`, which `notes.js` exposes for add-on files.
- `js/notes-codelang.js`: the "Auto" choice in a code block's language dropdown (new blocks and old plain ones start as Auto). `resolve(lang, text)` guesses PowerShell, bash, batch, Python, SQL or generic from the text; other languages pass through. Loaded before `notes.js`, which and `guides.js` call it.
- `js/notes-codesave.js`, `css/notes-codesave.css`: the "Save as…" menu in each code block's header. It opens the Spell Book's New Command, Script or Term window (via `openEntryModalWithHooks`) filled from the block's text and language; nothing is saved until you press Save there, and the note is unchanged.
- `js/entry-tables.js`, `css/entry-tables.css`: tables in the Notes box of commands, scripts and terms. Pipe-written lines (`| a | b |` with a `|---|---|` divider) are drawn as a table in the detail pane, and an **Insert table** button under each Notes box builds one in a grid. Stored notes stay plain text. It needs no edits to `app.js`: a MutationObserver on `#detail` swaps in the table, and it uses `escapeHtml`. Ported from the older `Spellbook` build.
- `js/sealed-tomes.js`, `css/sealed-tomes.css`: the **Sealed Tomes** tab, added after the tome tabs in the Compendium. It lists every outermost sealed node and the top-level nodes of sealed tomes (sealing is the only read-only mechanism) and shows one read-only. An "Environment variables" panel under the node name stores rows of Component, Variable, Default value, Ghost text and Description in `spellbook_sealed_env_v1` (`{ [nodeId]: { vars } }`). A sealed node opens with an Environment table whose Value inputs show the ghost text; what you type (kept in `spellbook_sealed_env_values_v1`, `{ [nodeId]: { [variable]: value } }`) replaces the variable everywhere in the note as you type, and an empty value leaves the variable as written. The note itself is never changed. The view replaces `#notes-body` while open (`.sealed-open` on `#page-notes`) and closes on any tome tab or `notes:shown`, an event `notes.js` fires from `applySealState()`.
- `js/datafile.js`: optional File System Access API adapter. It snapshots selected `localStorage` keys into a JSON file and exposes `window.DataFile`.
- `js/highlight.js`: small dependency-free syntax highlighter used by rendered code blocks.
- `data/spellbook-data.json`: full application snapshot, empty in this sample build.
- `data/{commands,scripts,terms}.json`: independent JSON repository seeds. Matching `.js` files are optional fallbacks and set `window.SPELLBOOK_COMMANDS`, `window.SPELLBOOK_SCRIPTS`, and `window.SPELLBOOK_TERMS`.
- `data/*.json`: strict import/export examples for appearance colors, category colors, code syntax colors, or combined themes. JSON does not support comments; use this file for their field meanings.
- `icons/*`, `favicon.png`: binary visual assets referenced by HTML or CSS. Binary files cannot contain source comments without corrupting them.

## Script and data flow

1. The inline script in `index.html` applies saved mode and code-theme attributes before the first paint.
2. `js/datafile.js` is loaded before `js/app.js`; its `autoload()` result can restore browser storage before the app reads it.
3. `js/highlight.js` defines the highlighting helper used by `app.js`.
4. The inline startup loader first honors a linked file, then the full JSON snapshot, then individual JSON repositories (with `.js` fallbacks when JSON cannot load). `js/app.js` reads the seeded storage, binds controls, and renders the initial page.
5. `js/settings.js` binds the settings modal after the app has defined shared helpers.
6. The final inline loader tries the embedded README first and then loads any configured data file.

## Button and link tracing

HTML buttons are identified by `id` and normally wired with `addEventListener('click', ...)` in `js/app.js`, `js/settings.js`, or `js/datafile.js`. Navigation links use `data-page` and hash routes; page switching is handled in `app.js`. The **←** Back and **→** Forward buttons (`#btn-back`, `#btn-forward`) keep their own stacks of places visited (Settings can hide them through `spellbook_nav_history_v1`), because choosing an entry or note doesn't change the address: `renderDetail()`, `showPage()` and the Compendium's `showSelected()` call `scheduleLocationCheck()`, which records the previous place once per task, and the Compendium supplies its part through `window.NotesNav`. `#/command/<id>`, `#/script/<id>` and `#/term/<id>` open one entry on the Spell Book page, clearing filters only if they hide it. `#/compendium/<node>/<kind>/<id>` opens a note, in whichever tome holds it, and scrolls to that entry's link; `#/notes` is accepted as the old address. File-import buttons click a hidden `<input type="file">`; the input's `change` listener parses and validates the selected file. Export buttons call `downloadFile(...)`, which creates a browser download and never writes project files directly.

When adding a control:

1. Add the semantic HTML element and a stable `id` in `index.html`.
2. Add a visible label or a precise `title`/`aria-label` explaining the action.
3. Bind the event in the owning JavaScript module.
4. Put persistence in the relevant `localStorage` helper, not in the click handler, when the value should survive reloads.
5. Render the changed state after mutation so the list, counts, modal, and accessibility attributes stay synchronized.
6. Add or update a short section comment describing the element id, the handler file, and any storage key.

## Suggested future file splits

- Move command/template parsing from `js/app.js` into `js/commands/template.js`; export `parseCommandTemplate`, `getTemplateFields`, and `buildGeneratedCommand`, then load it before `app.js` or import it as an ES module.
- Move the command/script/term import and CSV helpers into `js/data/import-export.js`; keep the public `downloadFile` helper there and call it from `app.js` and `settings.js`.
- Move section-name, hidden-column, collapsed-section, and layout persistence into `js/ui/preferences.js`; expose small `load`, `save`, and `apply` functions to both `app.js` and `settings.js`.
- Split the large embedded README from `index.html` into `README.md`, then have the final loader fetch it when the page is served. Keep the embedded fallback if direct `file://` use remains a requirement.
- Validate the generated JSON snapshot and collection seeds before publishing; keep the optional JavaScript fallback copies synchronized with the JSON examples.

## Storage keys

The keys beginning with `spellbook_` and `cmdref_` are browser persistence. `js/datafile.js` exports most of them, except its own linkage/autosave/status keys. Changing a key requires updating every reader, reset action, and data-file filter that refers to it.

## Commenting rule for data

Do not add `//` or `/* */` inside `.json` files. Those files are consumed by `JSON.parse` and must stay valid JSON. Document the schema and intended source of each JSON file here instead. JavaScript data files may have a short header comment before their assignment, but the object contents should stay machine-generated and stable.
