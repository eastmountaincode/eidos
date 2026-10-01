import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { abortAllQueries, sendMessage } from './codex.js';

type Turn = { id: string; prompt: string; claim_token: string; resume_session_id: string | null };
type Result = { id: string; payload: Record<string, unknown> };
const outbox = resolve(config.workspacePath, 'data/sessions/web-chat-outbox.json');
const shutdown = new AbortController();
let stopping = false;

class ApiError extends Error {
  constructor(readonly status: number) { super(`Agent chat request failed (${status})`); }
}

async function request<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  if (!config.messages.workerUrl || !config.messages.apiToken) throw new Error('Missing Eidos Worker configuration');
  const response = await fetch(new URL(`/api/agent-chat${path}`, config.messages.workerUrl), {
    method: body === undefined && method === 'GET' ? 'GET' : method,
    headers: { Authorization: `Bearer ${config.messages.apiToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(35000)]),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

async function saveResult(result: Result) {
  await mkdir(dirname(outbox), { recursive: true });
  await writeFile(`${outbox}.tmp`, JSON.stringify(result), { mode: 0o600 });
  await rename(`${outbox}.tmp`, outbox);
}

async function deliverSavedResult(): Promise<void> {
  let result: Result;
  try { result = JSON.parse(await readFile(outbox, 'utf8')) as Result; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  try {
    await request(`/turns/${result.id}`, result.payload, 'PATCH');
    await unlink(outbox);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Keep the generated reply recoverable if a user has already retried the turn.
      await rename(outbox, `${outbox}.undelivered-${result.id}-${Date.now()}`);
      console.error(`[web-chat] Saved an undelivered reply for ${result.id}`);
      return;
    }
    throw error;
  }
}

async function processTurn(turn: Turn) {
  let partial = '';
  let lastSaved = '';
  let updating = false;
  let claimLost = false;
  let pendingUpdate: Promise<void> = Promise.resolve();
  const heartbeat = setInterval(() => {
    if (updating) return;
    updating = true;
    const snapshot = partial;
    pendingUpdate = request(`/turns/${turn.id}`, {
      claim_token: turn.claim_token,
      ...(snapshot !== lastSaved ? { response: snapshot } : {}),
    }, 'PATCH').then(() => { lastSaved = snapshot; }).catch((error: unknown) => {
      console.error('[web-chat] Reply update failed:', String(error));
      if (error instanceof ApiError && error.status === 409) {
        claimLost = true;
        abortAllQueries();
      }
    }).finally(() => { updating = false; });
  }, 10000);
  try {
    const result = await sendMessage(turn.prompt, {
      profile: 'personal',
      channel: 'web',
      sourceRef: `eidos-chat:${turn.id}`,
      resumeSessionId: turn.resume_session_id || undefined,
      retryTransient: false,
      onPartialText: (text) => { partial = text; },
    });
    clearInterval(heartbeat);
    await pendingUpdate;
    const error = claimLost ? 'The agent connection was interrupted.'
      : result.error ? 'Eidos could not finish this reply. Please try again.'
      : !result.text.trim() ? 'Eidos returned an empty reply. Please try again.' : null;
    if (result.error) console.error(`[web-chat] Agent error for ${turn.id}: ${result.error}`);
    await saveResult({ id: turn.id, payload: {
      claim_token: turn.claim_token,
      status: error ? 'failed' : 'completed',
      response: result.text || partial,
      error,
      session_id: result.sessionId || undefined,
      model: config.codex.model || null,
      usage: result.usage,
    } });
    if (!stopping) await deliverSavedResult();
  } finally { clearInterval(heartbeat); }
}

function stop() {
  stopping = true;
  shutdown.abort();
  abortAllQueries();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('[web-chat] Starting Eidos web conversation worker');
while (!stopping) {
  try {
    await deliverSavedResult();
    const { turn } = await request<{ turn: Turn | null }>('/claim', {});
    if (turn) await processTurn(turn);
    else await request('/wait', undefined, 'GET');
  } catch (error) {
    if (stopping) break;
    console.error('[web-chat]', String(error));
    await sleep(5000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}
