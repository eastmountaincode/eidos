CREATE TABLE IF NOT EXISTS agent_chat_turns (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  revision INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  session_id TEXT,
  claim_token TEXT,
  model TEXT,
  settings_json TEXT,
  usage_json TEXT,
  prior_attempts_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_history ON agent_chat_turns(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_chat_queue ON agent_chat_turns(status, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_chat_active ON agent_chat_turns(conversation_id)
  WHERE status IN ('queued', 'running');
