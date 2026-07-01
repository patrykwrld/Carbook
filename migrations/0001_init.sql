-- Driver Signal: initial schema
-- Plates are stored normalized (uppercase, no spaces). No identity linking:
-- feedback_events store only a one-way user_hash, never raw user identity.

CREATE TABLE IF NOT EXISTS plates (
  plate TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('LET_MERGE', 'SAFE_DRIVING', 'AGGRESSIVE_DRIVING', 'PHONE_USE')),
  comment TEXT,
  image_key TEXT,
  user_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_day TEXT NOT NULL, -- YYYY-MM-DD (UTC), used for distinct-day + dedupe checks
  FOREIGN KEY (plate) REFERENCES plates(plate)
);

CREATE INDEX IF NOT EXISTS idx_feedback_plate ON feedback_events (plate);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback_events (created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_user_hash ON feedback_events (user_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_dedupe ON feedback_events (plate, user_hash, feedback_type, created_day);
