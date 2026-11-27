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

### 3. The PowerShell tab
- A new tab between Tools and ATT&CK: a **Find** box searches commands by name, alias or what they do; in the **PS>** box a list shows what can come next (cmdlets, parameters that still fit, listed values), with the command's help beside it.
- Follows pipelines, brackets, `$x = …`, aliases, shortened parameter names, positional values and parameter sets. A version list shows both (marking what only one has) or one; the choice is saved as `spellbook_ps_version_v1`. It runs nothing and can't suggest paths or other live values.
- `ps-export.ps1` builds `ps-data-5.js` (Windows PowerShell 5.1) and `ps-data-7.js` (PowerShell 7) from the computer's installed modules and help, one file for each version it is run in. Those files are not committed (`modules/powershell/.gitignore`), so each computer builds its own.
- Help can be imported without a script: paste or upload the text of `Get-Help <name> -Full` (one or several), plus `Get-Command -Syntax` and `Get-Alias` output. Saved under `spellbook_ps_help_v1`; an imported command replaces a built one.
- No tutorial yet.
- Files: `js/core/datafile.js`, `modules/powershell/`, `modules/modules.js`, `index.html`.

## Bash

### 4. The Bash tab
- A new tab after PowerShell, with the same Find box, command box, list and help.
- Commands come from text you paste or upload: man pages (one or several in a file), `--help` output and Bash's `help`. No script is needed.
- Completes imported commands, subcommands and options, including grouped short options (`-la`) and `--option=`.
- The text is saved under `spellbook_bash_v1`, in IndexedDB like notes, so it is in the data file and backups.
- No tutorial yet.
- Files: `modules/bash/`, `modules/modules.js`, `js/core/datafile.js`, `index.html`.
