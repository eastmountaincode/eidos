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
      return getMessagesOverview(env, url);
    }

    if (request.method === 'GET' && url.pathname === '/api/capabilities') {
      return getCapabilities(env);
    }

    if (request.method === 'GET' && url.pathname === '/api/checkins/runs') {
      return getCheckinRuns(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/checkins/runs') {
      const payload = await request.json();
      return upsertCheckinRun(env, payload);
    }

    const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/);
    if (request.method === 'POST' && capabilityMatch) {
      const payload = await request.json();
      return updateCapability(env, decodeURIComponent(capabilityMatch[1]), payload);
    }

    if (request.method === 'GET' && url.pathname === '/api/invoices/clients') {
      return getInvoiceClients(env);
    }

    if (request.method === 'POST' && url.pathname === '/api/invoices/client-counter') {
      const payload = await request.json();
      return setInvoiceClientCounter(env, payload);
    }

    if (request.method === 'POST' && url.pathname === '/api/invoices/reserve-number') {
      const payload = await request.json();
      return reserveInvoiceNumber(env, payload);
    }

    if (request.method === 'POST' && url.pathname === '/api/invoices/records') {
      const payload = await request.json();
      return recordInvoice(env, payload);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/conversations') {
      return getMessageConversations(env, url);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/conversation') {
      return getConversationDetail(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/summary-request') {
      const payload = await request.json();
      return requestSummary(env, payload);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/ingest-request') {
      return requestIngest(env);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/ingest-requests') {
      return getIngestRequests(env, url);
    }

    const ingestRequestMatch = url.pathname.match(/^\/api\/messages\/ingest-requests\/([^/]+)$/);
    if (request.method === 'POST' && ingestRequestMatch) {
      const payload = await request.json();
      return updateIngestRequest(env, ingestRequestMatch[1], payload);
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

async function getCapabilities(env) {
  const capabilities = await env.DB.prepare(`
    SELECT
      id,
      kind,
      name,
      status,
      category,
      summary,
      invocation,
      data_source,
      notes,
      sort_order,
      updated_at
    FROM agent_capabilities
    ORDER BY kind ASC, sort_order ASC, name ASC
  `).all();

  return json({ capabilities: capabilities.results });
}

async function getCheckinRuns(env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 10), 1), 50);
  const kind = url.searchParams.get('kind') || '';
  const status = url.searchParams.get('status') || '';
  const filters = [];
  const bindings = [];

  if (kind === 'morning' || kind === 'evening') {
    filters.push('kind = ?');
    bindings.push(kind);
  }

  if (status) {
    filters.push('status = ?');
    bindings.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const runs = await env.DB.prepare(`
    SELECT
      id,
      kind,
      status,
      scheduled_for,
      started_at,
      completed_at,
      title,
      body,
      calendar_context_json,
      message_context_json,
      model,
      error,
      created_at,
      updated_at
    FROM checkin_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ?
  `).bind(...bindings, limit).all();

  return json({ runs: runs.results.map(normalizeCheckinRun) });
}

