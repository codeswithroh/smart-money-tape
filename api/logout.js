import { clearSessionCookie } from './_auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const origin = new URL(req.url).origin;
  return new Response(null, {
    status: 302,
    headers: { location: origin + '/login.html', 'set-cookie': clearSessionCookie, 'cache-control': 'no-store' },
  });
}
