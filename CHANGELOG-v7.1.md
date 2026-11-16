# Spell Book v7.1 changes

Everything changed on branch `experimental-v7.1`, which started from the `tentative` branch at commit `1a0d994` ("V6.1 of Spell Book"). Entry 1 was already committed before this branch's other commits. Changes are grouped by what they do, with the files they touch.

Keep this file up to date as v7.1 work continues: add new entries at the top of the list for their area, and note what was and was not tested.

## Changes

### 1. Options in the detail pane are sorted alphabetically
- Options (the `-x` / `--long` entries from a pasted man page) are always listed alphabetically, however they were added. The sort uses the long name, or the short name if there is no long one, and ignores dashes and capitalization (`-a`, `--aligned`, `--Binary`, `--rows`).
- Applies to the Options list in the detail pane and to the option list in the Edit window. Existing commands show sorted without any edit. Variables keep their original order.
- File: `js/app.js` (`optionSortKey`, `sortOptions`, `sanitizeVariableDetails`, `variableReferenceHtml`).
- Tested: the sorting function on a mixed list. Not run in the app.

### 2. Compendium: leave a code block with the keyboard
- Pressing **Enter twice** at the end of a code block (Enter on an empty last line) now leaves the block and removes that empty line. **Esc** and **Ctrl+Enter** also leave it, from anywhere in the block.
- If nothing follows the block, or the next item is another code block or a command card, an empty paragraph is added after it.
- The placeholder text in an empty block now says how to leave.
- File: `js/notes.js` (`exitCodeBlock`, `codeBlockKeydown`).
- Tested: in Edge, typing two lines then Enter twice, then continuing to type in a paragraph below, and Esc. Ctrl+Enter, blocks in the middle of a note, and Sealed (read-only) notes were not tested.
- The cause of "Enter twice does nothing" in the user's notes is entry 2b below: their code blocks were never drawn as real blocks, so this key handling never ran for them.

### 2b. Compendium: pasted code blocks were not turned into code blocks
- Text pasted from a chat window or web page usually wraps its `<pre>` in a `<div>` or `<p>`. The editor only drew code blocks for a `<pre>` sitting directly in the note, so a wrapped one stayed a plain gray box: no language list, no Copy or remove buttons, no syntax colors, and Enter inside it just added line breaks forever, with no way out. This is what the user saw with the git how-to note.
- Now a wrapped `<pre>` is lifted out of its wrapper (the wrapper is split around it) and drawn as a normal code block. `<pre>` inside lists, tables, quotes, command cards and info boxes is left where it is.
- Existing notes are repaired the next time they are opened (the same function runs when a note opens), and the fixed structure is saved with the next edit.
- File: `js/notes.js` (`liftCodeBlocks`, called from `drawCodeBlocks`).
- Tested: in Edge, pasting HTML with the `<pre>` in a `<div>`, in a `<p>`, in nested divs with styles (VS Code style) and with colored spans. Every case now gives a drawn code block with syntax colors. Then Enter once stayed in the block and Enter twice left it, and typing continued in a paragraph below. Not tested: re-opening an already-saved note that has the old structure.

### 3. Compendium: `git` and other commands get bash colors in Auto mode
- A code block set to **Auto** guesses its language from its text. The bash guess now also recognizes lines starting with `git`, `ssh`, `scp`, `rsync`, `tar`, `mkdir`, `chown`, `wget`, `npm`, `npx` and `journalctl`. Before this, a block of only `git` commands was treated as "generic", which has no coloring, not even for `#` comments.
- File: `js/notes-codelang.js`.
- Tested: in Edge, a block of two `git` lines now has colored commands, flags and comments. Note that this only matters once a block is a real code block (see 2b); the user's blocks were plain gray boxes, which is why their `git` blocks had no colors at all.

### 4. Backup file names carry the date and time
- **Download Backup** (Settings → Data) and **Download my changes** (the banner shown when this browser has newer changes than the data file) now name the file like `spellbook-data_11Nov2026_12-57-28.json`. The format is `DDMMMYYYY_HH-MM-SS`; the month is the English three-letter abbreviation and the time is 24-hour. Colons are not allowed in file names, so dashes are used in the time.
- Not changed: the linked data file (**Create Data File…**) keeps the plain name `spellbook-data.json`, since that file is rewritten continuously. Exports (CSV, themes, category colors) keep their plain names.
- Files: `js/datafile.js` (`backupName`, also exposed as `DataFile.backupName`), `js/settings.js` (Download Backup button).
- Tested: clicked Download Backup in Edge and checked the file name.

### 5. Optional remote database (PostgreSQL or MySQL)
Keeps all of Spell Book's data in a database instead of the browser. Everything for it is in the new `remote-db/` folder; deleting that folder gives the app exactly as it was. Setup and behavior are in `remote-db/README.md`.

- **New files**
  - `remote-db/client.js`: browser side. Syncs with the server, and adds a **Database Server** section to Settings → Data (on/off checkbox, **Overwrite Database With This Browser**, **Replace This Browser With Database**).
  - `remote-db/server/server.js`: the web server. Serves Spell Book and a small API (`GET /api/status`, `GET /api/snapshot`, `PUT /api/snapshot`).
  - `remote-db/server/db.js`: PostgreSQL, MySQL and in-memory adapters.
  - `remote-db/server/package.json` and `package-lock.json`: dependencies (`pg`, `mysql2`).
  - `remote-db/README.md`: setup and behavior.
