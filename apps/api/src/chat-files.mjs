import { parseAttachments, isPreviewImage } from '../../../shared/chat-attachments.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const keyFor = (id) => `chat/${id}`;
const bytes = new TextEncoder();
const encode = (value) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function signingKey(env) {
  return crypto.subtle.importKey('raw', bytes.encode(`eidos-chat-files-v1:${env.EIDOS_API_TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function ticket(env, payload) {
  const data = encode(bytes.encode(JSON.stringify({ ...payload, expires: Date.now() + 10 * 60 * 1000 })));
  return `${data}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(env), bytes.encode(data))))}`;
}
async function verify(env, value) {
  try {
    if (!value || value.length > 4000) return null;
    const [data, signature, extra] = value.split('.');
    if (extra || !(await crypto.subtle.verify('HMAC', await signingKey(env), decode(signature), bytes.encode(data)))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(data)));
    return payload.expires > Date.now() ? payload : null;
  } catch { return null; }
}
function originAllowed(origin) {
  try { const url = new URL(origin); return url.origin === origin && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))); }
  catch { return false; }
}
function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(response.body, { status: response.status, headers });
}
async function boundedBody(request, size) {
  if (request.headers.has('content-length') && Number(request.headers.get('content-length')) !== size) throw new Error('File size does not match.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('No file received.');
  const result = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > size) throw new Error('File is too large.');
      result.set(value, offset); offset += value.length;
    }
    if (offset !== size) throw new Error('The upload was incomplete.');
    return result;
  } finally { await reader.cancel().catch(() => {}); }
}
export async function validateStoredAttachments(env, files) {
  for (const file of files) {
    const object = await env.CHAT_FILES?.head(keyFor(file.id));
    if (!object || object.size !== file.size || object.customMetadata?.attachment !== JSON.stringify(file)) throw new Error(`Upload ${file.name} again before sending.`);
  }
}

// Called before general API auth, but accepts only signed file-scoped tickets or the server token.
export async function handleChatFiles(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat-files' && !url.pathname.startsWith('/api/chat-files/')) return null;
  const trusted = Boolean(env.EIDOS_API_TOKEN) && request.headers.get('Authorization') === `Bearer ${env.EIDOS_API_TOKEN}`;
  const match = url.pathname.match(/^\/api\/chat-files\/([a-f0-9-]{36})(\/ticket)?$/);
  const signed = await verify(env, url.searchParams.get('ticket'));
  const upload = match && !match[2] && signed?.action === 'upload' && signed.file.id === match[1]
    && signed.origin === request.headers.get('Origin') && ['PUT', 'OPTIONS'].includes(request.method);
  const download = match && !match[2] && signed?.action === 'download' && signed.id === match[1] && request.method === 'GET';
  if (!trusted && !upload && !download) return json({ error: 'Unauthorized.' }, 401);
  if (!env.CHAT_FILES) return json({ error: 'File storage is not configured.' }, 503);
  if (upload) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), signed.origin);
    try {
      const file = parseAttachments([signed.file])[0];
      const body = await boundedBody(request, file.size);
      const digest = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', body)));
      const expected = encode(Uint8Array.from(file.sha256.match(/../g), (h) => parseInt(h, 16)));
      if (digest !== expected) throw new Error('The file changed during upload. Please retry.');
      // Content-bound ticket and conditional creation make repeated uploads immutable/idempotent.
      const object = await env.CHAT_FILES.put(keyFor(file.id), body, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: file.type }, customMetadata: { attachment: JSON.stringify(file) },
      });
      if (!object) await validateStoredAttachments(env, [file]);
      return cors(json({ attachment: file }), signed.origin);
    } catch (error) { return cors(json({ error: error.message || 'Upload failed.' }, 400), signed.origin); }
  }
  if (trusted && url.pathname === '/api/chat-files' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    try {
      if (!originAllowed(body?.origin)) throw new Error('Invalid upload origin.');
      const file = parseAttachments([{ ...body.file, id: crypto.randomUUID() }])[0];
      const link = new URL(`/api/chat-files/${file.id}`, url);
      link.searchParams.set('ticket', await ticket(env, { action: 'upload', origin: body.origin, file }));
      return json({ attachment: file, upload_url: link.href });
    } catch (error) { return json({ error: error.message || 'Invalid file.' }, 400); }
  }
  if (match && request.method === 'GET') {
    const object = match[2] ? await env.CHAT_FILES.head(keyFor(match[1])) : await env.CHAT_FILES.get(keyFor(match[1]));
    if (!object) return json({ error: 'File not found.' }, 404);
    const file = parseAttachments([JSON.parse(object.customMetadata.attachment)])[0];
    if (match[2] && trusted) {
      const link = new URL(`/api/chat-files/${file.id}`, url);
      link.searchParams.set('ticket', await ticket(env, { action: 'download', id: file.id, inline: url.searchParams.get('inline') === '1' }));
      return json({ url: link.href });
    }
    const inline = download && signed.inline && isPreviewImage(file);
    return new Response(object.body, { headers: {
      'Content-Type': file.type, 'Content-Length': String(file.size), 'Cache-Control': 'private, no-store',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer',
    } });
  }
  return json({ error: 'Not found.' }, 404);
}
