import assert from 'node:assert/strict';
import test from 'node:test';
import { messageForSend, parsePendingMessage } from './chat-settings';
import type { ChatTurn } from '../types/chat';
import { chatModels, defaultChatSettings, parseChatSettings, restoreChatPreference } from '../../shared/chat-settings.mjs';
import { parseAttachments } from '../../shared/chat-attachments.mjs';

test('files survive pending-message recovery and cannot change on retry', () => {
  const files = parseAttachments([{ id: crypto.randomUUID(), name: 'notes.txt', size: 12, sha256: 'a'.repeat(64) }]);
  const message = messageForSend('', defaultChatSettings, null, undefined, files);
  assert.deepEqual(parsePendingMessage(JSON.parse(JSON.stringify(message))), message);
  assert.deepEqual(messageForSend('new draft', defaultChatSettings, message, undefined, []), message);
  const retry = { id: message.id, prompt: '', settings_json: JSON.stringify(defaultChatSettings), attachments_json: JSON.stringify(files) } as ChatTurn;
  assert.deepEqual(messageForSend('ignored', defaultChatSettings, null, retry, []), message);
});

test('the picker offers current models and upgrades preferences without rewriting pending work', () => {
  assert.deepEqual(chatModels.map(model => model.id), ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna']);
  for (const model of chatModels) assert.deepEqual(parseChatSettings({ model: model.id, speed: 'fast' }), { model: model.id, speed: 'fast' });
  const legacy = { model: 'gpt-5.6-luna', speed: 'fast' as const };
  assert.deepEqual(restoreChatPreference(legacy), { model: defaultChatSettings.model, speed: 'fast' });
  assert.deepEqual(parsePendingMessage({ id: 'pending', prompt: 'hello', settings: legacy })?.settings, legacy);
});

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
