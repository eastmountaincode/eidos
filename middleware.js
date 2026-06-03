import { next } from '@vercel/functions';

const PASSWORD = process.env.EIDOS_PORTAL_PASSWORD || 'Eidos';
const COOKIE_NAME = 'eidos_portal';
const COOKIE_VALUE = process.env.EIDOS_PORTAL_SESSION_SECRET || 'local-session';

export default async function middleware(request) {
  const url = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';
  const isAuthed = cookie.split(';').some((part) => part.trim() === `${COOKIE_NAME}=${COOKIE_VALUE}`);

  if (url.pathname === '/logout') {
    return redirectWithCookie(url, '/', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  }

  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      const form = await request.formData();
      const password = String(form.get('password') || '');

      if (password === PASSWORD) {
        return redirectWithCookie(
          url,
          '/',
          `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        );
      }

      return loginPage('Incorrect password.', 401);
    }

    return isAuthed ? Response.redirect(new URL('/', url), 303) : loginPage();
  }

  if (isAuthed) {
    return next();
  }

  return loginPage();
}

function redirectWithCookie(url, path, cookie) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(path, url).toString(),
      'Set-Cookie': cookie,
    },
  });
}

function loginPage(error = '', status = 200) {
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Eidos Portal</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7f7;
        --surface: #ffffff;
        --ink: #1f2525;
        --muted: #667273;
        --border: #d7dfdf;
        --accent: #0f766e;
        --error: #b91c1c;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--bg);
        color: var(--ink);
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(360px, calc(100vw - 32px));
        padding: 24px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 18px 40px rgba(20, 35, 34, 0.08);
      }
      .mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        margin-bottom: 16px;
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--accent);
        font-weight: 700;
      }
      h1 { margin: 0; font-size: 24px; line-height: 1.1; }
      p { margin: 8px 0 0; color: var(--muted); }
      form { display: grid; gap: 12px; margin-top: 20px; }
      label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
      input, button {
        width: 100%;
        border-radius: 6px;
        font: inherit;
      }
      input {
        border: 1px solid var(--border);
        padding: 10px 11px;
        color: var(--ink);
      }
      button {
        border: 0;
        padding: 10px 12px;
        background: var(--accent);
        color: #ffffff;
        cursor: pointer;
        font-weight: 700;
      }
      .error { color: var(--error); }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">E</div>
      <h1>Eidos Portal</h1>
      <p>Enter the portal password.</p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/login">
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" autofocus>
        </label>
        <button type="submit">Enter</button>
      </form>
    </main>
  </body>
</html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const config = {
  runtime: 'edge',
};
