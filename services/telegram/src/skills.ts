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
    status: 'planned',
    summary: 'Morning and evening check-ins grounded in calendar, messages, and recent agent conversations.',
  },
  {
    name: 'playlist-from-image',
    status: 'planned',
    summary: 'Turn an image or vibe board into an Apple Music playlist.',
  },
];

export function skillsText(): string {
  return skills.map((skill) => `${skill.name} [${skill.status}]: ${skill.summary}`).join('\n');
}
