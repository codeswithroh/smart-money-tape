// POST { privyToken, txHash, chain? } -> verify Privy + verify the on-chain USDC payment,
// mark the account paid, issue a session cookie.
import { verifyPrivyToken, fetchPrivyUser, issueSession, sessionCookie, json } from './_auth.js';
import { dbReady, getByPrivyId, getByEmail, getByTxHash, createAccount, bindAccount, markPaid } from './_db.js';
import { verifyPayment, PRICE_USDC } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!dbReady) return json({ error: 'auth backend not configured' }, 503);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const token = body && body.privyToken;
  const txHash = (body && body.txHash || '').trim();
  const chain = (body && body.chain || '').trim().toLowerCase() || null;
  if (!token) return json({ error: 'missing privyToken' }, 400);
  const isEvm = /^0x[0-9a-fA-F]{64}$/.test(txHash);
  const isSol = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(txHash);
  if (!isEvm && !isSol) return json({ error: 'invalid transaction id' }, 400);

  let userId;
  try { ({ userId } = await verifyPrivyToken(token)); }
  catch (_) { return json({ error: 'invalid privy token' }, 401); }

  // one payment can unlock exactly one account
  const already = await getByTxHash(txHash);
  if (already && already.privy_user_id && already.privy_user_id !== userId) {
    return json({ error: 'that transaction is already linked to another account' }, 409);
  }

  const pay = await verifyPayment(txHash, chain);
  if (!pay.ok) {
    const msg = {
      tx_failed: 'that transaction failed on-chain',
      no_match: `no USDC payment of ${PRICE_USDC}+ to the receiver found in that transaction`,
      rpc: 'could not reach an RPC to check — try again in a moment',
      bad_tx: 'invalid transaction hash',
      bad_chain: 'unsupported chain',
    }[pay.reason] || 'could not verify that payment';
    return json({ error: msg, reason: pay.reason }, 400);
  }

  const { email, wallet } = await fetchPrivyUser(userId);
  let row = await getByPrivyId(userId);
  if (!row && email) {
    const byEmail = await getByEmail(email);
    if (byEmail) row = await bindAccount(byEmail.id, { privyUserId: userId, email, wallet });
  }
  if (!row) row = await createAccount({ privyUserId: userId, email, wallet });

  row = await markPaid(row.id, { txHash, chain: pay.chain });

  const jwt = await issueSession({ accountId: row.id, privyUserId: userId, email: row.email, paid: true });
  return json({ paid: true, chain: pay.chain, email: row.email || null }, 200, { 'set-cookie': sessionCookie(jwt) });
}
