const content = document.querySelector("#content");
const statusPill = document.querySelector("#status-pill");

async function loadMessagesStatus() {
  try {
    const response = await fetch("./data/messages-status.json", { cache: "no-store" });
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

  const stats = data.stats || {};
  content.innerHTML = `
    <section class="metrics">
      ${metric(stats.total_messages ?? 0, `messages in last ${data.window_days ?? 30} days`)}
      ${metric(stats.conversation_count ?? 0, "conversations")}
      ${metric(stats.last_message_at ? formatDate(stats.last_message_at) : "none", "latest message")}
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Access</h3>
        ${badge(data.status || "pending")}
      </div>
      <div class="list">
        ${row("Source", data.source || "~/Library/Messages/chat.db")}
        ${row("Private export", data.private_data_path || "not created yet")}
        ${row("Last export", data.exported_at ? formatDate(data.exported_at) : "not run yet")}
        ${row("Policy", data.note || "Read-only. Message text stays on the Mac mini.")}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Services</h3>
      </div>
      ${renderServices(stats.services_in_recent_export || {})}
    </section>
  `;
}

function renderServices(services) {
  const entries = Object.entries(services);
  if (!entries.length) {
    return `<p class="empty">No service counts yet.</p>`;
  }
  const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0) || 1;
  return `<div class="service-list">
    ${entries.map(([name, count]) => {
      const pct = Math.round((Number(count || 0) / total) * 100);
      return `<div class="service-row">
        <div class="row-head">
          <span class="row-title">${escapeHtml(name || "unknown")}</span>
          <span class="row-subtitle">${escapeHtml(String(count))}</span>
        </div>
        <div class="bar"><span style="width: ${pct}%"></span></div>
      </div>`;
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
    source: "~/Library/Messages/chat.db",
    private_data_path: "not created yet",
    window_days: 30,
    exported_at: null,
    stats: {
      total_messages: 0,
      conversation_count: 0,
      last_message_at: null,
      services_in_recent_export: {},
    },
    note: `Messages status unavailable: ${error}`,
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
