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

CREATE TABLE IF NOT EXISTS message_view_summaries (
  id TEXT PRIMARY KEY,
  view_key TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  list_limit TEXT NOT NULL,
  conversation_keys_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  generated_at TEXT,
  message_count INTEGER DEFAULT 0,
  conversation_count INTEGER DEFAULT 0,
  source_start_at TEXT,
  source_end_at TEXT,
  summary TEXT,
  themes_json TEXT,
  model TEXT,
  error TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_view_summaries_view ON message_view_summaries(view_key, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_view_summaries_status ON message_view_summaries(status, requested_at);

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

CREATE TABLE IF NOT EXISTS style_entries (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  kind TEXT,
  url TEXT,
  captured_at TEXT,
  context TEXT,
  notes TEXT,
  tags_json TEXT,
  file_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_style_entries_kind ON style_entries(kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_style_entries_updated ON style_entries(updated_at DESC);

CREATE TABLE IF NOT EXISTS invoice_clients (
  client_key TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  next_invoice_number INTEGER NOT NULL DEFAULT 1 CHECK (next_invoice_number >= 1),
  last_invoice_number INTEGER NOT NULL DEFAULT 0 CHECK (last_invoice_number >= 0),
  invoice_digits INTEGER NOT NULL DEFAULT 3 CHECK (invoice_digits >= 1 AND invoice_digits <= 12),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_records (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  client_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_number_int INTEGER,
  total REAL,
  pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_key) REFERENCES invoice_clients(client_key)
);

CREATE INDEX IF NOT EXISTS idx_invoice_records_client ON invoice_records(client_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_records_client_number ON invoice_records(client_key, invoice_number);

CREATE TABLE IF NOT EXISTS checkin_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('morning', 'evening')),
  status TEXT NOT NULL DEFAULT 'running',
  scheduled_for TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  title TEXT,
  body TEXT,
  calendar_context_json TEXT,
  message_context_json TEXT,
  model TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkin_runs_kind_started ON checkin_runs(kind, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_runs_status_started ON checkin_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS mantra_state (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_type TEXT,
  source_label TEXT,
  source_ref TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_entries_date ON history_entries(entry_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_notes (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL DEFAULT 'personal',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_type TEXT,
  source_label TEXT,
  source_ref TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_notes_profile ON memory_notes(profile, updated_at DESC);

CREATE TABLE IF NOT EXISTS people_notes (
  id TEXT PRIMARY KEY,
  person_key TEXT NOT NULL,
  person_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_type TEXT,
  source_label TEXT,
  source_ref TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_people_notes_person ON people_notes(person_key, updated_at DESC);

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
    'Cloudflare D1: message_conversations, message_items, conversation_summaries, message_view_summaries',
    'Default is compact. Use --limit N, --all, --since, --until, --offset, and --order for one conversation. Use --overview-summary for the latest cross-conversation Messages view summary.',
    10,
    datetime('now')
  ),
  (
    'invoice-generator',
    'tool',
    'Invoice generator',
    'active',
    'Creation',
    'Creates PDF invoices from structured client and line-item details with D1-backed per-client numbering.',
    'python3 ~/.eidos/services/invoices/create_invoice.py --client "CLIENT" --item "Description|hours|rate"',
    'Cloudflare D1: invoice_clients, invoice_records. Local PDF outbox: ~/.eidos/data/outbox/invoices',
    'Agent-facing tool. If --invoice-number is omitted, the tool reserves a zero-padded per-client number, e.g. 001, 002. Use --set-next-number N to seed or correct a client counter. Private sender details such as Andrew address/payment defaults live in ~/.eidos/data/invoices/config.json.',
    20,
    datetime('now')
  ),
  (
    'capability-registry',
    'tool',
    'Capability registry',
    'active',
    'Admin',
    'Updates Tools & Skills registry metadata and timestamps after tool or skill changes.',
    'python3 ~/.eidos/services/skills/update_capability.py --id "CAPABILITY_ID"',
    'Cloudflare D1: agent_capabilities',
    'Run this after changing a tool or skill implementation, prompt instructions, private config, or tested status so the portal Updated field stays trustworthy.',
    30,
    datetime('now')
  ),
  (
    'mantra-context',
    'tool',
    'Mantra context',
    'active',
    'Reflection',
    'Stores Andrew''s current focus/mantra for morning check-ins and agent context.',
    'Portal Mantra page updates Cloudflare D1; check-ins read /api/mantra.',
    'Cloudflare D1: mantra_state',
    'Use as a lightweight current intention, especially in morning check-ins. Do not overstate it or turn it into generic affirmation filler.',
    35,
    datetime('now')
  ),
  (
    'memory-context',
    'tool',
    'Memory context',
    'active',
    'Memory',
    'Stores and retrieves D1-backed daily history, durable profile memory, and people notes.',
    'python3 ~/.eidos/services/memory/memory_context.py --recent',
    'Cloudflare D1: history_entries, memory_notes, people_notes',
    'Portal Memory shows persistent profile memory, people notes, and a date-based history timeline. Agent writes should be selective: meaningful events, conversations Andrew processed, durable preferences/patterns, and person-specific context. Do not log routine agent chores.',
    45,
    datetime('now')
  ),
  (
    'calendar-events',
    'tool',
    'Calendar events',
    'needs_permission',
    'Calendar',
    'Adds structured event details to Apple Calendar on the Mac mini.',
    'python3 ~/.eidos/services/calendar/add_event.py --title "TITLE" --start "YYYY-MM-DD HH:MM"',
    'Apple Calendar on Mac mini. Default calendar: Events Ambient.',
    'Installed, but macOS Calendar permission must be granted to ~/Applications/EidosCalendarWriter.app on the Mac mini before it can read/write calendars. Use Events Ambient for events Andrew may attend or wants visible unless he explicitly names another calendar.',
    40,
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
    'Check-ins',
    'active',
    'Check-ins',
    'Morning and evening check-ins grounded in calendar, messages, and recent agent conversations.',
    'launchd ai.eidos.checkins -> python3 ~/.eidos/services/checkins/send_checkin.py --kind auto',
    'Cloudflare D1: checkin_runs, message tables. Apple Calendar via EventKit when permission is available. Telegram Bot API.',
    'Runs morning and evening. Morning check-ins should surface schedule, upcoming deadlines, and relevant plans from recent messages. Evening check-ins should look ahead to tomorrow and optionally follow up on unresolved loops from messages or recent agent conversations. Avoid trivial transactional texts unless they affect plans.',
    200,
    datetime('now')
  ),
  (
    'playlist-from-image',
    'skill',
    'Apple Music playlist',
    'active',
    'Music',
    'Create Apple Music playlists and add matched catalog tracks; image-to-playlist extraction is handled by the agent.',
    'python3 ~/.eidos/services/music/apple_music_playlist.py --playlist "PLAYLIST" --song "TITLE|ARTIST"',
    'Apple Music web player in a dedicated signed-in Chrome profile; MusicKit catalog and library playlist API.',
    'Uses ~/.eidos/browser-profiles/apple-music-chrome with Chrome DevTools on localhost:9223. Verified catalog search, playlist creation, and adding Bizarre Love Triangle by New Order to Eidos Catalog Test. If authorization expires, sign into Apple Music in the dedicated Eidos Chrome profile.',
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
