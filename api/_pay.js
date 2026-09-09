// Payment gate helpers. Flat-price USDC on Base, verified off public RPC. No DB.
export const PAYTO = '0xb77fF94Cb0EFB3Ab20424555199481C564C13239';
export const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // Circle native USDC on Base (6 dp)
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const RPCS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://1rpc.io/base',
  'https://base.blockpi.network/v1/rpc/public',
  'https://base.llamarpc.com',
];

export const ACCESS_CODE = (globalThis.process && process.env && process.env.ACCESS_CODE) || 'get it';
// flat price in USDC. override with env PRICE_USDC (e.g. 10 for launch). buyers send this OR MORE.
export const PRICE_USDC = Number((globalThis.process && process.env && process.env.PRICE_USDC)) || 1;
const PRICE_RAW = BigInt(Math.round(PRICE_USDC * 1e6)); // micro-USDC threshold

const topicToAddr = () => '0x' + PAYTO.slice(2).toLowerCase().padStart(64, '0');

function isPayment(lg) {
  try {
    if ((lg.address || '').toLowerCase() !== USDC_BASE) return false;
    if (((lg.topics && lg.topics[0]) || '').toLowerCase() !== TRANSFER_TOPIC) return false;
    if (((lg.topics && lg.topics[2]) || '').toLowerCase() !== topicToAddr()) return false;
    return BigInt(lg.data) >= PRICE_RAW;
  } catch (_) { return false; }
}

// best-effort auto scan of the last ~40 blocks (~90s). catches a payment made while polling.
export async function paymentLanded() {
  for (const url of RPCS) {
    try {
      const bnr = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) }).then((r) => r.json());
      if (!bnr || !bnr.result) continue;
      const latest = parseInt(bnr.result, 16);
      const from = '0x' + Math.max(0, latest - 40).toString(16);
      const lr = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{
          address: USDC_BASE, fromBlock: from, toBlock: 'latest',
          topics: [TRANSFER_TOPIC, null, topicToAddr()],
        }] }) }).then((r) => r.json());
      if (!lr || lr.error || !Array.isArray(lr.result)) continue;
      for (const lg of lr.result) if (isPayment(lg)) return { ok: true, tx: lg.transactionHash };
      return { ok: false, reason: 'not_found' };
    } catch (_) { /* next RPC */ }
  }
  return { ok: false, reason: 'rpc' };
}

// bulletproof: verify one pasted tx hash (no range limit, works forever)
export async function paymentByTx(txHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: 'bad_tx' };
  for (const url of RPCS) {
    try {
      const rc = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }) }).then((r) => r.json());
      if (!rc || rc.error || !rc.result) continue;
      const receipt = rc.result;
      if (receipt.status && receipt.status !== '0x1') return { ok: false, reason: 'tx_failed' };
      for (const lg of receipt.logs || []) if (isPayment(lg)) return { ok: true, tx: txHash };
      return { ok: false, reason: 'no_match' };
    } catch (_) { /* next RPC */ }
  }
  return { ok: false, reason: 'rpc' };
}

export function corsJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}
