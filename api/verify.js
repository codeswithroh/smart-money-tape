import { priceFor, paymentLanded, paymentByTx, ACCESS_CODE, corsJson } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsJson({}, 204);
  const url = new URL(req.url);
  const orderId = (url.searchParams.get('orderId') || '').trim();
  const tx = (url.searchParams.get('tx') || '').trim();
  if (!/^[a-f0-9]{12,40}$/.test(orderId)) return corsJson({ error: 'bad orderId' }, 400);

  const p = await priceFor(orderId);
  let res = tx ? await paymentByTx(tx, p.raw) : await paymentLanded(p.raw);
  // if the auto-scan missed it, a tx hash was not given -> just report pending
  if (res.ok) return corsJson({ paid: true, code: ACCESS_CODE, tx: res.tx || null });
  return corsJson({ paid: false, reason: res.reason || 'pending', amount: p.human });
}
