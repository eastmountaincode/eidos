import { parseChatSettings } from '../../../shared/chat-settings.mjs';

const publicFields = 'seq, id, conversation_id, prompt, response, status, revision, error, model, settings_json, created_at, updated_at';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function wakeStub(env) {
  return env.MESSAGE_JOB_WAKE?.get(env.MESSAGE_JOB_WAKE.idFromName('agent-chat'));
}

async function signal(env, path) {
  const stub = wakeStub(env);
  if (stub) await stub.fetch(new Request(`https://agent-chat${path}`, { method: 'POST' }));
}

async function expireInterruptedTurns(env) {
  // A lost agent is never automatically replayed: it may already have taken actions.
  await env.DB.prepare(`UPDATE agent_chat_turns SET status = 'failed', revision = revision + 1,
    error = 'The agent disconnected before finishing. You can retry this message.', updated_at = datetime('now')
    WHERE status = 'running' AND updated_at < datetime('now', '-5 minutes')`).run();
}

function conversationId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}

async function publicTurn(env, id) {
  return env.DB.prepare(`SELECT ${publicFields} FROM agent_chat_turns WHERE id = ?`).bind(id).first();
}

export async function handleAgentChat(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/agent-chat')) return null;

  if (url.pathname === '/api/agent-chat/wait' && request.method === 'GET') {
    await signal(env, '/heartbeat');
    const stub = wakeStub(env);
    return stub ? stub.fetch(new Request('https://agent-chat/wait?timeout=25')) : json({ woken: false });
  }

  if (url.pathname === '/api/agent-chat/claim' && request.method === 'POST') {
    await signal(env, '/heartbeat');
    await expireInterruptedTurns(env);
    const token = crypto.randomUUID();
    const turn = await env.DB.prepare(`UPDATE agent_chat_turns
      SET status = 'running', claim_token = ?, revision = revision + 1, updated_at = datetime('now')
      WHERE seq = (SELECT seq FROM agent_chat_turns WHERE status = 'queued' ORDER BY seq LIMIT 1)
        AND status = 'queued' RETURNING *`).bind(token).first();
    if (!turn) return json({ turn: null });
    const previous = await env.DB.prepare(`SELECT session_id FROM agent_chat_turns
      WHERE conversation_id = ? AND seq < ? AND session_id IS NOT NULL
      ORDER BY seq DESC LIMIT 1`).bind(turn.conversation_id, turn.seq).first();
    return json({ turn: { ...turn, resume_session_id: previous?.session_id || null } });
  }

  const updateMatch = url.pathname.match(/^\/api\/agent-chat\/turns\/([a-zA-Z0-9-]{1,80})$/);
  if (updateMatch && request.method === 'PATCH') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.claim_token !== 'string') return json({ error: 'Invalid claim.' }, 400);
    const status = body.status || 'running';
    if (!['running', 'completed', 'failed'].includes(status)) return json({ error: 'Invalid status.' }, 400);
    if (status === 'completed' && (typeof body.response !== 'string' || !body.response.trim())) {
      return json({ error: 'A completed reply cannot be empty.' }, 400);
    }
    if (body.response !== undefined && (typeof body.response !== 'string' || body.response.length > 200000)) {
      return json({ error: 'Invalid response.' }, 400);
    }
    await signal(env, '/heartbeat');
    const turn = await env.DB.prepare(`UPDATE agent_chat_turns SET
      status = ?, response = COALESCE(?, response), error = ?, revision = revision + 1,
      session_id = COALESCE(?, session_id), model = COALESCE(?, model),
      usage_json = COALESCE(?, usage_json), updated_at = datetime('now')
      WHERE id = ? AND claim_token = ? AND status = 'running' RETURNING ${publicFields}`)
      .bind(status, body.response ?? null, status === 'failed' ? String(body.error || 'The agent could not finish this reply.').slice(0, 500) : null,
        typeof body.session_id === 'string' && body.session_id ? body.session_id : null,
        typeof body.model === 'string' ? body.model.slice(0, 100) : null,
        body.usage ? JSON.stringify(body.usage).slice(0, 2000) : null, updateMatch[1], body.claim_token).first();
    if (!turn) {
      const saved = await env.DB.prepare(`SELECT claim_token, ${publicFields} FROM agent_chat_turns WHERE id = ?`)
        .bind(updateMatch[1]).first();
      if (saved?.claim_token === body.claim_token && saved.status === status && saved.response === body.response) {
        const { claim_token, ...publicSaved } = saved;
        return json({ turn: publicSaved });
      }
      return json({ error: 'This turn is no longer assigned to this agent.' }, 409);
    }
    return json({ turn });
  }

  if (url.pathname !== '/api/agent-chat') return json({ error: 'Not found.' }, 404);
  await expireInterruptedTurns(env);

  if (request.method === 'GET') {
    const conversation = conversationId(url.searchParams.get('conversation') || 'main');
    if (!conversation) return json({ error: 'Invalid conversation.' }, 400);
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');
    if ((after !== null && !/^\d+$/.test(after)) || (before !== null && !/^\d+$/.test(before))) {
      return json({ error: 'Invalid history cursor.' }, 400);
    }
    const cursor = after !== null ? Number(after) : before !== null ? Number(before) : Number.MAX_SAFE_INTEGER;
    const ascending = after !== null;
    const rows = await env.DB.prepare(`SELECT ${publicFields} FROM agent_chat_turns
      WHERE conversation_id = ? AND seq ${ascending ? '>' : '<'} ?
      ORDER BY seq ${ascending ? 'ASC' : 'DESC'} LIMIT 51`).bind(conversation, cursor).all();
    const hasMore = rows.results.length > 50;
    const turns = rows.results.slice(0, 50);
    if (!ascending) turns.reverse();
    const stub = wakeStub(env);
    const presence = stub ? await (await stub.fetch(new Request('https://agent-chat/status'))).json() : { online: false };
    return json({ turns, has_more: hasMore, agent_online: presence.online });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const conversation = conversationId(body?.conversation || 'main');
    if (!body || !conversation || typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.id)
      || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 20000) {
      return json({ error: 'Please enter a message of at most 20,000 characters.' }, 400);
    }
    const existing = await publicTurn(env, body.id);
    // Old clients omit settings. Redelivery/retry preserves the original choices.
    let settingsJson = existing?.settings_json ?? null;
    if (body.settings !== undefined && body.settings !== null) {
      try { settingsJson = JSON.stringify(parseChatSettings(body.settings)); }
      catch { return json({ error: 'Choose a supported model and speed.' }, 400); }
    }
    if (existing) {
      if (existing.conversation_id !== conversation || existing.prompt !== body.prompt.trim()
        || existing.settings_json !== settingsJson) {
        return json({ error: 'This message ID is already in use.' }, 409);
      }
      // Repeating a request after a connection loss returns the original turn.
      if (!body.retry || existing.status !== 'failed') return json({ turn: existing });
      const newer = await env.DB.prepare('SELECT 1 FROM agent_chat_turns WHERE conversation_id = ? AND seq > ? LIMIT 1')
        .bind(conversation, existing.seq).first();
      if (newer) return json({ error: 'Only the latest message can be retried. Send a new message to continue.' }, 409);
    }
    try {
      if (existing) {
        await env.DB.prepare(`UPDATE agent_chat_turns SET
          prior_attempts_json = json_insert(prior_attempts_json, '$[#]', json_object(
            'response', response, 'error', error, 'session_id', session_id, 'model', model,
            'usage_json', usage_json, 'updated_at', updated_at)),
          status = 'queued', error = NULL, revision = revision + 1,
          response = '', claim_token = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'failed'`)
          .bind(body.id).run();
      } else {
        await env.DB.prepare(`INSERT INTO agent_chat_turns (id, conversation_id, prompt, status, settings_json)
          VALUES (?, ?, ?, 'queued', ?)`).bind(body.id, conversation, body.prompt.trim(), settingsJson).run();
      }
    } catch (error) {
      const duplicate = await publicTurn(env, body.id);
      if (duplicate && duplicate.conversation_id === conversation && duplicate.prompt === body.prompt.trim()
        && duplicate.settings_json === settingsJson
        && duplicate.status !== 'failed') return json({ turn: duplicate });
      if (String(error).includes('UNIQUE constraint')) {
        return json({ error: 'Eidos is still answering your previous message.' }, 409);
      }
      throw error;
    }
    // The durable queue is authoritative even if a wake signal is missed.
    await signal(env, '/wake').catch(() => {});
    return json({ turn: await publicTurn(env, body.id) }, 202);
  }
  return json({ error: 'Method not allowed.' }, 405);
}
