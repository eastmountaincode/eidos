import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { config, profiles, type ProfileName } from './config.js';
import { buildPrompt } from './context.js';

export type AgentResponse = {
  text: string;
  sessionId: string;
  error?: string;
};

export type StreamCallback = (partialText: string) => Promise<void> | void;

type CodexJsonEvent = {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
  };
  message?: string;
};

const activeQueries = new Map<string, ChildProcessWithoutNullStreams>();

type ExitResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function codexEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: process.env.HOME ?? '/Users/oasis',
    PATH: config.codex.path,
  };
  delete env.CODEX_API_KEY;
  delete env.OPENAI_API_KEY;
  return env;
}

export function abortAllQueries(): void {
  for (const [key, child] of activeQueries) {
    child.kill('SIGTERM');
    activeQueries.delete(key);
  }
}

export function codexStatus(profile: ProfileName): string {
  return [
    'Provider: Codex CLI',
    `Model: ${config.codex.model ?? 'CLI default'}`,
    'Auth: ChatGPT login',
    `Timeout: ${config.codex.timeoutMs > 0 ? `${Math.round(config.codex.timeoutMs / 1000)}s` : 'disabled'}`,
    `Command: ${config.codex.binary}`,
    `Workspace: ${config.workspacePath}`,
    `Active profile: ${profile} (${profiles[profile].label})`,
  ].join('\n');
}

export async function sendMessage(
  prompt: string,
  opts: {
    profile: ProfileName;
    resumeSessionId?: string;
    onPartialText?: StreamCallback;
  },
): Promise<AgentResponse> {
  const queryKey = `${Date.now()}-${Math.random()}`;

  try {
    const response = await runCodex(prompt, opts, queryKey);
    if (response.error && isTransientError(response.error)) {
      console.log(`[codex] Transient error, retrying in 5s: ${response.error}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return runCodex(prompt, opts, `${queryKey}-retry`);
    }
    return response;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isTransientError(errMsg)) {
      console.log(`[codex] Transient error, retrying in 5s: ${errMsg}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return runCodex(prompt, opts, `${queryKey}-retry`);
    }
    return { text: '', sessionId: opts.resumeSessionId ?? '', error: errMsg };
  }
}

async function runCodex(
  prompt: string,
  opts: {
    profile: ProfileName;
    resumeSessionId?: string;
    onPartialText?: StreamCallback;
  },
  queryKey: string,
): Promise<AgentResponse> {
  const args = buildArgs(opts.resumeSessionId);
  const runtimePrompt = await buildPrompt(prompt, opts.profile);
  const resumed = Boolean(opts.resumeSessionId);
  console.log(`[codex] Starting ${resumed ? 'resume' : 'new'} query (${queryKey})`);
  const child = spawn(config.codex.binary, args, {
    cwd: config.workspacePath,
    env: codexEnv(),
  });

  activeQueries.set(queryKey, child);

  let stdout = '';
  let stderr = '';
  let sessionId = opts.resumeSessionId ?? '';
  let fullText = '';
  let timedOut = false;
  let forceKillTimer: NodeJS.Timeout | undefined;
  const timeoutTimer = config.codex.timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        stderr += `Codex timed out after ${Math.round(config.codex.timeoutMs / 1000)}s\n`;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5000);
        forceKillTimer.unref();
      }, config.codex.timeoutMs)
    : undefined;
  timeoutTimer?.unref();

  child.stdout.on('data', async (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
    const lines = stdout.split('\n');
    stdout = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseEvent(line);
      if (!event) continue;

      if (event.type === 'thread.started' && event.thread_id) {
        sessionId = event.thread_id;
      }

      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        fullText = event.item.text ?? fullText;
        if (event.item.text && opts.onPartialText) {
          try {
            await opts.onPartialText(event.item.text);
          } catch {
            // Telegram edit failures are non-critical.
          }
        }
      }

      if (event.type === 'error' && event.message) {
        stderr += `${event.message}\n`;
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  child.on('error', (err) => {
    stderr += `${err.message}\n`;
  });

  child.stdin.write(runtimePrompt);
  child.stdin.end();

  const exit = await waitForExit(child);
  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  activeQueries.delete(queryKey);
  console.log(
    `[codex] Finished query (${queryKey}) code=${exit.code ?? 'null'} signal=${exit.signal ?? 'none'} text=${fullText ? 'yes' : 'no'} timeout=${timedOut ? 'yes' : 'no'}`,
  );

  if (stdout.trim()) {
    const event = parseEvent(stdout.trim());
    if (event?.type === 'item.completed' && event.item?.type === 'agent_message') {
      fullText = event.item.text ?? fullText;
    }
  }

  if (timedOut) {
    const error = summarizeError(stderr) || 'Codex timed out';
    return { text: fullText, sessionId: fullText ? sessionId : '', error };
  }

  if (exit.signal) {
    const error = summarizeError(stderr) || `Codex was interrupted by ${exit.signal}`;
    return { text: fullText, sessionId: fullText ? sessionId : '', error };
  }

  if (exit.code !== 0) {
    const error = summarizeError(stderr) || `Codex exited with code ${exit.code}`;
    return { text: fullText, sessionId: fullText ? sessionId : '', error };
  }

  return { text: fullText, sessionId };
}

function buildArgs(resumeSessionId?: string): string[] {
  const common = [
    '--json',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
  ];

  if (config.codex.model) {
    common.push('--model', config.codex.model);
  }

  if (resumeSessionId) {
    return ['exec', 'resume', ...common, resumeSessionId, '-'];
  }

  return ['exec', ...common, '--cd', config.workspacePath, '-'];
}

function parseEvent(line: string): CodexJsonEvent | undefined {
  try {
    return JSON.parse(line) as CodexJsonEvent;
  } catch {
    return undefined;
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<ExitResult> {
  return new Promise((resolve) => {
    child.on('error', () => resolve({ code: 1, signal: null }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}

function summarizeError(stderr: string): string {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join('\n');
}

function isTransientError(error: string): boolean {
  return [
    '429',
    'ECONNRESET',
    'ETIMEDOUT',
    'idle timeout',
    'stream disconnected',
    'websocket closed',
    'error sending request',
    'Can\'t assign requested address',
  ].some((needle) => error.includes(needle));
}
