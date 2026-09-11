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
  const exitMc = parseMc(q.get('exit'));
  const by = (q.get('by') || '').trim().slice(0, 24) || null;

  const rc = await resolveCoin(ca);
  if (!rc) return new Response('no pair', { status: 404 });

  const nowMc = rc.best.mc;
  const hasExit = entryMc != null && exitMc != null;
  // no avatar fetch at all — the person's Telegram profile photo pulled in a 3-hop API chain
  // (getUserProfilePhotos -> getFile -> file download) was the single biggest source of latency
  // and the most likely reason Telegram's own fetch of this URL was timing out. Not worth it,
  // and the user explicitly doesn't want their face on the card anyway.
  const pk = hasExit ? null : await peakMc(rc.best);

  const png = await flexImage({
    sym: rc.best.sym,
    chain: rc.best.chain.toUpperCase(),
    entryMc: entryMc || null,
    exitMc: exitMc || null,
    nowMc,
    nowPrice: rc.best.price,
    peakMc: pk && pk > (entryMc || nowMc) ? pk : (entryMc ? Math.max(pk || 0, nowMc) : null),
    by,
  });

  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(png.byteLength),
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
}
