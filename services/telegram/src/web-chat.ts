import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { runSteerableCodex } from './steerable-codex.js';
import { buildPrompt } from './context.js';
import { parseChatSettings } from '../../../shared/chat-settings.mjs';
import { prepareAttachments } from './chat-attachments.js';
import { WakeChannel } from './wake-channel.js';

type Turn = { id: string; prompt: string; claim_token: string; resume_session_id: string | null; settings_json: string | null; attachments_json?: string };
type Result = { id: string; payload: Record<string, unknown> };
const outbox = resolve(config.workspacePath, 'data/sessions/web-chat-steering-outbox.json');
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
  const execution = new AbortController();
  let partial = '';
  let lastSaved = '';
  let updating = false;
  let claimLost = false;
  let finalizing = false;
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
        execution.abort();
      }
    }).finally(() => { updating = false; });
  }, 10000);
  try {
    const settings = turn.settings_json ? parseChatSettings(JSON.parse(turn.settings_json)) : undefined;
    const files = await prepareAttachments(turn.attachments_json, {
      workspacePath: config.workspacePath, workerUrl: config.messages.workerUrl || '', token: config.messages.apiToken || '', signal: shutdown.signal,
    });
    if (claimLost || stopping) throw new Error('Turn claim lost before execution.');
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: config.codex.path };
    delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const prompt = await buildPrompt((turn.prompt || 'Please inspect the attached files and briefly describe what they contain.') + files.context,
      'personal', 'web', `eidos-chat:${turn.id}`);
    const result = await runSteerableCodex({
      binary: config.codex.binary, cwd: config.workspacePath, env, prompt,
      sessionId: turn.resume_session_id || undefined,
      model: settings?.model || config.codex.model, speed: settings?.speed,
      images: files.images,
      signal: AbortSignal.any([shutdown.signal, execution.signal]),
      onText: (text) => { partial = text; },
      requeue: async (id) => { await request(`/turns/${turn.id}/followups`, { claim_token: turn.claim_token, requeue_id: id }); },
      nextFollowups: async () => {
        const { turns } = await request<{ turns: Turn[] }>(`/turns/${turn.id}/followups`, { claim_token: turn.claim_token });
        return Promise.all(turns.map(async (next) => {
          try {
            const more = await prepareAttachments(next.attachments_json, {
              workspacePath: config.workspacePath, workerUrl: config.messages.workerUrl || '', token: config.messages.apiToken || '', signal: shutdown.signal,
            });
            return { id: next.id, images: more.images, prompt: `Andrew sent this follow-up while you are working. Incorporate it into the current task. Preserve the existing objective unless he clearly cancels or replaces it.\nCurrent conversation reference: eidos-chat:${next.id}\n\n${next.prompt || 'Please inspect the attached files.'}${more.context}` };
          } catch (cause) {
            await request(`/turns/${turn.id}/followups`, { claim_token: turn.claim_token, requeue_id: next.id });
            throw cause;
          }
        }));
      },
    });
    clearInterval(heartbeat);
    await pendingUpdate;
    const error = claimLost ? 'The agent connection was interrupted.'
      : result.error ? 'Eidos could not finish this reply. Please try again.'
      : !result.text.trim() ? 'Eidos returned an empty reply. Please try again.' : null;
    if (result.error) console.error(`[web-chat] Agent error for ${turn.id}: ${result.error}`);
    finalizing = true;
    await saveResult({ id: turn.id, payload: {
      claim_token: turn.claim_token,
      status: error ? 'failed' : 'completed',
      response: result.text || partial,
      error,
      session_id: result.sessionId || undefined,
      model: settings?.model || config.codex.model || null,
    } });
    if (!stopping) await deliverSavedResult();
  } catch (error) {
    clearInterval(heartbeat);
    await pendingUpdate;
    // A saved reply must survive a delivery outage; don't replace it with an error.
    if (finalizing) throw error;
    if (!stopping) {
      console.error(`[web-chat] Turn ${turn.id} failed: ${String(error)}`);
      await saveResult({ id: turn.id, payload: { claim_token: turn.claim_token, status: 'failed', response: partial,
        error: 'Eidos could not read the attachments or finish this reply. Please try again.' } });
      await deliverSavedResult();
    }
  } finally { clearInterval(heartbeat); }
}

function stop() {
  stopping = true;
  shutdown.abort();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('[web-chat] Starting Eidos web conversation worker');
const wake = new WakeChannel(new URL('/api/agent-chat/connect', config.messages.workerUrl).href,
  config.messages.apiToken || '', shutdown.signal);
while (!stopping) {
  try {
    const revision = wake.revision;
    await deliverSavedResult();
    const { turn } = await request<{ turn: Turn | null }>('/claim', { protocol: 'steering-v1' });
    if (turn) await processTurn(turn);
    else await wake.waitSince(revision);
  } catch (error) {
    if (stopping) break;
    console.error('[web-chat]', String(error));
    await sleep(5000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}
