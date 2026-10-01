export type ChatSettings = { model: string; speed: 'standard' | 'fast' };
export const chatModels: { id: string; label: string }[];
export const chatSpeeds: { id: ChatSettings['speed']; label: string }[];
export const defaultChatSettings: ChatSettings;
export function parseChatSettings(value: unknown): ChatSettings;
export function chatSettingsLabel(settings: ChatSettings): string;
