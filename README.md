# Spell Book

**Version 7 — 20261105**

Spell Book is a local-first reference for commands, scripts, and technical terminology. It runs in a browser using HTML, CSS, and JavaScript, without an account, database server, or installation. Open `index.html` directly to use it. Some file-linking features depend on browser support.

## Getting Started

1. Extract the complete Spell Book folder; keep `index.html`, `styles.css`, `js/`, `data/`, and `icons/` together.
2. Open `index.html` in your browser.
3. Select **Spell Book** at the top. Choose a Command, Script, or Term filter and browse or search entries.
4. Click **+ New Command**, **+ New Script**, or **+ New Term**, or press **A** outside an input to choose what to create.
5. Use **Link** and **Save** in the sidebar to manage a linked data file or download a backup. Export individual collections separately when needed.
6. Select **Compendium** to keep notes; see **Compendium** below.

## Compendium

The **Compendium** keeps CherryTree style notes: a tree of nodes on the left and a text editor on the right. Notes are saved in the browser as you type and are included in linked data files and backups.

- **Tomes:** notes are grouped into tomes, shown as tabs above the tree. **+ Tome** starts a new one; double-click a tab to rename it, or right-click it to rename, seal or delete it. Guides and templates live here as tomes.
- **Nodes:** **+ Node** and **+ Subnode** add notes, and dragging a node moves it. Right-click a node for more, including **Move Up/Down** and **Move In/Out a Level**. Arrow keys move through the tree, **F2** renames and **Delete** deletes.
- **Editor:** headings, bold, italic, underline, strikethrough, colors, lists, alignment, links, horizontal lines and tables. Inline code (`</>`) is for a short piece of code inside a sentence. The code block button, or **Code block** in the paragraph style list, adds a block of code with a language picker and the same syntax colors as the Spell Book.
- **Insert Command, Insert Script, Insert Term:** a command card shows the command's variable fields and generated command; values typed into it are saved with that card in that note only. A script card shows the script, and a term becomes a link in the text. Cards have **Edit**, which opens the Spell Book's edit window without leaving the note, and **View in Spell Book**. Each Spell Book entry lists the notes that use it under **Linked in n notes**.
- **Sealing:** right-click a node and choose **Seal Branch** to make it and everything inside it read-only, or **Seal Tome** on a tab for a whole tome. Sealed notes can't be typed in, renamed, moved or deleted, and their command fields are locked. **Unseal** makes them editable again. Seals guard against accidental edits; anyone can unseal.
- **Search:** the search box covers the open tome, **This branch** (the selected node and its subnodes) or **All tomes**. Matches are highlighted in the open note; Enter and Shift+Enter, or the arrows beside the count, jump between them.

The **←** and **→** buttons beside the logo go back to whatever you were looking at before (the previous command, script, term or note, on either page) and forward again. Settings → Layout & Theme can hide them, and the Scratch pad too.

## Commands, Scripts, and Terms

- **Commands** store a title, platform/tool, tags, description/use case, command template, variables, examples, and notes. Template placeholders can produce fill-in fields for generating a command.
- **Scripts** store a name, required language, tags, script body, and notes. Their language filters are independent of command platforms.
- **Terms** store a term, required category, tags, definition, and notes. Their category filters are independent of command platforms and script languages.

Use the **Import**, **Export**, and **Edit** controls in each repository's section. Import/export of a single repository is different from backing up the entire application state. Review the import preview before applying changes; matching IDs can be treated as updates by existing import workflows. Importing records does not automatically rewrite the source files in the `data/` directory.

### Filters, Tags, and Search

The sidebar has separate quick filters for Commands, Scripts, and Terms. Click a filter to enable or disable it; multiple filters may be selected. **All** clears that repository's category selection. The search and tag controls further narrow the current list. The counter displays `(N shown)` when filtering is active for the current repository, including when zero entries match.

