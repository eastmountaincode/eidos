import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { knowledgePrompt } from './knowledge.js';
import { config, profiles, type ProfileName } from './config.js';

type MemoryResponse = {
  memoryNotes?: Array<{
    profile?: string;
    title?: string;
    body?: string;
    updated_at?: string;
  }>;
  peopleNotes?: Array<{
    person_name?: string;
    body?: string;
    updated_at?: string;
  }>;
};

function readIfExists(path: string): string {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8').trim();
}

export async function buildPrompt(userText: string, profile: ProfileName, channel: 'telegram' | 'web' = 'telegram', sourceRef?: string): Promise<string> {
  const root = config.workspacePath;
  const identity = readIfExists(resolve(root, 'shared/IDENTITY.md'));
  const profileIndex = readIfExists(resolve(root, 'shared/PROFILE_INDEX.md'));
  const crossContext = readIfExists(resolve(root, 'shared/CROSS_CONTEXT.md'));
  const memory = readIfExists(resolve(root, `profiles/${profile}/MEMORY.md`));
  const history = readIfExists(resolve(root, `profiles/${profile}/HISTORY.md`));
  const profileInfo = profiles[profile];
  const [d1Memory, knowledge] = await Promise.all([readPersistentMemory(profile), knowledgePrompt()]);

  return [
    '# Eidos Runtime Context',
    identity,
    profileIndex,
    crossContext,
    `Active profile: ${profile} (${profileInfo.description}).`,
    '',
    `## ${profileInfo.label} Memory`,
    memory || '(empty)',
    '',
    '## D1 Persistent Memory',
    d1Memory,
    '',
    `## ${profileInfo.label} History`,
    history || '(empty)',
    '',
    '## Operating Rules',
    '- You are Eidos, not Clawd, OpenClaw, or Claude.',
    '- Be concise, direct, and grounded in available data.',
    '- Do not infer stale projects, obligations, or priorities from old agent notes.',
    '- Before asking Andrew for stable personal facts such as home address, recurring preferences, or durable profile context, check the D1 Persistent Memory block and use it when it answers the question.',
    '- When Andrew refers to a specific person and context is uncertain, search both portal Memory and Messages before interpreting the situation. Start with the injected People Notes, then use `memory_context.py --search "NAME"` and `message_context.py --person "NAME"` as needed. A failed lookup in one source is not evidence that no context exists.',
    '- Write D1 history entries selectively when something would be meaningful for Andrew to see later on the portal Memory timeline. Do not ask "should I remember this"; use judgment, and when confidence is low, do not write.',
    '- Good history entries: events Andrew attended and then processed, meaningful plans or text conversations, relationship shifts, decisions, realizations, creative/work milestones, or unresolved threads likely to matter in a future check-in.',
    '- Write D1 persistent memory notes for durable facts, stable preferences, personal context, and profile-level facts Andrew will expect you to know later, such as addresses, recurring preferences, client defaults, or enduring project context.',
    '- Write D1 people notes for durable context about a specific person or relationship. Keep these grounded and update them when the relationship context changes.',
    '- Do not write persistent memory for simple contact-resolution facts like "this phone number is Gabe" or "rename this number to Sarah." Those belong in Messages contact resolution/overrides, not Memory, unless Andrew also provides durable relationship context worth remembering.',
    '- Bad history entries: routine agent chores, tool/status updates, generic summaries, calendar events just because they exist, every message exchange, speculative interpretations, or stale project assumptions.',
    '- Keep memory writes short and grounded. Use daily history for dated events and persistent memory for durable facts. Mention the write briefly only when it helps; do not make it the main response.',
    '- When you update a tool or skill implementation, prompt instructions, private config, or tested status, update the D1 capability registry before finishing so the portal Updated timestamp stays accurate.',
    '',
    knowledge,
    '',
    '## Current Conversation',
    channel === 'web'
      ? 'Andrew is talking to you in the Eidos web app. Reply directly here. Do not send this reply through Telegram. For memory provenance use "Eidos app conversation". Local file paths are not downloadable in this interface; do not claim to have attached a file.'
      : 'Andrew is talking to you through Telegram.',
    '',
    sourceRef ? `Current conversation reference: ${sourceRef}` : 'Current conversation reference: Telegram conversation; include the date and original quote when saving feedback.',
    '## User Message',
    userText,
  ].join('\n');
}

async function readPersistentMemory(profile: ProfileName): Promise<string> {
  if (!config.memory.workerUrl || !config.memory.apiToken) {
    throw new Error('Persistent memory unavailable: EIDOS_WORKER_URL and EIDOS_API_TOKEN are required');
  }

  const url = new URL('/api/memory', config.memory.workerUrl);
  url.searchParams.set('limit', '5');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${config.memory.apiToken}`,
      'User-Agent': 'Eidos/0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`Persistent memory unavailable: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as MemoryResponse;
  const lines: string[] = [];
  const profileNotes = (data.memoryNotes ?? []).filter((note) => !note.profile || note.profile === profile);
  const peopleNotes = data.peopleNotes ?? [];

  if (profileNotes.length) {
    lines.push('Profile notes:');
    for (const note of profileNotes) {
      lines.push(`- ${compact(note.title || 'Untitled')}: ${compact(note.body || '')}`);
    }
  }

  if (peopleNotes.length) {
    lines.push('People notes:');
    for (const note of peopleNotes.slice(0, 12)) {
      lines.push(`- ${compact(note.person_name || 'Unknown')}: ${compact(note.body || '')}`);
    }
  }

  return lines.length ? lines.join('\n') : '(empty)';
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
