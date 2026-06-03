import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { config, type ProfileName } from './config.js';

type SessionEntry = {
  sessionId: string;
  profile: ProfileName;
  createdAt: string;
  lastActiveAt: string;
};

type SessionStore = Record<string, SessionEntry>;

const storePath = resolve(config.workspacePath, 'data/sessions/telegram.json');

function load(): SessionStore {
  if (!existsSync(storePath)) return {};
  return JSON.parse(readFileSync(storePath, 'utf-8')) as SessionStore;
}

function save(store: SessionStore): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function sessionKey(userId: string): string {
  return `telegram:dm:${userId}`;
}

export function getSession(key: string): SessionEntry | undefined {
  return load()[key];
}

export function setSession(key: string, sessionId: string, profile: ProfileName): SessionEntry {
  const store = load();
  const now = new Date().toISOString();
  const existing = store[key];
  store[key] = {
    sessionId,
    profile,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
  };
  save(store);
  return store[key];
}

export function setProfile(key: string, profile: ProfileName): SessionEntry {
  const store = load();
  const now = new Date().toISOString();
  const existing = store[key];
  store[key] = {
    sessionId: '',
    profile,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
  };
  save(store);
  return store[key];
}

export function deleteSession(key: string): void {
  const store = load();
  delete store[key];
  save(store);
}

export function currentProfile(key: string): ProfileName {
  return getSession(key)?.profile ?? 'personal';
}
