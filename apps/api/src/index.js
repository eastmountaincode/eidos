function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function unauthorized() {
  return json({ error: 'unauthorized' }, 401);
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function requireAuth(request, env) {
  return env.EIDOS_API_TOKEN && bearer(request) === env.EIDOS_API_TOKEN;
}

function keyForConversation(item) {
  const raw = item.handle || item.contact || 'unknown';
  return raw.toLowerCase().replace(/[^a-z0-9@._+-]+/g, '_').slice(0, 180) || 'unknown';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!requireAuth(request, env)) {
      return unauthorized();
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/overview') {
      return getMessagesOverview(env);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/ingest') {
      const payload = await request.json();
      return ingestMessages(env, payload);
    }

    return json({ error: 'not found' }, 404);
  },
};

async function getMessagesOverview(env) {
  const latestRun = await env.DB.prepare(`
    SELECT * FROM message_sync_runs
    ORDER BY exported_at DESC
    LIMIT 1
  `).first();

  const top = await env.DB.prepare(`
    SELECT
      conversation_key,
      display_name,
      chat_type,
      message_count,
      sent_count,
      received_count,
      last_active
    FROM message_conversations
    ORDER BY message_count DESC, last_active DESC
    LIMIT 20
  `).all();

  return json({
    status: latestRun ? 'active' : 'pending',
    latestRun,
    topConversations: top.results,
  });
}

async function ingestMessages(env, payload) {
  const exportedAt = payload.exported_at || new Date().toISOString();
  const runId = crypto.randomUUID();
  const stats = payload.stats || {};
  const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
  const recentMessages = Array.isArray(payload.recent_messages) ? payload.recent_messages : [];

  await env.DB.prepare(`
    INSERT INTO message_sync_runs (
      id, exported_at, source, window_days, total_messages, sent_messages,
      received_messages, conversation_count, last_message_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    exportedAt,
    payload.source || null,
    payload.window_days || null,
    stats.total_messages || 0,
    stats.sent_messages || 0,
    stats.received_messages || 0,
    stats.conversation_count || conversations.length,
    stats.last_message_at || null,
  ).run();

  await env.DB.prepare('DELETE FROM message_items').run();
  await env.DB.prepare('DELETE FROM message_conversations').run();

  for (const conversation of conversations) {
    const conversationKey = keyForConversation(conversation);
    await env.DB.prepare(`
      INSERT INTO message_conversations (
        conversation_key, display_name, handle, chat_type, message_count,
        sent_count, received_count, last_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(conversation_key) DO UPDATE SET
        display_name = excluded.display_name,
        handle = excluded.handle,
        chat_type = excluded.chat_type,
        message_count = excluded.message_count,
        sent_count = excluded.sent_count,
        received_count = excluded.received_count,
        last_active = excluded.last_active,
        updated_at = datetime('now')
    `).bind(
      conversationKey,
      conversation.contact || conversation.handle || 'Unknown',
      conversation.handle || null,
      conversation.chat_type || null,
      conversation.message_count || 0,
      conversation.sent_count || 0,
      conversation.received_count || 0,
      conversation.last_active || null,
    ).run();
  }

  for (const item of recentMessages) {
    const conversationKey = keyForConversation(item);
    await env.DB.prepare(`
      INSERT INTO message_conversations (
        conversation_key, display_name, handle, chat_type, last_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(conversation_key) DO UPDATE SET
        display_name = COALESCE(message_conversations.display_name, excluded.display_name),
        handle = COALESCE(message_conversations.handle, excluded.handle),
        chat_type = COALESCE(message_conversations.chat_type, excluded.chat_type),
        last_active = COALESCE(message_conversations.last_active, excluded.last_active),
        updated_at = datetime('now')
    `).bind(
      conversationKey,
      item.contact || item.handle || 'Unknown',
      item.handle || null,
      item.chat_type || null,
      item.timestamp || null,
    ).run();

    await env.DB.prepare(`
      INSERT INTO message_items (
        source_id, conversation_key, timestamp, direction, chat_type, body, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_id) DO UPDATE SET
        conversation_key = excluded.conversation_key,
        timestamp = excluded.timestamp,
        direction = excluded.direction,
        chat_type = excluded.chat_type,
        body = excluded.body,
        updated_at = datetime('now')
    `).bind(
      String(item.id),
      conversationKey,
      item.timestamp || null,
      item.direction || null,
      item.chat_type || null,
      item.preview || '',
    ).run();
  }

  return json({
    ok: true,
    runId,
    conversations: conversations.length,
    recentMessages: recentMessages.length,
  }, 201);
}
