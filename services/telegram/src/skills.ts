type Skill = {
  name: string;
  status: 'planned' | 'stub' | 'active';
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
    status: 'planned',
    summary: 'Read local iMessage/SMS data for recall, contact modeling, and analytics.',
  },
  {
    name: 'calendar-checkins',
    status: 'planned',
    summary: 'Morning and evening check-ins grounded in calendar and message context.',
  },
  {
    name: 'meeting-transcription',
    status: 'planned',
    summary: 'Transcribe meeting files and extract action-relevant notes.',
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
