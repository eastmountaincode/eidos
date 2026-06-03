export function formatDate(value?: string | null) {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(value?: string | null) {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).replace(",", "");
}

export function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString();
}

export function shortSource(value?: string | null) {
  return String(value || "~/Library/Messages/chat.db").replace(/^\/Users\/[^/]+/, "~");
}
