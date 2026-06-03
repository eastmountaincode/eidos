import { abortAllQueries } from './codex.js';
import { startBot, stopBot } from './telegram.js';

console.log('[eidos] Starting Telegram gateway...');

let shutdownRequested = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(`[eidos] ${signal} received, shutting down...`);
  abortAllQueries();
  await stopBot();
  console.log('[eidos] Goodbye.');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await startBot();
} catch (err) {
  console.error('[eidos] Fatal error:', err);
  process.exit(1);
}
