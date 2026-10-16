# Spell Book

A local command reference that runs as a browser-based WebUI. It is built with plain HTML, CSS, and JavaScript, so it can be used without a server or installation.

## Getting Started

1. Open `index.html` in a browser.
2. Select a platform or tool from the sidebar.
3. Search for a command, or select one to view its details.
4. Use the **README** button in the header to view this guide inside the WebUI.

## How Data Works

`data/commands.txt` is the baseline command database. At startup, the app tries to load it first. TXT uses the same `window.SPELLBOOK_COMMANDS = [...]` assignment syntax as the JavaScript backup. If the TXT file is missing or invalid, the app falls back to `data/commands.js`. When opened directly with a `file://` URL, browser security may block fetching TXT, so the JS backup is used; serve the folder locally to load the TXT baseline.

Commands added or edited in the WebUI are saved in the browser's `localStorage`. They do not modify either data file on disk. This keeps the TXT baseline and JS backup intact and allows the WebUI to work in environments where browser developer tools are unavailable.

Use **Export** regularly to create a backup of the current command collection. Use **Import** to load a previously exported file or another compatible command file.

> Important: export your commands before clearing browser data or changing browsers.

## Header Buttons

### Add Command

Creates a new command entry. Use `<placeholder>` values in the command template to create fill-in fields automatically.

### Import

Loads a `.txt` or `.json` command file and previews its impact before applying it. Choose **Replace** to replace the current collection, or **Merge** to add new IDs, update matching IDs from the file, and keep current commands with IDs not in the file. TXT files use the same `window.SPELLBOOK_COMMANDS = [...]` syntax as the `.js` backup. Importing only changes data saved in this browser; it does not overwrite files in `data/`.

### Export

Downloads the current command collection as `commands.txt`. Its contents retain the `window.SPELLBOOK_COMMANDS = [...]` syntax. To use it as the startup dataset, place it at `data/commands.txt`; it will take priority over `data/commands.js`.

### Trash

Deleting a command moves it to **Trash** instead of removing it permanently. Restore commands individually, delete them permanently, or empty the Trash. Trashed commands are saved in this browser and are not included in exports.

### Change Counts

The bottom of the sidebar shows the current filtered command count, plus a green `+N` count for commands added since the last import and a red `-N` count for baseline commands that have been deleted. Restoring a command updates the counts. Before any import, the bundled startup dataset is the baseline; each successful import resets the baseline.

### README

Opens this file inside the WebUI.

### Settings

Provides appearance controls and local-data controls. You can change the theme colors, clear saved commands and Trash, clear saved settings, or reset all local Spell Book data. Clearing commands resets the since-import baseline. Press `Esc` to close Add Command, Edit Command, Settings, README, or Trash without saving an open form.

### Keyboard Shortcuts

- `/` when focus is outside a text field: focus command search.
- `A` when focus is outside a text field: open Add Command.
- `Esc`: close an open dialog. The Add/Edit form closes without saving.

## Command Format

Each command is an object in the `window.SPELLBOOK_COMMANDS` array:

```javascript
{
  "id": "example-1",
  "title": "Example Command",
  "os": "Windows",
  "tags": ["example", "help"],
  "description": "What the command is used for.",
  "command": "tool <target>",
  "variables": ["target"],
  "example": "tool server-01",
  "notes": "Additional tips or cautions."
}
```

Supported `os` values are `Windows`, `Linux`, `Wireshark`, `Routers+Switches`, `Kibana`, and `Arkime`.

## Project Files

```text
spell-book-v4/
├── data/
│   ├── commands.txt   Baseline startup command database
│   └── commands.js    Backup startup database and fallback
├── js/
│   ├── app.js         Command loading, search, editing, import, and export
│   └── settings.js    Theme and local-data settings
├── index.html         WebUI structure
├── styles.css         WebUI appearance
├── favicon.png        Browser tab icon
└── README.md          This guide
```

## Notes

- The browser may block loading `README.md` when `index.html` is opened directly from the filesystem. In that case, open the README separately or run the folder through a local web server.
- `favicon.png` supplies the book icon shown in the browser tab next to the page title.
- `data/commands.txt` is the baseline dataset; `data/commands.js` is its backup and startup fallback when TXT is unavailable or invalid. Browser-saved changes take priority after they are created or imported.
- Keep exported command files somewhere safe so local browser storage is not your only backup.

## Version Info

Version 4 -- 20260926

- `index.html`: Added Trash access and its modal, added the added/deleted command indicators beside the sidebar total, and replaced static data script loading with a TXT-first loader that validates the assignment data and falls back to the JS backup. Updated import file selection and button help text for TXT and JSON files; added the import-preview dialog, mode selector, impact summary, and shortcut hints. Updated Settings text to identify TXT as the baseline and JS as the backup.
- `js/app.js`: Added persistent Trash handling with restore, permanent delete, and empty-trash actions; made new IDs account for trashed commands; added persisted since-import added/deleted counts that reset after import; kept exported assignment syntax while exporting `commands.txt`; and made Escape close the command editor, settings, README, Trash, and import preview. Added pre-import impact preview with Replace and Merge-by-ID modes; matching IDs are updated, while unmatched current commands remain on merge. Added `/` search focus and `A` for Add Command outside editable fields, with modal-open guards.
- `index.html`: Updated Search and Add Command tooltips to show the non-browser-conflicting shortcut keys.
- `styles.css`: Added Trash modal/list styling with a narrow-screen layout, import-preview styling, and green/red styling for the change counters.
- `js/settings.js`: Updated Clear Local Commands and Reset All Local Data to remove saved Trash and import-baseline data too; clarified in confirmation prompts that TXT is the baseline, JS is the backup, and neither physical file is modified.
- `README.md`: Updated startup loading to identify TXT as the baseline and JS as the backup/fallback; refreshed import/export, Trash, change-counter, Settings, and keyboard guidance; documented preview and merge behavior and the current shortcuts; updated the project-file listing; and extended this V4 file-by-file change record.
- `data/commands.txt`: Active baseline startup dataset using the existing `window.SPELLBOOK_COMMANDS` assignment format.
- `data/commands.js`: Backup startup dataset and fallback when `data/commands.txt` is unavailable or invalid.

Version 3 -- 20260922

- Added a live filtered-command count to the sidebar.
- Standardized command IDs and normalized imported command data in `js/app.js`.
- Improved command-builder placeholder detection so variable inputs match command templates.
- Added support for the current platform filters, tags, and OS badge styling in the application UI.


Version 2 -- 20260920

- Added more tool/os command filters.
- Added a favicon.
- Added Kibana and Arkime platform filters and badges.