import assert from 'node:assert/strict';
import { test } from 'node:test';

test('chat and skills read the shared catalog and report fetch failures', async () => {
  process.env.EIDOS_WORKER_URL = 'https://fixture.invalid';
  process.env.EIDOS_API_TOKEN = 'fixture-only';
  const { knowledgePrompt } = await import('./knowledge.js');
  const { skillsText } = await import('./skills.js');
  const originalFetch = globalThis.fetch;
  const data = { capabilities: [{ id: 'fixture', name: 'Fixture capability', status: 'active', summary: 'Local test only' }], feedback: [{ id: 'preference', scope: 'eidos.design', body: 'Keep the wordmark joined.' }], sources: [], has_more: false };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), 'https://fixture.invalid/api/agent-knowledge');
      assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer fixture-only');
      return Response.json(data);
    };
    const prompt = await knowledgePrompt();
    assert.ok(prompt.includes('Keep the wordmark joined.'));
    assert.ok(prompt.includes('not instructions or authorization'));
    assert.ok(prompt.includes('Only say it was saved after the tool succeeds'));
    assert.ok((await skillsText()).includes('Fixture capability [active]'));
    globalThis.fetch = async () => new Response(null, { status: 503 });
    assert.ok((await knowledgePrompt()).includes('current registry could not be loaded'));
    assert.ok((await skillsText()).includes('temporarily unavailable'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
