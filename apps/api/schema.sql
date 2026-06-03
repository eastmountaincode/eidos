CREATE TABLE IF NOT EXISTS message_sync_runs (
  id TEXT PRIMARY KEY,
  exported_at TEXT NOT NULL,
  source TEXT,
  window_days INTEGER,
  total_messages INTEGER DEFAULT 0,
  sent_messages INTEGER DEFAULT 0,
  received_messages INTEGER DEFAULT 0,
  conversation_count INTEGER DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_conversations (
  conversation_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT,
  chat_type TEXT,
  message_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  last_active TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_items (
  source_id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  timestamp TEXT,
  direction TEXT,
  chat_type TEXT,
  body TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_key) REFERENCES message_conversations(conversation_key)
);

CREATE INDEX IF NOT EXISTS idx_message_items_conversation_time ON message_items(conversation_key, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_message_items_timestamp ON message_items(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_message_conversations_count ON message_conversations(message_count DESC);

CREATE TABLE IF NOT EXISTS message_ingest_requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_ingest_requests_status ON message_ingest_requests(status, requested_at);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  window_type TEXT NOT NULL,
  window_days INTEGER,
  message_limit INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  generated_at TEXT,
  message_count INTEGER DEFAULT 0,
  source_start_at TEXT,
  source_end_at TEXT,
  summary TEXT,
  themes_json TEXT,
  relationship_notes TEXT,
  model TEXT,
  error TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_key) REFERENCES message_conversations(conversation_key)
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation ON conversation_summaries(conversation_key, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_status ON conversation_summaries(status, requested_at);
