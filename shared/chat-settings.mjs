// Sol/Astra 6.2 verified with real ChatGPT-login replies on Codex 0.171.0, 2026-11-20.
// Keep this allowlist shared by the browser, queue and runner.
export const chatModels = [
  { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', shortLabel: 'Sol 6.2' },
  { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', shortLabel: 'Astra 6.2' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', shortLabel: 'Luna' },
];
// Historical turns, interrupted deliveries and older clients keep their exact settings.
// These are never offered in the picker or restored as a new-message preference.
const legacyModels = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'];
export const chatSpeeds = [
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast · more usage' },
];
export const defaultChatSettings = { model: 'gpt-6.2-sol', speed: 'standard' };

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
  const successor = { 'gpt-6.1-sol': 'gpt-6.2-sol', 'gpt-6-astra': 'gpt-6.2-astra' }[settings.model];
  if (successor) return { ...settings, model: successor };
  return chatModels.some((model) => model.id === settings.model)
    ? settings : { ...settings, model: defaultChatSettings.model };
}

export function chatSettingsLabel(settings) {
  const model = chatModels.find((model) => model.id === settings.model);
  return `${model?.label || settings.model} · ${settings.speed === 'fast' ? 'Fast' : 'Standard'}`;
}
