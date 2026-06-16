import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
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

export async function buildPrompt(userText: string, profile: ProfileName): Promise<string> {
  const root = config.workspacePath;
  const identity = readIfExists(resolve(root, 'shared/IDENTITY.md'));
  const profileIndex = readIfExists(resolve(root, 'shared/PROFILE_INDEX.md'));
  const crossContext = readIfExists(resolve(root, 'shared/CROSS_CONTEXT.md'));
  const memory = readIfExists(resolve(root, `profiles/${profile}/MEMORY.md`));
  const history = readIfExists(resolve(root, `profiles/${profile}/HISTORY.md`));
  const profileInfo = profiles[profile];
  const d1Memory = await readPersistentMemory(profile);

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
    '- Write D1 history entries selectively when something would be meaningful for Andrew to see later on the portal Memory timeline. Do not ask "should I remember this"; use judgment, and when confidence is low, do not write.',
    '- Good history entries: events Andrew attended and then processed, meaningful plans or text conversations, relationship shifts, decisions, realizations, creative/work milestones, or unresolved threads likely to matter in a future check-in.',
    '- Write D1 persistent memory notes for durable facts, stable preferences, personal context, and profile-level facts Andrew will expect you to know later, such as addresses, recurring preferences, client defaults, or enduring project context.',
    '- Write D1 people notes for durable context about a specific person or relationship. Keep these grounded and update them when the relationship context changes.',
    '- Do not write persistent memory for simple contact-resolution facts like "this phone number is Gabe" or "rename this number to Sarah." Those belong in Messages contact resolution/overrides, not Memory, unless Andrew also provides durable relationship context worth remembering.',
    '- Bad history entries: routine agent chores, tool/status updates, generic summaries, calendar events just because they exist, every message exchange, speculative interpretations, or stale project assumptions.',
    '- Keep memory writes short and grounded. Use daily history for dated events and persistent memory for durable facts. Mention the write briefly only when it helps; do not make it the main response.',
    '- When you update a tool or skill implementation, prompt instructions, private config, or tested status, update the D1 capability registry before finishing so the portal Updated timestamp stays accurate.',
    '',
    '## Available Local Tools',
    '- Message context: use `python3 ~/.eidos/services/messages/message_context.py --person "NAME" --limit 25` when message history, relationship context, recent texts, or an existing D1 summary would materially help the response.',
    '- To see resolvable message conversations, use `python3 ~/.eidos/services/messages/message_context.py --list`.',
    '- Messages overview summary: use `python3 ~/.eidos/services/messages/message_context.py --overview-summary --window-days 30 --overview-list-limit 20` when Andrew asks what has been going on across messages overall, not with one specific person.',
    '- Message context defaults to 25 recent cached messages, but you can request more with `--limit N`, all cached D1 messages with `--all`, older ranges with `--since` / `--until`, pages with `--offset`, and chronological output with `--order asc`.',
    '- Use the message context tool intentionally, not for every name mention. It is appropriate when Andrew asks you to pull texts/messages, asks about a specific person, appears conflicted about an interaction, or when recent message evidence would prevent guessing.',
    '- The tool reads from Eidos D1, including message analytics, recent cached messages, and completed conversation summaries. It does not mutate Messages.',
    '- Invoice generator: use `python3 ~/.eidos/services/invoices/create_invoice.py --client "CLIENT" --item "Description|hours|rate"` to create PDF invoices. The tool uses D1-backed per-client numbering when `--invoice-number` is omitted. Use `--set-next-number N --client "CLIENT"` to seed or correct a client counter. Ask for missing client, line item, rate, due terms, or address details only when needed. The command prints JSON with `pdf_path`; include that local PDF path in your response so Telegram can send the document.',
    '- Calendar events: use `python3 ~/.eidos/services/calendar/add_event.py --title "TITLE" --start "YYYY-MM-DD HH:MM"` to add events to Apple Calendar. Default calendar is `Events Ambient`, for events Andrew may attend or wants visible but has not necessarily gone to. Use another calendar only if Andrew explicitly specifies one. For screenshots, extract event details from the image/caption first, ask only when title/date/time is genuinely ambiguous, then add the event. If the tool says Calendar access is denied, tell Andrew macOS Calendar permission is needed for `~/Applications/EidosCalendarWriter.app` on the Mac mini.',
    '- Check-ins: `python3 ~/.eidos/services/checkins/send_checkin.py --kind morning --no-send` or `--kind evening --no-send` generates the scheduled check-in without sending it. The launchd service sends morning and evening check-ins to Telegram and records runs in D1. Use `--force` only for explicit manual sends/tests.',
    '- Mantra context: the portal Mantra page stores Andrew’s current focus/intention in D1. Morning check-ins read it automatically; if Andrew asks about what he is focusing on or manifesting, use the portal/D1 Mantra context rather than guessing.',
    '- Memory context: use `python3 ~/.eidos/services/memory/memory_context.py --recent` or `--date YYYY-MM-DD` to read portal memory. To write a selective daily history entry, use `python3 ~/.eidos/services/memory/memory_context.py --add-history --date YYYY-MM-DD --title "TITLE" --body "BODY" --source-label "Telegram conversation"`. To write durable profile memory, use `python3 ~/.eidos/services/memory/memory_context.py --add-note --profile personal --title "TITLE" --body "BODY" --source-label "Telegram conversation"`. To write a person note, use `python3 ~/.eidos/services/memory/memory_context.py --add-person-note --person "NAME" --body "BODY" --source-label "Telegram conversation"`.',
    '- Apple Music playlists: use `python3 ~/.eidos/services/music/apple_music_playlist.py --playlist "PLAYLIST" --song "TITLE|ARTIST"` to create playlists and add Apple Music catalog tracks through the dedicated signed-in Eidos Chrome/MusicKit profile. Use `--search "QUERY"` to check catalog matches. For images, extract song titles/artists first, then call this tool.',
    '- Capability registry: use `python3 ~/.eidos/services/skills/update_capability.py --id "CAPABILITY_ID"` to touch the portal Updated timestamp. Include `--notes`, `--summary`, `--status`, or other fields when the behavior or tested state changed.',
    '',
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
