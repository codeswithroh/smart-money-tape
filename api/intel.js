// Shared endpoint for the three server-backed research features: deployer reputation ledger,
// narrative half-life corpus, and cross-coin wallet sightings. One file (like watchlist.js's
// pattern) instead of three near-identical ones, routed by ?kind=.
import { readSession, json } from './_auth.js';
import {
  dbReady,
  deployerFlag, deployerLookup,
  pulseLog, pulseCurve,
  walletSightingsAdd, walletSightingsFor,
} from './_db.js';

export const config = { runtime: 'edge' };

const norm = (v, n) => String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, n);
const numOr = (v) => { const n = +v; return isFinite(n) ? n : null; };

export default async function handler(req) {
  const s = await readSession(req.headers.get('cookie'));
  if (!s || !s.paid) return json({ error: 'unauthorized' }, 401);
  if (!dbReady) return json({ error: 'backend not configured' }, 503);

  const q = new URL(req.url).searchParams;
  const kind = norm(q.get('kind'), 20);

  try {
    if (req.method === 'GET') {
      if (kind === 'deployer') {
        const addr = norm(q.get('addr'), 90).toLowerCase();
        if (!addr) return json({ error: 'missing addr' }, 400);
        return json({ flag: await deployerLookup(addr) });
      }
      if (kind === 'pulse') {
        const theme = norm(q.get('theme'), 40);
        if (!theme) return json({ error: 'missing theme' }, 400);
        return json({ rows: await pulseCurve(theme) });
      }
      if (kind === 'sightings') {
        const wals = norm(q.get('wals'), 2000).toLowerCase().split(',').map((w) => w.trim()).filter(Boolean).slice(0, 60);
        const addr = norm(q.get('addr'), 90).toLowerCase();
        if (!wals.length || !addr) return json({ error: 'missing wals/addr' }, 400);
        return json({ sightings: await walletSightingsFor(wals, addr) });
      }
      return json({ error: 'unknown kind' }, 400);
    }

    if (req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }

      if (kind === 'deployer_flag') {
        const addr = norm(b.addr, 90).toLowerCase();
        const reason = norm(b.reason, 60);
        if (!addr || !reason) return json({ error: 'missing addr/reason' }, 400);
        await deployerFlag(addr, norm(b.chain, 20).toLowerCase() || null, reason);
        return json({ ok: true });
      }
      if (kind === 'pulse') {
        const theme = norm(b.theme, 40), addr = norm(b.addr, 90).toLowerCase();
        if (!theme || !addr) return json({ error: 'missing theme/addr' }, 400);
        await pulseLog({
          theme, addr,
          chain: norm(b.chain, 20).toLowerCase() || null,
          sym: norm(b.sym, 24) || null,
          ageDays: numOr(b.ageDays),
          attnScore: numOr(b.attnScore),
          mc: numOr(b.mc),
        });
        return json({ ok: true });
      }
      if (kind === 'sightings') {
        const addr = norm(b.addr, 90).toLowerCase();
        const wals = Array.isArray(b.wals) ? b.wals.slice(0, 40) : [];
        if (!addr || !wals.length) return json({ error: 'missing addr/wals' }, 400);
        const rows = wals.map((w) => ({
          wal: norm(w, 90).toLowerCase(), addr,
          chain: norm(b.chain, 20).toLowerCase() || null,
          sym: norm(b.sym, 24) || null,
          mc: numOr(b.mc),
        })).filter((r) => r.wal);
        await walletSightingsAdd(rows);
        return json({ ok: true, n: rows.length });
      }
      return json({ error: 'unknown kind' }, 400);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    return json({ error: 'server error' }, 500);
  }
}
