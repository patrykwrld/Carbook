import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "carbook.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS plates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plate      TEXT NOT NULL UNIQUE,
    country    TEXT NOT NULL DEFAULT 'PL',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_id   INTEGER NOT NULL REFERENCES plates(id) ON DELETE CASCADE,
    author     TEXT NOT NULL DEFAULT 'Anonymous',
    text       TEXT NOT NULL,
    tag        TEXT NOT NULL DEFAULT 'general',
    votes      INTEGER NOT NULL DEFAULT 0,
    reports    INTEGER NOT NULL DEFAULT 0,
    hidden     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reactions (
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (comment_id, emoji)
  );

  CREATE INDEX IF NOT EXISTS idx_comments_plate ON comments(plate_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_plates_plate ON plates(plate);
`);

// In-place migration for v1 databases that predate photo support.
const commentCols = db.prepare("SELECT name FROM pragma_table_info('comments')").all().map((c) => c.name);
if (!commentCols.includes("photo")) {
  db.exec("ALTER TABLE comments ADD COLUMN photo BLOB");
}
if (!commentCols.includes("photo_mime")) {
  db.exec("ALTER TABLE comments ADD COLUMN photo_mime TEXT");
}

export default db;
