export default async function handler(request, response) {
  const workerUrl = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;

  if (!workerUrl || !token) {
    response.status(500).json({ error: 'missing Eidos API configuration' });
    return;
  }

  const upstream = await fetch(`${workerUrl.replace(/\/$/, '')}/api/messages/overview`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await upstream.text();
  response.status(upstream.status);
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.send(body);
}
