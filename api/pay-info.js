import { PAYTO, PRICE_USDC, CHAINS } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  const chains = Object.entries(CHAINS).map(([key, c]) => ({ key, name: c.name, id: c.id, usdc: c.usdc }));
  return new Response(JSON.stringify({ payTo: PAYTO, priceUsdc: PRICE_USDC, chains }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
