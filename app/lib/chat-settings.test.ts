import assert from 'node:assert/strict';
import test from 'node:test';
import { messageForSend, parsePendingMessage } from './chat-settings';
import type { ChatTurn } from '../types/chat';

test('new messages snapshot settings, recovery and retries retain their original choices', () => {
  const original = { model: 'gpt-5.6-luna', speed: 'fast' as const };
  const next = { model: 'gpt-5.6-sol', speed: 'standard' as const };
  const message = messageForSend('hello', original, null);
  assert.notEqual(message.settings, original);
  assert.deepEqual(message.settings, original);
  const restored = parsePendingMessage(JSON.parse(JSON.stringify(message)));
  assert.deepEqual(messageForSend('hello', next, restored), message);
  const retry = { id: message.id, prompt: 'hello', settings_json: JSON.stringify(original) } as ChatTurn;
  assert.deepEqual(messageForSend('hello', next, null, retry), message);
  const legacy = { id: 'legacy', prompt: 'hello' };
  assert.deepEqual(parsePendingMessage(legacy), legacy);
  assert.equal(messageForSend('hello', next, legacy).settings, undefined);
});
