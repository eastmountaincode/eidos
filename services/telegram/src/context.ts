import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config, profiles, type ProfileName } from './config.js';

function readIfExists(path: string): string {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8').trim();
}

export function buildPrompt(userText: string, profile: ProfileName): string {
  const root = config.workspacePath;
  const identity = readIfExists(resolve(root, 'shared/IDENTITY.md'));
  const profileIndex = readIfExists(resolve(root, 'shared/PROFILE_INDEX.md'));
  const crossContext = readIfExists(resolve(root, 'shared/CROSS_CONTEXT.md'));
  const memory = readIfExists(resolve(root, `profiles/${profile}/MEMORY.md`));
  const history = readIfExists(resolve(root, `profiles/${profile}/HISTORY.md`));
  const profileInfo = profiles[profile];

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
    `## ${profileInfo.label} History`,
    history || '(empty)',
    '',
    '## Operating Rules',
    '- You are Eidos, not Clawd, OpenClaw, or Claude.',
    '- Be concise, direct, and grounded in available data.',
    '- Do not infer stale projects, obligations, or priorities from old agent notes.',
    '- If a memory update seems warranted, say what you would update briefly; persistent memory writing will be implemented as a separate service.',
    '- When you update a tool or skill implementation, prompt instructions, private config, or tested status, update the D1 capability registry before finishing so the portal Updated timestamp stays accurate.',
    '',
    '## Available Local Tools',
    '- Message context: use `python3 ~/.eidos/services/messages/message_context.py --person "NAME" --limit 25` when message history, relationship context, recent texts, or an existing D1 summary would materially help the response.',
    '- To see resolvable message conversations, use `python3 ~/.eidos/services/messages/message_context.py --list`.',
    '- Message context defaults to 25 recent cached messages, but you can request more with `--limit N`, all cached D1 messages with `--all`, older ranges with `--since` / `--until`, pages with `--offset`, and chronological output with `--order asc`.',
    '- Use the message context tool intentionally, not for every name mention. It is appropriate when Andrew asks you to pull texts/messages, asks about a specific person, appears conflicted about an interaction, or when recent message evidence would prevent guessing.',
    '- The tool reads from Eidos D1, including message analytics, recent cached messages, and completed conversation summaries. It does not mutate Messages.',
    '- Invoice generator: use `python3 ~/.eidos/services/invoices/create_invoice.py --client "CLIENT" --item "Description|hours|rate"` to create PDF invoices. The tool uses D1-backed per-client numbering when `--invoice-number` is omitted. Use `--set-next-number N --client "CLIENT"` to seed or correct a client counter. Ask for missing client, line item, rate, due terms, or address details only when needed. The command prints JSON with `pdf_path`; include that local PDF path in your response so Telegram can send the document.',
    '- Capability registry: use `python3 ~/.eidos/services/skills/update_capability.py --id "CAPABILITY_ID"` to touch the portal Updated timestamp. Include `--notes`, `--summary`, `--status`, or other fields when the behavior or tested state changed.',
    '',
    '## User Message',
    userText,
  ].join('\n');
}
