import { PAYTO, PRICE_USDC, CHAINS, SOLANA } from './_pay.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  const evm = Object.entries(CHAINS).map(([key, c]) => ({
    key, name: c.name, kind: 'evm', id: c.id, usdc: c.usdc, receiver: PAYTO,
  }));
  // Solana first, then the EVM chains
  const chains = [
    { key: SOLANA.key, name: SOLANA.name, kind: 'svm', usdcMint: SOLANA.usdcMint, receiver: SOLANA.receiver },
    ...evm,
  ];
  return new Response(JSON.stringify({ payTo: PAYTO, solanaPayTo: SOLANA.receiver, priceUsdc: PRICE_USDC, chains }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
