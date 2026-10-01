const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const fields = ['kind', 'title', 'body', 'scope', 'source_ref', 'source_quote', 'status', 'resolution'];

export async function readCapabilities(env) {
  const rows = await env.DB.prepare(`SELECT c.*, d.instructions, d.requirements, d.limitations,
    (SELECT json_object('result', t.result, 'evidence', t.evidence, 'checked_at', t.checked_at)
      FROM agent_capability_checks t WHERE t.capability_id = c.id ORDER BY t.checked_at DESC, t.rowid DESC LIMIT 1) AS last_check_json
    FROM agent_capabilities c LEFT JOIN agent_capability_details d ON d.capability_id = c.id
    ORDER BY c.kind, c.sort_order, c.name`).all();
  return rows.results.map(({ last_check_json, ...row }) => ({ ...row, last_check: last_check_json ? JSON.parse(last_check_json) : null }));
}

async function feedbackList(env, url) {
  const status = url.searchParams.get('status') || 'current';
  if (!['current', 'all', 'active', 'open', 'resolved', 'withdrawn'].includes(status)) return json({ error: 'Invalid status.' }, 400);
  const offsetText = url.searchParams.get('offset') || '0';
  if (!/^\d{1,7}$/.test(offsetText)) return json({ error: 'Invalid page.' }, 400);
  const offset = Number(offsetText);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 200);
  const where = status === 'all' ? '1 = 1' : status === 'current' ? "status IN ('active', 'open')" : 'status = ?';
  const bindings = ['all', 'current'].includes(status) ? [] : [status];
  if (query) bindings.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`);
  const filter = `${where}${query ? " AND (title || ' ' || body || ' ' || scope) LIKE ? ESCAPE '\\'" : ''}`;
  const rows = await env.DB.prepare(`SELECT * FROM agent_feedback WHERE ${filter} ORDER BY updated_at DESC, id LIMIT 101 OFFSET ?`).bind(...bindings, offset).all();
  return json({ feedback: rows.results.slice(0, 100), has_more: rows.results.length > 100, next_offset: offset + 100 });
}

function validateFeedback(body, existing) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid feedback.' };
  const entry = { ...existing };
  const limits = { kind: 20, title: 160, body: 5000, scope: 100, source_ref: 500, source_quote: 2000, status: 20, resolution: 3000 };
  for (const key of fields) {
    const value = body[key] ?? entry[key] ?? (key === 'scope' ? 'eidos' : '');
    if (typeof value !== 'string' || value.length > limits[key]) return { error: `Invalid ${key}.` };
    entry[key] = value.trim();
  }
  if (!['preference', 'decision', 'issue'].includes(entry.kind)) return { error: 'Choose preference, decision or issue.' };
  if (!entry.status) entry.status = entry.kind === 'issue' ? 'open' : 'active';
  if (!entry.title || !entry.body || !entry.scope || !entry.source_ref) return { error: 'Title, details, scope and source are required.' };
  const statuses = entry.kind === 'issue' ? ['open', 'resolved', 'withdrawn'] : ['active', 'withdrawn'];
  if (!statuses.includes(entry.status)) return { error: 'Status does not match the feedback type.' };
  if (entry.status === 'resolved' && !entry.resolution) return { error: 'Describe the verification before resolving an issue.' };
  return { entry };
}

export async function handleAgentKnowledge(request, env) {
  const url = new URL(request.url);
  const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([a-zA-Z0-9_-]{1,100})\/(details|checks)$/);
  if (capabilityMatch && request.method === 'POST') {
    const [, id, kind] = capabilityMatch;
    if (!await env.DB.prepare('SELECT id FROM agent_capabilities WHERE id = ?').bind(id).first()) return json({ error: 'Capability not found.' }, 404);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Invalid record.' }, 400);
    if (kind === 'checks') {
      if (!validId(body.id) || !['passed', 'failed'].includes(body.result) || typeof body.evidence !== 'string' || !body.evidence.trim() || body.evidence.length > 3000) return json({ error: 'A check ID, result and evidence are required.' }, 400);
      const existing = await env.DB.prepare('SELECT * FROM agent_capability_checks WHERE id = ?').bind(body.id).first();
      if (existing) return existing.capability_id === id && existing.result === body.result && existing.evidence === body.evidence.trim() ? json({ check: existing }) : json({ error: 'Check ID already exists.' }, 409);
      const check = await env.DB.prepare('INSERT INTO agent_capability_checks (id, capability_id, result, evidence) VALUES (?, ?, ?, ?) RETURNING *').bind(body.id, id, body.result, body.evidence.trim()).first();
      return json({ check }, 201);
    }
    const existing = await env.DB.prepare('SELECT * FROM agent_capability_details WHERE capability_id = ?').bind(id).first();
    const keys = ['instructions', 'requirements', 'limitations'];
    const values = keys.map(k => body[k] ?? existing?.[k] ?? '');
    if (values.some(v => typeof v !== 'string' || v.length > 6000)) return json({ error: 'Invalid capability details.' }, 400);
    if (!existing || keys.some((k, i) => existing[k] !== values[i])) {
      await env.DB.prepare(`INSERT INTO agent_capability_details (capability_id, instructions, requirements, limitations) VALUES (?, ?, ?, ?)
        ON CONFLICT(capability_id) DO UPDATE SET instructions = excluded.instructions, requirements = excluded.requirements, limitations = excluded.limitations, updated_at = datetime('now')`).bind(id, ...values).run();
    }
    return json({ capability: (await readCapabilities(env)).find(c => c.id === id) });
  }
  if (url.pathname === '/api/agent-knowledge' && request.method === 'GET') {
    const [capabilities, feedbackResponse, sources] = await Promise.all([
      readCapabilities(env), feedbackList(env, new URL('https://eidos/api/feedback')),
      env.DB.prepare(`SELECT * FROM source_entries WHERE EXISTS
        (SELECT 1 FROM json_each(CASE WHEN json_valid(tags_json) THEN tags_json ELSE '[]' END) WHERE value = 'design')
        ORDER BY added_at DESC LIMIT 101`).all(),
    ]);
    const stub = env.MESSAGE_JOB_WAKE?.get(env.MESSAGE_JOB_WAKE.idFromName('agent-chat'));
    const presence = stub ? await (await stub.fetch('https://agent-chat/status')).json() : { online: false };
    return json({ capabilities, ...await feedbackResponse.json(),
      sources: sources.results.slice(0, 100).map(({ tags_json, ...s }) => ({ ...s, tags: JSON.parse(tags_json || '[]') })),
      sources_has_more: sources.results.length > 100,
      runtime: { agent_online: presence.online, observed_at: new Date().toISOString() },
    });
  }
  if (url.pathname === '/api/feedback' && request.method === 'GET') return feedbackList(env, url);
  const match = url.pathname.match(/^\/api\/feedback\/([a-zA-Z0-9_-]{1,100})$/);
  if (match && request.method === 'GET') {
    const entry = await env.DB.prepare('SELECT * FROM agent_feedback WHERE id = ?').bind(match[1]).first();
    if (!entry) return json({ error: 'Feedback not found.' }, 404);
    const revisions = await env.DB.prepare('SELECT revision, snapshot_json, recorded_at FROM agent_feedback_revisions WHERE feedback_id = ? ORDER BY revision DESC LIMIT 100').bind(match[1]).all();
    return json({ entry, revisions: revisions.results.map(({ snapshot_json, ...row }) => ({ ...row, snapshot: JSON.parse(snapshot_json) })) });
  }
  if ((url.pathname === '/api/feedback' && request.method === 'POST') || (match && request.method === 'PATCH')) {
    const body = await request.json().catch(() => null);
    const id = match?.[1] || body?.id;
    if (!validId(id)) return json({ error: 'A stable feedback ID is required.' }, 400);
    const existing = await env.DB.prepare('SELECT * FROM agent_feedback WHERE id = ?').bind(id).first();
    if (match && !existing) return json({ error: 'Feedback not found.' }, 404);
    const { error, entry } = validateFeedback(body, match ? existing : undefined);
    if (error) return json({ error }, 400);
    if (existing && fields.every((key) => existing[key] === entry[key])) return json({ entry: existing });
    if (!match && existing) return json({ error: 'This feedback ID already exists. Read it before editing.' }, 409);
    if (match) {
      if (!Number.isInteger(body.revision) || body.revision !== existing.revision) return json({ error: 'This record changed. Refresh before saving.' }, 409);
      const updated = await env.DB.prepare(`UPDATE agent_feedback SET ${fields.map(k => `${k} = ?`).join(', ')},
        revision = revision + 1, updated_at = datetime('now') WHERE id = ? AND revision = ? RETURNING *`)
        .bind(...fields.map(k => entry[k]), id, body.revision).first();
      return updated ? json({ entry: updated }) : json({ error: 'This record changed. Refresh before saving.' }, 409);
    }
    const inserted = await env.DB.prepare(`INSERT INTO agent_feedback (id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING RETURNING *`).bind(id, ...fields.map(k => entry[k])).first();
    if (inserted) return json({ entry: inserted }, 201);
    const saved = await env.DB.prepare('SELECT * FROM agent_feedback WHERE id = ?').bind(id).first();
    return fields.every(k => saved?.[k] === entry[k]) ? json({ entry: saved }) : json({ error: 'This feedback ID already exists.' }, 409);
  }
  if (url.pathname.startsWith('/api/feedback') || url.pathname.startsWith('/api/agent-knowledge')) return json({ error: 'Not found.' }, 404);
  return null;
}
