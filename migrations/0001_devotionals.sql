CREATE TABLE IF NOT EXISTS devotionals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  scripture TEXT,
  lyrics TEXT,
  audio_url TEXT,
  art_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_devotionals_entry_date ON devotionals(entry_date DESC);
