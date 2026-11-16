// Database adapters for the Spell Book server.
//
// Every adapter offers the same three calls:
//   init()               create the tables when they are missing
//   load()               { items, settings }  (everything that is stored)
//   replace(data)        swap the stored data for `data`, all or nothing
//
// "items" are the rows of the lists (commands, scripts, terms ...) and
// "settings" is everything else (theme, layout ...) as key / value pairs.
// Rows look like { store, id, position, data }.

const CHUNK = 200

// postgres://user:pass@host:5432/dbname
function createPostgres(url) {
  let pg
  try {
    pg = require('pg')
  } catch {
    throw new Error('The "pg" package is missing. Run: npm install')
  }
  const pool = new pg.Pool({ connectionString: url })
  // $1, $2 ... placeholders for `rows` rows of `width` values
  const values = (rows, width) =>
    Array.from(
      { length: rows },
      (_, r) =>
        `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(', ')})`,
    ).join(', ')

  return {
    type: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spellbook_items (
          store_key VARCHAR(100) NOT NULL,
          item_id VARCHAR(255) NOT NULL,
          sort_order INTEGER NOT NULL,
          data JSONB NOT NULL,
          PRIMARY KEY (store_key, item_id)
        )`)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spellbook_settings (
          setting_key VARCHAR(100) PRIMARY KEY,
          setting_value TEXT NOT NULL
        )`)
    },
    async load() {
      const items = await pool.query(
        'SELECT store_key, item_id, sort_order, data FROM spellbook_items ORDER BY store_key, sort_order',
      )
      const settings = await pool.query(
        'SELECT setting_key, setting_value FROM spellbook_settings',
      )
      return {
        items: items.rows.map((r) => ({
          store: r.store_key,
          id: r.item_id,
          position: r.sort_order,
          data: r.data,
        })),
        settings: Object.fromEntries(
          settings.rows.map((r) => [r.setting_key, r.setting_value]),
        ),
      }
    },
    async replace({ items, settings }) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM spellbook_items')
        await client.query('DELETE FROM spellbook_settings')
        for (let i = 0; i < items.length; i += CHUNK) {
          const part = items.slice(i, i + CHUNK)
          await client.query(
            `INSERT INTO spellbook_items (store_key, item_id, sort_order, data) VALUES ${values(part.length, 4)}`,
            part.flatMap((r) => [
              r.store,
              r.id,
              r.position,
              JSON.stringify(r.data),
            ]),
          )
        }
        const pairs = Object.entries(settings)
        for (let i = 0; i < pairs.length; i += CHUNK) {
          const part = pairs.slice(i, i + CHUNK)
          await client.query(
            `INSERT INTO spellbook_settings (setting_key, setting_value) VALUES ${values(part.length, 2)}`,
            part.flat(),
          )
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

// mysql://user:pass@host:3306/dbname
function createMysql(url) {
  let mysql
  try {
    mysql = require('mysql2/promise')
  } catch {
    throw new Error('The "mysql2" package is missing. Run: npm install')
  }
  const pool = mysql.createPool(url)
  const parse = (value) =>
    typeof value === 'string' ? JSON.parse(value) : value

  return {
    type: 'mysql',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spellbook_items (
          store_key VARCHAR(100) NOT NULL,
          item_id VARCHAR(190) NOT NULL,
          sort_order INT NOT NULL,
          data JSON NOT NULL,
          PRIMARY KEY (store_key, item_id)
        ) CHARACTER SET utf8mb4`)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spellbook_settings (
          setting_key VARCHAR(100) PRIMARY KEY,
          setting_value LONGTEXT NOT NULL
        ) CHARACTER SET utf8mb4`)
    },
    async load() {
      const [items] = await pool.query(
        'SELECT store_key, item_id, sort_order, data FROM spellbook_items ORDER BY store_key, sort_order',
      )
      const [settings] = await pool.query(
        'SELECT setting_key, setting_value FROM spellbook_settings',
      )
      return {
        items: items.map((r) => ({
          store: r.store_key,
          id: r.item_id,
          position: r.sort_order,
          data: parse(r.data),
        })),
        settings: Object.fromEntries(
          settings.map((r) => [r.setting_key, r.setting_value]),
        ),
      }
    },
    async replace({ items, settings }) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.query('DELETE FROM spellbook_items')
        await connection.query('DELETE FROM spellbook_settings')
        for (let i = 0; i < items.length; i += CHUNK) {
          const part = items.slice(i, i + CHUNK)
          await connection.query(
            `INSERT INTO spellbook_items (store_key, item_id, sort_order, data) VALUES ${part.map(() => '(?, ?, ?, ?)').join(', ')}`,
            part.flatMap((r) => [
              r.store,
              r.id,
              r.position,
              JSON.stringify(r.data),
            ]),
          )
        }
        const pairs = Object.entries(settings)
        for (let i = 0; i < pairs.length; i += CHUNK) {
          const part = pairs.slice(i, i + CHUNK)
          await connection.query(
            `INSERT INTO spellbook_settings (setting_key, setting_value) VALUES ${part.map(() => '(?, ?)').join(', ')}`,
            part.flat(),
          )
        }
        await connection.commit()
      } catch (err) {
        await connection.rollback().catch(() => {})
        throw err
      } finally {
        connection.release()
      }
    },
    close: () => pool.end(),
  }
}

// Keeps everything in memory (lost when the server stops). For trying Spell
// Book's server out, and for tests.
function createMemory() {
  let stored = { items: [], settings: {} }
  return {
    type: 'memory',
    async init() {},
    async load() {
      return JSON.parse(JSON.stringify(stored))
    },
    async replace(data) {
      stored = JSON.parse(JSON.stringify(data))
    },
    async close() {},
  }
}

function createDatabase(url) {
  if (!url) throw new Error('DATABASE_URL is not set.')
  if (url === 'memory:' || url === 'memory') return createMemory()
  if (/^postgres(ql)?:\/\//i.test(url)) return createPostgres(url)
  if (/^mysql:\/\//i.test(url)) return createMysql(url)
  throw new Error(
    'DATABASE_URL must start with postgres://, mysql:// or be "memory:".',
  )
}

module.exports = { createDatabase }
