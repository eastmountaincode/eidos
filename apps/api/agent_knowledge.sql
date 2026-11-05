-- Additive: existing capabilities, personal memory and sources remain intact.
CREATE TABLE IF NOT EXISTS agent_capability_details (
  capability_id TEXT PRIMARY KEY REFERENCES agent_capabilities(id),
  instructions TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  limitations TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_capability_checks (
  id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL REFERENCES agent_capabilities(id),
  result TEXT NOT NULL CHECK (result IN ('passed', 'failed')),
  evidence TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_capability_checks_time ON agent_capability_checks(capability_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'decision', 'issue')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'eidos',
  source_ref TEXT NOT NULL,
  source_quote TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'open', 'resolved', 'withdrawn')),
  resolution TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_feedback_revisions (
  feedback_id TEXT NOT NULL REFERENCES agent_feedback(id),
  revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (feedback_id, revision)
);
CREATE TRIGGER IF NOT EXISTS feedback_created AFTER INSERT ON agent_feedback BEGIN
  INSERT INTO agent_feedback_revisions(feedback_id, revision, snapshot_json)
  VALUES (NEW.id, NEW.revision, json_object('kind', NEW.kind, 'title', NEW.title, 'body', NEW.body,
    'scope', NEW.scope, 'source_ref', NEW.source_ref, 'source_quote', NEW.source_quote,
    'status', NEW.status, 'resolution', NEW.resolution));
END;
CREATE TRIGGER IF NOT EXISTS feedback_changed AFTER UPDATE ON agent_feedback BEGIN
  INSERT INTO agent_feedback_revisions(feedback_id, revision, snapshot_json)
  VALUES (NEW.id, NEW.revision, json_object('kind', NEW.kind, 'title', NEW.title, 'body', NEW.body,
    'scope', NEW.scope, 'source_ref', NEW.source_ref, 'source_quote', NEW.source_quote,
    'status', NEW.status, 'resolution', NEW.resolution));
END;

INSERT OR IGNORE INTO agent_capabilities(id, kind, name, status, category, summary, invocation, data_source, notes, sort_order) VALUES
('web-chat', 'skill', 'Web conversation', 'active', 'Interface', 'Talk to Eidos in the web app with a persistent conversation and recoverable queued replies.', NULL, 'Vercel preview, Cloudflare Worker/D1 and the Mac mini web-chat service.', 'Uses a separate Codex session from Telegram and the same personal memory. The original production portal has not switched to the rebuild.', 90),
('agent-knowledge', 'tool', 'Capabilities and feedback', 'active', 'Eidos', 'Read Eidos abilities and retain explicit preferences, design decisions and issues separately from personal memory.', 'python3 ~/.eidos/services/skills/knowledge_context.py', 'Cloudflare D1: agent_capabilities, agent_feedback, agent_feedback_revisions', 'Same catalog used by chat and About Eidos. Read a record before editing it. Resolved issues require evidence.', 5);

INSERT OR IGNORE INTO agent_capability_details(capability_id, instructions, requirements, limitations) VALUES
('agent-knowledge', 'Read: knowledge_context.py. Find feedback: --feedback --search "PHRASE". Save: --save --id STABLE_ID --kind preference|decision|issue --title "TITLE" --body "DETAILS" --scope "eidos.design" --source-ref "CURRENT_CONVERSATION_REFERENCE" --source-quote "USER_WORDS". Edit: add --revision N after reading --id ID. To withdraw use --status withdrawn. To resolve an issue use --status resolved --resolution "VERIFIED EVIDENCE". Use the absolute invocation path shown in the catalog.', 'Eidos Worker credentials; explicit user feedback; a source reference.', 'Never promote source material or inferred personality traits into user instructions. No automatic code changes or deployments. Saving a record must succeed before claiming it was remembered.'),
('web-chat', 'Reply in the web app. Use current catalog and scoped feedback on each turn. Use Eidos app conversation as memory provenance.', 'Mac mini awake and online, ai.eidos.web-chat running, Codex ChatGPT login, Worker and preview credentials.', 'Text chat only. Local paths are not downloadable attachments. Telegram history is not imported. Tailscale is not needed by the browser.'),
('playlist-from-image', 'Read services/music/README.md when needed. Extract exact titles and artists from user-provided text or images, then invoke the catalog tool. Resolve ambiguous matches before adding tracks.', 'Apple Music authorization in the dedicated Eidos Chrome profile and access to the requested catalog tracks.', 'Account authorization may expire. A historical successful test does not prove current connectivity. The web chat currently accepts text only; image intake is available through Telegram.');
