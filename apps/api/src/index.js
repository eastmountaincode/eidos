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

    if (request.method === 'GET' && url.pathname === '/api/messages/conversation') {
      return getConversationDetail(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/summary-request') {
      const payload = await request.json();
      return requestSummary(env, payload);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/summary-jobs') {
      return getSummaryJobs(env, url);
    }

    const completeMatch = url.pathname.match(/^\/api\/messages\/summary-jobs\/([^/]+)$/);
    if (request.method === 'POST' && completeMatch) {
      const payload = await request.json();
      return completeSummaryJob(env, completeMatch[1], payload);
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

async function getConversationDetail(env, url) {
  const conversationKey = url.searchParams.get('conversation_key') || '';
  if (!conversationKey) {
    return json({ error: 'missing conversation_key' }, 400);
  }

  const conversation = await env.DB.prepare(`
    SELECT
      conversation_key,
      display_name,
      handle,
      chat_type,
      message_count,
      sent_count,
      received_count,
      last_active
    FROM message_conversations
    WHERE conversation_key = ?
  `).bind(conversationKey).first();

  if (!conversation) {
    return json({ error: 'conversation not found' }, 404);
  }

  const recent = await env.DB.prepare(`
    SELECT timestamp, direction, chat_type, body
    FROM message_items
    WHERE conversation_key = ?
    ORDER BY timestamp DESC
    LIMIT 20
  `).bind(conversationKey).all();

  const summaries = await env.DB.prepare(`
    SELECT
      id,
      conversation_key,
      display_name,
      window_type,
      window_days,
      message_limit,
      status,
      requested_at,
      started_at,
      generated_at,
      message_count,
      source_start_at,
      source_end_at,
      summary,
      themes_json,
      relationship_notes,
      model,
      error,
      updated_at
    FROM conversation_summaries
    WHERE conversation_key = ?
    ORDER BY requested_at DESC
    LIMIT 8
  `).bind(conversationKey).all();

  return json({
    conversation,
    recentMessages: recent.results,
    summaries: summaries.results.map(normalizeSummary),
  });
}

async function requestSummary(env, payload) {
  const conversationKey = String(payload.conversation_key || '');
  if (!conversationKey) {
    return json({ error: 'missing conversation_key' }, 400);
  }

  const windowType = normalizeWindowType(payload.window_type || 'week');
  const windowConfig = windowForType(windowType);
  const conversation = await env.DB.prepare(`
    SELECT conversation_key, display_name
    FROM message_conversations
    WHERE conversation_key = ?
  `).bind(conversationKey).first();

  if (!conversation) {
    return json({ error: 'conversation not found' }, 404);
  }

  const existing = await env.DB.prepare(`
    SELECT *
    FROM conversation_summaries
    WHERE conversation_key = ?
      AND window_type = ?
      AND status IN ('queued', 'running')
    ORDER BY requested_at DESC
    LIMIT 1
  `).bind(conversationKey, windowType).first();

  if (existing) {
    return json({ summary: normalizeSummary(existing), reused: true }, 202);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO conversation_summaries (
      id, conversation_key, display_name, window_type, window_days, message_limit,
      status, requested_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))
  `).bind(
    id,
    conversation.conversation_key,
    conversation.display_name,
    windowType,
    windowConfig.windowDays,
    windowConfig.messageLimit,
  ).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM conversation_summaries
    WHERE id = ?
  `).bind(id).first();

  return json({ summary: normalizeSummary(summary), reused: false }, 202);
}

async function getSummaryJobs(env, url) {
  const status = url.searchParams.get('status') || 'queued';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 20);

  const jobs = await env.DB.prepare(`
    SELECT
      s.id,
      s.conversation_key,
      s.display_name,
      c.handle,
      c.chat_type,
      s.window_type,
      s.window_days,
      s.message_limit,
      s.status,
      s.requested_at
    FROM conversation_summaries s
    LEFT JOIN message_conversations c ON c.conversation_key = s.conversation_key
    WHERE s.status = ?
    ORDER BY s.requested_at ASC
    LIMIT ?
  `).bind(status, limit).all();

  return json({ jobs: jobs.results });
}

async function completeSummaryJob(env, id, payload) {
  const status = payload.status === 'failed' ? 'failed' : 'completed';
  const themesJson = payload.themes_json
    ? JSON.stringify(payload.themes_json)
    : payload.themes
      ? JSON.stringify(payload.themes)
      : null;

  await env.DB.prepare(`
    UPDATE conversation_summaries
    SET
      status = ?,
      started_at = COALESCE(started_at, ?),
      generated_at = CASE WHEN ? = 'completed' THEN COALESCE(?, datetime('now')) ELSE generated_at END,
      message_count = COALESCE(?, message_count),
      source_start_at = COALESCE(?, source_start_at),
      source_end_at = COALESCE(?, source_end_at),
      summary = COALESCE(?, summary),
      themes_json = COALESCE(?, themes_json),
      relationship_notes = COALESCE(?, relationship_notes),
      model = COALESCE(?, model),
      error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    status,
    payload.started_at || null,
    status,
    payload.generated_at || null,
    payload.message_count ?? null,
    payload.source_start_at || null,
    payload.source_end_at || null,
    payload.summary || null,
    themesJson,
    payload.relationship_notes || null,
    payload.model || null,
    payload.error || null,
    id,
  ).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM conversation_summaries
    WHERE id = ?
  `).bind(id).first();

  if (!summary) {
    return json({ error: 'summary job not found' }, 404);
  }

  return json({ summary: normalizeSummary(summary) });
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

function normalizeWindowType(value) {
  const allowed = new Set(['week', 'two_weeks', 'month', 'last_100']);
  return allowed.has(value) ? value : 'week';
}

function windowForType(value) {
  if (value === 'two_weeks') return { windowDays: 14, messageLimit: null };
  if (value === 'month') return { windowDays: 30, messageLimit: null };
  if (value === 'last_100') return { windowDays: null, messageLimit: 100 };
  return { windowDays: 7, messageLimit: null };
}

function normalizeSummary(summary) {
  if (!summary) return null;
  return {
    ...summary,
    themes: parseJson(summary.themes_json, []),
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
