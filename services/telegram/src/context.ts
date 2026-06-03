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
    '',
    '## User Message',
    userText,
  ].join('\n');
}
