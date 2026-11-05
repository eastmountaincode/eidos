import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { Miniflare } from 'miniflare';

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Missing WebSocket message')), 3000);
    ws.addEventListener('message', (event) => { clearTimeout(timeout); resolve(event.data); }, { once: true });
  });
}

test('authenticated wake sockets auto-pong, survive idle, isolate channels and retire long polling', async (t) => {
  const mf = new Miniflare({ modules: true,
    modulesRoot: new URL('../../..', import.meta.url).pathname,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-06-01', bindings: { EIDOS_API_TOKEN: 'test-token' },
    durableObjects: { MESSAGE_JOB_WAKE: { className: 'MessageJobWake', useSQLite: true } },
  });
  t.after(() => mf.dispose());
  const headers = { Authorization: 'Bearer test-token', Upgrade: 'websocket' };
  assert.equal((await mf.dispatchFetch('http://localhost/api/agent-chat/connect', { headers: { Upgrade: 'websocket' } })).status, 401);
  assert.equal((await mf.dispatchFetch('http://localhost/api/agent-chat/connect', { headers: { Authorization: 'Bearer test-token' } })).status, 426);
  for (const path of ['/api/agent-chat/wait', '/api/messages/jobs/wait']) {
    assert.equal((await mf.dispatchFetch(`http://localhost${path}`, { headers })).status, 410);
  }
  const namespace = await mf.getDurableObjectNamespace('MESSAGE_JOB_WAKE');
  const sockets = [];
  for (const [path, name] of [['/api/agent-chat/connect', 'agent-chat'], ['/api/messages/jobs/connect', 'messages']]) {
    const response = await mf.dispatchFetch(`http://localhost${path}`, { headers });
    assert.equal(response.status, 101);
    const ws = response.webSocket;
    ws.accept(); sockets.push(ws);
    t.after(() => { if (ws.readyState < 2) ws.close(); });
    const pong = nextMessage(ws); ws.send('ping'); assert.equal(await pong, 'pong');
    const stub = namespace.get(namespace.idFromName(name));
    const status = await (await stub.fetch('https://wake/status')).json();
    assert.equal(status.online, true);
    assert.equal(status.connections, 1);
    assert.equal(status.transport, 'hibernating-websocket');
  }
  // Give workerd a chance to hibernate; state must not depend on constructor fields.
  await sleep(11000);
  const chat = namespace.get(namespace.idFromName('agent-chat'));
  const messages = namespace.get(namespace.idFromName('messages'));
  assert.equal((await (await chat.fetch('https://wake/status')).json()).online, true);
  const pendingChat = nextMessage(sockets[0]);
  await chat.fetch('https://wake/wake', { method: 'POST', body: JSON.stringify({ reason: 'chat-test' }) });
  assert.equal(JSON.parse(await pendingChat).reason, 'chat-test');
  const pendingMessages = nextMessage(sockets[1]);
  await messages.fetch('https://wake/wake', { method: 'POST', body: JSON.stringify({ reason: 'messages-test' }) });
  assert.equal(JSON.parse(await pendingMessages).reason, 'messages-test');
  sockets[0].close();
  await sleep(50);
  assert.equal((await (await chat.fetch('https://wake/status')).json()).online, false);
});