async function upsertCheckinRun(env, payload) {
  const kind = normalizeCheckinKind(payload.kind);
  const status = normalizeCheckinStatus(payload.status);
  const id = cleanOptionalString(payload.id) || crypto.randomUUID();
  const calendarJson = payload.calendar_context_json
    ? String(payload.calendar_context_json)
    : payload.calendar_context
      ? JSON.stringify(payload.calendar_context)
      : null;
  const messageJson = payload.message_context_json
    ? String(payload.message_context_json)
    : payload.message_context
      ? JSON.stringify(payload.message_context)
      : null;

  await env.DB.prepare(`
    INSERT INTO checkin_runs (
      id,
      kind,
      status,
      scheduled_for,
      started_at,
      completed_at,
      title,
      body,
      calendar_context_json,
      message_context_json,
      model,
      error,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      status = excluded.status,
      scheduled_for = COALESCE(excluded.scheduled_for, checkin_runs.scheduled_for),
      started_at = COALESCE(excluded.started_at, checkin_runs.started_at),
      completed_at = COALESCE(excluded.completed_at, checkin_runs.completed_at),
      title = COALESCE(excluded.title, checkin_runs.title),
      body = COALESCE(excluded.body, checkin_runs.body),
      calendar_context_json = COALESCE(excluded.calendar_context_json, checkin_runs.calendar_context_json),
      message_context_json = COALESCE(excluded.message_context_json, checkin_runs.message_context_json),
      model = COALESCE(excluded.model, checkin_runs.model),
      error = excluded.error,
      updated_at = datetime('now')
  `).bind(
    id,
    kind,
    status,
    cleanOptionalString(payload.scheduled_for),
    cleanOptionalString(payload.started_at),
    cleanOptionalString(payload.completed_at),
    cleanOptionalString(payload.title),
    cleanOptionalString(payload.body),
    calendarJson,
    messageJson,
    cleanOptionalString(payload.model),
    cleanOptionalString(payload.error),
  ).run();

  const run = await env.DB.prepare(`
    SELECT *
    FROM checkin_runs
    WHERE id = ?
  `).bind(id).first();

  return json({ run: normalizeCheckinRun(run) }, status === 'running' ? 202 : 200);
}

function normalizeCheckinKind(value) {
  return value === 'morning' ? 'morning' : 'evening';
}

function normalizeCheckinStatus(value) {
  if (value === 'completed') return 'completed';
  if (value === 'failed') return 'failed';
  if (value === 'skipped') return 'skipped';
  return 'running';
}

