CREATE TABLE IF NOT EXISTS source_entries (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  type TEXT,
  context TEXT,
  creator TEXT,
  year TEXT,
  url TEXT,
  file_path TEXT,
  preview_url TEXT,
  tags_json TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_source_entries_added ON source_entries(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_entries_type ON source_entries(type, added_at DESC);
