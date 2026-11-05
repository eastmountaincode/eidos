import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodexArgs } from './codex-args.js';

test('images reach both new and resumed turns as separate arguments', () => {
  for (const resumeSessionId of [undefined, 'saved-session']) {
    const args = buildCodexArgs({ workspacePath: '/workspace', resumeSessionId, images: ['/safe/one.png', '/safe/two.png'], settings: { model: 'gpt-6.1-sol', speed: 'standard' } });
    assert.deepEqual(args.flatMap((arg, i) => arg === '--image' ? [args[i + 1]] : []), ['/safe/one.png', '/safe/two.png']);
    assert.equal(args.at(-1), '-');
  }
});

test('selected settings override defaults for both new and resumed turns', () => {
  for (const resumeSessionId of [undefined, 'saved-session']) {
    const args = buildCodexArgs({ workspacePath: '/workspace', defaultModel: 'gpt-5.6-sol', resumeSessionId,
      settings: { model: 'gpt-5.6-luna', speed: 'fast' } });
    assert.equal(args[args.indexOf('--model') + 1], 'gpt-5.6-luna');
    assert.ok(args.includes('service_tier="fast"'));
    assert.ok(args.includes('features.fast_mode=true'));
    assert.equal(args.includes('resume'), Boolean(resumeSessionId));
  }
});

test('standard explicitly overrides a prior fast turn, and Telegram defaults stay unchanged', () => {
  const standard = buildCodexArgs({ workspacePath: '/workspace', resumeSessionId: 'saved-session',
    settings: { model: 'gpt-5.6-sol', speed: 'standard' } });
  assert.ok(standard.includes('service_tier="default"'));
  const legacy = buildCodexArgs({ workspacePath: '/workspace', defaultModel: 'existing-model' });
  assert.equal(legacy[legacy.indexOf('--model') + 1], 'existing-model');
  assert.ok(!legacy.includes('--config'));
  assert.throws(() => buildCodexArgs({ workspacePath: '/workspace', settings: { model: 'unknown', speed: 'fast' } }));
});
