import { readSession, json } from './_auth.js';
import { dbReady, watchList, watchCount, watchAdd, watchRemove } from './_db.js';

export const config = { runtime: 'edge' };

const norm = (v, n) => String(v == null ? "" : v).replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, n);

export default async function handler(req) {
  const s = await readSession(req.headers.get('cookie'));
  if (!s || !s.paid) return json({ error: 'unauthorized' }, 401);
  if (!dbReady) return json({ error: 'backend not configured' }, 503);
  const aid = s.aid;

  try {
    if (req.method === 'GET') {
      return json({ items: await watchList(aid) });
    }
    if (req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
      const addr = norm(b.addr, 90).toLowerCase();
      if (!addr) return json({ error: 'missing addr' }, 400);
      if ((await watchCount(aid)) >= 300) return json({ error: 'watchlist full (300 max)' }, 409);
      await watchAdd(aid, { addr, chain: norm(b.chain, 20).toLowerCase() || null, sym: norm(b.sym, 24) || null });
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const addr = norm(new URL(req.url).searchParams.get('addr'), 90).toLowerCase();
      if (!addr) return json({ error: 'missing addr' }, 400);
      await watchRemove(aid, addr);
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    return json({ error: 'server error' }, 500);
  }
}
