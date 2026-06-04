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

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('tool', 'skill')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  category TEXT,
  summary TEXT NOT NULL,
  invocation TEXT,
  data_source TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_capabilities_kind ON agent_capabilities(kind, sort_order, name);

INSERT INTO agent_capabilities (
  id, kind, name, status, category, summary, invocation, data_source, notes, sort_order, updated_at
) VALUES
  (
    'message-context',
    'tool',
    'Message context',
    'active',
    'Messages',
    'Fetches D1-backed iMessage/SMS context for a person when the agent needs message evidence.',
    'python3 ~/.eidos/services/messages/message_context.py --person "NAME" --limit 25',
    'Cloudflare D1: message_conversations, message_items, conversation_summaries',
    'Default is compact. Use --limit N, --all, --since, --until, --offset, and --order when Andrew asks for more or older cached message context.',
    10,
    datetime('now')
  ),
  (
    'invoice-generator',
    'tool',
    'Invoice generator',
    'active',
    'Creation',
    'Creates PDF invoices from structured client and line-item details.',
    'python3 ~/.eidos/services/invoices/create_invoice.py --client "CLIENT" --item "Description|hours|rate"',
    'Local PDF outbox: ~/.eidos/data/outbox/invoices',
    'Agent-facing tool. Ask for missing invoice details, run the command, then include the returned pdf_path so Telegram can send the document.',
    20,
    datetime('now')
  ),
  (
    'telegram-chat',
    'skill',
    'Telegram chat',
    'active',
    'Interface',
    'Talk to Eidos from Telegram with profile-aware Codex sessions.',
    NULL,
    NULL,
    'Primary conversational interface.',
    100,
    datetime('now')
  ),
  (
    'file-intake',
    'skill',
    'File intake',
    'active',
    'Interface',
    'Accepts forwarded Telegram photos, voice notes, and documents as local files for the agent.',
    NULL,
    NULL,
    'Useful for image review, document work, and future transcription workflows.',
    110,
    datetime('now')
  ),
  (
    'calendar-checkins',
    'skill',
    'Calendar check-ins',
    'planned',
    'Check-ins',
    'Morning and evening check-ins grounded in calendar and message context.',
    NULL,
    NULL,
    'Not built yet.',
    200,
    datetime('now')
  ),
  (
    'meeting-transcription',
    'skill',
    'Meeting transcription',
    'planned',
    'Media',
    'Transcribe meeting files and extract action-relevant notes.',
    NULL,
    NULL,
    'Not built yet.',
    210,
    datetime('now')
  ),
  (
    'playlist-from-image',
    'skill',
    'Playlist from image',
    'planned',
    'Music',
    'Turn an image or vibe board into an Apple Music playlist.',
    NULL,
    NULL,
    'Not built yet.',
    220,
    datetime('now')
  )
ON CONFLICT(id) DO UPDATE SET
  kind = excluded.kind,
  name = excluded.name,
  status = excluded.status,
  category = excluded.category,
  summary = excluded.summary,
  invocation = excluded.invocation,
  data_source = excluded.data_source,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  updated_at = datetime('now');