Tags offer suggestions as you type and can be added as chips. Platform/tool, script-language, and term-category fields also suggest existing names, including when focused while empty. You can type a new name and accept it with Enter. A new command platform is added to the available command quick filters when the command is saved.

## Data, Saving, and Backups

Spell Book maintains working data in your browser's **localStorage**. Changes saved in the interface do **not** automatically edit files in the project folder. Browser storage is specific to that browser/profile and can be lost when site data is cleared.

There are several related but distinct ways to save data:

- **Link / Linked:** Connect to a data file through the browser's supported file-access workflow. When connected, the button displays **Linked**. File-linking and permissions depend on browser support.
- **Save:** Save to the linked JSON data file where available; otherwise download a `spellbook-data.json` backup.
- **Settings → Data & Backups:** Access the more complete data-management, backup, restore, and synchronization controls.
- **Repository Export:** Export Commands, Scripts, or Terms separately for sharing or selective import; these exports are not full backups of every application setting.

### JSON data files and startup

- **`data/spellbook-data.json`** is the complete application snapshot (commands, scripts, terms, settings, and other saved state). It is the primary portable backup format.
- **`data/commands.json`**, **`data/scripts.json`**, and **`data/terms.json`** are independent collection files used to seed an empty browser if a full snapshot is unavailable.
- **HTTP(S):** On a fresh browser, Spell Book first checks a previously linked file, then the full JSON snapshot, then any missing individual collections. Each collection uses JSON first, falling back to the corresponding `.js` file only when JSON is unavailable or invalid. An empty JSON array is valid and does not trigger fallback. Existing browser records are not overwritten.
- **`file://`:** Browsers generally prohibit automatic local JSON fetches. The loader can instead use `commands.js`, `scripts.js`, or `terms.js` if present. To use JSON directly, choose **Restore From File**, link a supported file, or run Spell Book on localhost. The bundled sample `.js` files provide a direct-file demonstration.
- **Linked data file:** A previously linked JSON file is checked before bundled data, subject to browser permissions. Local unsaved changes are protected.
- **Legacy fallback:** `commands.js`, `scripts.js`, and `terms.js` are optional classic-script fallbacks for their JSON counterparts; `commands.txt` is no longer requested. Legacy full-backup JavaScript may still be restored manually.


### Keyboard Shortcuts

