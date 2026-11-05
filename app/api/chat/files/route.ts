import { isPortalAuthed } from '@/lib/auth';
import { hasSameOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!hasSameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const base = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;
  if (!base || !token) return Response.json({ error: 'File storage is not configured.' }, { status: 503 });
  try {
    const file = await request.json();
    const response = await fetch(new URL('/api/chat-files', base), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, origin: request.headers.get('origin') }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Could not start the upload. Please retry.' }, { status: 502 }); }
}
