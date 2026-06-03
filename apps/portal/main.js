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
  content.innerHTML = `
    <section class="status-strip">
      ${metric(run.total_messages ?? 0, `messages in last ${run.window_days ?? 30} days`)}
      ${metric(run.conversation_count ?? conversations.length, "conversations")}
      ${metric(run.last_message_at ? formatDate(run.last_message_at) : "none", "latest message")}
      ${metric(run.exported_at ? formatDate(run.exported_at) : "not yet", "last ingest")}
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>People, last ${run.window_days ?? 30} days</h3>
        ${badge(data.status || "pending")}
      </div>
      ${renderConversations(conversations)}
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Ingest</h3>
      </div>
      <div class="list">
        ${row("Storage", "Cloudflare D1")}
        ${row("Source", run.source || "~/Library/Messages/chat.db")}
        ${row("Next", "not scheduled yet")}
      </div>
    </section>
  `;
}

function renderConversations(conversations) {
  if (!conversations.length) {
    return `<p class="empty">No conversations ingested yet.</p>`;
  }
  return `<div class="conversation-list">
    ${conversations.map((item) => {
      const count = Number(item.message_count || 0);
      const sent = Number(item.sent_count || 0);
      const received = Number(item.received_count || 0);
      const sentPct = count ? Math.round((sent / count) * 100) : 0;
      const receivedPct = count ? 100 - sentPct : 0;
      return `<article class="conversation-row">
        <div class="row-head">
          <span class="row-title">${escapeHtml(item.display_name || "Unknown")}</span>
          <span class="row-subtitle">${escapeHtml(String(count))} messages</span>
        </div>
        <div class="balance-bar" aria-label="${sentPct}% from Andrew, ${receivedPct}% from them">
          <span class="sent" style="width: ${sentPct}%"></span>
          <span class="received" style="width: ${receivedPct}%"></span>
        </div>
        <div class="conversation-meta">
          <span>${sent} sent</span>
          <span>${received} received</span>
          <span>${sentPct}% from Andrew</span>
          <span>${item.last_active ? formatDate(item.last_active) : "no date"}</span>
        </div>
      </article>`;
    }).join("")}
  </div>`;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function row(title, detail) {
  return `<div class="row">
    <span class="row-title">${escapeHtml(title)}</span>
    <p class="row-subtitle">${escapeHtml(detail)}</p>
  </div>`;
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
