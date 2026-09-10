// Edge middleware: the dashboard is served only to a valid, paid session.
// Everything else (login page, /bot, /api/*, images) is public.
import { readSession } from './api/_auth.js';

export const config = {
  matcher: ['/', '/index.html', '/app.js'],
};

const SECRET = (globalThis.process && process.env && process.env.SESSION_SECRET) || '';

export default async function middleware(req) {
  const url = new URL(req.url);

  // emergency owner bypass: /?k=<SESSION_SECRET> -> 7-day cookie
  const k = url.searchParams.get('k');
  if (SECRET && k && k === SECRET) {
    return new Response(null, {
      status: 302,
      headers: {
        location: url.origin + url.pathname,
        'set-cookie': `ar_bypass=${SECRET}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      },
    });
  }

  const cookie = req.headers.get('cookie') || '';
  if (SECRET && cookie.split(/;\s*/).indexOf('ar_bypass=' + SECRET) >= 0) return;

  const s = await readSession(cookie);
  if (s && s.paid) return; // let the request through to the static asset

  return new Response(null, {
    status: 302,
    headers: { location: url.origin + '/login.html', 'cache-control': 'no-store' },
  });
}
