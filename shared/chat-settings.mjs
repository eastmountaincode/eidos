// Verified with real replies on the Mac mini using Codex 0.159.3 on 2026-10-01.
// Keep this allowlist shared by the browser, queue and runner.
export const chatModels = [
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', shortLabel: 'Sol 6.1' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', shortLabel: 'Astra' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', shortLabel: 'Luna' },
];
// Historical turns, interrupted deliveries and older clients keep their exact settings.
// These are never offered in the picker or restored as a new-message preference.
const legacyModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'];
export const chatSpeeds = [
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast · more usage' },
];
export const defaultChatSettings = { model: 'gpt-6.1-sol', speed: 'standard' };

export function parseChatSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['model', 'speed'].includes(key))
    || !(chatModels.some((model) => model.id === value.model) || legacyModels.includes(value.model))
    || !chatSpeeds.some((speed) => speed.id === value.speed)) {
    throw new Error('Choose a supported model and speed.');
  }
  return { model: value.model, speed: value.speed };
}

export function restoreChatPreference(value) {
  const settings = parseChatSettings(value);
  return chatModels.some((model) => model.id === settings.model)
    ? settings : { ...settings, model: defaultChatSettings.model };
}

export function chatSettingsLabel(settings) {
  const model = chatModels.find((model) => model.id === settings.model);
  return `${model?.label || settings.model} · ${settings.speed === 'fast' ? 'Fast' : 'Standard'}`;
}
