# Spell Book developer notes

This file explains where the application behavior lives. The application is intentionally a static browser app: open `index.html` directly, or serve this folder over HTTP when browser file permissions are needed.

## File map

- `index.html`: page structure, controls, modal forms, embedded README text, and script loading order.
- `styles.css`: all layout, colors, responsive rules, modal styles, code-theme variables, and generated-list styles.
- `js/app.js`: primary controller. Loads command data, owns commands/scripts/terms state, wires buttons, renders lists/details, handles import/export, and coordinates modals.
- `js/settings.js`: appearance settings, light/dark mode, code themes, fonts, category colors, layout controls, and linked-data settings UI. It calls functions exposed by `app.js` and `datafile.js`.
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

HTML buttons are identified by `id` and normally wired with `addEventListener('click', ...)` in `js/app.js`, `js/settings.js`, or `js/datafile.js`. Navigation links use `data-page` and hash routes; page switching is handled in `app.js`. File-import buttons click a hidden `<input type="file">`; the input's `change` listener parses and validates the selected file. Export buttons call `downloadFile(...)`, which creates a browser download and never writes project files directly.

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
