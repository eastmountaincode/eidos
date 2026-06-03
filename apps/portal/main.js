const content = document.querySelector("#content");
const statusPill = document.querySelector("#status-pill");
let currentData = null;
let selectedConversationKey = "";

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
  currentData = data;
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

    <section class="messages-grid">
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

      <aside class="panel detail-panel" id="detail-panel">
        ${renderDetailEmpty()}
      </aside>
    </section>

    <section class="ops-line">
      <span>Cloudflare D1</span>
      <span>${escapeHtml(shortSource(run.source || "~/Library/Messages/chat.db"))}</span>
    </section>
  `;

  bindConversationRows();
  if (selectedConversationKey) {
    loadConversationDetail(selectedConversationKey);
  }
}

function renderConversations(conversations) {
  if (!conversations.length) {
    return `<p class="empty">No conversations ingested yet.</p>`;
  }
  return `<div class="people-table">
    <div class="people-row table-head">
      <span>#</span>
      <span>Person</span>
      <span>Messages</span>
      <span>Balance</span>
      <span>Split</span>
      <span>Last active</span>
    </div>
    ${conversations.map((item, index) => {
      const count = Number(item.message_count || 0);
      const sent = Number(item.sent_count || 0);
      const received = Number(item.received_count || 0);
      const sentPct = count ? Math.round((sent / count) * 100) : 0;
      const receivedPct = count ? 100 - sentPct : 0;
      const selected = item.conversation_key === selectedConversationKey ? " selected" : "";
      return `<article class="people-row${selected}" role="button" tabindex="0" data-conversation-key="${escapeHtml(item.conversation_key)}">
        <span class="rank">${index + 1}</span>
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

function bindConversationRows() {
  document.querySelectorAll(".people-row[data-conversation-key]").forEach((row) => {
    row.addEventListener("click", () => selectConversation(row.dataset.conversationKey));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectConversation(row.dataset.conversationKey);
      }
    });
  });
}

function selectConversation(conversationKey) {
  if (!conversationKey) return;
  selectedConversationKey = conversationKey;
  document.querySelectorAll(".people-row[data-conversation-key]").forEach((row) => {
    row.classList.toggle("selected", row.dataset.conversationKey === selectedConversationKey);
  });
  loadConversationDetail(conversationKey);
}

async function loadConversationDetail(conversationKey) {
  const panel = document.querySelector("#detail-panel");
  if (!panel) return;
  panel.innerHTML = `<p class="empty">Loading conversation...</p>`;

  try {
    const response = await fetch(`/api/message-detail?conversation_key=${encodeURIComponent(conversationKey)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const detail = await response.json();
    panel.innerHTML = renderDetail(detail);
    bindSummaryControls(detail.conversation.conversation_key);
  } catch (err) {
    panel.innerHTML = `<p class="empty">Could not load conversation detail: ${escapeHtml(String(err))}</p>`;
  }
}

function bindSummaryControls(conversationKey) {
  const button = document.querySelector("#summary-request-button");
  const select = document.querySelector("#summary-window");
  if (!button || !select) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Requesting...";
    try {
      const response = await fetch("/api/message-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_key: conversationKey,
          window_type: select.value,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await loadConversationDetail(conversationKey);
    } catch (err) {
      button.disabled = false;
      button.textContent = "Summarize";
      const target = document.querySelector("#summary-status");
      if (target) target.textContent = `Request failed: ${String(err)}`;
    }
  });
}

function renderDetailEmpty() {
  return `<div class="detail-empty">
    <h3>Conversation detail</h3>
    <p class="muted">Select a person to view recent messages and request a summary.</p>
  </div>`;
}

function renderDetail(detail) {
  const conversation = detail.conversation || {};
  const summaries = detail.summaries || [];
  const latestSummary = summaries[0] || null;
  return `
    <div class="detail-head">
      <div>
        <h3>${escapeHtml(conversation.display_name || "Conversation")}</h3>
        <p class="muted">${formatNumber(conversation.message_count)} messages in the current window</p>
      </div>
      ${conversation.last_active ? `<span class="muted">${formatDate(conversation.last_active)}</span>` : ""}
    </div>

    <div class="summary-controls">
      <select id="summary-window" aria-label="Summary window">
        <option value="week">Last week</option>
        <option value="two_weeks">Last 2 weeks</option>
        <option value="month">Last month</option>
        <option value="last_100">Last 100 messages</option>
      </select>
      <button id="summary-request-button" type="button">Summarize</button>
    </div>
    <p id="summary-status" class="muted">${latestSummary ? summaryStatus(latestSummary) : "No summary requested yet."}</p>

    ${renderSummary(latestSummary)}
    ${renderRecentMessages(detail.recentMessages || [])}
  `;
}

function renderSummary(summary) {
  if (!summary) {
    return `<section class="detail-block">
      <h4>Summary</h4>
      <p class="muted">Request one when this conversation is worth reading in context.</p>
    </section>`;
  }

  if (summary.status !== "completed") {
    return `<section class="detail-block">
      <h4>Summary</h4>
      <p class="muted">${summary.status === "failed" ? escapeHtml(summary.error || "Summary failed.") : "Queued for the Mac mini."}</p>
    </section>`;
  }

  return `<section class="detail-block">
    <h4>Summary</h4>
    <p>${escapeHtml(summary.summary || "No summary text.")}</p>
    ${renderThemes(summary.themes || [])}
    ${summary.relationship_notes ? `<h4>Relationship notes</h4><p>${escapeHtml(summary.relationship_notes)}</p>` : ""}
  </section>`;
}

function renderThemes(themes) {
  if (!themes.length) return "";
  return `<h4>Themes</h4><ul class="themes">${themes.map((theme) => `<li>${escapeHtml(theme)}</li>`).join("")}</ul>`;
}

function renderRecentMessages(messages) {
  if (!messages.length) {
    return `<section class="detail-block">
      <h4>Recent messages</h4>
      <p class="muted">No recent message previews in D1 for this conversation.</p>
    </section>`;
  }

  return `<section class="detail-block">
    <h4>Recent messages</h4>
    <div class="message-preview-list">
      ${messages.map((message) => `<article class="message-preview ${message.direction === "sent" ? "sent" : "received"}">
        <div>
          <strong>${message.direction === "sent" ? "You" : "Them"}</strong>
          <span>${message.timestamp ? formatDate(message.timestamp) : ""}</span>
        </div>
        <p>${escapeHtml(message.body || "")}</p>
      </article>`).join("")}
    </div>
  </section>`;
}

function summaryStatus(summary) {
  const label = summaryWindowLabel(summary.window_type);
  if (summary.status === "completed") {
    return `${label} summary generated ${summary.generated_at ? formatDate(summary.generated_at) : ""}.`;
  }
  if (summary.status === "failed") {
    return `${label} summary failed.`;
  }
  return `${label} summary is ${summary.status}.`;
}

function summaryWindowLabel(value) {
  if (value === "two_weeks") return "Last 2 weeks";
  if (value === "month") return "Last month";
  if (value === "last_100") return "Last 100 messages";
  return "Last week";
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