function normalizeCheckinRun(run) {
  if (!run) return null;
  return {
    ...run,
    calendar_context: parseJsonField(run.calendar_context_json, null),
    message_context: parseJsonField(run.message_context_json, null),
  };
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function updateCapability(env, id, payload) {
  const existing = await env.DB.prepare(`
    SELECT *
    FROM agent_capabilities
    WHERE id = ?
  `).bind(id).first();

  if (!existing) {
    return json({ error: 'capability not found' }, 404);
  }

  const allowedStatuses = new Set(['active', 'planned', 'stub', 'broken', 'needs_test']);
  const status = payload.status === undefined ? existing.status : String(payload.status || '').trim();
  if (!status || (!allowedStatuses.has(status) && status.length > 40)) {
    return json({ error: 'invalid status' }, 400);
  }

  const sortOrder = payload.sort_order === undefined || payload.sort_order === null
    ? existing.sort_order
    : Number(payload.sort_order);
  const name = payload.name === undefined ? existing.name : cleanRequiredCapabilityString(payload.name);
  const summary = payload.summary === undefined ? existing.summary : cleanRequiredCapabilityString(payload.summary);
  if (!name) return json({ error: 'name cannot be empty' }, 400);
  if (!summary) return json({ error: 'summary cannot be empty' }, 400);

  await env.DB.prepare(`
    UPDATE agent_capabilities
    SET
      name = ?,
      status = ?,
      category = ?,
      summary = ?,
      invocation = ?,
      data_source = ?,
      notes = ?,
      sort_order = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    name,
    status,
    payload.category === undefined ? existing.category : cleanOptionalString(payload.category),
    summary,
    payload.invocation === undefined ? existing.invocation : cleanOptionalString(payload.invocation),
    payload.data_source === undefined ? existing.data_source : cleanOptionalString(payload.data_source),
    payload.notes === undefined ? existing.notes : cleanOptionalString(payload.notes),
    Number.isFinite(sortOrder) ? Math.floor(sortOrder) : existing.sort_order,
    id,
  ).run();

  const capability = await env.DB.prepare(`
    SELECT
      id,
      kind,
      name,
      status,
      category,
      summary,
      invocation,
      data_source,
      notes,
      sort_order,
      updated_at
    FROM agent_capabilities
    WHERE id = ?
  `).bind(id).first();

  return json({ capability });
}

function cleanOptionalString(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

function cleanRequiredCapabilityString(value) {
  return String(value ?? '').trim();
}

async function getInvoiceClients(env) {
  const clients = await env.DB.prepare(`
    SELECT
      client_key,
      client_name,
      next_invoice_number,
      last_invoice_number,
      invoice_digits,
      created_at,
      updated_at
    FROM invoice_clients
    ORDER BY client_name ASC
  `).all();

  return json({ clients: clients.results.map(withFormattedInvoiceNumbers) });
}

async function setInvoiceClientCounter(env, payload) {
  const clientName = cleanRequiredString(payload.client || payload.client_name, 'client');
  if (clientName.error) return clientName.error;

  const nextNumber = parsePositiveInteger(payload.next_invoice_number || payload.next_number || payload.next, 1);
  if (!nextNumber) return json({ error: 'next_invoice_number must be a positive integer' }, 400);

  const invoiceDigits = parseInvoiceDigits(payload.invoice_digits);
  const clientKey = keyForInvoiceClient(clientName.value);

  await env.DB.prepare(`
    INSERT INTO invoice_clients (
      client_key, client_name, next_invoice_number, last_invoice_number, invoice_digits, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(client_key) DO UPDATE SET
      client_name = excluded.client_name,
      next_invoice_number = excluded.next_invoice_number,
      last_invoice_number = excluded.next_invoice_number - 1,
      invoice_digits = excluded.invoice_digits,
      updated_at = datetime('now')
  `).bind(clientKey, clientName.value, nextNumber, nextNumber - 1, invoiceDigits).run();

  const client = await env.DB.prepare(`
    SELECT *
    FROM invoice_clients
    WHERE client_key = ?
  `).bind(clientKey).first();

  return json({ client: withFormattedInvoiceNumbers(client) });
}

async function reserveInvoiceNumber(env, payload) {
  const clientName = cleanRequiredString(payload.client || payload.client_name, 'client');
  if (clientName.error) return clientName.error;

  const requestedDigits = parseInvoiceDigits(payload.invoice_digits);
  const clientKey = keyForInvoiceClient(clientName.value);

  await env.DB.prepare(`
    INSERT INTO invoice_clients (
      client_key, client_name, next_invoice_number, last_invoice_number, invoice_digits, created_at, updated_at
    ) VALUES (?, ?, 1, 0, ?, datetime('now'), datetime('now'))
    ON CONFLICT(client_key) DO UPDATE SET
      client_name = excluded.client_name,
      invoice_digits = excluded.invoice_digits,
      updated_at = datetime('now')
  `).bind(clientKey, clientName.value, requestedDigits).run();

  const client = await env.DB.prepare(`
    UPDATE invoice_clients
    SET
      last_invoice_number = next_invoice_number,
      next_invoice_number = next_invoice_number + 1,
      updated_at = datetime('now')
    WHERE client_key = ?
    RETURNING *
  `).bind(clientKey).first();

  const invoiceNumberInt = Number(client.last_invoice_number);
  const invoiceNumber = formatInvoiceNumber(invoiceNumberInt, client.invoice_digits);

  return json({
    client: withFormattedInvoiceNumbers(client),
    invoice_number: invoiceNumber,
    invoice_number_int: invoiceNumberInt,
  }, 201);
}

async function recordInvoice(env, payload) {
  const clientName = cleanRequiredString(payload.client || payload.client_name, 'client');
  if (clientName.error) return clientName.error;

  const invoiceNumber = String(payload.invoice_number || '').trim();
  if (!invoiceNumber) return json({ error: 'missing invoice_number' }, 400);

  const invoiceNumberInt = parseInvoiceNumberInt(payload.invoice_number_int, invoiceNumber);
  const invoiceDigits = parseInvoiceDigits(payload.invoice_digits);
  const clientKey = keyForInvoiceClient(clientName.value);
  const total = payload.total === undefined || payload.total === null ? null : Number(payload.total);
  const pdfPath = payload.pdf_path ? String(payload.pdf_path) : null;

  await env.DB.prepare(`
    INSERT INTO invoice_clients (
      client_key, client_name, next_invoice_number, last_invoice_number, invoice_digits, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(client_key) DO UPDATE SET
      client_name = excluded.client_name,
      next_invoice_number = CASE
        WHEN excluded.next_invoice_number > next_invoice_number THEN excluded.next_invoice_number
        ELSE next_invoice_number
      END,
      last_invoice_number = CASE
        WHEN excluded.last_invoice_number > last_invoice_number THEN excluded.last_invoice_number
        ELSE last_invoice_number
      END,
      invoice_digits = excluded.invoice_digits,
      updated_at = datetime('now')
  `).bind(
    clientKey,
    clientName.value,
    invoiceNumberInt ? invoiceNumberInt + 1 : 1,
    invoiceNumberInt || 0,
    invoiceDigits,
  ).run();

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO invoice_records (
      id, client_key, client_name, invoice_number, invoice_number_int, total, pdf_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(client_key, invoice_number) DO UPDATE SET
      client_name = excluded.client_name,
      invoice_number_int = excluded.invoice_number_int,
      total = excluded.total,
      pdf_path = excluded.pdf_path
  `).bind(id, clientKey, clientName.value, invoiceNumber, invoiceNumberInt, total, pdfPath).run();

  const record = await env.DB.prepare(`
    SELECT *
    FROM invoice_records
    WHERE client_key = ? AND invoice_number = ?
  `).bind(clientKey, invoiceNumber).first();
  const client = await env.DB.prepare(`
    SELECT *
    FROM invoice_clients
    WHERE client_key = ?
  `).bind(clientKey).first();

  return json({ record, client: withFormattedInvoiceNumbers(client) }, 201);
}

function cleanRequiredString(value, field) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return { error: json({ error: `missing ${field}` }, 400) };
  return { value: cleaned };
}

function keyForInvoiceClient(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 160) || 'unknown';
}

function parseInvoiceDigits(value) {
  const parsed = Number(value || 3);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(Math.floor(parsed), 1), 12);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  return integer >= 1 ? integer : null;
}

