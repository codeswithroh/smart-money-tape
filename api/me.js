import { readSession, json } from './_auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const s = await readSession(req.headers.get('cookie'));
  if (!s) return json({ authed: false, paid: false });
  return json({ authed: true, paid: !!s.paid, email: s.email || null });
}
