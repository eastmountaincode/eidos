import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';

async function setup(t) {
  const mf = new Miniflare({
    modules: true,
    modulesRoot: new URL('../../..', import.meta.url).pathname,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-06-01',
    bindings: { EIDOS_API_TOKEN: 'test-token' },
    d1Databases: { DB: 'eidos-chat-test' },
    durableObjects: { MESSAGE_JOB_WAKE: { className: 'MessageJobWake', useSQLite: true } },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = await readFile(new URL('../agent_chat.sql', import.meta.url), 'utf8');
  for (const sql of schema.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  const request = (path = '', body, method = body ? 'POST' : 'GET') => mf.dispatchFetch(`http://localhost/api/agent-chat${path}`, {
    method,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { mf, db, request };
}

test('chat persists replies, continues sessions and never duplicates delivery', async (t) => {
  const { mf, db, request } = await setup(t);
  assert.equal((await mf.dispatchFetch('http://localhost/api/agent-chat')).status, 401);
  assert.equal((await request('', { id: 'bad', prompt: 'hello' })).status, 400);
  const prompt = { id: crypto.randomUUID(), prompt: 'hello' };
  const deliveries = await Promise.all([request('', prompt), request('', prompt)]);
  assert.ok(deliveries.every((r) => [200, 202].includes(r.status)));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM agent_chat_turns').first()).n, 1);
  assert.equal((await request('', { id: crypto.randomUUID(), prompt: 'second' })).status, 409);
  const claims = await Promise.all([request('/claim', {}), request('/claim', {})]);
  const claimed = (await Promise.all(claims.map((r) => r.json()))).map((r) => r.turn).filter(Boolean);
  assert.equal(claimed.length, 1);
  const turn = claimed[0];
  assert.equal(turn.resume_session_id, null);
  const patch = { claim_token: turn.claim_token, response: 'Hello Andrew.', status: 'completed', session_id: 'session-1', usage: { input_tokens: 10, output_tokens: 3 } };
  assert.equal((await request(`/turns/${turn.id}`, { ...patch, claim_token: 'incorrect' }, 'PATCH')).status, 409);
  assert.equal((await request(`/turns/${turn.id}`, { ...patch, response: '' }, 'PATCH')).status, 400);
  assert.equal((await request(`/turns/${turn.id}`, patch, 'PATCH')).status, 200);
  assert.equal((await request(`/turns/${turn.id}`, patch, 'PATCH')).status, 200);
  const history = await (await request()).json();
  assert.equal(history.agent_online, true);
  assert.equal(history.turns[0].response, 'Hello Andrew.');
  assert.equal(history.turns[0].status, 'completed');
  assert.equal(history.turns[0].claim_token, undefined);
  assert.equal(history.turns[0].session_id, undefined);
  assert.equal((await (await request('', prompt)).json()).turn.status, 'completed');
  // Reading and polling must not rewrite messages or bump revisions.
  const before = await db.prepare('SELECT * FROM agent_chat_turns').all();
  await request();
  const empty = await (await request(`?after=${turn.seq}`)).json();
  assert.deepEqual(empty.turns, []);
  assert.deepEqual((await db.prepare('SELECT * FROM agent_chat_turns').all()).results, before.results);
  await request('', { id: crypto.randomUUID(), prompt: 'Remember what I said?' });
  const next = await (await request('/claim', {})).json();
  assert.equal(next.turn.resume_session_id, 'session-1');
});

test('an interrupted turn needs an explicit retry and rejects its old agent', async (t) => {
  const { db, request } = await setup(t);
  const message = { id: crypto.randomUUID(), prompt: 'hello again' };
  await request('', message);
  const first = (await (await request('/claim', {})).json()).turn;
  await request(`/turns/${first.id}`, { claim_token: first.claim_token, response: 'Saved partial reply' }, 'PATCH');
  await db.prepare("UPDATE agent_chat_turns SET updated_at = datetime('now', '-6 minutes') WHERE id = ?").bind(first.id).run();
  const history = await (await request()).json();
  assert.equal(history.turns[0].status, 'failed');
  assert.equal((await (await request('/claim', {})).json()).turn, null);
  assert.equal((await (await request('', message)).json()).turn.status, 'failed');
  assert.equal((await request('', { ...message, retry: true })).status, 202);
  const archive = await db.prepare('SELECT prior_attempts_json FROM agent_chat_turns WHERE id = ?').bind(first.id).first();
  assert.equal(JSON.parse(archive.prior_attempts_json)[0].response, 'Saved partial reply');
  const second = (await (await request('/claim', {})).json()).turn;
  assert.notEqual(second.claim_token, first.claim_token);
  assert.equal((await request(`/turns/${first.id}`, { claim_token: first.claim_token, status: 'completed', response: 'stale reply' }, 'PATCH')).status, 409);
});

test('history pages are ordered, bounded, and isolated by conversation', async (t) => {
  const { db, request } = await setup(t);
  for (let i = 0; i < 55; i++) await db.prepare(`INSERT INTO agent_chat_turns (id, conversation_id, prompt, response, status)
    VALUES (?, 'main', ?, 'reply', 'completed')`).bind(crypto.randomUUID(), `Message ${i}`).run();
  await db.prepare(`INSERT INTO agent_chat_turns (id, conversation_id, prompt, status) VALUES (?, 'other', 'Other project', 'queued')`).bind(crypto.randomUUID()).run();
  const latest = await (await request()).json();
  assert.equal(latest.turns.length, 50);
  assert.equal(latest.turns[0].prompt, 'Message 5');
  assert.equal(latest.has_more, true);
  const older = await (await request(`?before=${latest.turns[0].seq}`)).json();
  assert.equal(older.turns.length, 5);
  assert.equal(older.turns[0].prompt, 'Message 0');
  assert.equal(older.has_more, false);
  assert.equal((await request('?after=invalid')).status, 400);
});

test('model and speed are durable, validated, and immutable across delivery and retry', async (t) => {
  const { db, request } = await setup(t);
  const settings = { model: 'gpt-5.6-luna', speed: 'fast' };
  const message = { id: crypto.randomUUID(), prompt: 'settings check', settings };
  for (const invalid of [{ ...settings, model: 'unknown' }, { ...settings, speed: 'turbo' },
    { ...settings, command: '--dangerous' }, 'not an object']) {
    assert.equal((await request('', { ...message, settings: invalid })).status, 400);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM agent_chat_turns').first()).n, 0);
  const deliveries = await Promise.all([request('', message), request('', message)]);
  assert.ok(deliveries.every((r) => [200, 202].includes(r.status)));
  const first = (await (await request('/claim', {})).json()).turn;
  assert.deepEqual(JSON.parse(first.settings_json), settings);
  assert.equal((await request('', { ...message, settings: { ...settings, speed: 'standard' } })).status, 409);
  await request(`/turns/${first.id}`, { claim_token: first.claim_token, status: 'failed', response: 'partial', model: settings.model }, 'PATCH');
  const history = (await (await request()).json()).turns[0];
  assert.deepEqual(JSON.parse(history.settings_json), settings);
  assert.equal(history.model, settings.model);
  assert.equal((await request('', { ...message, settings: { ...settings, model: 'gpt-5.6-sol' }, retry: true })).status, 409);
  // A pre-selector client can still retry: omission preserves saved settings.
  assert.equal((await request('', { id: message.id, prompt: message.prompt, retry: true })).status, 202);
  const second = (await (await request('/claim', {})).json()).turn;
  assert.deepEqual(JSON.parse(second.settings_json), settings);
  await request(`/turns/${second.id}`, { claim_token: second.claim_token, status: 'completed', response: 'done', session_id: 'settings-session' }, 'PATCH');
  const nextSettings = { model: 'gpt-5.6-sol', speed: 'standard' };
  await request('', { id: crypto.randomUUID(), prompt: 'continue', settings: nextSettings });
  const next = (await (await request('/claim', {})).json()).turn;
  assert.equal(next.resume_session_id, 'settings-session');
  assert.deepEqual(JSON.parse(next.settings_json), nextSettings);
});

test('settings migration preserves existing conversation history', async (t) => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: { DB: 'migration-test' } });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = (await readFile(new URL('../agent_chat.sql', import.meta.url), 'utf8')).replace('  settings_json TEXT,\n', '');
  for (const sql of schema.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  await db.prepare("INSERT INTO agent_chat_turns (id, conversation_id, prompt, response, status) VALUES ('old', 'main', 'hello', 'saved reply', 'completed')").run();
  const migration = await readFile(new URL('../agent_chat_settings.sql', import.meta.url), 'utf8');
  await db.prepare(migration).run();
  const row = await db.prepare('SELECT response, settings_json FROM agent_chat_turns WHERE id = ?').bind('old').first();
  assert.deepEqual(row, { response: 'saved reply', settings_json: null });
});
