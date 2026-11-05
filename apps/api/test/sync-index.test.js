import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

test('latest sync uses an index after an idempotent migration', () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec('CREATE TABLE message_sync_runs (id TEXT PRIMARY KEY, exported_at TEXT NOT NULL)');
        db.exec(`WITH RECURSIVE runs(n) AS (
            SELECT 1 UNION ALL SELECT n + 1 FROM runs WHERE n < 7000
        ) INSERT INTO message_sync_runs SELECT CAST(n AS TEXT), printf('%08d', n) FROM runs`);
        const query = 'SELECT * FROM message_sync_runs ORDER BY exported_at DESC LIMIT 1';
        const migration = readFileSync(new URL('../message_sync_index.sql', import.meta.url), 'utf8');
        db.exec(migration);
        db.exec(migration);
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
        assert.ok(plan.some((row) => row.detail.includes('idx_message_sync_runs_exported_at')));
        assert.ok(plan.every((row) => !row.detail.includes('TEMP B-TREE')));
        assert.equal(db.prepare(query).get().id, '7000');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM message_sync_runs').get().count, 7000);
    } finally {
        db.close();
    }
});
