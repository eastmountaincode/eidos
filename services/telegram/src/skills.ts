type Skill = {
  name: string;
  status: 'planned' | 'stub' | 'active' | 'needs_permission';
  summary: string;
};

const skills: Skill[] = [
  {
    name: 'telegram-chat',
    status: 'active',
    summary: 'Talk to Eidos from Telegram with profile-aware Codex sessions.',
  },
  {
    name: 'file-intake',
    status: 'active',
    summary: 'Forward Telegram photos, voice notes, and documents to Codex as local files.',
  },
  {
    name: 'messages-ingest',
    status: 'active',
    summary: 'Read D1-backed iMessage/SMS context, summaries, and analytics when useful.',
  },
  {
    name: 'invoice-generator',
    status: 'active',
    summary: 'Create PDF invoices with D1-backed per-client numbering.',
  },
  {
    name: 'capability-registry',
    status: 'active',
    summary: 'Update tool and skill metadata timestamps for the portal registry.',
  },
  {
    name: 'calendar-events',
    status: 'needs_permission',
    summary: 'Add structured event details to Apple Calendar, defaulting to Events Ambient.',
  },
  {
    name: 'calendar-checkins',
    status: 'active',
    summary: 'Send morning and evening Telegram check-ins grounded in calendar, messages, and recent agent context.',
  },
  {
    name: 'mantra-context',
    status: 'active',
    summary: 'Read the current portal Mantra as a lightweight focus/intention for check-ins and reflection.',
  },
  {
    name: 'memory-context',
    status: 'active',
    summary: 'Read and selectively write D1-backed daily history, persistent profile memory, and people notes.',
  },
  {
    name: 'apple-music-playlist',
    status: 'active',
    summary: 'Create Apple Music playlists and add matched catalog tracks; image-to-playlist extraction is handled by the agent.',
  },
];

export function skillsText(): string {
  return skills.map((skill) => `${skill.name} [${skill.status}]: ${skill.summary}`).join('\n');
}
