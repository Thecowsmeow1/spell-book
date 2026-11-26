# Spell Book v7.2 changes

## The app

### 1. Tabs are modules
- Each tab is a folder in `modules/`, listed in `modules/modules.js`: **Spells**, **Compendium**, **Tools**, **ATT&CK** and **Games**. Any tab can be taken out of the list, Spells included; the others carry on without it, and its data stays in the data file.
- **Turn tabs off** in Settings → Layout & Theme → **Tabs**, a checkbox per tab. A tab turned off leaves the bar at once (if it was open, the first tab left opens) and isn't loaded the next time Spell Book starts, as if it were taken out of the list; its data stays in the data file. Turning one back on shows **Reload Now**. One tab always stays on. Which tabs are off is saved in the data file, Import / Export copies it with the tab order (the **Tabs** group), and **Clear Settings** turns every tab back on.
- **Reorder the tabs** by dragging the dotted handle at a tab's left, or with **Ctrl+Shift+←** / **→** on a focused tab. The order is saved in the data file, `#/` opens the first tab, and **Clear Settings** goes back to the list's order.
- Back / Forward work across every tab.
- Files: `modules/`, `js/core/pages.js`, `js/core/router.js`, `js/core/reorder.js`, `js/settings.js`, `index.html`.

### 2. The top bar
- From left to right: ← and →, the tabs, then **Save**, **Import / Export** and **Trash**, a divider, then **Settings**, **Tutorial (?)** and **About (i)**. Every button but Save is an icon, with its name as the tooltip.
- **Save** is one control: the save state and a disk, joined to an arrow that opens a menu.
  - It reads *Saved 3:42* (with the date once it isn't today), *Save*, *Saving…*, *Autosaved 3:42* with a green light, *Allow saving* in amber when the browser needs permission again (a click asks), or *Not saved* in amber when a write failed (the tooltip gives the error). The amber states have an outline round the whole control.
  - The number on it counts unsaved changes across all tabs, by entry (a command, a note, a tome, a template, a setting), not by keystroke. Undoing a change takes it off the count. Hover to see them by kind.
  - With no data file linked it reads **Link a Data File**, and a click links one.
  - The menu: the **Autosave** switch, linking (link, create, link a different file, unlink), **Backup**, and data file settings.
- **Trash** shows how many items it holds.
- Light / dark mode is in Settings → Layout & Theme.
- Files: `index.html`, `js/settings.js`, `js/core/unsaved.js`, `css/base.css`, `css/nav-icons.css`, `icons/nav-*.png`.

### 3. Every setting is in the data file
- Every setting of every tab is saved under a `spellbook_` key, so the data file and backups carry it, and linking the file in another browser sets that browser up the same. That includes Autosave, Trash, the tab order, the first-start answers and the ATT&CK notes.
- Only the link to the data file (and the browser's permission to write it) and the save-state flags stay in the browser.
- Loading an older file without the Autosave setting leaves this browser's switch as it is. Unlinking the data file keeps the setting for the next file.
- Files: `js/core/datafile.js`, `js/settings.js`.

### 4. Saving is reliable
- **Save**, **Backup** and the save on leaving the page include the last keystrokes in a note and a template record still being typed.
- When the browser has dropped permission to the file, Save (and Autosave, and linking an existing file) asks for it again instead of failing.
- After writing, Save reads the file back and reports an error if it doesn't match. A write that fails partway leaves the file as it was.
- Edits made while the file is being written aren't marked as saved.
- Leaving the page while notes are still being written asks first (rare, it takes a moment).
- Files: `js/core/datafile.js`, `js/settings.js`, `modules/compendium/notes.js`.

### 5. Trash for every tab
- Trash has a section for each tab (Commands, Scripts, Terms, Compendium), each with a count and **Empty**; **Empty Trash** clears them all.
- Scripts, terms, notes and tomes now go to Trash instead of being deleted for good.
- Restoring puts an item back where it was: a command, script or term in its list; a note under the same parent, after the same sibling (or at the top of the tome, with a message, if that place is gone or archived), with its Variables; a tome in its old place among the tabs.
- Saved in the data file (`spellbook_trash_v1`, `spellbook_trash_scripts_v1`, `spellbook_trash_terms_v1`, `spellbook_trash_notes_v1`).
- Files: `js/core/trash.js`.

### 6. Tutorials and first-start questions
- The first time each tab is shown, a card asks: **Take the tutorial**, **Skip**, or, for someone who has used Spell Book before, **Link my data file** (**Restore from a backup file** in a browser that can't link files). While a data file is linked, nothing is asked. **Esc** asks again next time.
- Each tab has its own tour: the page dims, one control is lit and a card explains it, with Back, Next and End tour (arrow keys and Esc work). Steps for controls that aren't shown are left out.
- **Tutorial (?)** in the top bar runs the open tab's tour; it's greyed out on a tab without one. **Show First-Start Prompts Again** is in Settings → Data & Backups.
- The answers are saved in the data file (`spellbook_first_start_<tab>_v1`).
- Files: `js/core/tutorial.js`, `css/tutorial.css`, each tab's `*-tour.js`.

### 7. Settings
- **Theme presets** in Settings → Layout & Theme: Default, Midnight, Forest, Ocean, Ember, Dusk and Graphite, each with a dark and a light version. Changing a color by hand makes the theme Custom; presets leave category colors alone. **Dark mode** / **Light mode** is a choice there too.
- Buttons darken on hover in the theme's accent color. Amber warnings (archived notes, the unsaved count, Save's warnings) use the theme's `--warning` color, a darker amber in light mode.
- Each tab has its own Settings tab where it has settings: **Spells** (page layout, quick filters, the Options default, category colors, Clear Local Commands) and **Compendium** (note width, note bars, note titles, the Archive's tags).
- Files: `js/settings.js`, `css/base.css`, `css/settings-and-controls.css`.
- **Long text in the table** (Settings → Spells): **Cut off at one line** (the default) or **Wrap**, which shows the whole description (commands), definition (terms) or script preview over as many lines as needed. Saved as `spellbook_wrap_cells_v1`, copied with the "Layout and panes" group and reset by **Clear Settings**. Files: `modules/spells/spells.js`, `spells-settings.js`, `spells-transfer.js`, `css/layout-and-table.css`.

### 8. Import / Export
- One **Import / Export** window, in the top bar next to Save. Tick parts (commands, scripts, terms, Compendium tomes, colors, groups of settings) or **Choose items**, as JSON or CSV, or **Markdown (.zip)** for tomes (see 30).
- Setting groups: Fonts, Layout and panes, Columns and filters, Custom lists, Scratch pad text, Compendium layout and Tab order. Imported settings are read by key, whichever group an older file saved them under; keys no installed tab knows are skipped.
- Files: `js/transfer.js`, `modules/spells/spells-transfer.js`.

## Spells

### 9. Command variable fields
- A command's fields follow the order they appear in its Command Template; variables listed by hand that aren't in the template come last. Saved values are kept.
- Labels stay on one line, ending in "…" when long; hovering one shows the full name, its kind (choice, optional group, switch) and its description. The boxes in a row line up whatever the labels' lengths, in the detail pane and in command cards in notes.
- Files: `modules/spells/spells.js`, `css/layout-and-table.css`.

### 10. Tabs in code editors
- In the Command Template, its Example, a script's body and note code blocks, **Tab** types a tab character. With several lines selected, **Tab** indents each line and **Shift+Tab** takes one level off (a tab, or up to four spaces), as in VS Code; each is one Ctrl+Z. Shift+Tab on a line with no indent moves to the field before, so the keyboard can still leave the editor.
- Tabs show four columns wide.
- Files: `js/core/code-indent.js`, `css/base.css`.

### 11. Tags shared with notes
- The tag editor suggests tags from commands, scripts, terms and Compendium notes alike.
- A command's, script's or term's detail pane lists the notes that use it under **Linked in n notes**, and the notes with the same tags; a link opens the note.
- Fixed: after adding or removing a tag, typing stays in the tag box.
- Files: `js/core/tags.js`, `modules/spells/spells.js`.

## Compendium

### 12. Notes kept in IndexedDB
- The Compendium's notes are kept in the browser's IndexedDB, which has room for images, instead of localStorage (about 5 MB for everything). Notes still in localStorage move over on the first start.
- Nothing changes in files: the data file, backups, restores, the bundled data and the database server carry the notes under the same key. The browser is asked to keep the data when space runs low.
- A failed write shows "Could not save: …" under the note.
- Files: `js/core/datafile.js`.

### 13. Images in notes
- Add images with the toolbar's image button, by pasting (a screenshot, an image file, or a web page's or Word document's text with its images) or by dropping.
- Images are saved in the note, shrunk to at most 1600 pixels wide (WebP; a small GIF stays as it is, to keep moving). A web image whose site doesn't allow copying keeps its address.
- Click an image to resize it by its corner grip (double-click the grip for its own size) or remove it with ×. Ctrl+Z brings it back.
- Files: `modules/compendium/notes.js`, `notes.css`.

### 14. Templates: sections of records in a note
- **Insert Template** (**Alt+P**; the toolbar button with a table icon) puts a section of records at the cursor: a saved template, or a **Blank table**, **Blank cards** or **Blank form**. Starter templates **System** (Hostname, Address, OS information, Networking information, Recon notes) and **Log Entry** (Time, Host, Kind, Action, Why, Result, Related TTPs) are there from the start.
- **Layouts:** **Cards** (a box per record), **Table** (a row per record) and **Form** (labelled fields, side by side in rows).
- **Records are typed into in the note.** **+ Add** (or **Ctrl+Enter**) adds one, with Now and Carry values filled in. Long tables show their rows as text until you click one, stay quick with a thousand records, and scroll inside the section with the headings kept in view.
- **Fields** (or a Table heading's **▾**, and **+** for a new column) sets the section's name, layout, order and fields. Field types: short text, rich text, date and time, choice, number and checkbox. Options: **Title** (shown in a card's title), **Beside** (on the same row as the field above), **Carry** (a new record starts with the last one's value), **Now** (a new date and time starts at the current time), and wrapping (between words, anywhere, or not at all).
- Changing a field's type converts its values, asking before anything is lost. A Choice field keeps only values that match its choices (ignoring case); the others are removed after asking.
- **Rich text fields** are small editors: formatting, lists, links, inline code, preformatted text, term links, and command and script cards (with their fields, Copy and Edit).
- **Filter**, sort by a heading, **Import CSV…** (matched to the field names) and **Export CSV** (UTF-8, readable by Excel).
- **Save as template…** keeps a section's fields for later; a section made from a template can **Update** it. Delete a saved template with the × beside it in Insert Template; sections already in notes keep their records.
- Search covers every field. Archived notes show their records read-only, but can still filter, sort and export.
- Filter tables in older notes become template tables, with a short text field per column and a record per row.
- Files: `modules/compendium/note-blocks.js`, `note-blocks.css`, `notes.js`.

### 15. Note Presets
- Right-click a node → **Use as Note Preset** to make it a starting point for new notes (a stamp mark shows in the tree). **From Preset** (with the stamp) under the tree, or **Add Node from Preset…** / **Add Subnode from Preset…** in the right-click menu, copies it, with its subnodes, templates and tags, into a new note with its name ready to rename.
- **Add the starter MCA Hunt note preset** adds an example hunt page: headings for Overview, Objectives, Lines of Effort, Limit of Advance, Break Contact Criteria, Assessment, Research Required and Notes, with **System** and **Log Entry** sections. It goes into a **Note Presets** tome, or an existing **Templates** tome.
- Files: `modules/compendium/note-templates.js`, `note-templates.css`.

### 16. Duplicate a node
- Right-click a node → **Duplicate**, or **Ctrl+D** in the tree, copies it and its subnodes right after it as "… (copy)", with the name ready to rename. The copy keeps every node's Variables and tags, and links inside the branch point at the copies. A copy is never archived or starred.
- Files: `modules/compendium/notes.js`.

### 17. Note tags
- A note has tags under its name, edited like a command's: **+ add tag** with suggestions, Enter or a comma to add, × or Backspace to remove.
- The **Tag** box under the tree search shows only notes carrying every chosen tag, with the search and the scope. Clicking a tag on a note adds it to the filter. The search matches tags too.
- Files: `modules/compendium/notes.js`, `js/core/tags.js`.

### 18. Variables
- **Insert Variable** (**Alt+V**; the toolbar button with the `{x}` icon) opens a small box at the cursor: type to filter the note's variables, **Tab** or a click puts one in, **Enter** puts in the one with that name or creates it. It works in code blocks too.
- A variable shows in the note as a **chip** with its value (else its default value, else its name). Changing a value changes every chip at once. Hovering a chip shows its name, component, default value and description.
- **Variables (n)** above the note: Name and Value, and **Advanced** (top right of the open panel) adds Component, Default value, Ghost text and Description. **+ Variable** (with the same `{x}` icon) adds one. Renaming a variable keeps its chips, in code blocks too.
- In code blocks a variable is kept whole: Backspace and Delete remove it at once, the arrow keys step over it, and **Copy** gives the values.
- Nothing you type, such as `{{ }}`, `$VAR` or `%VAR%`, is ever taken for a variable. Notes with names written as text offer **Make chips of N names written in the note**.
- Removing a variable leaves its chips dashed: click one to restore the variable (with its value) or to make the chip plain text.
- Files: `modules/compendium/note-vars.js`, `note-vars.css`, `sealed-tomes.js`.

### 19. Fonts, sizes and colors
- The note toolbar has a **Font** list and a **Size** list (10–48 px), which work on the selected text or what you type next; **Default** takes them off. They work in template rich text fields too.
- The text color and highlight buttons apply their color on click, and their arrow picks another, remembered in the data file. Clicking highlight on highlighted text removes it.
- Files: `modules/compendium/notes.js`, `module.js`, `notes.css`.

### 20. Tables
- The table options float just above the table you're in, instead of a bar that pushed the note down.
- Column widths and row heights are set by dragging their borders; typing no longer resizes columns. Double-click a row's border to fit it to its text.
- **Expand** (in the table options) makes a table fill the note with its columns fitting their text; it's saved per table.
- Files: `modules/compendium/notes.js`, `notes.css`.

### 21. Editing around blocks
- Backspace and Delete next to a code block, card or template no longer remove it; its × does. A selection that includes one asks first, and Ctrl+Z brings it back.
- The empty line between two blocks, or above the first block or below the last, can be deleted, so blocks can meet and a note can start or end with one. Click between two blocks, just above the first or below the last, to start a new line there. Ctrl+Z and Ctrl+Y work for these lines.
- The arrow keys go into a code block from the line just above or below it.
- Files: `modules/compendium/notes.js`, `notes.css`.

### 22. The note toolbar and its shortcuts
- **Insert Template** (**Alt+P**) and **Insert Variable** (**Alt+V**) come first, as icon buttons (hover for their names), then **Insert Command** (**Alt+C**), **Insert Script** (**Alt+S**) and **Insert Term** (**Alt+T**) in a group labelled **Spells**, which shows only while the Spells tab is installed. Without Spells, cards in notes show the copy saved in the note.
- **Superscript** (**Ctrl+.**) and **Subscript** (**Ctrl+,**) sit beside Strikethrough. They're kept as `<sup>` and `<sub>`, and Markdown export writes them that way too.
- The shortcuts work while typing in a note that isn't archived; Ctrl+Alt (AltGr) letters still type.
- Files: `modules/compendium/module.js`, `notes.js`, `notes.css`.

### 23. The note page and Branch view
- A note shows as one page under the toolbar: its star and name, its tags, its **Variables (n)**, a thin line, then its text.
- A note's name is its heading: largest for a note on its own or the top of a branch, a step smaller for each level inside. Settings → Compendium → **Note titles** makes them Small, Medium or Large.
- **Branch view:** the branch button at the right end of a note's name shows it with every note inside it on one page, each indented with a bar in its level's color. Click any note to edit it there, name, tags and Variables included. Right-click → **Open as Whole Branch** does the same.
- Click a note's bar to switch all bars between the level colors, the accent color and plain grey. Settings → Compendium → **Note bars** has the same choice, and can turn off indenting.
- Nothing moves when you select another note: every note you can edit shows its **Variables (n)**, **+ add tag**, code block and template controls whether or not it's selected, and a click goes straight to the spot you clicked.
- Files: `modules/compendium/note-branch.js`, `notes.js`, `notes.css`, `icons/nav-branch.png`.

### 24. Note width
- **↔ Expand** at the end of the note toolbar fills the pane; off, the note is a centered column. Drag its right edge to resize it (double-click for 820 px), or set it in Settings → Compendium.
- Files: `modules/compendium/note-width.js`.

### 25. The tree and the tomes
- The search box, the **Tag** filter and the scope (**All tomes**, **This tome**, **This branch**) sit at the top of the tree pane, with **+ Node**, **+ Subnode**, **From Preset** and **Delete** just above the tree.
- Drag a note onto another tome's tab to move it there, or hold it over the tab until the tome opens and drop it in its tree. Links, Variables and archived state go with it.
- Drag a tome's dotted handle to reorder the tomes (or **Ctrl+Shift+←** / **→**).
- **Delete** is greyed out for a note that can't be deleted (archived, or holding an archived branch), with the reason in its tooltip.
- The foot of the tree shows the number of notes, with how many were added and deleted since the last import of tomes.
- Files: `modules/compendium/notes.js`, `notes.css`.

### 26. Stars
- Every note's name has a star just before it: in the tree (☆ on hover), on the note page, in Branch view and in the Archive. Click it, or right-click → **Star**, to keep the note as a favorite.
- The ★ button beside the search box shows only starred notes, with any search, tag and scope. The Archive has the same button.
- Saved with the note, so it's in the data file.
- Files: `modules/compendium/notes.js`, `sealed-tomes.js`.

### 27. Select & Export
- **Select & Export**, at the bottom of the tree and of the Archive list, opens an export list beside it. Each note gets a **＋** to add it (**✓** once added); right-click → **Add to Export List** or **Add Branch to Export List**, or **Add shown** for what the search matches. Gather notes from any searches and tomes, and from the Archive.
- Drag notes in the list to order them (or **Alt+↑/↓**). The branch button at the top previews the export, as **Rendered** notes or the **Markdown** text.
- **Export…** downloads one Markdown file (each note a `#` section, with its tome, path and tags, and its images) or a .zip with a Markdown file per note, its images and its attachments. In the one-file export an attachment is just its name, since the file can't go along.
- The list isn't saved. Drag its right edge to resize it.
- Files: `modules/compendium/note-select.js`, `notes-markdown.js`.

### 28. The Archive
- **Archive Branch** (right-click a node) or **Archive Tome** (right-click a tab) puts notes in the archive: they're locked, and only their Variables' Values can be typed in. **Unarchive** makes them editable again. It guards against accidents; it isn't a security lock.
- An archived note shows an amber archive box after its name; click it to unarchive. Archived branches are hidden from the tree and from Branch view, and archived tomes from the tabs and from **All tomes**. The archive button beside ★ by the tree search shows them (saved in the data file).
- **The Archive tab**, at the right end of the tome bar (with its archive box, after a thin line, so it doesn't read as a tome), shows every archived branch and tome as clean pages, in a list with a box per tome. It has the tree's search tools (a search box that also matches tome names, a **Tag** filter, **Tome name / All tomes / This tome / This branch**) and a ★ filter. A note's page looks like the archived note in its tome: its name, tags, **Variables (n)** (type the Values there), **Open in** *tome*, **Unarchive** on an archived branch's top note, and the branch button to add every note inside it. An archived tome's box has an archive box: click it to unarchive the tome and get its tab back.
- Drag the list's right edge to resize it. Settings → Compendium → **Show tags in the Archive** hides the notes' tags there.
- Saved data is unchanged: archived notes are the ones older versions called sealed.
- Files: `modules/compendium/sealed-tomes.js`, `sealed-tomes.css`, `notes.js`, `note-branch.js`.

### 29. Code blocks
- Pasted code blocks (wrapped in a `<div>` or `<p>` by the page they came from) are drawn as code blocks.
- In **Auto**, lines starting with `git`, `ssh`, `scp`, `rsync`, `tar`, `mkdir`, `chown`, `wget`, `npm`, `npx` or `journalctl` get bash colors.
- Files: `modules/compendium/notes.js`, `notes-codelang.js`.

### 30. Export as Markdown
- Import / Export's **Markdown (.zip): Compendium** downloads the ticked tomes as a .zip: a folder per tome, a `.md` file per note (with a folder for its subnotes) images in `assets/` and attachments in `attachments/`. It's a copy; your notes stay in Spell Book.
- Each file has front matter (id, title, tome, order, tags, its Variables, and `sealed: true`, `preset: true` or `starred: true` where they apply; `sealed` marks an archived note), then the note in Markdown: headings, formatting, lists, links, quotes, code blocks with their language, tables, info boxes as `> [!NOTE]`, and images. Command and script cards become a line and a code block, templates a table of their records, and variables their values.
- Attachments go in `attachments/`, and a note links to its files there.
- Files: `modules/compendium/notes-markdown.js`.

### 31. Attachments
- Attach any file to a note: the paperclip button on the toolbar, or drop or paste a file that isn't a picture. Each one is a chip with its name and size, at the caret. Files can be up to 100 MB.
- Click a chip for **Open** (PDFs, PNG, JPEG, GIF and WebP pictures, and text files, in a new tab), **Download**, and **Remove** in a note you can edit (Ctrl+Z brings it back). The same chips work in Branch view and the Archive. Archived notes can't get new attachments or lose them.
- Files are kept out of the data file, so it stays small. This browser keeps a copy of each, and saves each one in an `attachments` folder next to the data file (`data/attachments` for Spell Book's own data folder). A browser may only write to a folder you've picked, so after a data file is linked a banner asks once: click **Choose Folder**, then **Select Folder** in the window, which opens in the data file's folder. The `attachments` folder is made if needed. **Not now** doesn't ask again for that file; **Settings → Data & Backups → Attachments** has the same button. Copy the data file and the folder together to back up or move everything. The same file attached twice is kept once.
- The database server keeps attachments in `data/attachments` too, with no setup (`FILES_DIR` moves it), and other browsers get them from there. It never serves that folder as web files, only through the signed-in API, as downloads.
- A chip whose file this browser doesn't have is drawn dashed. Choose the folder that holds it (or open Spell Book from the server) and it fills in.
- A file deleted, renamed or changed in the folder (or changed on the server) is put back from the browser's copy at the next sync: after a save, on start, or **Sync Now**. Every file is checked against its fingerprint, and checked again only when its size or time changes.
- Removing a chip, or deleting a note for good (it's kept while it's in Trash), leaves its file unused. Unused files are deleted from the browser and the folder the next time Spell Book starts, not straight away, so a chip brought back with Ctrl+Z still works. This is skipped when the data file didn't load (it needs permission again), and when it would delete most of a folder of more than five files: Settings → Attachments then shows them. **Clean Up…** deletes unused files right away, from the folder and from the database server, after asking. The server's are only removed this way, since other browsers share it.
- Safety: a file is shown in a tab only when its first bytes say it's a PDF, a picture or text. Anything else (HTML or SVG, for example) is only downloaded, never shown inside Spell Book.
- Files: `js/core/attachments.js`, `modules/compendium/note-files.js`, `note-files.css`, `notes.js`, `module.js`, `notes-markdown.js`, `note-select.js`, `js/transfer.js`, `remote-db/server/server.js`, `remote-db/client.js`.

## Tools

### 32. The Tools tab
- **Man page importer:** paste a man page (`man ls | col -b`), `--help` output, PowerShell `Get-Help -Full` text or a help harvester dump. The synopsis becomes a Command Template (`<file>` required, `[file]` optional, `[-v]` a switch, `[-f <archive>]` an option with a value, `<start|stop>` a choice); with several forms you pick one, and the template can be edited with a live list of its fields. The options become the command's Options list, and the name, description, an example and notes are filled in. **Create command…** opens it in the New Command window to check and save. It needs Spells.
- **Number converter** (decimal, hex, octal, binary, bytes), **Crontab interpreter** (the schedule in plain English and its next runs), **Regex interpreter** (the pattern explained and tested on your text) and the **Help harvester** (a script that collects a command's help, and its subcommands', for the importer).
- Files: `modules/tools/`.

## ATT&CK

### 33. The ATT&CK tab
- The MITRE ATT&CK Enterprise matrix (v20): 15 tactics, 706 techniques and sub-techniques, with search, **sub-techniques** and **only with entries**.
- Tag a command, script, term or note with a technique id (`T1003`, `T1003.001`), or write the id in its text, to tie it to the technique; the matrix counts them.
- Click a technique for its details, MITRE's detection strategies, your **Indicators, paths and commands**, the entries **In this book** (click one to open it; Back returns to the matrix) and your **Notes**.
- Only your indicators and notes are saved (`spellbook_attack_notes_v1`, in the data file), so a newer matrix keeps them. `python3 -I modules/attack/attack.py` rebuilds the matrix.
- Files: `modules/attack/`.

## Games

### 34. The Games tab
- HTML games played inside Spell Book, each a folder in `modules/games/` with an `index.html`, listed in `modules/games/games-list.js` (`folder`, and optionally `title` and `description`). Click one to play it; it keeps going while you visit other tabs. **← Games** closes it, **Restart** starts it again, **Full Screen** fills the screen. `#/games/<folder>` opens a game, and Back / Forward include them.
- Games run in a sandboxed frame (scripts only): they can't read or change Spell Book's data, open windows or use the browser's storage. A game can keep its scores, up to 200 KB of JSON, in the data file (`spellbook_games_v1`) through `postMessage`: Spell Book sends what it saved and the app's colors when the game loads (and the colors again when they change), and the game sends `{ spellbook: 'save', data }`. `games.js` describes it.
- **Tic-Tac-Toe** comes with it: against the computer at **Easy** (random), **Normal** (wins and blocks, otherwise mostly good moves) or **Hard** (never loses), as X or O (X goes first). Mouse, arrow keys and Enter, or 1–9; N for a new game. Wins, draws and losses are counted per level and saved, with the level and side. It takes on the app's colors and still plays when opened on its own.
- The tab has its own tutorial.
- Files: `modules/games/`, `modules/modules.js`, `js/settings.js` (the `spellbook:theme` event).

## Database server

### 35. Password sign-in, Docker and Synology
- With `SPELLBOOK_PASSWORD` set, every page, file and API call needs a session: a sign-in page, sessions kept for 30 days, and **Sign Out** in Settings → Data & Backups. Guessing is slowed (scrypt, a wait after a wrong password, lockouts), sign-in from other sites is refused, and responses carry `X-Frame-Options`, `nosniff` and `Referrer-Policy` headers. `COOKIE_SECURE=1` and `TRUST_PROXY=1` are for running behind an HTTPS proxy.
- Signed out while working: a banner offers **Sign in**, Save says **Not saved**, and your changes wait in the browser until you're back.
- `remote-db/docker-compose.yml` runs Spell Book with PostgreSQL 16, for Docker or Synology Container Manager. `remote-db/README.md` covers sign-in and a Synology NAS behind DSM's HTTPS reverse proxy.
- The server serves the tabs in `modules/` (web files only, so `attack.py` stays private). A tab's own HTML pages (the Games tab's games) may be shown in a frame by Spell Book itself; every other page refuses frames.
- Files: `remote-db/server/auth.js`, `server.js`, `remote-db/client.js`, `remote-db/docker-compose.yml`, `remote-db/README.md`.

## For module authors

### 36. The core and what a module can add
- `js/core/` holds what every tab shares: the data file, tabs and services, addresses and Back / Forward, Trash, the unsaved count, tutorials, the tag editor, drag handles, syntax colors, code indenting, the About window and small helpers.
- A module is a folder with a `module.js` calling `SpellBook.module({ id, title, routes, css, scripts, html, seeds })`; `seeds` lists its bundled starter data.
- Tabs never use each other's code directly. Spells provides the `spells` service and the Compendium the `compendium` service; `SpellBook.service(name)` is `null` when that tab isn't installed.
- What a module can add: `settingsSection`, `transferPart`, `exportFormat`, `settingGroup`, `tagSource`, `tutorial`, `trash.section` (and `trash.bin`), `trackChanges`, `places` and `route`, `reorderHandle` / `reorderable`, and `saveTarget`. `DataFile` has `beforeSave`, `onSaved`, `onDataChange`, `autosaveOn` and `getState`.
- The README's "For Developers: Tabs Are Modules" section has the rules.
- Files: `js/core/`, `modules/tools/` (a small example).

## Housekeeping

- **Storage keys stay as they are** (`spellbook_commands_v1`, `spellbook_trash_v1` and so on) so older data files and backups still load. New keys follow the same `spellbook_` pattern, which also puts them in the data file.
- `data/attachments/` (attachments, from the browser or the server) holds personal files and stays out of commits too.
- `data/spellbook-data.json` and `data/Compendium/` hold personal data and stay out of commits (the repository is public). The same goes for real passwords in `remote-db/docker-compose.yml`: commit it with its placeholders.
