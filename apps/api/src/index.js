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

export class MessageJobWake {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.waiters = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/wait') {
      return this.wait(url);
    }

    if (request.method === 'POST' && url.pathname === '/wake') {
      const payload = await request.json().catch(() => ({}));
      return this.wake(payload.reason || 'message_job');
    }

    return json({ error: 'not found' }, 404);
  }

  wait(url) {
    const timeoutSeconds = Math.min(Math.max(Number(url.searchParams.get('timeout') || 300), 1), 300);

    return new Promise((resolve) => {
      const waiter = {
        resolve,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve(json({
            woken: false,
            reason: 'timeout',
            waited_seconds: timeoutSeconds,
            returned_at: new Date().toISOString(),
          }));
        }, timeoutSeconds * 1000),
      };
      this.waiters.add(waiter);
    });
  }

  wake(reason) {
    const waiters = Array.from(this.waiters);
    this.waiters.clear();
    const payload = {
      woken: true,
      reason,
      woken_at: new Date().toISOString(),
    };

    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(json(payload));
    }

    return json({ ...payload, waiters: waiters.length });
  }
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

    if (request.method === 'GET' && url.pathname === '/api/styles') {
      return getStyleEntries(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/styles') {
      return upsertStyleEntry(env, null, await request.json());
    }

    const styleMatch = url.pathname.match(/^\/api\/styles\/([^/]+)$/);
    if (request.method === 'POST' && styleMatch) {
      return upsertStyleEntry(env, decodeURIComponent(styleMatch[1]), await request.json());
    }

    if (request.method === 'GET' && url.pathname === '/api/sources') {
      return getSourceEntries(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/sources') {
      return upsertSourceEntry(env, null, await request.json());
    }

    const sourceMatch = url.pathname.match(/^\/api\/sources\/([^/]+)$/);
    if (request.method === 'POST' && sourceMatch) {
      return upsertSourceEntry(env, decodeURIComponent(sourceMatch[1]), await request.json());
    }

    if (request.method === 'GET' && url.pathname === '/api/future-events') {
      return getFutureEvents(env);
    }

    if (request.method === 'POST' && url.pathname === '/api/future-events') {
      return upsertFutureEvent(env, null, await request.json());
    }

    const futureEventMatch = url.pathname.match(/^\/api\/future-events\/([^/]+)$/);
    if (request.method === 'POST' && futureEventMatch) {
      return upsertFutureEvent(env, decodeURIComponent(futureEventMatch[1]), await request.json());
    }

    if (request.method === 'GET' && url.pathname === '/api/mantra') {
      return getMantra(env);
    }

    if (request.method === 'POST' && url.pathname === '/api/mantra') {
      const payload = await request.json();
      return updateMantra(env, payload);
    }

    if (request.method === 'GET' && url.pathname === '/api/memory') {
      return getMemory(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/memory/history') {
      const payload = await request.json();
      return upsertHistoryEntry(env, payload);
    }

    if (request.method === 'POST' && url.pathname === '/api/memory/notes') {
      const payload = await request.json();
      return upsertMemoryNote(env, payload);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/memory/notes/')) {
      return archiveMemoryNote(env, decodeURIComponent(url.pathname.slice('/api/memory/notes/'.length)));
    }

    if (request.method === 'POST' && url.pathname === '/api/memory/people') {
      const payload = await request.json();
      return upsertPeopleNote(env, payload);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/memory/people/')) {
      return archivePeopleNote(env, decodeURIComponent(url.pathname.slice('/api/memory/people/'.length)));
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

    if (request.method === 'GET' && url.pathname === '/api/messages/jobs/wait') {
      return waitForMessageJobs(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/summary-request') {
      const payload = await request.json();
      return requestSummary(env, payload);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages/view-summary') {
      return getViewSummary(env, url);
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/view-summary-request') {
      const payload = await request.json();
      return requestViewSummary(env, payload);
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

    if (request.method === 'GET' && url.pathname === '/api/messages/view-summary-jobs') {
      return getViewSummaryJobs(env, url);
    }

    const completeViewMatch = url.pathname.match(/^\/api\/messages\/view-summary-jobs\/([^/]+)$/);
    if (request.method === 'POST' && completeViewMatch) {
      const payload = await request.json();
      return completeViewSummaryJob(env, completeViewMatch[1], payload);
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

async function getStyleEntries(env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
  const kind = String(url.searchParams.get('kind') || '').trim();
  const entries = kind
    ? await env.DB.prepare('SELECT * FROM style_entries WHERE kind = ? ORDER BY updated_at DESC LIMIT ?').bind(kind, limit).all()
    : await env.DB.prepare('SELECT * FROM style_entries ORDER BY updated_at DESC LIMIT ?').bind(limit).all();
  return json({ entries: entries.results.map(normalizeStyleEntry) });
}

function normalizeStyleTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof tags !== 'string') return [];
  const parsed = parseJson(tags, null);
  return Array.isArray(parsed) ? normalizeStyleTags(parsed) : tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function styleSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function normalizeStyleEntry(entry) {
  return entry ? { ...entry, tags: parseJson(entry.tags_json, []) } : null;
}

async function upsertStyleEntry(env, id, payload) {
  const requestedId = String(id || payload.id || '').trim();
  const existing = requestedId ? await env.DB.prepare('SELECT * FROM style_entries WHERE id = ?').bind(requestedId).first() : null;
  const sourceText = String(payload.source_text || payload.sourceText || existing?.source_text || '').trim();
  if (!sourceText) return json({ error: 'missing source_text' }, 400);

  const entry = {
    id: requestedId || styleSlug(sourceText) || crypto.randomUUID(),
    source_text: sourceText,
    kind: payload.kind ? String(payload.kind).trim() : existing?.kind || null,
    url: payload.url ? String(payload.url).trim() : existing?.url || null,
    preview_url: payload.preview_url ? String(payload.preview_url).trim() : existing?.preview_url || null,
    captured_at: payload.captured_at ? String(payload.captured_at).trim() : existing?.captured_at || null,
    context: payload.context ? String(payload.context).trim() : existing?.context || null,
    notes: payload.notes ? String(payload.notes).trim() : existing?.notes || null,
    tags_json: JSON.stringify(normalizeStyleTags(payload.tags ?? payload.tags_json ?? existing?.tags_json)),
    file_path: payload.file_path ? String(payload.file_path).trim() : existing?.file_path || null,
  };

  await env.DB.prepare(`
    INSERT INTO style_entries (id, source_text, kind, url, preview_url, captured_at, context, notes, tags_json, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET source_text = excluded.source_text, kind = excluded.kind, url = excluded.url,
      preview_url = excluded.preview_url, captured_at = excluded.captured_at, context = excluded.context, notes = excluded.notes,
      tags_json = excluded.tags_json, file_path = excluded.file_path, updated_at = datetime('now')
  `).bind(entry.id, entry.source_text, entry.kind, entry.url, entry.preview_url, entry.captured_at, entry.context, entry.notes, entry.tags_json, entry.file_path).run();

  return json({ entry: normalizeStyleEntry(await env.DB.prepare('SELECT * FROM style_entries WHERE id = ?').bind(entry.id).first()) }, 201);
}

async function getSourceEntries(env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
  const type = String(url.searchParams.get('type') || '').trim();
  const entries = type
    ? await env.DB.prepare('SELECT * FROM source_entries WHERE type = ? ORDER BY added_at DESC LIMIT ?').bind(type, limit).all()
    : await env.DB.prepare('SELECT * FROM source_entries ORDER BY added_at DESC LIMIT ?').bind(limit).all();
  return json({ entries: entries.results.map(normalizeSourceEntry) });
}

function normalizeSourceEntry(entry) {
  return entry ? { ...entry, tags: parseJson(entry.tags_json, []) } : null;
}

async function upsertSourceEntry(env, id, payload) {
  const requestedId = String(id || payload.id || '').trim();
  const existing = requestedId ? await env.DB.prepare('SELECT * FROM source_entries WHERE id = ?').bind(requestedId).first() : null;
  const sourceText = String(payload.source_text || payload.sourceText || existing?.source_text || '').trim();
  if (!sourceText) return json({ error: 'missing source_text' }, 400);

  const entry = {
    id: requestedId || styleSlug(sourceText) || crypto.randomUUID(),
    source_text: sourceText,
    type: payload.type ? String(payload.type).trim() : existing?.type || null,
    context: payload.context ? String(payload.context).trim() : existing?.context || null,
    creator: payload.creator ? String(payload.creator).trim() : existing?.creator || null,
    year: payload.year ? String(payload.year).trim() : existing?.year || null,
    url: payload.url ? String(payload.url).trim() : existing?.url || null,
    file_path: payload.file_path ? String(payload.file_path).trim() : existing?.file_path || null,
    preview_url: payload.preview_url ? String(payload.preview_url).trim() : existing?.preview_url || null,
    tags_json: JSON.stringify(normalizeStyleTags(payload.tags ?? payload.tags_json ?? existing?.tags_json)),
  };

  await env.DB.prepare(`
    INSERT INTO source_entries (id, source_text, type, context, creator, year, url, file_path, preview_url, tags_json, added_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET source_text = excluded.source_text, type = excluded.type, context = excluded.context,
      creator = excluded.creator, year = excluded.year, url = excluded.url, file_path = excluded.file_path,
      preview_url = excluded.preview_url, tags_json = excluded.tags_json, updated_at = datetime('now')
  `).bind(entry.id, entry.source_text, entry.type, entry.context, entry.creator, entry.year, entry.url, entry.file_path, entry.preview_url, entry.tags_json).run();

  return json({ entry: normalizeSourceEntry(await env.DB.prepare('SELECT * FROM source_entries WHERE id = ?').bind(entry.id).first()) }, 201);
}

async function getFutureEvents(env) {
  const entries = await env.DB.prepare(`
    SELECT * FROM future_events
    WHERE status != 'archived'
    ORDER BY CASE WHEN next_start IS NULL THEN 1 ELSE 0 END, next_start ASC, watch_month ASC, name ASC
  `).all();
  return json({ entries: entries.results.map(normalizeFutureEvent) });
}

function normalizeFutureEvent(entry) {
  return entry ? { ...entry, tags: parseJson(entry.tags_json, []) } : null;
}

async function upsertFutureEvent(env, id, payload) {
  const requestedId = String(id || payload.id || '').trim();
  const existing = requestedId ? await env.DB.prepare('SELECT * FROM future_events WHERE id = ?').bind(requestedId).first() : null;
  const name = String(payload.name || existing?.name || '').trim();
  if (!name) return json({ error: 'missing name' }, 400);

  const text = (value, fallback = null) => value === undefined ? fallback : (String(value).trim() || null);
  const entry = {
    id: requestedId || styleSlug(name) || crypto.randomUUID(),
    name,
    url: text(payload.url, existing?.url),
    description: text(payload.description, existing?.description),
    location: text(payload.location, existing?.location),
    cadence: text(payload.cadence, existing?.cadence || 'annual') || 'annual',
    last_start: text(payload.last_start, existing?.last_start),
    last_end: text(payload.last_end, existing?.last_end),
    next_start: text(payload.next_start, existing?.next_start),
    next_end: text(payload.next_end, existing?.next_end),
    watch_month: payload.watch_month === undefined ? existing?.watch_month ?? null : Math.min(Math.max(Number(payload.watch_month), 1), 12),
    status: text(payload.status, existing?.status || 'watching') || 'watching',
    notes: text(payload.notes, existing?.notes),
    tags_json: JSON.stringify(normalizeStyleTags(payload.tags ?? payload.tags_json ?? existing?.tags_json)),
  };

  await env.DB.prepare(`
    INSERT INTO future_events (id, name, url, description, location, cadence, last_start, last_end, next_start, next_end, watch_month, status, notes, tags_json, added_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, description = excluded.description,
      location = excluded.location, cadence = excluded.cadence, last_start = excluded.last_start, last_end = excluded.last_end,
      next_start = excluded.next_start, next_end = excluded.next_end, watch_month = excluded.watch_month,
      status = excluded.status, notes = excluded.notes, tags_json = excluded.tags_json, updated_at = datetime('now')
  `).bind(entry.id, entry.name, entry.url, entry.description, entry.location, entry.cadence, entry.last_start, entry.last_end,
    entry.next_start, entry.next_end, entry.watch_month, entry.status, entry.notes, entry.tags_json).run();

  return json({ entry: normalizeFutureEvent(await env.DB.prepare('SELECT * FROM future_events WHERE id = ?').bind(entry.id).first()) }, 201);
}

async function getMantra(env) {
  const mantra = await env.DB.prepare(`
    SELECT id, body, created_at, updated_at
    FROM mantra_state
    WHERE id = 'current'
  `).first();

  return json({
    mantra: mantra || {
      id: 'current',
      body: '',
      created_at: null,
      updated_at: null,
    },
  });
}

async function updateMantra(env, payload) {
  const body = String(payload.body ?? '').trim().slice(0, 4000);
  await env.DB.prepare(`
    INSERT INTO mantra_state (id, body, created_at, updated_at)
    VALUES ('current', ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      body = excluded.body,
      updated_at = datetime('now')
  `).bind(body).run();

  return getMantra(env);
}

async function getMemory(env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 120), 1), 500);
  const noteLimit = Math.min(Math.max(Number(url.searchParams.get('note_limit') || 80), 1), 250);
  const selectedDate = cleanOptionalString(url.searchParams.get('date'));

  const dates = await env.DB.prepare(`
    SELECT
      entry_date,
      COUNT(*) AS entry_count,
      MAX(updated_at) AS updated_at
    FROM history_entries
    GROUP BY entry_date
    ORDER BY entry_date DESC
    LIMIT ?
  `).bind(limit).all();

  const activeDate = selectedDate || dates.results[0]?.entry_date || null;
  const entries = activeDate
    ? await env.DB.prepare(`
        SELECT
          id,
          entry_date,
          title,
          body,
          source_type,
          source_label,
          source_ref,
          created_at,
          updated_at
        FROM history_entries
        WHERE entry_date = ?
        ORDER BY created_at ASC, title ASC
      `).bind(activeDate).all()
    : { results: [] };

  const memoryNotes = await env.DB.prepare(`
    SELECT
      id,
      profile,
      title,
      body,
      status,
      source_type,
      source_label,
      source_ref,
      created_at,
      updated_at
    FROM memory_notes
    WHERE status = 'active'
    ORDER BY updated_at DESC, created_at DESC, title ASC
    LIMIT ?
  `).bind(noteLimit).all();

  const peopleNotes = await env.DB.prepare(`
    SELECT
      id,
      person_key,
      person_name,
      body,
      status,
      source_type,
      source_label,
      source_ref,
      created_at,
      updated_at
    FROM people_notes
    WHERE status = 'active'
    ORDER BY updated_at DESC, created_at DESC, person_name ASC
    LIMIT ?
  `).bind(noteLimit).all();

  return json({
    activeDate,
    dates: dates.results,
    entries: entries.results,
    memoryNotes: memoryNotes.results,
    peopleNotes: peopleNotes.results,
  });
}

async function upsertHistoryEntry(env, payload) {
  const entryDate = normalizeDate(payload.entry_date || payload.date);
  if (!entryDate) return json({ error: 'missing valid entry_date' }, 400);

  const title = cleanRequiredString(payload.title, 'title');
  if (title.error) return title.error;
  const body = cleanRequiredString(payload.body || payload.content, 'body');
  if (body.error) return body.error;
  const id = cleanOptionalString(payload.id) || crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO history_entries (
      id,
      entry_date,
      title,
      body,
      source_type,
      source_label,
      source_ref,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      entry_date = excluded.entry_date,
      title = excluded.title,
      body = excluded.body,
      source_type = excluded.source_type,
      source_label = excluded.source_label,
      source_ref = excluded.source_ref,
      updated_at = datetime('now')
  `).bind(
    id,
    entryDate,
    title.value,
    body.value,
    cleanOptionalString(payload.source_type),
    cleanOptionalString(payload.source_label),
    cleanOptionalString(payload.source_ref),
  ).run();

  const entry = await env.DB.prepare(`
    SELECT *
    FROM history_entries
    WHERE id = ?
  `).bind(id).first();

  return json({ entry }, 201);
}

async function upsertMemoryNote(env, payload) {
  const title = cleanRequiredString(payload.title, 'title');
  if (title.error) return title.error;
  const body = cleanRequiredString(payload.body || payload.content, 'body');
  if (body.error) return body.error;

  const id = cleanOptionalString(payload.id) || crypto.randomUUID();
  const profile = normalizeProfile(payload.profile);
  const status = normalizeMemoryStatus(payload.status);

  await env.DB.prepare(`
    INSERT INTO memory_notes (
      id,
      profile,
      title,
      body,
      status,
      source_type,
      source_label,
      source_ref,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      profile = excluded.profile,
      title = excluded.title,
      body = excluded.body,
      status = excluded.status,
      source_type = excluded.source_type,
      source_label = excluded.source_label,
      source_ref = excluded.source_ref,
      updated_at = datetime('now')
  `).bind(
    id,
    profile,
    title.value,
    body.value,
    status,
    cleanOptionalString(payload.source_type),
    cleanOptionalString(payload.source_label),
    cleanOptionalString(payload.source_ref),
  ).run();

  const note = await env.DB.prepare(`
    SELECT *
    FROM memory_notes
    WHERE id = ?
  `).bind(id).first();

  return json({ note }, 201);
}

async function upsertPeopleNote(env, payload) {
  const personName = cleanRequiredString(payload.person_name || payload.person, 'person_name');
  if (personName.error) return personName.error;
  const body = cleanRequiredString(payload.body || payload.content, 'body');
  if (body.error) return body.error;

  const id = cleanOptionalString(payload.id) || crypto.randomUUID();
  const personKey = cleanOptionalString(payload.person_key) || keyForInvoiceClient(personName.value);
  const status = normalizeMemoryStatus(payload.status);

  await env.DB.prepare(`
    INSERT INTO people_notes (
      id,
      person_key,
      person_name,
      body,
      status,
      source_type,
      source_label,
      source_ref,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      person_key = excluded.person_key,
      person_name = excluded.person_name,
      body = excluded.body,
      status = excluded.status,
      source_type = excluded.source_type,
      source_label = excluded.source_label,
      source_ref = excluded.source_ref,
      updated_at = datetime('now')
  `).bind(
    id,
    personKey,
    personName.value,
    body.value,
    status,
    cleanOptionalString(payload.source_type),
    cleanOptionalString(payload.source_label),
    cleanOptionalString(payload.source_ref),
  ).run();

  const note = await env.DB.prepare(`
    SELECT *
    FROM people_notes
    WHERE id = ?
  `).bind(id).first();

  return json({ note }, 201);
}

async function archiveMemoryNote(env, id) {
  const noteId = cleanOptionalString(id);
  if (!noteId) return json({ error: 'missing note id' }, 400);

  const result = await env.DB.prepare(`
    UPDATE memory_notes
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ?
  `).bind(noteId).run();

  if (!result.meta?.changes) return json({ error: 'memory note not found' }, 404);
  return json({ deleted: true, id: noteId, kind: 'memory' });
}

async function archivePeopleNote(env, id) {
  const noteId = cleanOptionalString(id);
  if (!noteId) return json({ error: 'missing note id' }, 400);

  const result = await env.DB.prepare(`
    UPDATE people_notes
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ?
  `).bind(noteId).run();

  if (!result.meta?.changes) return json({ error: 'people note not found' }, 404);
  return json({ deleted: true, id: noteId, kind: 'person' });
}

function normalizeProfile(value) {
  const profile = String(value || 'personal').trim().toLowerCase();
  if (profile === 'creative' || profile === 'bioinformatics') return profile;
  return 'personal';
}

function normalizeMemoryStatus(value) {
  const status = String(value || 'active').trim().toLowerCase();
  if (status === 'archived' || status === 'inactive') return status;
  return 'active';
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : raw;
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


async function waitForMessageJobs(env, url) {
  const stub = messageJobWakeStub(env);
  if (!stub) {
    return json({ error: 'message job wake channel is not configured' }, 503);
  }

  const timeout = Math.min(Math.max(Number(url.searchParams.get('timeout') || 300), 1), 300);
  return stub.fetch(new Request(`https://message-job-wake/wait?timeout=${timeout}`, { method: 'GET' }));
}

async function wakeMessageJobs(env, reason) {
  const stub = messageJobWakeStub(env);
  if (!stub) return;

  try {
    await stub.fetch(new Request('https://message-job-wake/wake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }));
  } catch (error) {
    console.error('message job wake failed', error);
  }
}

function messageJobWakeStub(env) {
  if (!env.MESSAGE_JOB_WAKE) return null;
  const id = env.MESSAGE_JOB_WAKE.idFromName('messages');
  return env.MESSAGE_JOB_WAKE.get(id);
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
    if (existing.status === 'queued') {
      await wakeMessageJobs(env, 'summary_reused');
    }
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

  await wakeMessageJobs(env, 'summary_requested');

  return json({ summary: normalizeSummary(summary), reused: false }, 202);
}

async function getViewSummary(env, url) {
  const windowDays = normalizeOverviewWindow(url.searchParams.get('window_days'));
  const listLimit = normalizeViewListLimit(url.searchParams.get('list_limit'));
  const conversationKeys = normalizeConversationKeys(url.searchParams.getAll('conversation_key'));

  let summary;
  if (conversationKeys.length) {
    const viewKey = await viewKeyFor(windowDays, listLimit, conversationKeys);
    summary = await env.DB.prepare(`
      SELECT *
      FROM message_view_summaries
      WHERE view_key = ?
      ORDER BY requested_at DESC
      LIMIT 1
    `).bind(viewKey).first();
  } else {
    summary = await env.DB.prepare(`
      SELECT *
      FROM message_view_summaries
      WHERE window_days = ?
        AND list_limit = ?
      ORDER BY requested_at DESC
      LIMIT 1
    `).bind(windowDays, listLimit).first();
  }

  return json({ summary: normalizeViewSummary(summary) });
}

async function requestViewSummary(env, payload) {
  const windowDays = normalizeOverviewWindow(payload.window_days);
  const listLimit = normalizeViewListLimit(payload.list_limit);
  const conversationKeys = normalizeConversationKeys(payload.conversation_keys);
  if (!conversationKeys.length) {
    return json({ error: 'conversation_keys required' }, 400);
  }

  const viewKey = await viewKeyFor(windowDays, listLimit, conversationKeys);
  const existing = await env.DB.prepare(`
    SELECT *
    FROM message_view_summaries
    WHERE view_key = ?
      AND status IN ('queued', 'running')
    ORDER BY requested_at DESC
    LIMIT 1
  `).bind(viewKey).first();

  if (existing) {
    if (existing.status === 'queued') {
      await wakeMessageJobs(env, 'view_summary_reused');
    }
    return json({ summary: normalizeViewSummary(existing), reused: true }, 202);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO message_view_summaries (
      id, view_key, window_days, list_limit, conversation_keys_json,
      conversation_count, status, requested_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))
  `).bind(
    id,
    viewKey,
    windowDays,
    listLimit,
    JSON.stringify(conversationKeys),
    conversationKeys.length,
  ).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM message_view_summaries
    WHERE id = ?
  `).bind(id).first();

  await wakeMessageJobs(env, 'view_summary_requested');

  return json({ summary: normalizeViewSummary(summary), reused: false }, 202);
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
    if (existing.status === 'queued') {
      await wakeMessageJobs(env, 'ingest_reused');
    }
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

  await wakeMessageJobs(env, 'ingest_requested');

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

async function getViewSummaryJobs(env, url) {
  const status = url.searchParams.get('status') || 'queued';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 20);

  const jobs = await env.DB.prepare(`
    SELECT *
    FROM message_view_summaries
    WHERE status = ?
    ORDER BY requested_at ASC
    LIMIT ?
  `).bind(status, limit).all();

  return json({ jobs: jobs.results.map(normalizeViewSummary) });
}

async function completeViewSummaryJob(env, id, payload) {
  const status = normalizeSummaryStatus(payload.status);
  const themesJson = payload.themes_json
    ? JSON.stringify(payload.themes_json)
    : payload.themes
      ? JSON.stringify(payload.themes)
      : null;

  await env.DB.prepare(`
    UPDATE message_view_summaries
    SET
      status = ?,
      started_at = COALESCE(started_at, ?),
      generated_at = CASE WHEN ? = 'completed' THEN COALESCE(?, datetime('now')) ELSE generated_at END,
      message_count = COALESCE(?, message_count),
      conversation_count = COALESCE(?, conversation_count),
      source_start_at = COALESCE(?, source_start_at),
      source_end_at = COALESCE(?, source_end_at),
      summary = COALESCE(?, summary),
      themes_json = COALESCE(?, themes_json),
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
    payload.conversation_count ?? null,
    payload.source_start_at || null,
    payload.source_end_at || null,
    payload.summary || null,
    themesJson,
    payload.model || null,
    payload.error || null,
    id,
  ).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM message_view_summaries
    WHERE id = ?
  `).bind(id).first();

  if (!summary) {
    return json({ error: 'view summary job not found' }, 404);
  }

  return json({ summary: normalizeViewSummary(summary) });
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

  const storedConversationRows = await env.DB.prepare(`
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
  `).all();
  const storedConversations = new Map(
    storedConversationRows.results.map((row) => [row.conversation_key, row]),
  );

  const incomingConversations = new Map();
  for (const conversation of conversations) {
    const conversationKey = keyForConversation(conversation);
    incomingConversations.set(conversationKey, {
      conversation_key: conversationKey,
      display_name: conversation.contact || conversation.handle || 'Unknown',
      handle: conversation.handle || null,
      chat_type: conversation.chat_type || null,
      message_count: Number(conversation.message_count || 0),
      sent_count: Number(conversation.sent_count || 0),
      received_count: Number(conversation.received_count || 0),
      last_active: conversation.last_active || null,
    });
  }

  const conversationStatements = [];
  let conversationsUpserted = 0;
  let conversationsCleared = 0;
  for (const [conversationKey, conversation] of incomingConversations) {
    const stored = storedConversations.get(conversationKey);
    if (stored && conversationRowsEqual(stored, conversation)) continue;

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
      conversation.display_name,
      conversation.handle,
      conversation.chat_type,
      conversation.message_count,
      conversation.sent_count,
      conversation.received_count,
      conversation.last_active,
    ));
    conversationsUpserted += 1;
  }

  for (const [conversationKey, stored] of storedConversations) {
    if (incomingConversations.has(conversationKey)) continue;
    if (
      Number(stored.message_count || 0) === 0
      && Number(stored.sent_count || 0) === 0
      && Number(stored.received_count || 0) === 0
    ) continue;

    conversationStatements.push(env.DB.prepare(`
      UPDATE message_conversations
      SET message_count = 0,
          sent_count = 0,
          received_count = 0,
          updated_at = datetime('now')
      WHERE conversation_key = ?
    `).bind(conversationKey));
    conversationsCleared += 1;
  }
  await runBatches(env, conversationStatements);

  const storedMessageRows = await env.DB.prepare(`
    SELECT source_id, conversation_key, timestamp, direction, chat_type, body
    FROM message_items
  `).all();
  const storedMessages = new Map(
    storedMessageRows.results.map((row) => [String(row.source_id), row]),
  );

  const incomingMessages = new Map();
  for (const item of recentMessages) {
    const conversationKey = keyForConversation(item);
    if (!incomingConversations.has(conversationKey)) continue;
    const sourceId = String(item.id);
    incomingMessages.set(sourceId, {
      source_id: sourceId,
      conversation_key: conversationKey,
      timestamp: item.timestamp || null,
      direction: item.direction || null,
      chat_type: item.chat_type || null,
      body: item.preview || '',
    });
  }

  const messageStatements = [];
  let messagesUpserted = 0;
  for (const [sourceId, item] of incomingMessages) {
    const stored = storedMessages.get(sourceId);
    if (stored && messageRowsEqual(stored, item)) continue;

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
      sourceId,
      item.conversation_key,
      item.timestamp,
      item.direction,
      item.chat_type,
      item.body,
    ));
    messagesUpserted += 1;
  }
  await runBatches(env, messageStatements);

  const deleteStatements = [];
  for (const sourceId of storedMessages.keys()) {
    if (incomingMessages.has(sourceId)) continue;
    deleteStatements.push(
      env.DB.prepare('DELETE FROM message_items WHERE source_id = ?').bind(sourceId),
    );
  }
  await runBatches(env, deleteStatements);

  return json({
    ok: true,
    runId,
    conversations: conversations.length,
    recentMessages: incomingMessages.size,
    changes: {
      conversationsUpserted,
      conversationsCleared,
      messagesUpserted,
      messagesDeleted: deleteStatements.length,
    },
  }, 201);
}

function conversationRowsEqual(stored, incoming) {
  return stored.display_name === incoming.display_name
    && nullableTextEqual(stored.handle, incoming.handle)
    && nullableTextEqual(stored.chat_type, incoming.chat_type)
    && Number(stored.message_count || 0) === incoming.message_count
    && Number(stored.sent_count || 0) === incoming.sent_count
    && Number(stored.received_count || 0) === incoming.received_count
    && nullableTextEqual(stored.last_active, incoming.last_active);
}

function messageRowsEqual(stored, incoming) {
  return stored.conversation_key === incoming.conversation_key
    && nullableTextEqual(stored.timestamp, incoming.timestamp)
    && nullableTextEqual(stored.direction, incoming.direction)
    && nullableTextEqual(stored.chat_type, incoming.chat_type)
    && String(stored.body || '') === incoming.body;
}

function nullableTextEqual(left, right) {
  return (left == null ? null : String(left)) === (right == null ? null : String(right));
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

function normalizeViewSummary(summary) {
  if (!summary) return null;
  return {
    ...summary,
    conversation_keys: parseJson(summary.conversation_keys_json, []),
    themes: parseJson(summary.themes_json, []),
  };
}

function normalizeViewListLimit(value) {
  if (value === 'all') return 'all';
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed) || parsed < 1) return '20';
  return String(Math.floor(parsed));
}

function normalizeConversationKeys(value) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set();
  const keys = [];
  for (const item of values) {
    const key = String(item || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys.slice(0, 250);
}

async function viewKeyFor(windowDays, listLimit, conversationKeys) {
  const hash = await sha256Hex(JSON.stringify(conversationKeys));
  return `${windowDays}:${listLimit}:${hash}`;
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
