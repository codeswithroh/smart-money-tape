import { PAYTO, priceFor, corsJson, PRICE_USDC } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsJson({}, 204);
  // random opaque order id; the exact amount is derived from it, so no storage needed
  const orderId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const p = await priceFor(orderId);
  return corsJson({
    orderId,
    chain: 'base',
    token: 'USDC',
    address: PAYTO,
    amount: p.human,      // e.g. "10.004731" — send this EXACT amount
    amountRaw: p.raw,
    priceUsdc: PRICE_USDC,
    decimals: 6,
    note: 'Send this exact USDC amount on Base. Confirms automatically within ~1 min.',
  });
}
