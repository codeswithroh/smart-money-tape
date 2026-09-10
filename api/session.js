// POST { privyToken } -> verify Privy, resolve/create the access row, issue a session cookie.
// Returns { paid:true } (cookie set) or { paid:false, account:{email, privyId} }.
import { verifyPrivyToken, fetchPrivyUser, issueSession, sessionCookie, json } from './_auth.js';
import { dbReady, getByPrivyId, getByEmail, createAccount, bindAccount } from './_db.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!dbReady) return json({ error: 'auth backend not configured' }, 503);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const token = body && body.privyToken;
  if (!token) return json({ error: 'missing privyToken' }, 400);

  let userId;
  try { ({ userId } = await verifyPrivyToken(token)); }
  catch (_) { return json({ error: 'invalid privy token' }, 401); }

  const { email, wallet } = await fetchPrivyUser(userId);

  let row = await getByPrivyId(userId);
  if (!row && email) {
    const byEmail = await getByEmail(email);
    if (byEmail) row = await bindAccount(byEmail.id, { privyUserId: userId, email, wallet });
  }
  if (!row) row = await createAccount({ privyUserId: userId, email, wallet });

  if (!row.paid) {
    return json({ paid: false, account: { email: row.email || email || null, privyId: userId } });
  }

  const jwt = await issueSession({ accountId: row.id, privyUserId: userId, email: row.email, paid: true });
  return json({ paid: true, email: row.email || null }, 200, { 'set-cookie': sessionCookie(jwt) });
}
