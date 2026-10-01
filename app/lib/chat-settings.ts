import { parseChatSettings, type ChatSettings } from '../../shared/chat-settings.mjs';
import type { ChatTurn } from '../types/chat';
import { parseAttachments, savedAttachments, type ChatAttachment } from '../../shared/chat-attachments.mjs';

export type PendingMessage = { id: string; prompt: string; settings?: ChatSettings; attachments?: ChatAttachment[] };

export function turnSettings(turn: Pick<ChatTurn, 'settings_json'>): ChatSettings | undefined {
  try { return turn.settings_json ? parseChatSettings(JSON.parse(turn.settings_json)) : undefined; }
  catch { return undefined; }
}

export function parsePendingMessage(value: unknown): PendingMessage | null {
  if (!value || typeof value !== 'object' || !('id' in value) || !('prompt' in value)
    || typeof value.id !== 'string' || typeof value.prompt !== 'string') return null;
  // Keep legacy pending messages without settings; don't silently add new defaults.
  return { id: value.id, prompt: value.prompt,
    ...('attachments' in value ? { attachments: parseAttachments(value.attachments) } : {}),
    ...('settings' in value && value.settings ? { settings: parseChatSettings(value.settings) } : {}) };
}

export function messageForSend(prompt: string, settings: ChatSettings, pending: PendingMessage | null, retryTurn?: ChatTurn, attachments?: ChatAttachment[]): PendingMessage {
  if (retryTurn) return { id: retryTurn.id, prompt: retryTurn.prompt, settings: turnSettings(retryTurn), ...(retryTurn.attachments_json ? { attachments: savedAttachments(retryTurn.attachments_json) } : {}) };
  return pending || { id: crypto.randomUUID(), prompt, settings: { ...settings }, ...(attachments?.length ? { attachments: parseAttachments(attachments) } : {}) };
}
