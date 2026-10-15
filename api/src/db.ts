import { Database } from "bun:sqlite";

export type ReportStatus = "draft" | "submitted" | "rejected" | "attested";

export function openDb(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY,              -- keccak256("<country>/<registryId>"), the on-chain id
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      registry_id TEXT NOT NULL,
      operator TEXT NOT NULL,           -- 0x address that signs passports
      route TEXT NOT NULL,              -- CBAM benchmark route letter
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      installation_id TEXT NOT NULL REFERENCES installations(id),
      year INTEGER NOT NULL,
      cn_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      bundle_json TEXT,
      bundle_hash TEXT,
      submitted_at TEXT,
      rejection TEXT,
      attestation_id INTEGER,
      attest_tx TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES reports(id),
      filename TEXT NOT NULL,
      media_type TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      extraction_json TEXT,
      extracted_at TEXT,
      UNIQUE (report_id, sha256)
    );
    CREATE TABLE IF NOT EXISTS fields (
      id INTEGER PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES reports(id),
      document_id INTEGER REFERENCES documents(id),
      key TEXT NOT NULL,
      value REAL NOT NULL,              -- what the document says (or what the operator typed)
      page INTEGER,
      snippet TEXT,
      reference TEXT,
      source TEXT NOT NULL,             -- 'model' | 'operator'
      check_result TEXT,                -- verify.ts outcome for model fields
      confirmed INTEGER NOT NULL DEFAULT 0,
      corrected_from REAL,              -- the model's value, when the operator changed it
      confirmed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS passports (
      id INTEGER PRIMARY KEY,           -- on-chain passport id
      tx TEXT NOT NULL,
      doc_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}
