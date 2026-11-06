CREATE TABLE IF NOT EXISTS message_contact_names (
  conversation_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
