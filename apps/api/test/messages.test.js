import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { sqlStatements } from './sql.js';

async function setup(t) {
  const mf = new Miniflare({ modules: true, modulesRoot: new URL('../../..', import.meta.url).pathname,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname, compatibilityDate: '2026-06-01',
    bindings: { EIDOS_API_TOKEN: 'test-token' }, d1Databases: { DB: 'messages-test' } });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const sql of sqlStatements(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))) await db.prepare(sql).run();
  await db.prepare("INSERT INTO message_conversations (conversation_key, display_name, handle, message_count) VALUES ('alice', 'Imported Alice', 'alice', 1)").run();
  const call = async (path, body, method = 'POST') => {
    const r = await mf.dispatchFetch(`http://localhost/api/messages/${path}`, { method: body === undefined ? 'GET' : method,
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, ...await r.json() };
  };
  return { db, call, mf };
}

test('contact names persist through sync, appear in summaries, and can be reset', async t => {
  const { call } = await setup(t);
  assert.equal((await call('contact-name', { conversation_key: 'alice', display_name: 'Alice Smith' }, 'PATCH')).status, 200);
  const snapshot = { exported_at: new Date().toISOString(), conversations: [{ handle: 'alice', contact: 'Changed import', message_count: 1 }], recent_messages: [] };
  await call('ingest', snapshot);
  const detail = await call('conversation?conversation_key=alice');
  assert.equal(detail.conversation.display_name, 'Alice Smith');
  assert.equal(detail.conversation.imported_name, 'Changed import');
  assert.equal((await call('overview')).topConversations[0].display_name, 'Alice Smith');
  const job = await call('summary-request', { conversation_key: 'alice', window_type: 'month' });
  assert.equal(job.summary.display_name, 'Alice Smith');
  const replay = await call('ingest', snapshot);
  assert.equal(replay.changes.conversationsUpserted, 0);
  assert.equal(replay.changes.messagesUpserted, 0);
  assert.equal((await call('contact-name', { conversation_key: 'alice', display_name: '' }, 'PATCH')).conversation.display_name, 'Changed import');
  assert.equal((await call('contact-name', { conversation_key: 'missing', display_name: 'Name' }, 'PATCH')).status, 404);
  assert.equal((await call('contact-name', { conversation_key: 'alice', display_name: 'x'.repeat(121) }, 'PATCH')).status, 400);
});

test('reading summaries never queues work; abandoned jobs can be retried without duplicating active jobs', async t => {
  const { db, call, mf } = await setup(t);
  const first = await call('summary-request', { conversation_key: 'alice', window_type: 'month' });
  const id = first.summary.id;
  assert.equal((await call('summary-request', { conversation_key: 'alice', window_type: 'month' })).summary.id, id);
  await db.prepare("UPDATE conversation_summaries SET status = 'running', updated_at = datetime('now', '-1 hour') WHERE id = ?").bind(id).run();
  const detail = await call('conversation?conversation_key=alice');
  assert.equal(detail.summaries[0].status, 'failed');
  assert.match(detail.summaries[0].error, /interrupted/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM conversation_summaries').first()).n, 1);
  const retry = await call('summary-request', { conversation_key: 'alice', window_type: 'month' });
  assert.notEqual(retry.summary.id, id);
  assert.equal((await db.prepare('SELECT status FROM conversation_summaries WHERE id = ?').bind(id).first()).status, 'failed');
  assert.equal((await call(`summary-jobs/${retry.summary.id}`, { status: 'completed', summary: '' })).status, 400);
  const completed = await call(`summary-jobs/${retry.summary.id}`, { status: 'completed', summary: 'A real summary.', message_count: 3 });
  assert.equal(completed.summary.status, 'completed');
  await db.prepare("UPDATE conversation_summaries SET error = 'private transcript content' WHERE id = ?").bind(id).run();
  assert.ok(!JSON.stringify(await call('conversation?conversation_key=alice')).includes('private transcript content'));
  assert.equal((await mf.dispatchFetch('http://localhost/api/messages/contact-name', {method:'PATCH',body:'{}'})).status, 401);
});

test('overview summaries recover from an interrupted worker', async t => {
  const { db, call } = await setup(t);
  const request = { window_days: 30, list_limit: 'all', conversation_keys: ['alice'] };
  const first = await call('view-summary-request', request);
  await db.prepare("UPDATE message_view_summaries SET status='running', updated_at=datetime('now','-1 hour') WHERE id=?").bind(first.summary.id).run();
  assert.equal((await call('view-summary?window_days=30&list_limit=all&conversation_key=alice')).summary.status, 'failed');
  assert.notEqual((await call('view-summary-request', request)).summary.id, first.summary.id);
});
