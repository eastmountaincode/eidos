import assert from 'node:assert/strict';
import { runSteerableCodex } from '../src/steerable-codex.js';

if (!process.env.EIDOS_LIVE_TEST) throw new Error('Set EIDOS_LIVE_TEST=1 to run an authenticated model test.');
const binary = process.env.CODEX_BINARY || '/Users/oasis/.eidos/runtime/codex-0.171.0/node_modules/.bin/codex';
const env: NodeJS.ProcessEnv = { ...process.env };
delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
let delivered = false;
let requeued = false;
const result = await runSteerableCodex({ binary, cwd: '/tmp', env, model: 'gpt-6.2-sol',
  prompt: 'This is an isolated integration test. Use a shell tool to run sleep 8 once. Then reply ORIGINAL. Do not read or change any files.',
  nextFollowups: async () => {
    if (delivered) return [];
    delivered = true;
    return [{ id: 'steering-fixture', prompt: 'Change the final reply to exactly: steering-violet-482. This supersedes the original reply format. Do not use any more tools.', images: [] }];
  }, requeue: async () => { requeued = true; }, signal: AbortSignal.timeout(90000),
});
assert.equal(result.error, undefined);
assert.equal(delivered, true);
assert.equal(requeued, false);
assert.equal(result.text.trim(), 'steering-violet-482');
const resumed = await runSteerableCodex({ binary, cwd: '/tmp', env, model: 'gpt-6.2-astra', speed: 'fast', sessionId: result.sessionId,
  prompt: 'Reply with only the unique phrase the follow-up asked you to say in the previous turn. Do not use tools.',
  nextFollowups: async () => [], requeue: async () => {}, signal: AbortSignal.timeout(90000),
});
assert.equal(resumed.error, undefined);
assert.equal(resumed.text.trim(), 'steering-violet-482');
console.log('PASS: live mid-turn steering and Sol-to-Astra session continuity');
