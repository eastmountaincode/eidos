import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

loadEnv({ path: resolve(repoRoot, '.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function nonNegativeNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const config = {
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  telegramChatId: requireEnv('TELEGRAM_CHAT_ID'),
  allowedUserIds: new Set([requireEnv('TELEGRAM_CHAT_ID')]),
  workspacePath: resolve(process.env.EIDOS_HOME || repoRoot),
  codex: {
    binary: process.env.CODEX_BINARY || '/opt/homebrew/bin/codex',
    model: optionalEnv('CODEX_MODEL'),
    path: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    timeoutMs: nonNegativeNumberEnv('EIDOS_CODEX_TIMEOUT_MS', 0),
  },
  messages: {
    workerUrl: optionalEnv('EIDOS_WORKER_URL'),
    apiToken: optionalEnv('EIDOS_API_TOKEN'),
    automaticRecentLimit: Number(process.env.EIDOS_MESSAGE_CONTEXT_RECENT_LIMIT || 8),
    explicitRecentLimit: Number(process.env.EIDOS_MESSAGE_CONTEXT_EXPLICIT_LIMIT || 80),
  },
  memory: {
    workerUrl: optionalEnv('EIDOS_WORKER_URL'),
    apiToken: optionalEnv('EIDOS_API_TOKEN'),
  },
  telegram: {
    maxMessageLength: 4096,
    editDebounceMs: 1000,
  },
} as const;

export type ProfileName = 'personal' | 'creative' | 'bioinformatics';

export const profiles: Record<ProfileName, { label: string; description: string }> = {
  personal: {
    label: 'Personal',
    description: 'relationships, daily life, feelings, values, people, and personal history',
  },
  creative: {
    label: 'Creative',
    description: 'creative coding, client websites, net art, browser experiences, design, and artistic practice',
  },
  bioinformatics: {
    label: 'Bioinformatics',
    description: 'MGH/work, antibody and bioinformatics tasks, scientific workflows, scripts, and research operations',
  },
};
