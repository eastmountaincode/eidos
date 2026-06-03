export default async function handler(request, response) {
  const workerUrl = process.env.EIDOS_WORKER_URL;
  const token = process.env.EIDOS_API_TOKEN;

  if (!workerUrl || !token) {
    response.status(500).json({ error: 'missing Eidos API configuration' });
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'method not allowed' });
    return;
  }

  const upstream = await fetch(`${workerUrl.replace(/\/$/, '')}/api/messages/summary-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request.body || {}),
  });

  const body = await upstream.text();
  response.status(upstream.status);
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.send(body);
}