function parseInvoiceNumberInt(value, invoiceNumber) {
  if (value !== undefined && value !== null && value !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  }

  const digits = String(invoiceNumber || '').match(/\d+/g);
  if (!digits?.length) return null;
  const parsed = Number(digits[digits.length - 1]);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
}

function formatInvoiceNumber(value, digits) {
  return String(value).padStart(digits, '0');
}

function withFormattedInvoiceNumbers(client) {
  if (!client) return null;
  return {
    ...client,
    next_invoice_number_formatted: formatInvoiceNumber(client.next_invoice_number, client.invoice_digits),
    last_invoice_number_formatted: formatInvoiceNumber(client.last_invoice_number, client.invoice_digits),
  };
}

async function getMessagesOverview(env, url) {
  const windowDays = normalizeOverviewWindow(url.searchParams.get('window_days'));
  const latestRun = await env.DB.prepare(`
    SELECT * FROM message_sync_runs
    ORDER BY exported_at DESC
    LIMIT 1
  `).first();

  const overview = windowDays === 7
    ? await getCachedMessageWindow(env, latestRun, windowDays)
    : await getStoredMessageWindow(env, latestRun);

  const latestIngestRequest = await env.DB.prepare(`
    SELECT *
    FROM message_ingest_requests
    ORDER BY requested_at DESC
    LIMIT 1
  `).first();

  return json({
    status: latestRun ? 'active' : 'pending',
    latestRun: overview.run,
    latestIngestRequest,
    topConversations: overview.conversations,
  });
}

