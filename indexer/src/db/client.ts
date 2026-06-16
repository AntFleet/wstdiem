import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./schema.js";

export type DB = Database.Database;

export function openDatabase(path: string): DB {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM migrations").all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  const sorted = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  const tx = db.transaction((pending: typeof MIGRATIONS) => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO migrations(version, applied_at, description) VALUES (?, ?, ?)",
      ).run(migration.version, Date.now(), migration.description);
    }
  });
  const pending = sorted.filter((m) => !applied.has(m.version));
  if (pending.length > 0) tx(pending);
}

export function closeDatabase(db: DB): void {
  db.close();
}
