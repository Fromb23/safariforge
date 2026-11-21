import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS credentials (
  role TEXT PRIMARY KEY CHECK(role IN ('ADMIN','TRAVELER')), token_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, rotated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, session_hash TEXT UNIQUE NOT NULL, csrf_hash TEXT NOT NULL, role TEXT NOT NULL,
  credential_version INTEGER NOT NULL, expires_at TEXT NOT NULL,
  FOREIGN KEY(role) REFERENCES credentials(role) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, thumbnail_key TEXT UNIQUE NOT NULL,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL, tags_json TEXT NOT NULL, alt_text TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(original_name, sha256)
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, blocks_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS itineraries (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, draft_revision_id TEXT, published_revision_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY, itinerary_id TEXT NOT NULL, number INTEGER NOT NULL, state TEXT NOT NULL,
  document_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT,
  FOREIGN KEY(itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE, UNIQUE(itinerary_id, number)
);
CREATE TABLE IF NOT EXISTS revision_media (
  revision_id TEXT NOT NULL, media_id TEXT NOT NULL, PRIMARY KEY(revision_id, media_id),
  FOREIGN KEY(revision_id) REFERENCES revisions(id) ON DELETE CASCADE,
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE RESTRICT
);
`;

type SafariDb = DatabaseSync & { transaction<T>(fn: () => T): () => T };
const globalDb = globalThis as unknown as { safariDb?: SafariDb };

export function db() {
  if (!globalDb.safariDb) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    const instance = new DatabaseSync(config.databasePath) as SafariDb;
    instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    instance.exec(schema);
    instance.transaction = <T>(fn: () => T) => () => {
      instance.exec("BEGIN IMMEDIATE");
      try { const result = fn(); instance.exec("COMMIT"); return result; }
      catch (error) { instance.exec("ROLLBACK"); throw error; }
    };
    globalDb.safariDb = instance;
  }
  return globalDb.safariDb;
}

export function migrate() { db(); }