async function getStoredMessageWindow(env, latestRun) {
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
    WHERE message_count > 0
    ORDER BY message_count DESC, last_active DESC
  `).all();

  return {
    run: latestRun,
    conversations: top.results,
  };
}

async function getCachedMessageWindow(env, latestRun, windowDays) {
  const conversations = await env.DB.prepare(`
    SELECT
      c.conversation_key,
      c.display_name,
      c.handle,
      c.chat_type,
      COUNT(*) AS message_count,
      SUM(CASE WHEN i.direction = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN i.direction != 'sent' THEN 1 ELSE 0 END) AS received_count,
      MAX(i.timestamp) AS last_active
    FROM message_items i
    JOIN message_conversations c ON c.conversation_key = i.conversation_key
    WHERE datetime(i.timestamp) >= datetime('now', ?)
    GROUP BY c.conversation_key, c.display_name, c.handle, c.chat_type
    HAVING message_count > 0
    ORDER BY message_count DESC, last_active DESC
  `).bind(`-${windowDays} days`).all();

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_messages,
      SUM(CASE WHEN direction = 'sent' THEN 1 ELSE 0 END) AS sent_messages,
      SUM(CASE WHEN direction != 'sent' THEN 1 ELSE 0 END) AS received_messages,
      COUNT(DISTINCT conversation_key) AS conversation_count,
      MAX(timestamp) AS last_message_at
    FROM message_items
    WHERE datetime(timestamp) >= datetime('now', ?)
  `).bind(`-${windowDays} days`).first();

  return {
    run: {
      ...(latestRun || {}),
      window_days: windowDays,
      total_messages: stats?.total_messages || 0,
      sent_messages: stats?.sent_messages || 0,
      received_messages: stats?.received_messages || 0,
      conversation_count: stats?.conversation_count || conversations.results.length,
      last_message_at: stats?.last_message_at || null,
    },
    conversations: conversations.results,
  };
}

function normalizeOverviewWindow(value) {
  return Number(value) === 7 ? 7 : 30;
}

async function getMessageConversations(env, url) {
  const limit = parseLimit(url.searchParams.get('limit'), 100);
  const limitClause = limit === null ? '' : 'LIMIT ?';
  const bindings = limit === null ? [] : [limit];
  const conversations = await env.DB.prepare(`
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
    WHERE message_count > 0
    ORDER BY message_count DESC, last_active DESC
    ${limitClause}
  `).bind(...bindings).all();

  return json({ conversations: conversations.results });
}

