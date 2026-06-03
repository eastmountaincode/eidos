const state = {
  view: "today",
  profile: localStorage.getItem("eidos.profile") || "personal",
  data: null,
};

const viewMeta = {
  today: {
    kicker: "Overview",
    title: "Today",
    subtitle: "Grounded check-in surface for schedule, messages, and relevant context.",
  },
  messages: {
    kicker: "Texts",
    title: "Messages",
    subtitle: "iMessage/SMS ingest, recall, contact resolution, and analytics.",
  },
  people: {
    kicker: "Relationships",
    title: "People",
    subtitle: "Resolved contacts, recent context, and relationship notes.",
  },
  history: {
    kicker: "Memory",
    title: "History",
    subtitle: "Daily history grounded in meaningful conversations, events, and agent sessions.",
  },
  skills: {
    kicker: "Capabilities",
    title: "Skills",
    subtitle: "Compact inventory of what Eidos can do and whether it still works.",
  },
  profiles: {
    kicker: "Context",
    title: "Profiles",
    subtitle: "Profile-specific framing with a small shared identity layer and full tool access.",
  },
  system: {
    kicker: "Runtime",
    title: "System",
    subtitle: "Deployment state, data freshness, and old-system boundaries.",
  },
};

const content = document.querySelector("#content");
const title = document.querySelector("#view-title");
const subtitle = document.querySelector("#view-subtitle");
const kicker = document.querySelector("#view-kicker");
const profileSelect = document.querySelector("#profile-select");
const runtimePill = document.querySelector("#runtime-pill");

profileSelect.value = state.profile;

