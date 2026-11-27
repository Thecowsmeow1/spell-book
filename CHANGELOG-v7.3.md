# Spell Book v7.3 changes

Changes since v7.2 (`CHANGELOG-v7.2.md`).

## Spells

### 1. Long text in the table
- **Settings → Spells → Long text in the table**: **Cut off at one line** (the default) or **Wrap**, which shows the whole description (commands), definition (terms) or script preview over as many lines as needed.
- Applies to the table view. The card list (table beside the details, or in the control bar) is unchanged.
- Saved as `spellbook_wrap_cells_v1`, copied with the "Layout and panes" group in Import / Export and reset by **Clear Settings**.
- Files: `modules/spells/spells.js`, `modules/spells/spells-settings.js`, `modules/spells/spells-transfer.js`, `css/layout-and-table.css`.

## The app

### 2. Browser-tab icon
- The tab icon is now `favicon.png`.
- Files: `index.html`, `favicon.png`.

## PowerShell

### 3. The PowerShell tool
- On the Tools tab: a **Find** box searches commands by name, alias or what they do; in the **PS>** box a list shows what can come next (cmdlets, parameters that still fit, listed values), with the command's help beside it.
- Follows pipelines, brackets, `$x = …`, aliases, shortened parameter names, positional values and parameter sets. A version list shows both (marking what only one has) or one; the choice is saved as `spellbook_ps_version_v1`. It runs nothing and can't suggest paths or other live values.
- `ps-export.ps1` builds `ps-data-5.js` (Windows PowerShell 5.1) and `ps-data-7.js` (PowerShell 7) from the computer's installed modules and help, one file for each version it is run in. Those files are not committed (`modules/tools/powershell/.gitignore`), so each computer builds its own.
- Help can be imported without a script: paste or upload the text of `Get-Help <name> -Full` (one or several), plus `Get-Command -Syntax` and `Get-Alias` output. Saved under `spellbook_ps_help_v1`; an imported command replaces a built one.
- No tutorial yet.
- Files: `js/core/datafile.js`, `modules/tools/powershell/`, `index.html`.

## Bash

### 4. The Bash tool
- On the Tools tab, with the same Find box, command box, list and help.
- Commands come from text you paste or upload: man pages (one or several in a file), `--help` output and Bash's `help`. No script is needed.
- Completes imported commands, subcommands and options, including grouped short options (`-la`) and `--option=`.
- The text is saved under `spellbook_bash_v1`, in IndexedDB like notes, so it is in the data file and backups.
- No tutorial yet.
- Files: `modules/tools/bash/`, `js/core/datafile.js`, `index.html`.

## Tools

### 5. Redesigned Tools page
- A list of tools on the left and the chosen tool on the right, in place of the grid of cards. The tool last open is remembered in the browser.
- Drag a tool by its dotted handle, or press **Ctrl+Shift+↑/↓**, to reorder the list; **Default order** (under Choose tools) and **Clear Settings** undo it. `js/core/reorder.js` gained a `vertical` option for this.
- **Choose tools** under the list turns tools on or off. The tutorial opens each tool and skips those that are off.
- Saved as `spellbook_tools_v1`, copied with the "Tools tab" group in Import / Export and reset by **Clear Settings**.
- Files: `modules/tools/tools-layout.js`, `module.js`, `tools.css`, `tools-tour.js`, `index.html`.

### 6. Context help in the crontab and regex interpreters
- Crontab: the five fields under the box with their ranges, the current one highlighted and explained; click a field to select it.
- Regex: a line explaining the part of the pattern at the cursor, or the flags.
- Both have examples to try and a quick reference whose entries can be clicked into the box.
- Files: `modules/tools/tools-help.js`, `module.js`, `tools.css`, `index.html`.

### 7. Code tables
- Six new tools: **FTP codes**, **HTTP codes**, **SMTP codes**, **Windows syslog codes**, **Windows event IDs** and **Windows Security log codes**, as tables with a search box and a Group filter.
- Columns start as wide as their contents, and keep that width while searching.
- Columns can be resized by dragging their dividers (or ← → on a focused divider); double-click or Home resets a table. Saved as `spellbook_code_columns_v1`, in the "Code table columns" group of Import / Export, and reset by **Clear Settings**.
- Files: `modules/tools/tools-codes.js`, `module.js`, `tools-layout.js`, `tools.css`, `index.html`.

## The app: page width

### 8. Limit the page width
- Settings → Layout & Theme → **Page width**: fill the window (the default), or stay at most 1920, 1600 or 1366 pixels wide, on the left of the window. For wide and ultrawide screens.
- Saved as `spellbook_page_width_v1`, copied with the "Page width" group in Import / Export and reset by **Clear Settings**.
- Files: `js/settings.js`, `css/base.css`, `index.html`, `modules/spells/spells.js` (redraws the table).
- The Compendium's note column (Expand off) now starts at the left of its pane instead of being centered; dragging its right edge sets the width. Files: `modules/compendium/notes.css`, `note-width.js`.

## Compendium

### 9. Tables stay inside the note
- Modeled on TriliumNext: a table's width is a share of the note (100% at most) and each column a share of the table, so tables narrow and widen with the note.
- Dragging the border between two columns moves width from one to the other; dragging the table's right border resizes the table. Row heights work as before.
- Tables saved in pixels are converted when their note is opened.
- Files: `modules/compendium/notes.js`, `notes.css`, `module.js`, `index.html`.
