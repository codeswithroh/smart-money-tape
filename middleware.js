// Edge middleware: the dashboard is served only to a valid, paid session.
// Everything else (login page, /bot, /api/*, images) is public.
import { readSession } from './api/_auth.js';

export const config = {
  matcher: ['/', '/index.html', '/app.js'],
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const s = await readSession(req.headers.get('cookie') || '');
  if (s && s.paid) return; // let the request through to the static asset

  return new Response(null, {
    status: 302,
    headers: { location: url.origin + '/login.html', 'cache-control': 'no-store' },
  });
}
