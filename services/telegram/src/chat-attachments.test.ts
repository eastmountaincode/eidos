import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareAttachments } from './chat-attachments.js';

test('attachment originals are hash-checked, cached, and never named by untrusted input', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'eidos-file-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = Buffer.from('The reference phrase is violet otter.');
  const file = { id: crypto.randomUUID(), name: 'spaces and $shell.txt', type: 'text/plain', size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(data, { headers: { 'Content-Length': String(data.length) } }); });
  const options = { workspacePath: root, workerUrl: 'https://worker.example.com', token: 'test' };
  const first = await prepareAttachments(JSON.stringify([file]), options);
  assert.equal(await readFile(join(root, 'data/inbox/web', file.id, 'original.txt'), 'utf8'), data.toString());
  assert.match(first.context, /untrusted data/);
  assert.deepEqual(first.images, []);
  assert.equal(calls, 1);
  await prepareAttachments(JSON.stringify([file]), options);
  assert.equal(calls, 1);
  await assert.rejects(prepareAttachments(JSON.stringify([{ ...file, id: crypto.randomUUID(), sha256: '0'.repeat(64) }]), options), /integrity/);
  await assert.rejects(prepareAttachments(JSON.stringify([{ ...file, name: '../config.txt' }]), options), /filename/);
});
