import { paymentLanded, paymentByTx, ACCESS_CODE, corsJson } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsJson({}, 204);
  const tx = (new URL(req.url).searchParams.get('tx') || '').trim();

  const res = tx ? await paymentByTx(tx) : await paymentLanded();

  if (res.ok) return corsJson({ paid: true, code: ACCESS_CODE, tx: res.tx || null });
  return corsJson({ paid: false, reason: res.reason || 'pending' });
}
