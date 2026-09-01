import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';

const schema = `
  CREATE TABLE message_sync_runs (
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

  CREATE TABLE message_conversations (
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

  CREATE TABLE message_items (
    source_id TEXT PRIMARY KEY,
    conversation_key TEXT NOT NULL,
    timestamp TEXT,
    direction TEXT,
    chat_type TEXT,
    body TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_key) REFERENCES message_conversations(conversation_key)
  );

  CREATE INDEX idx_message_items_conversation_time
    ON message_items(conversation_key, timestamp DESC);
  CREATE INDEX idx_message_items_timestamp ON message_items(timestamp DESC);
`;

function basePayload() {
  return {
    exported_at: '2026-09-01T12:00:00-04:00',
    source: 'messages',
    window_days: 30,
    stats: {
      total_messages: 3,
      sent_messages: 1,
      received_messages: 2,
      conversation_count: 2,
      last_message_at: '2026-09-01T11:59:00-04:00',
    },
    conversations: [
      {
        contact: 'Alice',
        handle: 'alice@example.com',
        chat_type: 'direct',
        message_count: 2,
        sent_count: 1,
        received_count: 1,
        last_active: '2026-09-01T11:59:00-04:00',
      },
      {
        contact: 'Bob',
        handle: '+15555550100',
        chat_type: 'direct',
        message_count: 1,
        sent_count: 0,
        received_count: 1,
        last_active: '2026-09-01T11:00:00-04:00',
      },
    ],
    recent_messages: [
      {
        id: 'm1',
        contact: 'Alice',
        handle: 'alice@example.com',
        timestamp: '2026-09-01T11:58:00-04:00',
        direction: 'received',
        chat_type: 'direct',
        preview: 'Hello',
      },
      {
        id: 'm2',
        contact: 'Alice',
        handle: 'alice@example.com',
        timestamp: '2026-09-01T11:59:00-04:00',
        direction: 'sent',
        chat_type: 'direct',
        preview: 'Hi',
      },
      {
        id: 'm3',
        contact: 'Bob',
        handle: '+15555550100',
        timestamp: '2026-09-01T11:00:00-04:00',
        direction: 'received',
        chat_type: 'direct',
        preview: 'Checking in',
      },
    ],
  };
}

async function ingest(mf, payload) {
  const response = await mf.dispatchFetch('http://localhost/api/messages/ingest', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('message ingest writes only the delta after the initial snapshot', async (t) => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-06-01',
    bindings: { EIDOS_API_TOKEN: 'test-token' },
    d1Databases: { DB: 'eidos-test' },
  });
  t.after(() => mf.dispose());

  const db = await mf.getD1Database('DB');
  for (const statement of schema.split(';').map((value) => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }

  const first = await ingest(mf, basePayload());
  assert.deepEqual(first.changes, {
    conversationsUpserted: 2,
    conversationsCleared: 0,
    messagesUpserted: 3,
    messagesDeleted: 0,
  });

  const unchanged = await ingest(mf, basePayload());
  assert.deepEqual(unchanged.changes, {
    conversationsUpserted: 0,
    conversationsCleared: 0,
    messagesUpserted: 0,
    messagesDeleted: 0,
  });

  const changedPayload = basePayload();
  changedPayload.exported_at = '2026-09-01T13:00:00-04:00';
  changedPayload.stats.total_messages = 3;
  changedPayload.stats.sent_messages = 2;
  changedPayload.stats.received_messages = 1;
  changedPayload.stats.conversation_count = 1;
  changedPayload.conversations = [{
    ...changedPayload.conversations[0],
    message_count: 3,
    sent_count: 2,
  }];
  changedPayload.recent_messages = [
    changedPayload.recent_messages[0],
    changedPayload.recent_messages[1],
    {
      id: 'm4',
      contact: 'Alice',
      handle: 'alice@example.com',
      timestamp: '2026-09-01T12:59:00-04:00',
      direction: 'sent',
      chat_type: 'direct',
      preview: 'One more thing',
    },
  ];

  const changed = await ingest(mf, changedPayload);
  assert.deepEqual(changed.changes, {
    conversationsUpserted: 1,
    conversationsCleared: 1,
    messagesUpserted: 1,
    messagesDeleted: 1,
  });

  const messages = await db.prepare('SELECT source_id, body FROM message_items ORDER BY source_id').all();
  assert.deepEqual(messages.results, [
    { source_id: 'm1', body: 'Hello' },
    { source_id: 'm2', body: 'Hi' },
    { source_id: 'm4', body: 'One more thing' },
  ]);

  const bob = await db.prepare(`
    SELECT message_count, sent_count, received_count
    FROM message_conversations
    WHERE conversation_key = ?
  `).bind('+15555550100').first();
  assert.deepEqual(bob, {
    message_count: 0,
    sent_count: 0,
    received_count: 0,
  });

  const editedPayload = structuredClone(changedPayload);
  editedPayload.recent_messages[0].preview = 'Hello, edited';
  const edited = await ingest(mf, editedPayload);
  assert.deepEqual(edited.changes, {
    conversationsUpserted: 0,
    conversationsCleared: 0,
    messagesUpserted: 1,
    messagesDeleted: 0,
  });
});
