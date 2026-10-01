// Verified against the Mac mini's signed-in Codex catalog on 2026-10-01.
// Keep this allowlist shared by the browser, queue and runner.
export const chatModels = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
];
export const chatSpeeds = [
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast · more usage' },
];
export const defaultChatSettings = { model: 'gpt-5.6-sol', speed: 'standard' };

export function parseChatSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['model', 'speed'].includes(key))
    || !chatModels.some((model) => model.id === value.model)
    || !chatSpeeds.some((speed) => speed.id === value.speed)) {
    throw new Error('Choose a supported model and speed.');
  }
  return { model: value.model, speed: value.speed };
}

export function chatSettingsLabel(settings) {
  const model = chatModels.find((model) => model.id === settings.model);
  return `${model?.label || settings.model} · ${settings.speed === 'fast' ? 'Fast' : 'Standard'}`;
}