async function loadData() {
  try {
    const response = await fetch("./data/portal.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (err) {
    state.data = fallbackData(String(err));
  }
  render();
}

function render() {
  const meta = viewMeta[state.view];
  kicker.textContent = meta.kicker;
  title.textContent = meta.title;
  subtitle.textContent = meta.subtitle;
  runtimePill.textContent = state.data.system.gateway.status === "running" ? "Gateway running" : "Gateway pending";
  runtimePill.className = state.data.system.gateway.status === "running" ? "runtime-pill" : "runtime-pill badge wait";

  const renderers = {
    today: renderToday,
    messages: renderMessages,
    people: renderPeople,
    history: renderHistory,
    skills: renderSkills,
    profiles: renderProfiles,
    system: renderSystem,
  };

  content.innerHTML = renderers[state.view]();
}

function renderToday() {
  const profile = state.data.profiles.find((item) => item.id === state.profile);
  const checkins = state.data.checkins;
  return grid([
    panel("Active Profile", `
      <div class="row">
        <div class="row-head">
          <span class="row-title">${escapeHtml(profile.label)}</span>
          ${badge(profile.memoryMode)}
        </div>
        <p class="row-subtitle">${escapeHtml(profile.scope)}</p>
      </div>
    `, "span-4"),
    panel("Telegram", `
      <div class="row">
        <div class="row-head">
          <span class="row-title">${escapeHtml(state.data.system.telegram.displayName)}</span>
          ${badge(state.data.system.gateway.status)}
        </div>
        <p class="row-subtitle">@${escapeHtml(state.data.system.telegram.username)}</p>
      </div>
    `, "span-4"),
    panel("Messages", `
      <div class="row">
        <div class="row-head">
          <span class="row-title">${escapeHtml(state.data.messages.ingest.status)}</span>
          ${badge(state.data.messages.ingest.freshness)}
        </div>
        <p class="row-subtitle">${escapeHtml(state.data.messages.ingest.source)}</p>
      </div>
    `, "span-4"),
    panel("Check-ins", `
      <div class="list">
        ${checkins.map((item) => row(item.name, item.schedule, item.status)).join("")}
      </div>
    `, "span-6"),
    panel("Open Build Threads", `
      <div class="list">
        ${state.data.today.openThreads.map((item) => row(item.title, item.detail, item.status)).join("")}
      </div>
    `, "span-6"),
    panel("Recent History", renderTimeline(state.data.history.slice(0, 3)), "span-12"),
  ]);
}

function renderMessages() {
  const stats = state.data.messages.stats;
  return grid([
    `<section class="metrics panel span-12">
      ${metric(stats.conversationsTracked, "tracked conversations")}
      ${metric(stats.aliasCorrections, "alias corrections")}
      ${metric(stats.analyticsViews, "analytics views planned")}
    </section>`,
    panel("Ingest", `
      <div class="list">
        ${row("Source", state.data.messages.ingest.source, state.data.messages.ingest.status)}
        ${row("Freshness", state.data.messages.ingest.lastRun, state.data.messages.ingest.freshness)}
        ${row("Policy", state.data.messages.ingest.policy, "read-only")}
      </div>
    `, "span-5"),
    panel("Analytics", `
      <div class="list">
        ${state.data.messages.analytics.map((item) => row(item.name, item.detail, item.status)).join("")}
      </div>
    `, "span-7"),
    panel("Contact Resolution", `
      <div class="list">
        ${state.data.messages.contactResolution.map((item) => row(item.name, item.detail, item.status)).join("")}
      </div>
    `, "span-12"),
  ]);
}

function renderPeople() {
  return grid([
    panel("People Model", `
      <div class="list">
        ${state.data.people.model.map((item) => row(item.name, item.detail, item.status)).join("")}
      </div>
    `, "span-5"),
    panel("Contact Records", renderTable(["Field", "Purpose", "Status"], state.data.people.fields.map((item) => [
      item.field,
      item.purpose,
      item.status,
    ])), "span-7"),
  ]);
}

function renderHistory() {
  const profile = state.data.profiles.find((item) => item.id === state.profile);
  return grid([
    panel(`${profile.label} History Rule`, `
      <div class="row">
        <span class="row-title">${escapeHtml(profile.historyRule)}</span>
        <p class="row-subtitle">${escapeHtml(profile.memoryMode)} memory mode</p>
      </div>
    `, "span-5"),
    panel("Eligibility", `
      <div class="list">
        ${state.data.historyRules.map((item) => row(item.name, item.detail, item.status)).join("")}
      </div>
    `, "span-7"),
    panel("Timeline", renderTimeline(state.data.history), "span-12"),
  ]);
}

function renderSkills() {
  return grid([
    panel("Inventory", renderTable(["Skill", "Status", "Last Tested", "Summary"], state.data.skills.map((skill) => [
      skill.name,
      statusCell(skill.status),
      skill.lastTested,
      skill.summary,
    ])), "span-12"),
  ]);
}

function renderProfiles() {
  return grid(state.data.profiles.map((profile) => panel(profile.label, `
    <div class="list">
      ${row("Scope", profile.scope, profile.id === state.profile ? "active" : "available")}
      ${row("Memory", profile.memoryMode, "mode")}
      ${row("History", profile.historyRule, "rule")}
    </div>
  `, "span-4")));
}

function renderSystem() {
  return grid([
    panel("Runtime", `
      <div class="list">
        ${row("LaunchAgent", state.data.system.gateway.launchAgent, state.data.system.gateway.status)}
        ${row("Workspace", state.data.system.gateway.workspace, "active")}
        ${row("Codex", state.data.system.gateway.model, "provider")}
      </div>
    `, "span-6"),
    panel("Boundaries", `
      <div class="list">
        ${state.data.system.boundaries.map((item) => row(item.name, item.detail, item.status)).join("")}
      </div>
    `, "span-6"),
    panel("Data Freshness", renderTable(["Source", "Status", "Last Seen"], state.data.system.freshness.map((item) => [
      item.source,
      statusCell(item.status),
      item.lastSeen,
    ])), "span-12"),
  ]);
}

function grid(items) {
  return `<div class="section-grid">${items.join("")}</div>`;
}

function panel(titleText, body, span = "span-6") {
  return `<section class="panel ${span}">
    <div class="panel-head">
      <h3>${escapeHtml(titleText)}</h3>
    </div>
    ${body}
  </section>`;
}

function row(titleText, detail, status) {
  return `<div class="row">
    <div class="row-head">
      <span class="row-title">${escapeHtml(titleText)}</span>
      ${badge(status)}
    </div>
    <p class="row-subtitle">${escapeHtml(detail)}</p>
  </div>`;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderTimeline(items) {
  if (!items.length) return `<p class="empty">No history entries yet.</p>`;
  return `<div class="timeline">
    ${items.map((item) => `<div class="timeline-item">
      <div class="row-title">${escapeHtml(item.title)}</div>
      <p class="row-subtitle">${escapeHtml(item.date)} · ${escapeHtml(item.profile)}</p>
      <p class="muted">${escapeHtml(item.detail)}</p>
    </div>`).join("")}
  </div>`;
}

function renderTable(headers, rows) {
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function badge(value) {
  const text = String(value || "pending");
  const className = ["running", "active", "ready", "read-only"].includes(text)
    ? "badge"
    : ["planned", "pending", "needs_test", "stale"].includes(text)
      ? "badge wait"
      : text === "off"
        ? "badge off"
        : "badge wait";
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function statusCell(status) {
  return badge(status);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackData(error) {
  return {
    profiles: [{ id: "personal", label: "Personal", scope: "Fallback data", memoryMode: "narrative", historyRule: error }],
    today: { openThreads: [] },
    checkins: [],
    messages: {
      ingest: { status: "pending", freshness: "stale", source: "portal data failed", lastRun: error, policy: "read-only" },
      stats: { conversationsTracked: 0, aliasCorrections: 0, analyticsViews: 0 },
      analytics: [],
      contactResolution: [],
    },
    people: { model: [], fields: [] },
    historyRules: [],
    history: [],
    skills: [],
    system: {
      telegram: { displayName: "Eidos", username: "unknown" },
      gateway: { status: "pending", launchAgent: "unknown", workspace: "unknown", model: "unknown" },
      boundaries: [],
      freshness: [],
    },
  };
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.view = button.dataset.view;
    render();
  });
});

profileSelect.addEventListener("change", () => {
  state.profile = profileSelect.value;
  localStorage.setItem("eidos.profile", state.profile);
  render();
});

loadData();
