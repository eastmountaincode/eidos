import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';

const schema = `
  CREATE TABLE source_entries (
    id TEXT PRIMARY KEY,
    source_text TEXT NOT NULL,
    type TEXT,
    context TEXT,
    creator TEXT,
    year TEXT,
    url TEXT,
    file_path TEXT,
    preview_url TEXT,
    tags_json TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE future_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    description TEXT,
    location TEXT,
    cadence TEXT NOT NULL DEFAULT 'annual',
    last_start TEXT,
    last_end TEXT,
    next_start TEXT,
    next_end TEXT,
    watch_month INTEGER,
    status TEXT NOT NULL DEFAULT 'watching',
    notes TEXT,
    tags_json TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

async function request(mf, path, options = {}) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    ...options,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

test('sources and future-event endpoints survive the recovered Worker merge', async (t) => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: new URL('../src/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-06-01',
    bindings: { EIDOS_API_TOKEN: 'test-token' },
    d1Databases: { DB: 'eidos-catalog-test' },
  });
  t.after(() => mf.dispose());

  const db = await mf.getD1Database('DB');
  for (const statement of schema.split(';').map((value) => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }

  const sourceResponse = await request(mf, '/api/sources', {
    method: 'POST',
    body: JSON.stringify({
      source_text: 'Ways of Seeing',
      type: 'book',
      creator: 'John Berger',
      year: '1972',
      tags: ['art', 'criticism'],
    }),
  });
  assert.equal(sourceResponse.status, 201);

  const sourcesResponse = await request(mf, '/api/sources?type=book');
  assert.equal(sourcesResponse.status, 200);
  const sources = await sourcesResponse.json();
  assert.equal(sources.entries.length, 1);
  assert.equal(sources.entries[0].source_text, 'Ways of Seeing');
  assert.deepEqual(sources.entries[0].tags, ['art', 'criticism']);

  const futureResponse = await request(mf, '/api/future-events', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Festival',
      location: 'New York, NY',
      watch_month: 4,
      tags: ['art', 'technology'],
    }),
  });
  assert.equal(futureResponse.status, 201);

  const archivedResponse = await request(mf, '/api/future-events', {
    method: 'POST',
    body: JSON.stringify({ name: 'Past Festival', status: 'archived' }),
  });
  assert.equal(archivedResponse.status, 201);

  const futureEventsResponse = await request(mf, '/api/future-events');
  assert.equal(futureEventsResponse.status, 200);
  const futureEvents = await futureEventsResponse.json();
  assert.equal(futureEvents.entries.length, 1);
  assert.equal(futureEvents.entries[0].name, 'Test Festival');
  assert.deepEqual(futureEvents.entries[0].tags, ['art', 'technology']);
});
