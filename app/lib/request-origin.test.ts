import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasSameOrigin } from './request-origin';

test('same-origin writes survive Next internal host rewriting without accepting cross-site writes', () => {
  const request = (origin: string, host = 'eidos.example', proto = 'https') => new Request('http://localhost:3100/api/knowledge', { headers: { origin, host, 'x-forwarded-proto': proto } });
  assert.equal(hasSameOrigin(request('https://eidos.example')), true);
  assert.equal(hasSameOrigin(request('http://127.0.0.1:3100', '127.0.0.1:3100', 'http')), true);
  assert.equal(hasSameOrigin(request('https://evil.example')), false);
  assert.equal(hasSameOrigin(request('http://eidos.example')), false);
  assert.equal(hasSameOrigin(request('https://eidos.example.attacker.example')), false);
  assert.equal(hasSameOrigin(request('null')), false);
  assert.equal(hasSameOrigin(request('')), false);
  assert.equal(hasSameOrigin(request('https://eidos.example', 'eidos.example', 'https,http')), false);
});
