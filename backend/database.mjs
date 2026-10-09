import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { seeds, defaultSettings } from './seed.mjs';

const { Pool } = pg;
const pgSql = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };

export function dbGet(db, sql, params = []) {
  if (db.dialect === 'postgres') return db.query(pgSql(sql), params).then(r => r.rows[0]);
  return db.prepare(sql).get(...params);
}
export function dbAll(db, sql, params = []) {
  if (db.dialect === 'postgres') return db.query(pgSql(sql), params).then(r => r.rows);
  return db.prepare(sql).all(...params);
}
export function dbRun(db, sql, params = []) {
  if (db.dialect === 'postgres') return db.query(pgSql(sql), params).then(r => ({changes:r.rowCount, rows:r.rows}));
  return db.prepare(sql).run(...params);
}

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_uploads (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, image_data BLOB NOT NULL, created_at TEXT NOT NULL);
  `);
  if (!db.prepare('SELECT version FROM migrations WHERE version=1').get()) {
    db.exec(`BEGIN;
      CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX idx_records_kind_visible_order ON records(kind, visible, sort_order);
      CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL);
      CREATE TABLE admin (id INTEGER PRIMARY KEY CHECK (id=1), email TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE enquiries (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, subject TEXT NOT NULL, preferred_date TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL);
      CREATE INDEX idx_enquiries_created ON enquiries(created_at DESC);
      CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
      INSERT INTO migrations VALUES (1, datetime('now')); COMMIT;`);
    db.prepare('INSERT INTO settings VALUES (1, ?)').run(JSON.stringify(defaultSettings));
    const now = new Date().toISOString();
    const insert = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const [kind, records] of Object.entries(seeds)) for (const item of records) {
      insert.run(randomUUID(), kind, JSON.stringify(item), +item.visible, item.order, now, now);
    }
  }
  return db;
}

export async function openPostgresDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required for cloud storage.');
  const db = new Pool({connectionString, ssl:{rejectUnauthorized:false}, max:5, idleTimeoutMillis:30000, connectionTimeoutMillis:10000});
  db.dialect = 'postgres';
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_records_kind_visible_order ON records(kind, visible, sort_order);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK (id=1), email TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS enquiries (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, subject TEXT NOT NULL, preferred_date TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_uploads (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, image_data BYTEA NOT NULL, created_at TEXT NOT NULL);
  `);
  const migration = await dbGet(db, 'SELECT version FROM migrations WHERE version=1');
  if (!migration) {
    await dbRun(db, 'INSERT INTO migrations(version, applied_at) VALUES (?, ?)', [1, new Date().toISOString()]);
    await dbRun(db, 'INSERT INTO settings(id, payload) VALUES (?, ?)', [1, JSON.stringify(defaultSettings)]);
    const now = new Date().toISOString();
    for (const [kind, items] of Object.entries(seeds)) {
      for (const item of items) await dbRun(db, 'INSERT INTO records(id, kind, payload, visible, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(),kind,JSON.stringify(item),+item.visible,item.order,now,now]);
    }
  }
  return db;
}
export async function listRecords(db, kind, publicOnly = false) {
  const rows = await dbAll(db, `SELECT * FROM records WHERE kind=? ${publicOnly ? 'AND visible=1' : ''} ORDER BY sort_order, created_at`, [kind]);
  return rows.map(row => ({...JSON.parse(row.payload), id: row.id, updatedAt: row.updated_at}));
}
export async function settings(db) {
  const row = await dbGet(db, 'SELECT payload FROM settings WHERE id=1');
  return JSON.parse(row.payload);
}
