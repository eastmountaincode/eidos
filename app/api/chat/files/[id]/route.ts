import { isPortalAuthed } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const base = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;
  if (!base || !token) return new Response(null, { status: 503 });
  try {
    const url = new URL(`/api/chat-files/${id}/ticket`, base);
    if (new URL(request.url).searchParams.get('inline') === '1') url.searchParams.set('inline', '1');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) return Response.json(data, { status: response.status });
    // Keep large binary responses off Vercel; the short-lived link grants access to this file only.
    return new Response(null, { status: 307, headers: { Location: data.url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return Response.json({ error: 'Could not download this file.' }, { status: 502 }); }
}
