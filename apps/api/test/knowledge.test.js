import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { sqlStatements } from './sql.js';

async function setup(t) {
  const mf = new Miniflare({ modules: true, scriptPath: new URL('../src/index.js', import.meta.url).pathname, compatibilityDate: '2026-06-01', bindings: { EIDOS_API_TOKEN: 'test-token' }, d1Databases: { DB: 'knowledge-test' }, durableObjects: { MESSAGE_JOB_WAKE: { className: 'MessageJobWake', useSQLite: true } } });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.prepare(`CREATE TABLE agent_capabilities (id TEXT PRIMARY KEY, kind TEXT, name TEXT, status TEXT, category TEXT, summary TEXT, invocation TEXT, data_source TEXT, notes TEXT, sort_order INTEGER, updated_at TEXT DEFAULT (datetime('now')))` ).run();
  await db.prepare("INSERT INTO agent_capabilities (id, kind, name, status, summary) VALUES ('playlist-from-image', 'skill', 'Apple Music playlist', 'active', 'Create a playlist')").run();
  const sourceSql = await readFile(new URL('../source_entries.sql', import.meta.url), 'utf8');
  const sql = await readFile(new URL('../agent_knowledge.sql', import.meta.url), 'utf8');
  for (const statement of sqlStatements(sourceSql + sql)) await db.prepare(statement).run();
  // The additive migration is safe to retry and must not rewrite existing rows.
  for (const statement of sqlStatements(sql)) await db.prepare(statement).run();
  const request = (path, body, method = body ? 'POST' : 'GET', auth = true) => mf.dispatchFetch('https://test' + path, { method, headers: { ...(auth ? { Authorization: 'Bearer test-token' } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { db, request };
}
const feedback = { id: 'compact-interface', kind: 'preference', title: 'Keep controls compact', body: 'Give content most of the space.', scope: 'eidos.design', source_ref: 'eidos-chat:test', source_quote: 'Too much unused space.' };

test('feedback retains provenance, is idempotent and prevents stale overwrites', async t => {
  const { db, request } = await setup(t);
  assert.equal((await request('/api/feedback', feedback, 'POST', false)).status, 401);
  assert.equal((await request('/api/feedback', { ...feedback, source_ref: '' })).status, 400);
  assert.equal((await request('/api/feedback', feedback)).status, 201);
  assert.equal((await request('/api/feedback', feedback)).status, 200);
  assert.equal((await request('/api/feedback', { ...feedback, body: 'Different' })).status, 409);
  assert.equal((await request('/api/feedback/compact-interface', { revision: 1, body: 'Compact but readable.' }, 'PATCH')).status, 200);
  assert.equal((await request('/api/feedback/compact-interface', { revision: 1, body: 'Stale edit' }, 'PATCH')).status, 409);
  const history = await (await request('/api/feedback/compact-interface')).json();
  assert.equal(history.revisions.length, 2);
  assert.equal(history.revisions[1].snapshot.body, feedback.body);
  assert.equal(history.entry.source_quote, feedback.source_quote);
  const before = await db.prepare('SELECT COUNT(*) AS n FROM agent_feedback_revisions').first();
  await request('/api/agent-knowledge'); await request('/api/feedback');
  assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM agent_feedback_revisions').first(), before);
  await request('/api/feedback/compact-interface', { revision: 2, status: 'withdrawn' }, 'PATCH');
  assert.equal((await (await request('/api/agent-knowledge')).json()).feedback.length, 0);
  assert.equal((await (await request('/api/feedback?status=all')).json()).feedback.length, 1);
});

test('issues require verification to resolve and inactive feedback is excluded from chat', async t => {
  const { request } = await setup(t);
  await request('/api/feedback', { ...feedback, id: 'messages-broken', kind: 'issue' });
  assert.equal((await request('/api/feedback/messages-broken', { revision: 1, status: 'resolved' }, 'PATCH')).status, 400);
  assert.equal((await request('/api/feedback/messages-broken', { revision: 1, status: 'resolved', resolution: 'Tested loading and opening a conversation in the preview.' }, 'PATCH')).status, 200);
  const data = await (await request('/api/agent-knowledge')).json();
  assert.equal(data.feedback.length, 0);
});

test('the catalog is shared; declared status, checks and sources stay separate', async t => {
  const { request } = await setup(t);
  let data = await (await request('/api/agent-knowledge')).json();
  assert.equal(data.capabilities.find(c => c.id === 'playlist-from-image').last_check, null);
  const check = { id: 'playlist-test', result: 'failed', evidence: 'Sign-in required in the dedicated music profile.' };
  assert.equal((await request('/api/capabilities/playlist-from-image/checks', { ...check, evidence: '' })).status, 400);
  assert.equal((await request('/api/capabilities/playlist-from-image/checks', check)).status, 201);
  assert.equal((await request('/api/capabilities/playlist-from-image/checks', check)).status, 200);
  await request('/api/sources', { id: 'design-reference', source_text: 'Design reference', tags: ['design', 'eidos'] });
  await request('/api/sources', { id: 'film', source_text: 'A film', tags: ['film'] });
  data = await (await request('/api/agent-knowledge')).json();
  const catalog = await (await request('/api/capabilities')).json();
  assert.deepEqual(data.capabilities, catalog.capabilities);
  const music = data.capabilities.find(c => c.id === 'playlist-from-image');
  assert.equal(music.status, 'active');
  assert.equal(music.last_check.result, 'failed');
  assert.equal(data.sources.length, 1);
  assert.equal(data.runtime.agent_online, false);
  assert.equal((await request('/api/feedback?offset=bad')).status, 400);
});
