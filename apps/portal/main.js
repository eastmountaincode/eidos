const views = {
  today: {
    title: "Today",
    subtitle: "Grounded check-in surface for schedule, messages, and relevant context.",
    cards: [
      ["Morning / Evening Check-in", "Calendar plus relevant message context. Email is deferred."],
      ["Open Loops", "Conversation-derived reminders without turning every calendar item into history."],
      ["Recent Signals", "Meaningful messages, agent conversations, and events worth noticing."]
    ]
  },
  messages: {
    title: "Messages",
    subtitle: "iMessage/SMS search, contact resolution, and analytics.",
    cards: [
      ["Ingest", "Read-only import from Messages chat.db on the Mac mini."],
      ["Analytics", "Conversation volume, sent/received balance, timing, gaps, and recent flow."],
      ["Contact Resolution", "Automatic matching with conversational corrections persisted as aliases."]
    ]
  },
  people: {
    title: "People",
    subtitle: "Relationships, recent context, and contact identity mapping.",
    cards: [
      ["People Index", "Resolved contacts, aliases, relationships, and notes."],
      ["Relationship History", "How relationships change over time, especially when messages and agent conversations overlap."]
    ]
  },
  history: {
    title: "History",
    subtitle: "Daily/life-history notes grounded in meaningful events.",
    cards: [
      ["Personal History", "Richer narrative history for things Andrew processed or cared about."],
      ["Creative History", "Project milestones, client conversations, and creative decisions."],
      ["Bioinformatics History", "Scientific/work milestones and decisions, not routine task logs."]
    ]
  },
  skills: {
    title: "Skills",
    subtitle: "Visible inventory of what Eidos can do and whether it still works.",
    cards: [
      ["Meeting Transcription", "Transcribe/summarize a meeting from a file."],
      ["Image to Apple Music Playlist", "Send a picture and generate an Apple Music playlist."],
      ["Skill Health", "Last tested, examples, inputs/outputs, and failure status."]
    ]
  },
  profiles: {
    title: "Profiles",
    subtitle: "Profile-specific memory and framing with full tool access.",
    cards: [
      ["personal", "Relationships, life history, people, personal processing. Narrative memory."],
      ["creative", "Creative coding, client work, browser experiences. Concise memory."],
      ["bioinformatics", "MGH/work, antibodies, HER2, scripts. Concise memory."]
    ]
  },
  system: {
    title: "System",
    subtitle: "Runtime status and data freshness, not life-priority claims.",
    cards: [
      ["Agent", "Eidos gateway, active profile, model, sessions."],
      ["Data Freshness", "Messages ingest, calendar check, portal sync, skills tests."],
      ["Archive", "Old Clawd notes are reference/search only, not active context."]
    ]
  }
};

const content = document.querySelector("#content");
const title = document.querySelector("#view-title");
const subtitle = document.querySelector("#view-subtitle");

function render(viewName) {
  const view = views[viewName];
  title.textContent = view.title;
  subtitle.textContent = view.subtitle;
  content.innerHTML = view.cards.map(([heading, body], index) => `
    <article class="card">
      <h3>${heading}</h3>
      <p>${body}</p>
      <p class="meta">${index === 0 ? '<span class="status"><span class="dot"></span> planned</span>' : '<span class="status"><span class="dot amber"></span> design pending</span>'}</p>
    </article>
  `).join("");
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    render(button.dataset.view);
  });
});

render("today");

