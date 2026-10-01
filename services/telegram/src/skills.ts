import { readAgentKnowledge } from './knowledge.js';

export async function skillsText(): Promise<string> {
  try {
    const { capabilities } = await readAgentKnowledge();
    return capabilities.map(c => `${c.name} [${c.status}]: ${c.summary}${c.last_check ? ` Last check: ${c.last_check.result} (${c.last_check.checked_at}).` : ' Not recently verified.'}`).join('\n');
  } catch {
    return 'The capability catalog is temporarily unavailable. Please try again.';
  }
}
