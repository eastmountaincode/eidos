import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

type Input = { type: 'text'; text: string; text_elements: never[] } | { type: 'localImage'; path: string };
export type Followup = { id: string; prompt: string; images: string[] };
export type SteerOptions = {
  binary: string; cwd: string; env: NodeJS.ProcessEnv; prompt: string; model?: string;
  speed?: 'standard' | 'fast'; sessionId?: string; images?: string[];
  onText?: (text: string) => void;
  nextFollowups: () => Promise<Followup[]>;
  requeue: (id: string) => Promise<void>;
  signal?: AbortSignal;
};

class RpcRejected extends Error {}

function inputs(prompt: string, images: string[] = []): Input[] {
  return [{ type: 'text', text: prompt, text_elements: [] }, ...images.map((path): Input => ({ type: 'localImage', path }))];
}

/** One stdio server owns one executing turn. Nothing listens on the network.
 * Accepted follow-ups are never replayed automatically after a transport failure. */
export async function runSteerableCodex(opts: SteerOptions) {
  const child = spawn(opts.binary, ['app-server', '--listen', 'stdio://', '-c', 'features.fast_mode=true'], {
    cwd: opts.cwd, env: opts.env,
  });
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  let sessionId = opts.sessionId || '';
  let turnId = '';
  let active = false;
  let text = '';
  let error: string | undefined;
  let stopped = false;
  let pollBusy = false;
  let pendingPoll: Promise<void> = Promise.resolve();
  const texts = new Map<string, string>();
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => { finish = resolve; });
  function stop(reason: string) {
    if (stopped) return;
    stopped = true; active = false; error ||= reason;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(reason)); }
    pending.clear(); finish();
  }
  function send(message: unknown) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function rpc(method: string, params: unknown): Promise<any> {
    if (stopped) return Promise.reject(new Error(error || 'Runtime stopped'));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Runtime request timed out: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }
  lines.on('line', (line) => {
    let event: any;
    try { event = JSON.parse(line); } catch { return; }
    if (event.id !== undefined && event.method) {
      // This integration is non-interactive. Never silently grant an unexpected approval.
      send({ id: event.id, error: { code: -32601, message: 'Interactive requests are not supported by this adapter.' } });
      return;
    }
    if (event.id !== undefined) {
      const entry = pending.get(event.id);
      if (entry) {
        clearTimeout(entry.timer); pending.delete(event.id);
        if (event.error) entry.reject(new RpcRejected(event.error.message || 'Runtime rejected the request'));
        else entry.resolve(event.result);
      }
      return;
    }
    const p = event.params;
    if (p?.threadId && sessionId && p.threadId !== sessionId) return;
    if (event.method === 'turn/started') { turnId = p.turn.id; active = true; }
    if (event.method === 'item/agentMessage/delta') {
      const next = (texts.get(p.itemId) || '') + p.delta;
      texts.set(p.itemId, next); text = next; opts.onText?.(text);
    }
    if (event.method === 'item/completed' && p.item?.type === 'agentMessage') {
      text = p.item.text; opts.onText?.(text);
    }
    if (event.method === 'turn/completed') {
      active = false;
      if (p.turn.status !== 'completed') error = p.turn.error?.message || `Turn ${p.turn.status}`;
      finish();
    }
  });
  // Consume stderr, which may contain runtime diagnostics. Never log auth/config contents.
  child.stderr.on('data', () => {});
  child.on('error', (cause) => stop(cause.message));
  child.on('close', () => stop('Runtime disconnected before finishing'));
  child.stdin.on('error', () => stop('Runtime input disconnected'));
  const abort = () => { stop('Runtime interrupted'); child.kill('SIGTERM'); };
  opts.signal?.addEventListener('abort', abort, { once: true });
  const poll = async () => {
    if (!active || pollBusy || stopped) return;
    pollBusy = true;
    try {
      const followups = await opts.nextFollowups();
      for (const next of followups) {
        if (!active) { await opts.requeue(next.id); continue; }
        try {
          await rpc('turn/steer', { threadId: sessionId, expectedTurnId: turnId,
            clientUserMessageId: next.id, input: inputs(next.prompt, next.images) });
        } catch (cause) {
          if (cause instanceof RpcRejected) await opts.requeue(next.id);
          else {
            // Transport failure is ambiguous: do not replay a possibly accepted action.
            stop('Follow-up delivery was interrupted.'); child.kill('SIGTERM');
          }
        }
      }
    } catch (cause) {
      console.error('[web-chat] Follow-up check failed:', cause instanceof Error ? cause.message : 'request failed');
    } finally { pollBusy = false; }
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    if (opts.signal?.aborted) throw new Error('Runtime interrupted');
    await rpc('initialize', { clientInfo: { name: 'eidos_web', title: 'Eidos', version: '0.2.0' } });
    send({ method: 'initialized', params: {} });
    await rpc('model/list', {});
    const threadOptions = { cwd: opts.cwd, model: opts.model, approvalPolicy: 'never', sandbox: 'danger-full-access' };
    const thread = await rpc(opts.sessionId ? 'thread/resume' : 'thread/start', opts.sessionId
      ? { ...threadOptions, threadId: opts.sessionId } : threadOptions);
    sessionId = thread.thread.id;
    const result = await rpc('turn/start', { threadId: sessionId,
      serviceTierForTurn: opts.speed === 'fast' ? 'fast' : 'default', input: inputs(opts.prompt, opts.images) });
    turnId ||= result.turn.id;
    timer = setInterval(() => { if (!pollBusy) pendingPoll = poll(); }, 2000);
    await completed;
    clearInterval(timer);
    await pendingPoll;
    return { text, sessionId, error };
  } catch (cause) {
    return { text, sessionId, error: cause instanceof Error ? cause.message : 'Runtime failed' };
  } finally {
    clearInterval(timer); opts.signal?.removeEventListener('abort', abort);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Runtime closed')); }
    pending.clear(); lines.close(); child.stdin.end(); child.kill('SIGTERM');
  }
}
