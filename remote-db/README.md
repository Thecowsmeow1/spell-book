# Remote database (optional)

Keeps all of Spell Book's data (commands, scripts, terms, notes, theme, layout) in a **PostgreSQL** or **MySQL** database instead of the browser. Everything for it lives in this folder. Delete the folder and Spell Book works exactly as before.

```
remote-db/
  client.js            browser side: syncs with the server, adds Settings → Data → Database Server
  docker-compose.yml   Spell Book + PostgreSQL for Docker / Synology Container Manager
  server/
    server.js          the web server (serves Spell Book and a small API)
    auth.js            password sign-in (SPELLBOOK_PASSWORD)
    db.js              PostgreSQL, MySQL and in-memory adapters
    package.json       dependencies (pg, mysql2)
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
| `HOST` | `127.0.0.1` | This computer only. `0.0.0.0` accepts other computers: set `SPELLBOOK_PASSWORD` first. |
| `SPELLBOOK_PASSWORD` | none | Turns on sign-in (below). Needed before anything but this computer can reach the server. |
| `COOKIE_SECURE` | off | `1` behind HTTPS: the sign-in cookie is only sent over HTTPS. |
| `FILES_DIR` | `data/attachments` | Where attachments are kept (below). On Docker, point it at a volume if the app folder isn't one. |
| `FILE_MAX_MB` | `100` | The largest attachment the server takes. |
| `TRUST_PROXY` | off | `1` behind a reverse proxy: wrong-password limits count the browser's address (from `X-Forwarded-For`), not the proxy's. |

## Sign-in

With `SPELLBOOK_PASSWORD` set, every page, file and API request needs signing in first. Opening Spell Book shows a sign-in page; the right password gives the browser a session for 30 days, renewed each time Spell Book is opened. **Settings → Data → Database Server → Sign Out** ends it.

- The session is a signed cookie (HttpOnly, SameSite=Lax, and Secure with `COOKIE_SECURE=1` or when the proxy says the browser used HTTPS). It's signed with a key made from the password, so sessions survive restarts, and **changing the password signs every browser out**.
- Guessing is slowed: each check runs scrypt; a wrong password waits a second; after 10 wrong passwords from one address in 15 minutes that address is locked out for the rest of the 15 minutes, and after 50 in total sign-in is locked for everyone (browsers already signed in keep working). Wrong passwords are logged with the address.
- If a session ends while Spell Book is open, changes stay in the browser, the Save button says **Not saved**, and a banner offers **Sign in**. After signing in they're saved.
- The password is only read from the environment. Use a long one (the server warns under 12 characters).

## On a Synology NAS (or any Docker host), with HTTPS

1. In Package Center, install **Container Manager**.
2. In File Station, make `docker/spellbook/app` and copy the whole Spell Book folder's contents into `app` (so `app/index.html` and `app/remote-db/` exist). Copy `remote-db/docker-compose.yml` to `docker/spellbook/`.
3. Edit that `docker-compose.yml`: set `SPELLBOOK_PASSWORD`, and replace `change-db-password` (both places) with another password.
4. Container Manager → **Project** → **Create**: name `spellbook`, path `/volume1/docker/spellbook`, source **Use existing docker-compose.yml**. Finish; it downloads and starts. The `app` container's log should end with `Database: postgres` and `Sign-in: on`.
5. Control Panel → External Access → **DDNS**: add `yourname.synology.me` and get its Let's Encrypt certificate.
6. Control Panel → Login Portal → Advanced → **Reverse Proxy** → Create: source HTTPS, `yourname.synology.me`, port `8443`; destination HTTP, `localhost`, port `8787`. Under **Custom Header**, add `Host` = `$http_host` (the server refuses requests whose origin doesn't match the host) and `X-Forwarded-For` = `$proxy_add_x_forwarded_for`.
7. Control Panel → Security → Certificate → **Settings**: give that reverse-proxy entry the Let's Encrypt certificate.
8. On the router, forward TCP 8443 (and 80, for the certificate's renewals) to the NAS. Never forward 8787, 5000/5001 or 5432.
9. Open `https://yourname.synology.me:8443` and sign in. On first use, do it from the browser that has your data: an empty database takes this browser's data (see below).

The compose file only lets the NAS itself reach port 8787, so the reverse proxy is the only way in. For plain http on your home network only, change the port line to `"8787:8787"` and remove `COOKIE_SECURE`.

To update Spell Book, copy the new files over `app/` and restart the `app` container. Back up with **Backup** in the Save menu, or `docker exec spellbook-db-1 pg_dump -U spellbook spellbook > backup.sql` (Task Scheduler can run it).

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

Attachments (files attached to Compendium notes) aren't in the database. The server keeps them in `FILES_DIR` (`data/attachments` in the Spell Book folder unless set), one file per attachment, named by its SHA-256; the server checks every upload against its name. They're only reached through the signed-in API and always sent as downloads: the folder is never served as web files, even though the rest of `data/` is. Back up that folder with the database.

## Safety

- The server listens on this computer only by default, and refuses API requests (and sign-ins) that come from another website's page. Its pages can't be shown inside another site's frame.
- It serves only Spell Book's own files (`index.html`, `styles.css`, `js/`, `css/`, `data/`, `icons/`, `modules/` and `remote-db/client.js`). From `modules/` it serves only web files (`.js`, `.css`, `.json`, `.html`, images), so tools kept there, such as `modules/attack/attack.py`, are not served. The server code and its settings are not served.
- The connection string, which holds your password, is only ever read from the environment. It is never written to a file or sent to the browser.
- Without `SPELLBOOK_PASSWORD` there is no sign-in: anyone who can reach the server's address can read and change the data. The server warns at startup when it listens beyond this computer with no password.

## Back up

**Backup** in the Save menu (or Settings → Data → **Download Backup**) still works and includes the same data, but not attachments: copy `FILES_DIR` too. You can also use the database's own tools, for example `pg_dump spellbook` or `mysqldump spellbook`.

## Status

Tested with Chrome-family browsers, the in-memory adapter, and the PostgreSQL adapter against an in-memory PostgreSQL emulator (pg-mem). The MySQL adapter has not been run against a real MySQL server yet.
