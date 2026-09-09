import { PAYTO, corsJson, PRICE_USDC } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  return corsJson({
    chain: 'base',
    token: 'USDC',
    address: PAYTO,
    amount: String(PRICE_USDC),        // flat: send this or more
    priceUsdc: PRICE_USDC,
    decimals: 6,
    note: 'Send ' + PRICE_USDC + ' USDC (or more) on Base. Then paste your tx hash, or wait ~1 min for auto-confirm.',
  });
}
