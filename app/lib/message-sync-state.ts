import type { MessageIngestRequest } from "@/types/messages";

export function messageSyncState(
  request?: MessageIngestRequest | null,
  now = Date.now(),
) {
  if (!request || !["queued", "running"].includes(request.status))
    return request?.status || "idle";
  const value =
    request.updated_at || request.started_at || request.requested_at;
  // D1 datetime strings are UTC, even without a timezone suffix.
  const timestamp = value
    ? Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z")
    : NaN;
  return Number.isFinite(timestamp) && now - timestamp > 30 * 60 * 1000
    ? "stale"
    : request.status;
}