- **Changes to existing files**
  - `js/datafile.js`: a `useRemote` hook that lets `client.js` plug in, and the checks that make saving, scheduling and the unsaved flag also work for the database. About 70 new lines. Linked-file and backup behavior is unchanged.
  - `index.html`: the startup script loads `remote-db/client.js` only when the page is served over http(s), and ignores it if the file is missing. It also treats a database load as authoritative so the starter data files are not loaded over it.
- **How it behaves**
  - Opened as a file (`file://`), or with the server stopped: nothing changes.
  - Opened from the server (for example `http://localhost:8787`): the database is the main store, and changes save about 0.8 seconds after they are made.
  - The data is saved in parts: Commands, Scripts, Terms, Compendium notes, and each group of settings. Each part has a version number in the database. A browser saves only the parts it changed.
  - Two browsers changing different parts (for example Commands in one and the Compendium in the other) merge with no prompt.
  - A part changed in both browsers is a conflict for that part only. The browser that saves second sees a banner with **Keep mine (overwrite theirs)** or **Use theirs (reload)**. Nothing is overwritten silently.
  - An open page checks the database every 15 seconds and offers **Reload** when another browser changed a part that this one has not.
  - The server listens on this computer only by default, refuses API requests from other websites' pages, and serves only Spell Book's own files. It has no login.
- Tested
  - The server's save, version and conflict logic against the PostgreSQL adapter, using `pg-mem` (an in-memory PostgreSQL emulator). All checks passed, including the security checks.
  - Two separate Edge windows against the server using its `memory:` mode (data kept in memory, lost when the server stops): seeding an empty database, loading in a second browser, commands in one browser with Compendium notes in the other (no conflict), both browsers editing the same part (one conflict banner, then **Use theirs**), the 15-second change notice and Reload.
  - Opening the app as a file: no database section, nothing different.
- **Not tested**
  - Any real PostgreSQL or MySQL server (none was available).
  - The MySQL adapter, which has never been run.
  - Saving while a page is closing (it relies on the browser allowing the request to finish).
- **Known limits**
  - Commands are saved as one part. Two browsers adding or editing different commands at the same time still conflict. Merging command by command was discussed and not built.
  - The Compendium is also one part, so two browsers editing different notes at the same time conflict.
  - A page keeps showing its own copy of a part another browser changed until you reload it.
  - The server must run as a single process. Several server processes on one database are not supported.

### 6. `styles.css` split into `css/` files
- The one 3,800-line stylesheet is now ten files in `css/` (`base`, `layout-and-table`, `modals`, `settings-and-controls`, `code-themes`, `control-bar-and-panes`, `import-manager`, `editors-and-scratch`, `notes`, `notes-blocks`), loaded by `<link>` tags in `index.html` in the original order. The files joined end to end are byte-for-byte the old `styles.css`, so nothing looks different. `styles.css` is deleted.
- Decided: `index.html` will NOT be split into pieces that JavaScript loads. Markup stays in `index.html`.

### 7. Import / Export Manager replaces every import and export button
- One **Import / Export** button in the top bar opens a window with an Export tab and an Import tab. The Import, Export, theme and code-theme buttons that were spread across Commands, Scripts, Terms and Settings are gone. **Download Backup**, **Restore From File** and **Create Data File** in Settings > Data are unchanged.
- **Export:** tick whole groups or use **Choose items** to pick individual commands, scripts, terms or Compendium tomes. Groups: Commands, Scripts, Terms, Compendium; Appearance, Category colors, Code block theme; and settings (Layout and panes, Fonts, Columns and filters, Custom lists, Scratch pad text). Saves one file, `spellbook-export_DDMMMYYYY_HH-MM-SS.json`, or CSV files for commands, scripts and terms.
- **Import:** reads that file, and also older files: commands (JSON, CSV, TXT), scripts, terms, and the old appearance, category color, code theme and full theme files. Tick the parts to bring in. Commands, scripts and terms then open the existing Import Manager one after another, so each item is still reviewed as new, changed or not in the file. Colors replace yours. Tomes are added as new tabs (ids are renamed if they clash). Settings are written and the page reloads.
- Left out on purpose: sealed-note variables (can hold secrets). Sealed tomes export still sealed.
- Files: `js/transfer.js` (new), `css/transfer.css` (new), `js/notes.js` (`NotesIO`), `js/app.js` (import queue; old handlers and `showExportMenu` removed), `js/settings.js` (old theme import/export removed), `index.html`.
- Tested in Edge: the window lists every group; ticking groups and single scripts; export file contents; reading the file back; old category, code theme, terms and CSV files; CSV export; the Import tab handing commands to the Import Manager; importing a tome twice (second copy gets new ids, both saved); a settings import writing the value and reloading. Not tested: Terms/Scripts review hand-off for a combined file with all three lists, and re-importing into a second browser.

## Not part of this branch

- Features that were already in `tentative` (scratch pad, fonts, Options section collapse and its setting, Synopsis and Details split for man pages, Edit and Delete buttons at the top and bottom of the detail pane, tables in notes, and others). Several of these were first built in an older working copy and turned out to be in `tentative` already. That older copy is saved in `Archive/spell-book-experimental-claude-2026-11-11/`.

## Planned, not started

- Possibly split `js/app.js` and `js/settings.js` into several script files.
- Merge by individual command, script and term for the database.

## Housekeeping

- The linked data file `spellbook-data.json` showed "A requested file or directory could not be found" after the branch switch. The browser keeps its link by file, not by folder path, so replacing the file broke it. Relink it in Settings → Data, and use **Download Backup** first.
- `Archive/` holds older copies of the project and must stay out of commits.