- **A** outside editable fields: open **Create New**; then **C**, **S**, or **T** chooses Command, Script, or Term.
- **/** outside editable fields: focus the current search field.
- **Esc:** close the active dialog or creation selector without saving an unfinished form.

Shortcuts should not override normal typing in input fields.

## Trash and Change Counters

Deleted entries may be moved to **Trash**, where supported, so they can be restored or permanently removed. Green `+N` and red `-N` indicators track changes relative to the applicable import/baseline state. A `(N shown)` counter is a view/filter indicator, not a count of newly added records. Import operations can reset the change baseline.

## Project Files (Version 7)

```text
spell-book-experimental/
├── index.html                 Interface, JSON startup, embedded README
├── styles.css                 Themes, layouts, and responsive styles
├── DEVELOPER_NOTES.md         Developer notes
├── js/
│   ├── app.js                 Commands, scripts, terms, imports, filters
│   ├── settings.js            Settings and backup controls
│   ├── notes.js               Compendium: tomes, notes editor, sealing
│   ├── datafile.js            Linked JSON storage, backup and restore
│   └── highlight.js           Syntax highlighting
├── data/
│   ├── spellbook-data.json    Full application snapshot
│   ├── commands.json          Commands-only seed
│   ├── scripts.json           Scripts-only seed
│   ├── terms.json             Terms-only seed
│   ├── commands.js            Optional JSON fallback / file:// sample
│   ├── scripts.js             Optional JSON fallback / file:// sample
│   ├── terms.js               Optional JSON fallback / file:// sample
│   └── *.json                 Theme presets
└── icons/                     Icons and layout previews
```

The bundled JSON files seed a fresh browser over HTTP(S). On `file://`, the optional JavaScript collection files can seed data instead; use **Restore From File** to import JSON directly. The full `spellbook-data.json` sample intentionally contains no records, so individual collection examples can be tested.

## About This README

This documentation is currently embedded in `index.html` as `<script id="readme-source" type="text/x-readme">`. The **About** dialog reads that embedded text. `README.md` holds the same text for reading outside the app; keep the two in step. No fetch of a Markdown file is required to display this guide from `file://`.

## Version History

Version 7 -- 20261105

Summary: added the Compendium (a notes page with tomes, sealing, Spell Book links and highlighted code), Back and Forward buttons, live syntax colors in the command and script editors, three new settings, a new logo, and light mode readability fixes. The Guides and Templates pages were removed; guides and templates now live in the Compendium as tomes.

- `js/notes.js` (new): The Compendium page. Tome tabs; a node tree with add, rename, delete, drag and drop, a right-click menu and keyboard control; and a rich text editor with formatting, colors, lists, links, tables, inline code and highlighted code blocks with a language picker. Insert Command, Insert Script and Insert Term add cards and links that point to the Spell Book; command cards keep their variable values per note, and cards have **Edit** and **View in Spell Book** buttons. Branches and whole tomes can be sealed (read-only) and unsealed. Search covers the open tome, the selected branch or all tomes, highlights matches in the open note and jumps between them. Everything pasted, dropped or loaded passes through an HTML allowlist sanitizer. Notes autosave to `spellbook_notes_v1`; notes from before tomes are moved into a tome named "Notes" without loss.
- `js/app.js`: **Linked in n notes** on command, script and term details. Links into the app (`#/command/<id>`, `#/script/<id>`, `#/term/<id>`, `#/compendium/<node>/...`; the old `#/notes` address still works). Back and Forward history across both pages. A setting for selecting one quick filter at a time or several. The New and Edit windows can be opened from the Compendium, for new entries or existing ones. Live syntax colors in the Command Template, Example and Script fields, following the platform or language field. The Guides and Templates pages were removed.
- `js/settings.js`: New Layout & Theme settings for **Quick filters** (several at once or one at a time), **Back and Forward buttons** (show or hide) and **Scratch pad** (show or hide; its hide button had been unreachable since Version 5 hid the old layout toolbar). Resetting settings restores all three.
- `index.html`: Compendium navigation and page, the Insert picker, an in-app confirm/input dialog (the browser's own dialogs are unreliable in some embedded browsers), table tools, the search match bar and the sealed-note bar. Back and Forward buttons, the new settings, and the new logo and browser tab icon (`icons/bookSB256BW.png`). New preview icons for the Layout settings (`icons/Side-Layout.png` and `icons/2L1R-Layout-thick-mirrored.png`). Guides and Templates removed. The embedded README matches this file.
- `styles.css`: Styles for the Compendium (tabs, tree, editor, cards, code blocks, sealed notes, search highlights) and for the highlighted code fields. Light mode fixes: grey buttons now use the theme's text color, and accent-colored text (links, headings) is automatically darkened through the new `--accent-text` color so it stays readable on white. **View in Spell Book** is a button, **+ Tome** looks like a tab, and the tab bar no longer shows a stray scrollbar.
- `README.md` and `DEVELOPER_NOTES.md`: Documented the Compendium, its storage format, links, sealing, Back and Forward, and the highlighted code fields; added this entry.
- `.claude/launch.json` (new, development only): starts a local preview server with `python -m http.server 8765`.

Known limitations in Version 7:

- Notes saved by Version 7 use a new format that older versions can't read; keep a backup before opening the same browser data with an older copy.
- Nodes can't be moved from one tome to another yet.
- Seals prevent accidental edits but are not security; anyone can unseal.
- Undoing a table edit can occasionally leave an extra blank line.
- The Spell Book's own Delete buttons still use the browser's confirm dialog.
- Not yet tested when opening `index.html` directly from disk (`file://`); tested over a local web server.

Version 6 -- 20261025

- `index.html`: Prefer linked data, then the full `spellbook-data.json` snapshot, then individual JSON collection files; fall back to matching `.js` collection files only when JSON cannot load. Preserve existing browser data and linked-file unsaved-change protection.
- `data/`: Include small example command, script, and term datasets in JSON and JavaScript fallback formats. Keep the full snapshot empty for startup testing; remove obsolete test snapshots.
- Updated README and developer notes to match actual startup behavior, file formats, and the local `file://` limitation.

Version 5 -- 20261025

- `index.html` and `styles.css`: Refined filter sizing across top, left, and right layouts; reorganized Settings into Layout & Theme, Category Colors, Code Blocks, Typography, and Data & Backups; consolidated application theme colors and removed redundant badge color controls. Hid unavailable Columns and main-screen layout controls. Added a quick-create selector, required-field indicators, autocomplete fields, and Link/Save shortcuts in the sidebar.

- `js/app.js`: Updated the `A` shortcut to choose between new Commands, Scripts, and Terms; added suggestions and new-value entry for platforms, languages, and term categories; automatically registers new command platforms as filters. Corrected shown-count behavior for active filters, empty categories, and repository switching while preserving multi-select filtering.

- `js/settings.js` and `styles.css`: Updated Settings startup behavior and linked-file button status; enlarged and vertically stacked Link/Linked and Save controls at the right of the sidebar counters.

- Preserved the embedded README, existing storage formats, and import/export workflows. Guides and import ID-collision improvements remain future work.

Version 4 -- 20260926

- `index.html`: Added Trash access and its modal, added the added/deleted command indicators beside the sidebar total, and replaced static data script loading with a TXT-first loader that validates the assignment data and falls back to the JS backup. Updated import file selection and button help text for TXT and JSON files; added the import-preview dialog, mode selector, impact summary, and shortcut hints. Updated Settings text to identify TXT as the baseline and JS as the backup.

- `js/app.js`: Added persistent Trash handling with restore, permanent delete, and empty-trash actions; made new IDs account for trashed commands; added persisted since-import added/deleted counts that reset after import; kept exported assignment syntax while exporting `commands.txt`; and made Escape close the command editor, settings, README, Trash, and import preview. Added pre-import impact preview with Replace and Merge-by-ID modes; matching IDs are updated, while unmatched current commands remain on merge. Added `/` search focus and `A` for Add Command outside editable fields, with modal-open guards.

- `index.html`: Updated Search and Add Command tooltips to show the non-browser-conflicting shortcut keys.

- `styles.css`: Added Trash modal/list styling with a narrow-screen layout, import-preview styling, and green/red styling for the change counters.

- `js/settings.js`: Updated Clear Local Commands and Reset All Local Data to remove saved Trash and import-baseline data too; clarified in confirmation prompts that TXT is the baseline, JS is the backup, and neither physical file is modified.

- `README.md`: Updated startup loading to identify TXT as the baseline and JS as the backup/fallback; refreshed import/export, Trash, change-counter, Settings, and keyboard guidance; documented preview and merge behavior and the current shortcuts; updated the project-file listing; and extended this V4 file-by-file change record.

- `data/commands.txt`: Active baseline startup dataset using the existing `window.SPELLBOOK_COMMANDS` assignment format.

- `data/commands.json`: Backup startup dataset and fallback when `data/commands.txt` is unavailable or invalid.

Version 3 -- 20260922

- Added a live filtered-command count to the sidebar.
- Standardized command IDs and normalized imported command data in `js/app.js`.
- Improved command-builder placeholder detection so variable inputs match command templates.
- Added support for the current platform filters, tags, and OS badge styling in the application UI.

Version 2 -- 20260920

- Added more tool/os command filters.
- Added a favicon.
- Added Kibana and Arkime platform filters and badges.
