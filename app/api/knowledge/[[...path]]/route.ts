import { isPortalAuthed } from '@/lib/auth';
import { hasSameOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (!(await isPortalAuthed())) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  if (request.method !== 'GET' && !hasSameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const path = (await context.params).path || [];
  const isRoot = path.length === 0;
  const isFeedback = path[0] === 'feedback' && (path.length === 1 || (path.length === 2 && /^[a-zA-Z0-9_-]{1,100}$/.test(path[1])));
  if ((!isRoot && !isFeedback) || (isRoot && request.method !== 'GET')) return Response.json({ error: 'Not found.' }, { status: 404 });
  const base = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;
  if (!base || !token) return Response.json({ error: 'Eidos is not configured.' }, { status: 503 });
  const url = new URL(isRoot ? '/api/agent-knowledge' : `/api/${path.join('/')}`, base);
  if (request.method === 'GET') {
    const incoming = new URL(request.url);
    for (const key of ['q', 'status', 'offset']) {
      const value = incoming.searchParams.get(key);
      if (value !== null) url.searchParams.set(key, value);
    }
  }
  const body = request.method === 'GET' ? undefined : await request.text();
  if (body && body.length > 16000) return Response.json({ error: 'This record is too long.' }, { status: 413 });
  try {
    const response = await fetch(url, { method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (isRoot && response.ok) data.portal = { branch: process.env.VERCEL_GIT_COMMIT_REF || 'local', revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local' };
    return Response.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not reach Eidos. Try again.' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
