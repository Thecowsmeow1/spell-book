# Remote database (optional)

Keeps all of Spell Book's data (commands, scripts, terms, notes, theme, layout) in a **PostgreSQL** or **MySQL** database instead of the browser. Everything for it lives in this folder. Delete the folder and Spell Book works exactly as before.

```
remote-db/
  client.js          browser side: syncs with the server, adds Settings → Data → Database Server
  server/
    server.js        the web server (serves Spell Book and a small API)
    db.js            PostgreSQL, MySQL and in-memory adapters
    package.json     dependencies (pg, mysql2)
```

## Set up

You need Node.js 18 or newer and an empty database you can log in to.

1. Create the database, for example `spellbook`. The server creates its own tables.
2. Install the dependencies once:
   ```
   cd remote-db/server
   npm install
   ```
3. Start the server with a connection string:
   ```
   # PostgreSQL
   DATABASE_URL=postgres://user:password@localhost:5432/spellbook node server.js

   # MySQL
   DATABASE_URL=mysql://user:password@localhost:3306/spellbook node server.js
   ```
   On Windows PowerShell set it first: `$env:DATABASE_URL = "postgres://user:password@localhost:5432/spellbook"`, then `node server.js`.
4. Open **http://localhost:8787** (not the `index.html` file). Settings → Data → Database Server should say it is connected.

To try it without a database, use `DATABASE_URL=memory:`. Nothing is kept when the server stops.

| Setting | Default | |
| --- | --- | --- |
| `DATABASE_URL` | none | `postgres://…`, `mysql://…` or `memory:` |
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | This computer only. Do not set `0.0.0.0` unless you add your own protection: the server has no login. |

## How it behaves

- **Opened from the server, with the database on:** the database is the main store. Changes save about a second after you make them, and again when you leave the page.
- **Opened as a file (`file://`) or with the server stopped:** nothing changes. Spell Book uses the browser and data files as before.
- **First time with an empty database:** it starts with whatever is already in this browser.
- **Two browsers at once:** the data is saved in parts, one for each of Commands, Scripts, Terms, Compendium notes and each group of settings. A browser saves only the parts it changed, and each part has a version number in the database. So commands in one browser and the Compendium in the other merge by themselves, with no prompt.
- **A part changed in both browsers:** the browser that saves second is refused for that part only (everything else it changed is still saved) and a banner offers **Keep mine (overwrite theirs)** or **Use theirs (reload)**. Nothing is overwritten silently. Two browsers adding different commands count as the same part (Commands), so the second one gets this banner.
- **Seeing the other browser's changes:** an open page checks the database every 15 seconds. When another browser changed a part you have not touched here, a banner says which one and offers **Reload**. Until you reload, the page keeps showing its own copy.
- **Settings → Data → Database Server** can turn the database off for one browser, overwrite the database with this browser's data, or replace this browser's data with the database's.

## What is stored

Two tables, created automatically:

- `spellbook_items` has one row per command, script or term (`store_key`, `item_id`, `sort_order`, `data` as JSON), so the rows can be queried.
- `spellbook_settings` has the rest as key / value rows (theme, layout, notes and so on), plus the time of the last save.

## Safety

- The server listens on this computer only by default, and refuses API requests that come from another website's page.
- It serves only Spell Book's own files (`index.html`, `styles.css`, `js/`, `css/`, `data/`, `icons/` and `remote-db/client.js`). The server code and its settings are not served.
- The connection string, which holds your password, is only ever read from the environment. It is never written to a file or sent to the browser.
- There is no login. Anyone who can reach the server's address can read and change the data.

## Back up

Settings → Data → **Download Backup** still works and includes the same data. You can also use the database's own tools, for example `pg_dump spellbook` or `mysqldump spellbook`.

## Status

Tested with Chrome-family browsers, the in-memory adapter, and the PostgreSQL adapter against an in-memory PostgreSQL emulator (pg-mem). The MySQL adapter has not been run against a real MySQL server yet.
