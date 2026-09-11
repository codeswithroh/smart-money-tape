import { resolveCoin, peakMc } from './_token.js';
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

// fetch + base64-embed rather than hand satori a remote URL: the og-image renderer's own
// remote-image fetch is unreliable inside this edge runtime, but a data: URI always renders.
async function dicebearDataUri(seed) {
  try {
    const url = 'https://api.dicebear.com/9.x/identicon/png?seed=' + encodeURIComponent(seed || 'anon') +
      '&backgroundColor=eadfc4,f4ecd9,fdf3cf&backgroundType=solid&radius=50&size=120';
    const buf = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (!buf) return null;
    return 'data:image/png;base64,' + toB64(buf);
  } catch (_) { return null; }
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
  const hasExit = entryMc != null && exitMc != null;
  // Telegram fetches this URL itself and gives up after a few seconds — every extra network hop
  // here is a way for that fetch to time out and fail completely silently on the user's end, so:
  // skip peakMc entirely when it isn't even shown (only the open-position view uses it), and cap
  // the avatar chain (3 sequential Telegram API round-trips) instead of letting a slow one stall
  // the whole card — a missing avatar is a cosmetic loss, a timed-out card is a support ticket.
  // race the real Telegram avatar against the DiceBear fallback instead of trying one then the
  // other — worst case is now one ~1.8s wait total, not up to 4s of stacked sequential timeouts
  const timeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
  const [pk, tgAvatar, dbAvatar] = await Promise.all([
    hasExit ? null : peakMc(rc.best),
    timeout(tgAvatarDataUri(uid), 1800),
    timeout(dicebearDataUri(un), 1800),
  ]);
  const avatar = tgAvatar || dbAvatar;

  const png = await flexImage({
    sym: rc.best.sym,
    chain: rc.best.chain.toUpperCase(),
    entryMc: entryMc || null,
    exitMc: exitMc || null,
    nowMc,
    nowPrice: rc.best.price,
    peakMc: pk && pk > (entryMc || nowMc) ? pk : (entryMc ? Math.max(pk || 0, nowMc) : null),
    by,
    avatar,
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
