// Run once after the additive migration; existing records are never overwritten.
// EIDOS_WORKER_URL / EIDOS_API_TOKEN must be supplied through the environment.
import { readFile } from 'node:fs/promises';

const seed = JSON.parse(await readFile(new URL('./initial-knowledge.json', import.meta.url), 'utf8'));
if (!process.argv.includes('--apply')) {
  console.log('Preview only:', seed.procedures.length, 'existing procedures,', seed.sources.length, 'sources and', seed.feedback.length, 'feedback records. Use --apply to save.');
  process.exit(0);
}
const base = process.env.EIDOS_WORKER_URL;
const token = process.env.EIDOS_API_TOKEN;
if (!base || !token) throw new Error('Missing Eidos Worker configuration');
async function request(path, body) {
  const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Request failed (${r.status}) at ${path}`);
  return r.json();
}
const { capabilities } = await request('/api/capabilities');
for (const { id, ...details } of seed.procedures) {
  const capability = capabilities.find(c => c.id === id);
  if (!capability || capability.instructions) console.log('Retained capability:', id);
  else { await request(`/api/capabilities/${id}/details`, details); console.log('Saved procedure:', id); }
}
const { entries } = await request('/api/sources?limit=500');
for (const source of seed.sources) {
  if (entries.some(e => e.id === source.id || e.url === source.url)) console.log('Retained source:', source.id);
  else { await request('/api/sources', source); console.log('Saved source:', source.id); }
}
let existing = [];
for (let offset = 0; ; offset += 100) {
  const page = await request(`/api/feedback?status=all&offset=${offset}`);
  existing.push(...page.feedback);
  if (!page.has_more) break;
}
for (const feedback of seed.feedback) {
  if (existing.some(e => e.id === feedback.id)) console.log('Retained feedback:', feedback.id);
  else { await request('/api/feedback', feedback); console.log('Saved feedback:', feedback.id); }
}
