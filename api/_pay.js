// Shared helpers for the payment gate. USDC on Base, verified straight off public RPC. No DB.
export const PAYTO = '0xb77fF94Cb0EFB3Ab20424555199481C564C13239';
export const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // Circle native USDC on Base (6 decimals)
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const RPCS = [
  'https://base.llamarpc.com',
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
];

const SECRET = (globalThis.process && process.env && process.env.GATE_SECRET) || 'ar-salt-9f2c-2026';
export const ACCESS_CODE = (globalThis.process && process.env && process.env.ACCESS_CODE) || 'get it';

const enc = (s) => new TextEncoder().encode(s);

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic unique price per order so we can match a payment to a buyer with no state.
// Base 10 USDC + up to ~0.009 USDC of "signature" micro-cents.
export async function priceFor(orderId) {
  const h = await hmacHex(SECRET, 'amt:' + orderId);
  const micro = (parseInt(h.slice(0, 6), 16) % 8000) + 1000; // 1000..8999 micro-USDC
  const raw = 10 * 1e6 + micro; // integer, 6 decimals
  return { raw, human: (raw / 1e6).toFixed(6) };
}

async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await r.json();
      if (j && j.result !== undefined && j.result !== null) return j.result;
    } catch (_) { /* try next */ }
  }
  return null;
}

// Has a USDC transfer of exactly `rawAmount` landed on PAYTO recently?
export async function paymentLanded(rawAmount) {
  const bn = await rpc('eth_blockNumber', []);
  if (!bn) return { ok: false, reason: 'rpc' };
  const latest = parseInt(bn, 16);
  const topicTo = '0x' + PAYTO.slice(2).toLowerCase().padStart(64, '0');
  const want = BigInt(rawAmount);

  for (const span of [0x8000, 0x1800, 0x400]) { // ~18h, ~3.4h, ~35m
    const from = '0x' + Math.max(0, latest - span).toString(16);
    const logs = await rpc('eth_getLogs', [{
      address: USDC_BASE,
      fromBlock: from,
      toBlock: 'latest',
      topics: [TRANSFER_TOPIC, null, topicTo],
    }]);
    if (Array.isArray(logs)) {
      for (const lg of logs) {
        try { if (BigInt(lg.data) === want) return { ok: true, tx: lg.transactionHash }; } catch (_) {}
      }
      return { ok: false, reason: 'not_found' }; // valid response, no match -> stop
    }
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
