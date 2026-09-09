// Payment gate helpers. USDC on Base, verified off public RPC. No DB.
export const PAYTO = '0xb77fF94Cb0EFB3Ab20424555199481C564C13239';
export const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // Circle native USDC on Base (6 dp)
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// public Base RPCs. base.org allows small eth_getLogs (<=2000 blocks); all allow getTransactionReceipt.
export const RPCS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://1rpc.io/base',
  'https://base.blockpi.network/v1/rpc/public',
  'https://base.llamarpc.com',
];

const SECRET = (globalThis.process && process.env && process.env.GATE_SECRET) || 'ar-salt-9f2c-2026';
export const ACCESS_CODE = (globalThis.process && process.env && process.env.ACCESS_CODE) || 'get it';

const enc = (s) => new TextEncoder().encode(s);

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Unique price per order so a payment matches a buyer with zero state.
// 10 USDC + up to ~0.009 USDC of "signature".
export async function priceFor(orderId) {
  const h = await hmacHex(SECRET, 'amt:' + orderId);
  const micro = (parseInt(h.slice(0, 6), 16) % 8000) + 1000; // 1000..8999
  const raw = 10 * 1e6 + micro;
  return { raw, human: (raw / 1e6).toFixed(6) };
}

async function rpc(method, params, only) {
  const list = only ? [only] : RPCS;
  for (const url of list) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await r.json();
      if (j && j.error) continue;
      if (j && j.result !== undefined && j.result !== null) return j.result;
    } catch (_) { /* next */ }
  }
  return null;
}

const topicToAddr = () => '0x' + PAYTO.slice(2).toLowerCase().padStart(64, '0');

function logMatches(lg, want) {
  try {
    if ((lg.address || '').toLowerCase() !== USDC_BASE) return false;
    if (((lg.topics && lg.topics[0]) || '').toLowerCase() !== TRANSFER_TOPIC) return false;
    if (((lg.topics && lg.topics[2]) || '').toLowerCase() !== topicToAddr()) return false;
    return BigInt(lg.data) === want;
  } catch (_) { return false; }
}

// A) auto scan: small recent window (base.org caps getLogs at 2000 blocks)
export async function paymentLanded(rawAmount) {
  const bn = await rpc('eth_blockNumber', [], 'https://mainnet.base.org');
  if (!bn) return { ok: false, reason: 'rpc' };
  const latest = parseInt(bn, 16);
  const want = BigInt(rawAmount);
  const from = '0x' + Math.max(0, latest - 1800).toString(16);
  const logs = await rpc('eth_getLogs', [{
    address: USDC_BASE, fromBlock: from, toBlock: 'latest',
    topics: [TRANSFER_TOPIC, null, topicToAddr()],
  }], 'https://mainnet.base.org');
  if (!Array.isArray(logs)) return { ok: false, reason: 'rpc' };
  for (const lg of logs) if (logMatches(lg, want)) return { ok: true, tx: lg.transactionHash };
  return { ok: false, reason: 'not_found' };
}

// B) bulletproof: verify one pasted tx hash (no range limit, works forever)
export async function paymentByTx(txHash, rawAmount) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: 'bad_tx' };
  const rc = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!rc) return { ok: false, reason: 'rpc' };
  if (rc.status && rc.status !== '0x1') return { ok: false, reason: 'tx_failed' };
  const want = BigInt(rawAmount);
  for (const lg of rc.logs || []) if (logMatches(lg, want)) return { ok: true, tx: txHash };
  return { ok: false, reason: 'no_match' };
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
