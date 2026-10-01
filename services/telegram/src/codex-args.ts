import { parseChatSettings, type ChatSettings } from '../../../shared/chat-settings.mjs';

export function buildCodexArgs(opts: {
  workspacePath: string;
  defaultModel?: string;
  resumeSessionId?: string;
  settings?: ChatSettings;
}): string[] {
  const common = ['--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];
  const settings = opts.settings ? parseChatSettings(opts.settings) : undefined;
  const model = settings?.model || opts.defaultModel;
  if (model) common.push('--model', model);
  if (settings) {
    // Explicitly reset Standard on resume; never inherit a previous turn's Fast tier.
    common.push('--config', 'features.fast_mode=true', '--config',
      `service_tier="${settings.speed === 'fast' ? 'fast' : 'default'}"`);
  }
  return opts.resumeSessionId
    ? ['exec', 'resume', ...common, opts.resumeSessionId, '-']
    : ['exec', ...common, '--cd', opts.workspacePath, '-'];
}
