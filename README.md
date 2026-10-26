# Spell Book

**Version 6 — 20261025**

Spell Book is a local-first reference for commands, scripts, and technical terminology. It runs in a browser using HTML, CSS, and JavaScript, without an account, database server, or installation. Open `index.html` directly to use it. Some file-linking features depend on browser support.

## Getting Started

1. Extract the complete Spell Book folder; keep `index.html`, `styles.css`, `js/`, `data/`, and `icons/` together.
2. Open `index.html` in your browser.
3. Select **Spell Book** at the top. Choose a Command, Script, or Term filter and browse or search entries.
4. Click **+ New Command**, **+ New Script**, or **+ New Term**, or press **A** outside an input to choose what to create.
5. Use **Link** and **Save** in the sidebar to manage a linked data file or download a backup. Export individual collections separately when needed.

The **Guides** and **Templates** top-level pages are placeholders in this release; they do not yet contain a completed guide or template system.

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

## Project Files (Version 5)

```text
spell-book-experimental/
├── index.html                 Interface, JSON startup, embedded README
├── styles.css                 Themes, layouts, and responsive styles
├── DEVELOPER_NOTES.md         Developer notes
├── js/
│   ├── app.js                 Commands, scripts, terms, imports, filters
│   ├── settings.js            Settings and backup controls
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

This documentation is currently embedded in `index.html` as `<script id="readme-source" type="text/x-readme">`. The **About** dialog reads that embedded text. There is no separate `README.md` in this archive, and no fetch of a Markdown file is required to display this guide from `file://`.

## Version History

Version 6 -- 20261025

- `index.html`: Prefer linked data, then the full `spellbook-data.json` snapshot, then individual JSON collection files; fall back to matching `.js` collection files only when JSON cannot load. Preserve existing browser data and linked-file unsaved-change protection.
- `data/`: Include small example command, script, and term datasets in JSON and JavaScript fallback formats. Keep the full snapshot empty for startup testing; remove obsolete test snapshots.
- Updated README and developer notes to match actual startup behavior, file formats, and the local `file://` limitation.

Version 5 -- 20261025

- `index.html` and `styles.css`: Refined filter sizing across top, left, and right layouts; reorganized Settings into Layout & Theme, Category Colors, Code Blocks, Typography, and Data & Backups; consolidated application theme colors and removed redundant badge color controls. Hid unavailable Columns and main-screen layout controls. Added a quick-create selector, required-field indicators, autocomplete fields, and Link/Save shortcuts in the sidebar.

- `js/app.js`: Updated the `A` shortcut to choose between new Commands, Scripts, and Terms; added suggestions and new-value entry for platforms, languages, and term categories; automatically registers new command platforms as filters. Corrected shown-count behavior for active filters, empty categories, and repository switching while preserving multi-select filtering.

- `js/settings.js` and `styles.css`: Updated Settings startup behavior and linked-file button status; enlarged and vertically stacked Link/Linked and Save controls at the right of the sidebar counters.

- Preserved the embedded README, existing storage formats, and import/export workflows. Guides, Notes, and import ID-collision improvements remain future work.

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
