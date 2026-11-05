import assert from "node:assert/strict";
import { test } from "node:test";
import { messageSyncState } from "./message-sync-state";

test("an old sync request is not displayed or polled as a current sync", () => {
  const now = Date.parse("2026-10-01T16:30:00Z");
  assert.equal(
    messageSyncState(
      { id: "old", status: "running", updated_at: "2026-09-01 18:57:24" },
      now,
    ),
    "stale",
  );
  assert.equal(
    messageSyncState(
      { id: "new", status: "queued", requested_at: "2026-10-01 16:29:00" },
      now,
    ),
    "queued",
  );
  assert.equal(
    messageSyncState(
      { id: "new", status: "running", updated_at: "2026-10-01T16:29:00Z" },
      now,
    ),
    "running",
  );
  assert.equal(
    messageSyncState(
      { id: "done", status: "completed", updated_at: "2026-09-01 18:57:24" },
      now,
    ),
    "completed",
  );
  assert.equal(messageSyncState(undefined, now), "idle");
});
