import { resolveCoin, peakMc, priceSeries } from './_token.js';
import { flexImage } from './_flex.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;

function parseMc(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase().replace(/[$,\s]/g, '');
  const m = s.match(/^([\d.]+)([kmb])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === 'k') n *= 1e3; else if (m[2] === 'm') n *= 1e6; else if (m[2] === 'b') n *= 1e9;
  return n || null;
}

function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

// the person's real Telegram profile photo, base64-embedded server-side (the file API needs
// the bot token, so it can't be linked directly into the rendered image). Falls back to null
// so the caller can use a seeded identicon instead — never blocks the card on a slow/missing photo.
async function tgAvatarDataUri(uid) {
  if (!TOKEN || !uid) return null;
  try {
    const api = `https://api.telegram.org/bot${TOKEN}`;
    const pr = await fetch(`${api}/getUserProfilePhotos?user_id=${uid}&limit=1`).then((r) => r.json());
    const photos = pr && pr.result && pr.result.photos;
    if (!photos || !photos.length) return null;
    const sizes = photos[0];
    const biggest = sizes[sizes.length - 1];
    const fr = await fetch(`${api}/getFile?file_id=${biggest.file_id}`).then((r) => r.json());
    const path = fr && fr.result && fr.result.file_path;
    if (!path) return null;
    const buf = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${path}`).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (!buf) return null;
    const ext = /\.png$/i.test(path) ? 'png' : 'jpeg';
    return `data:image/${ext};base64,` + toB64(buf);
  } catch (_) { return null; }
}

function dicebearUrl(seed) {
  // .png, not .svg — the og-image renderer (satori) can't rasterize a remote SVG <img>, only bitmaps
  return 'https://api.dicebear.com/9.x/identicon/png?seed=' + encodeURIComponent(seed || 'anon') +
    '&backgroundColor=eadfc4,f4ecd9,fdf3cf&backgroundType=solid&radius=50&size=120';
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ca = (q.get('ca') || '').trim();
  const entryMc = parseMc(q.get('entry'));
  const exitMc = parseMc(q.get('exit'));
  const by = (q.get('by') || '').trim().slice(0, 24) || null;
  const uid = q.get('uid') || null;
  const un = q.get('un') || by || 'anon';

  const rc = await resolveCoin(ca);
  if (!rc) return new Response('no pair', { status: 404 });

  const nowMc = rc.best.mc;
  const [pk, series, avatar] = await Promise.all([
    peakMc(rc.best),
    priceSeries(rc.best, 200).catch(() => []),
    tgAvatarDataUri(uid),
  ]);

  const png = await flexImage({
    sym: rc.best.sym,
    chain: rc.best.chain.toUpperCase(),
    entryMc: entryMc || null,
    exitMc: exitMc || null,
    nowMc,
    peakMc: pk && pk > (entryMc || nowMc) ? pk : (entryMc ? Math.max(pk || 0, nowMc) : null),
    by,
    series,
    avatar: avatar || dicebearUrl(un),
  });

  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
}
