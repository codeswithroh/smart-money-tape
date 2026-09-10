import { resolveCoin, peakMc } from './_token.js';
import { flexImage } from './_flex.js';

export const config = { runtime: 'edge' };

function parseMc(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase().replace(/[$,\s]/g, '');
  const m = s.match(/^([\d.]+)([kmb])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === 'k') n *= 1e3; else if (m[2] === 'm') n *= 1e6; else if (m[2] === 'b') n *= 1e9;
  return n || null;
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ca = (q.get('ca') || '').trim();
  const entryMc = parseMc(q.get('entry'));
  const by = (q.get('by') || '').trim().slice(0, 24) || null;

  const rc = await resolveCoin(ca);
  if (!rc) return new Response('no pair', { status: 404 });

  const nowMc = rc.best.mc;
  const pk = await peakMc(rc.best);

  const png = await flexImage({
    sym: rc.best.sym,
    chain: rc.best.chain.toUpperCase(),
    entryMc: entryMc || null,
    nowMc,
    peakMc: pk && pk > (entryMc || nowMc) ? pk : (entryMc ? Math.max(pk || 0, nowMc) : null),
    by,
  });

  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
}
