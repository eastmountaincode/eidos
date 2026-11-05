import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { WakeChannel } from './wake-channel.js';

test('wake client buffers hints during queue checks, reconnects, falls back, and shuts down', async (t) => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address();
  assert.ok(typeof address === 'object' && address);
  let connections = 0;
  server.on('connection', (ws, request) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    connections++;
    ws.on('message', (message) => { if (message.toString() === 'ping') ws.send('pong'); });
  });
  const stop = new AbortController();
  const channel = new WakeChannel(`http://127.0.0.1:${address.port}/connect`, 'fixture-token', stop.signal);
  t.after(() => { stop.abort(); for (const ws of server.clients) ws.terminate(); server.close(); });
  await channel.waitSince(0, 2000);
  assert.equal(connections, 1);
  const beforeCheck = channel.revision;
  for (const ws of server.clients) ws.send(JSON.stringify({ woken: true }));
  await sleep(20);
  assert.ok(channel.revision > beforeCheck);
  await channel.waitSince(beforeCheck, 2000); // Already received: must not block.
  const pending = channel.waitSince(channel.revision, 2000);
  for (const ws of server.clients) ws.send(JSON.stringify({ woken: true }));
  await pending;
  for (const ws of server.clients) ws.terminate();
  for (let i = 0; i < 50 && connections < 2; i++) await sleep(100);
  assert.equal(connections, 2);
  const beforeFallback = Date.now();
  await channel.waitSince(channel.revision, 30);
  assert.ok(Date.now() - beforeFallback >= 20);
  const waiting = channel.waitSince(channel.revision, 10000);
  stop.abort();
  await waiting;
});
