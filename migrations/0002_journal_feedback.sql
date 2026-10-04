ALTER TABLE devotionals ADD COLUMN notes TEXT;
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES devotionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Guest',
  comment TEXT NOT NULL CHECK(length(comment) BETWEEN 1 AND 1000),
  timestamp_seconds REAL NOT NULL CHECK(timestamp_seconds BETWEEN 0 AND 86400),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_entry_status ON feedback(entry_id, status, created_at);
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE media_cleanup (
  url TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