async function getConversationDetail(env, url) {
  const conversationKey = url.searchParams.get('conversation_key') || '';
  if (!conversationKey) {
    return json({ error: 'missing conversation_key' }, 400);
  }
  const limit = parseLimit(url.searchParams.get('limit'), 20);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const since = url.searchParams.get('since') || '';
  const until = url.searchParams.get('until') || '';
  const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

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

  const messageFilters = ['conversation_key = ?'];
  const messageBindings = [conversationKey];
  if (since) {
    messageFilters.push('timestamp >= ?');
    messageBindings.push(since);
  }
  if (until) {
    messageFilters.push('timestamp <= ?');
    messageBindings.push(until);
  }
  const limitClause = limit === null ? (offset > 0 ? 'LIMIT -1' : '') : 'LIMIT ?';
  const offsetClause = offset > 0 ? 'OFFSET ?' : '';
  if (limit !== null) messageBindings.push(limit);
  if (offset > 0) messageBindings.push(offset);

  const recent = await env.DB.prepare(`
    SELECT timestamp, direction, chat_type, body
    FROM message_items
    WHERE ${messageFilters.join(' AND ')}
    ORDER BY timestamp ${order}
    ${limitClause}
    ${offsetClause}
  `).bind(...messageBindings).all();

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

function parseLimit(value, defaultValue) {
  if (value === 'all' || value === '0') return null;
  const parsed = Number(value || defaultValue);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(Math.floor(parsed), 1);
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

async function requestIngest(env) {
  const existing = await env.DB.prepare(`
    SELECT *
    FROM message_ingest_requests
    WHERE status IN ('queued', 'running')
    ORDER BY requested_at DESC
    LIMIT 1
  `).first();

  if (existing) {
    return json({ request: existing, reused: true }, 202);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO message_ingest_requests (
      id, status, requested_at, updated_at
    ) VALUES (?, 'queued', datetime('now'), datetime('now'))
  `).bind(id).run();

  const request = await env.DB.prepare(`
    SELECT *
    FROM message_ingest_requests
    WHERE id = ?
  `).bind(id).first();

  return json({ request, reused: false }, 202);
}

async function getIngestRequests(env, url) {
  const status = url.searchParams.get('status') || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 20);
  const allowed = new Set(['queued', 'running', 'completed', 'failed']);

  if (allowed.has(status)) {
    const requests = await env.DB.prepare(`
      SELECT *
      FROM message_ingest_requests
      WHERE status = ?
      ORDER BY requested_at ASC
      LIMIT ?
    `).bind(status, limit).all();
    return json({ requests: requests.results });
  }

  const requests = await env.DB.prepare(`
    SELECT *
    FROM message_ingest_requests
    ORDER BY requested_at DESC
    LIMIT ?
  `).bind(limit).all();
  return json({ requests: requests.results });
}

async function updateIngestRequest(env, id, payload) {
  const status = normalizeIngestRequestStatus(payload.status);
  await env.DB.prepare(`
    UPDATE message_ingest_requests
    SET
      status = ?,
      started_at = CASE
        WHEN ? = 'running' THEN COALESCE(started_at, datetime('now'))
        ELSE started_at
      END,
      completed_at = CASE
        WHEN ? IN ('completed', 'failed') THEN COALESCE(?, datetime('now'))
        ELSE completed_at
      END,
      error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    status,
    status,
    status,
    payload.completed_at || null,
    payload.error || null,
    id,
  ).run();

  const request = await env.DB.prepare(`
    SELECT *
    FROM message_ingest_requests
    WHERE id = ?
  `).bind(id).first();

  if (!request) {
    return json({ error: 'ingest request not found' }, 404);
  }

  return json({ request });
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
  const status = normalizeSummaryStatus(payload.status);
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

function normalizeSummaryStatus(value) {
  if (value === 'failed') return 'failed';
  if (value === 'running') return 'running';
  return 'completed';
}

function normalizeIngestRequestStatus(value) {
  if (value === 'failed') return 'failed';
  if (value === 'running') return 'running';
  if (value === 'queued') return 'queued';
  return 'completed';
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
  await env.DB.prepare(`
    UPDATE message_conversations
    SET message_count = 0,
        sent_count = 0,
        received_count = 0,
        updated_at = datetime('now')
  `).run();

  const conversationKeys = new Set();
  const conversationStatements = [];
  for (const conversation of conversations) {
    const conversationKey = keyForConversation(conversation);
    conversationKeys.add(conversationKey);
    conversationStatements.push(env.DB.prepare(`
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
    ));
  }
  await runBatches(env, conversationStatements);

  const storedRows = await env.DB.prepare(`
    SELECT conversation_key
    FROM message_conversations
  `).all();
  const storedConversationKeys = new Set(storedRows.results.map((row) => row.conversation_key));

  const messageStatements = [];
  for (const item of recentMessages) {
    const conversationKey = keyForConversation(item);
    if (!conversationKeys.has(conversationKey) || !storedConversationKeys.has(conversationKey)) continue;

    messageStatements.push(env.DB.prepare(`
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
    ));
  }
  await runBatches(env, messageStatements);

  return json({
    ok: true,
    runId,
    conversations: conversations.length,
    recentMessages: messageStatements.length,
  }, 201);
}

async function runBatches(env, statements, size = 100) {
  for (let index = 0; index < statements.length; index += size) {
    await env.DB.batch(statements.slice(index, index + size));
  }
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
