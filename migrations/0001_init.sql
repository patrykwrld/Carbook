-- Carbook: initial schema
-- Plates are stored normalized (uppercase, no spaces). Comments are public;
-- user_hash is a one-way anonymous identifier used only for abuse control,
-- never displayed.

CREATE TABLE IF NOT EXISTS plates (
  plate TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  comment_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  tag TEXT CHECK (tag IS NULL OR tag IN ('SAFE_DRIVING', 'AGGRESSIVE_DRIVING', 'LET_MERGE', 'PHONE_USE', 'OTHER')),
  image_key TEXT,
  user_hash TEXT NOT NULL,
  flag_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  created_day TEXT NOT NULL,
  FOREIGN KEY (plate) REFERENCES plates(plate)
);

CREATE INDEX IF NOT EXISTS idx_comments_plate_created ON comments (plate, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user_hash ON comments (user_hash);
CREATE INDEX IF NOT EXISTS idx_plates_last_seen ON plates (last_seen_at);
