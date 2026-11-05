/** Next's internal URL can use a loopback hostname behind its server/proxy. */
export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  const protocol = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol)) return false;
  return origin === `${protocol}://${host}`;
}
