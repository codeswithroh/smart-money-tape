// Upstash Redis (REST) helpers for MC alerts. No-op-safe when env vars are missing.
const U = (globalThis.process && process.env && process.env.UPSTASH_REDIS_REST_URL) || '';
const T = (globalThis.process && process.env && process.env.UPSTASH_REDIS_REST_TOKEN) || '';

export const kvReady = !!(U && T);
const HKEY = 'mc_alerts';

async function pipe(cmds) {
  if (!kvReady) throw new Error('kv not configured');
  const r = await fetch(U.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('kv http ' + r.status);
  const j = await r.json();
  return (Array.isArray(j) ? j : []).map((x) => (x && 'result' in x ? x.result : null));
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// [{id, chat, user, addr, chain, sym, target, base, dir, ts}, ...]
export async function alertsAll() {
  const [flat] = await pipe([['HGETALL', HKEY]]);
  const out = [];
  const arr = flat || [];
  for (let i = 0; i < arr.length; i += 2) {
    try { out.push({ id: arr[i], ...JSON.parse(arr[i + 1]) }); } catch (_) {}
  }
  return out;
}

export async function alertPut(id, obj) {
  return pipe([['HSET', HKEY, id, JSON.stringify(obj)]]);
}

export async function alertDel(ids) {
  if (!ids || !ids.length) return;
  return pipe([['HDEL', HKEY, ...ids]]);
}

// ---- repeat-offender deployer push: dedupe so the same coin isn't re-alerted every cron tick ----
const ALERTED_PREFIX = 'deployer_alerted:';
const ALERTED_TTL_S = 7 * 86400; // 7 days is plenty — a coin's launch window is long over by then

export async function alertedHas(addr) {
  const [v] = await pipe([['GET', ALERTED_PREFIX + addr]]);
  return !!v;
}

export async function alertedMark(addr) {
  return pipe([['SET', ALERTED_PREFIX + addr, '1', 'EX', ALERTED_TTL_S]]);
}
