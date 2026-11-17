import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN','SUPPLIER','OPERATOR')),
  wallet_address  TEXT UNIQUE COLLATE NOCASE,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copie hors chaîne consultable et vérifiable. La blockchain reste la référence
-- pour le numéro, le statut et les dates certifiées.
CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            INTEGER UNIQUE,               -- numéro blockchain (NULL tant que non ancré)
  name              TEXT,
  category          TEXT,
  description       TEXT,
  salt              TEXT,
  expected_number   INTEGER,                      -- numéro utilisé pour calculer l'empreinte
  previous_hash     TEXT,
  shipment_hash     TEXT UNIQUE COLLATE NOCASE,
  arrival_salt      TEXT,
  arrival_hash      TEXT COLLATE NOCASE,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SHIPPED','ARRIVED')),
  shipped_at        INTEGER,                      -- horodatage du bloc (secondes)
  arrived_at        INTEGER,
  supplier_id       INTEGER REFERENCES users(id),
  operator_id       INTEGER REFERENCES users(id),
  supplier_address  TEXT,
  operator_address  TEXT,
  offchain_missing  INTEGER NOT NULL DEFAULT 0,   -- événement on-chain sans données hors chaîne
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER REFERENCES products(id),
  product_number  INTEGER,
  type            TEXT NOT NULL CHECK (type IN ('SHIPMENT','ARRIVAL')),
  tx_hash         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  state           TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CONFIRMED','FAILED')),
  from_address    TEXT,
  block_number    INTEGER,
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_state ON transactions(state);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Exécute fn dans une transaction SQL (rollback en cas d'erreur). */
export function inTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}
