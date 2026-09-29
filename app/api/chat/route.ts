import { isPortalAuthed } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function forward(request: Request) {
  if (!(await isPortalAuthed())) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  if (request.method === 'POST' && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const base = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;
  if (!base || !token) return Response.json({ error: 'The agent connection is not configured.' }, { status: 503 });
  const url = new URL('/api/agent-chat', base);
  const incoming = new URL(request.url);
  for (const key of ['before', 'after']) {
    const value = incoming.searchParams.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  let body;
  if (request.method === 'POST') {
    const parsed = await request.json().catch(() => null);
    if (!parsed || typeof parsed.prompt !== 'string' || parsed.prompt.length > 20000) {
      return Response.json({ error: 'Please enter a message of at most 20,000 characters.' }, { status: 400 });
    }
    body = JSON.stringify({ id: parsed.id, prompt: parsed.prompt, retry: parsed.retry === true, conversation: 'main' });
  }
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid agent response');
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Could not reach Eidos. Please try again.' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
