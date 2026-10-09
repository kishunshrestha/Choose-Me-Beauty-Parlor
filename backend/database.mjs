import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { seeds, defaultSettings } from './seed.mjs';

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
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
export function listRecords(db, kind, publicOnly = false) {
  return db.prepare(`SELECT * FROM records WHERE kind=? ${publicOnly ? 'AND visible=1' : ''} ORDER BY sort_order, created_at`).all(kind).map(row => ({...JSON.parse(row.payload), id: row.id, updatedAt: row.updated_at}));
}
export function settings(db) { return JSON.parse(db.prepare('SELECT payload FROM settings WHERE id=1').get().payload); }
