-- Keep latest-sync lookups from scanning every historical sync run.
-- Safe to apply repeatedly to existing production databases.
CREATE INDEX IF NOT EXISTS idx_message_sync_runs_exported_at ON message_sync_runs(exported_at DESC);
