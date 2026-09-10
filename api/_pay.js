// Multi-chain USDC payment verification. Non-custodial: buyer sends USDC to PAYTO
// on any supported EVM chain, we confirm the transfer from the tx receipt.
const env = (k) => (globalThis.process && process.env && process.env[k]) || '';

export const PAYTO = (env('PAYTO') || '0xb77fF94Cb0EFB3Ab20424555199481C564C13239').toLowerCase();
export const PRICE_USDC = Number(env('PRICE_USDC')) || 10;
const PRICE_RAW = BigInt(Math.round(PRICE_USDC * 1e6)); // USDC has 6 decimals

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const paytoTopic = '0x' + PAYTO.slice(2).padStart(64, '0');

// chainKey -> { id, name, usdc, rpcs }
export const CHAINS = {
  base: {
    id: 8453, name: 'Base',
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    rpcs: ['https://mainnet.base.org', 'https://base.publicnode.com', 'https://1rpc.io/base', 'https://base.llamarpc.com'],
  },
  ethereum: {
    id: 1, name: 'Ethereum',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    rpcs: ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth', 'https://rpc.ankr.com/eth'],
  },
  arbitrum: {
    id: 42161, name: 'Arbitrum',
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://1rpc.io/arb'],
  },
  optimism: {
    id: 10, name: 'Optimism',
    usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://1rpc.io/op'],
  },
  polygon: {
    id: 137, name: 'Polygon',
    usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    rpcs: ['https://polygon-rpc.com', 'https://polygon-bor-rpc.publicnode.com', 'https://1rpc.io/matic'],
  },
  avalanche: {
    id: 43114, name: 'Avalanche',
    usdc: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
    rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com', 'https://1rpc.io/avax/c'],
  },
};
export const CHAIN_KEYS = Object.keys(CHAINS);

function matchTransfer(log, usdc) {
  try {
    if ((log.address || '').toLowerCase() !== usdc) return null;
    const t = log.topics || [];
    if ((t[0] || '').toLowerCase() !== TRANSFER_TOPIC) return null;
    if ((t[2] || '').toLowerCase() !== paytoTopic) return null;
    const amt = BigInt(log.data);
    if (amt < PRICE_RAW) return null;
    return amt;
  } catch (_) { return null; }
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!r.ok) throw new Error('rpc ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

// verify a tx hash on ONE chain. returns {ok, amountRaw} | {ok:false, reason}
export async function verifyOnChain(txHash, chainKey) {
  const c = CHAINS[chainKey];
  if (!c) return { ok: false, reason: 'bad_chain' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: 'bad_tx' };
  let sawReceipt = false;
  for (const url of c.rpcs) {
    try {
      const receipt = await rpc(url, 'eth_getTransactionReceipt', [txHash]);
      if (!receipt) continue;
      sawReceipt = true;
      if (receipt.status && receipt.status !== '0x1') return { ok: false, reason: 'tx_failed' };
      for (const log of receipt.logs || []) {
        const amt = matchTransfer(log, c.usdc);
        if (amt != null) return { ok: true, amountRaw: amt.toString(), chain: chainKey };
      }
      return { ok: false, reason: 'no_match' };
    } catch (_) { /* next rpc */ }
  }
  return { ok: false, reason: sawReceipt ? 'no_match' : 'rpc' };
}

// try a hint chain first, then the rest
export async function verifyPayment(txHash, hintChain) {
  const order = hintChain && CHAINS[hintChain]
    ? [hintChain, ...CHAIN_KEYS.filter((k) => k !== hintChain)]
    : CHAIN_KEYS;
  let lastReason = 'no_match';
  for (const k of order) {
    const res = await verifyOnChain(txHash, k);
    if (res.ok) return res;
    if (res.reason === 'tx_failed') return res;
    if (res.reason !== 'rpc') lastReason = res.reason;
  }
  return { ok: false, reason: lastReason };
}
