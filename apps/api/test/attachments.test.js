import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { attachmentMetadata, parseAttachments } from '../../../shared/chat-attachments.mjs';

const origin = 'https://eidos-preview.example.com';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function setup(t) {
  const mf = new Miniflare({ modules: true, modulesRoot: new URL('../../..', import.meta.url).pathname,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname, compatibilityDate: '2026-06-01',
    bindings: { EIDOS_API_TOKEN: 'test-token' }, d1Databases: { DB: 'attachments-test' }, r2Buckets: ['CHAT_FILES'],
    durableObjects: { MESSAGE_JOB_WAKE: { className: 'MessageJobWake', useSQLite: true } },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const sql of (await readFile(new URL('../agent_chat.sql', import.meta.url), 'utf8')).split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  const request = (path, body, method = body ? 'POST' : 'GET') => mf.dispatchFetch(`https://worker.example.com${path}`, {
    method, headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ticket = async (name, content) => (await request('/api/chat-files', { origin, file: { name, size: content.length, sha256: hash(content) } })).json();
  return { mf, db, request, ticket };
}

test('file tickets are private, origin-scoped, content-bound and idempotent; large uploads bypass Vercel', async (t) => {
  const { mf, request, ticket } = await setup(t);
  assert.equal((await mf.dispatchFetch('https://worker.example.com/api/chat-files', { method: 'POST' })).status, 401);
  const content = Buffer.alloc(5 * 1024 * 1024, 'a');
  const signed = await ticket('notes.txt', content);
  const upload = (body = content, site = origin, url = signed.upload_url) => mf.dispatchFetch(url, { method: 'PUT', headers: { Origin: site }, body });
  assert.equal((await upload(content, 'https://wrong.example')).status, 401);
  assert.equal((await upload(content, origin, signed.upload_url + 'tampered')).status, 401);
  const preflight = await mf.dispatchFetch(signed.upload_url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await upload(Buffer.from('short'))).status, 400);
  const corrupt = Buffer.alloc(content.length, 'b');
  assert.equal((await upload(corrupt)).status, 400);
  for (let i = 0; i < 2; i++) {
    const result = await upload();
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).attachment, signed.attachment);
  }
  const path = `/api/chat-files/${signed.attachment.id}`;
  assert.equal((await mf.dispatchFetch(`https://worker.example.com${path}`)).status, 401);
  assert.equal((await mf.dispatchFetch(signed.upload_url)).status, 401);
  const download = (await (await request(`${path}/ticket?inline=1`)).json()).url;
  const result = await mf.dispatchFetch(download);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(result.headers.get('Content-Disposition'), /^attachment/);
  assert.equal(hash(Buffer.from(await result.arrayBuffer())), hash(content));
  assert.equal((await mf.dispatchFetch(download, { method: 'PUT', headers: { Origin: origin }, body: content })).status, 401);
});

test('file-only turns persist immutable references; missing or modified files cannot be queued', async (t) => {
  const { mf, db, request, ticket } = await setup(t);
  const content = Buffer.from('Eidos attachment fixture: violet otter');
  const signed = await ticket('notes.txt', content);
  const message = { id: crypto.randomUUID(), prompt: '', attachments: [signed.attachment] };
  assert.equal((await request('/api/agent-chat', message)).status, 400);
  await mf.dispatchFetch(signed.upload_url, { method: 'PUT', headers: { Origin: origin }, body: content });
  assert.equal((await request('/api/agent-chat', { ...message, attachments: [{ ...signed.attachment, name: 'different.txt' }] })).status, 400);
  assert.equal((await request('/api/agent-chat', message)).status, 202);
  assert.equal((await request('/api/agent-chat', message)).status, 200);
  assert.equal((await request('/api/agent-chat', { ...message, attachments: [] })).status, 400);
  assert.equal((await request('/api/agent-chat', { ...message, prompt: 'different' })).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM agent_chat_turns').first()).n, 1);
  const turn = (await (await request('/api/agent-chat/claim', {})).json()).turn;
  assert.deepEqual(JSON.parse(turn.attachments_json), [signed.attachment]);
  await request(`/api/agent-chat/turns/${turn.id}`, { claim_token: turn.claim_token, status: 'failed', response: '', error: 'test' }, 'PATCH');
  assert.equal((await request('/api/agent-chat', { id: message.id, prompt: '', retry: true })).status, 202);
  const retried = (await (await request('/api/agent-chat/claim', {})).json()).turn;
  assert.equal(retried.attachments_json, turn.attachments_json);
  const history = await (await request('/api/agent-chat')).json();
  assert.deepEqual(JSON.parse(history.turns[0].attachments_json), [signed.attachment]);
});

test('attachment limits reject unsupported types, unsafe names, empty/oversized files and excessive totals', () => {
  for (const name of ['../notes.txt', 'a\\b.txt', 'file.exe', 'file.svg', 'file.__proto__', 'a\n.txt']) assert.throws(() => attachmentMetadata({ name, size: 1 }));
  for (const size of [0, -1, 1.5, 25 * 1024 * 1024 + 1]) assert.throws(() => attachmentMetadata({ name: 'a.txt', size }));
  const file = { id: crypto.randomUUID(), name: 'a.pdf', size: 25 * 1024 * 1024, sha256: 'a'.repeat(64) };
  assert.throws(() => parseAttachments([file, file]));
  assert.throws(() => parseAttachments(Array.from({ length: 3 }, () => ({ ...file, id: crypto.randomUUID() }))));
  assert.throws(() => parseAttachments(Array.from({ length: 6 }, () => ({ ...file, size: 1, id: crypto.randomUUID() }))));
});

test('attachment migration leaves existing replies intact', async (t) => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: { DB: 'attachment-migration' } });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = (await readFile(new URL('../agent_chat.sql', import.meta.url), 'utf8')).replace("  attachments_json TEXT NOT NULL DEFAULT '[]',\n", '');
  for (const sql of schema.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  await db.prepare("INSERT INTO agent_chat_turns (id, conversation_id, prompt, response, status) VALUES ('old', 'main', 'hello', 'saved reply', 'completed')").run();
  await db.prepare(await readFile(new URL('../agent_chat_attachments.sql', import.meta.url), 'utf8')).run();
  assert.deepEqual(await db.prepare("SELECT response, attachments_json FROM agent_chat_turns WHERE id = 'old'").first(), { response: 'saved reply', attachments_json: '[]' });
});
