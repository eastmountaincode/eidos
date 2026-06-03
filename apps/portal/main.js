const content = document.querySelector("#content");
const statusPill = document.querySelector("#status-pill");

async function loadMessagesStatus() {
  try {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (err) {
    render(fallbackStatus(String(err)));
  }
}

function render(data) {
  const active = data.status === "active";
  statusPill.textContent = active ? "Connected" : "Not connected";
  statusPill.className = active ? "runtime-pill" : "runtime-pill wait";

  const run = data.latestRun || {};
  const conversations = data.topConversations || [];
  const windowDays = run.window_days ?? 30;
  content.innerHTML = `
    <section class="summary-line" aria-label="Messages summary">
      ${summaryFact(formatNumber(run.total_messages ?? 0), `${windowDays}d messages`)}
      ${summaryFact(formatNumber(run.conversation_count ?? conversations.length), `${windowDays}d active conversations`)}
      ${summaryFact(run.last_message_at ? formatDate(run.last_message_at) : "none", "latest")}
      ${summaryFact(run.exported_at ? formatDate(run.exported_at) : "not yet", "ingested")}
      ${summaryFact("not scheduled", "next ingest")}
    </section>

    <section class="panel people-panel">
      <div class="panel-head">
        <div>
          <h3>People</h3>
          <p class="muted">Last ${windowDays} days, sorted by message count.</p>
        </div>
        ${badge(data.status || "pending")}
      </div>
      ${renderConversations(conversations)}
    </section>

    <section class="ops-line">
      <span>Cloudflare D1</span>
      <span>${escapeHtml(shortSource(run.source || "~/Library/Messages/chat.db"))}</span>
    </section>
  `;
}

function renderConversations(conversations) {
  if (!conversations.length) {
    return `<p class="empty">No conversations ingested yet.</p>`;
  }
  return `<div class="people-table">
    <div class="people-row table-head">
      <span>Person</span>
      <span>Messages</span>
      <span>Balance</span>
      <span>Split</span>
      <span>Last active</span>
    </div>
    ${conversations.map((item) => {
      const count = Number(item.message_count || 0);
      const sent = Number(item.sent_count || 0);
      const received = Number(item.received_count || 0);
      const sentPct = count ? Math.round((sent / count) * 100) : 0;
      const receivedPct = count ? 100 - sentPct : 0;
      return `<article class="people-row">
        <span class="person-name">${escapeHtml(item.display_name || "Unknown")}</span>
        <span>${formatNumber(count)}</span>
        <div class="balance-cell">
          <div class="balance-bar" aria-label="${sentPct}% from Andrew, ${receivedPct}% from them">
            <span class="sent" style="width: ${sentPct}%"></span>
            <span class="received" style="width: ${receivedPct}%"></span>
          </div>
        </div>
        <span class="split">
          <span>${sent} you</span>
          <span>${received} them</span>
        </span>
        <span>${item.last_active ? formatDate(item.last_active) : "no date"}</span>
      </article>`;
    }).join("")}
  </div>`;
}

function summaryFact(value, label) {
  return `<div class="summary-fact"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function shortSource(value) {
  return String(value).replace(/^\/Users\/[^/]+/, "~");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function badge(status) {
  const text = String(status);
  const className = text === "active" ? "badge" : "badge wait";
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fallbackStatus(error) {
  return {
    status: "pending",
    latestRun: {
      total_messages: 0,
      conversation_count: 0,
      last_message_at: null,
      exported_at: null,
      window_days: 30,
      source: "~/Library/Messages/chat.db",
    },
    topConversations: [],
    error,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadMessagesStatus();
