import { alertsAll, alertDel, kvReady } from './_kv.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (globalThis.process && process.env && process.env.CRON_SECRET) || '';
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://meme-attention-radar.vercel.app';
const DEX = 'https://api.dexscreener.com';

function fUsd(n) {
  if (n == null || isNaN(n)) return '?';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function mcOf(pairs, addr) {
  const ps = (pairs || []).filter(
    (p) => String((p.baseToken && p.baseToken.address) || '').toLowerCase() === addr.toLowerCase()
  );
  if (!ps.length) return null;
  ps.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  return +ps[0].marketCap || +ps[0].fdv || null;
}

export default async function handler(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!SECRET || key !== SECRET) return new Response('unauthorized', { status: 401 });
  if (!TOKEN) return new Response('no token', { status: 500 });
  if (!kvReady) return Response.json({ ok: false, reason: 'kv not configured' });

  let alerts;
  try { alerts = await alertsAll(); } catch (e) { return Response.json({ ok: false, reason: String(e) }); }
  if (!alerts.length) return Response.json({ ok: true, checked: 0, fired: 0 });

  const uniq = [...new Set(alerts.map((a) => a.addr))];
  const mc = {};
  for (let i = 0; i < uniq.length; i += 30) {
    const batch = uniq.slice(i, i + 30);
    let j = null;
    try { j = await fetch(`${DEX}/latest/dex/tokens/${batch.join(',')}`).then((r) => (r.ok ? r.json() : null)); } catch (_) {}
    for (const a of batch) mc[a] = mcOf(j && j.pairs, a);
  }

  const done = [];
  let fired = 0;
  for (const al of alerts) {
    const now = mc[al.addr];
    if (now == null) continue;
    const hit = al.dir === 'up' ? now >= al.target : now <= al.target;
    if (!hit) continue;
    fired++;
    const head = al.dir === 'up' ? '🟢 ▲ crossed above' : '🔴 ▼ fell below';
    await tg('sendMessage', {
      chat_id: al.chat,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      text:
        `🔔 <b>MC alert</b> — <b>$${al.sym}</b> ${head} <b>${fUsd(al.target)}</b>\n` +
        `now <b>${fUsd(now)}</b>  ·  set when it was ${fUsd(al.base)}\n\n` +
        `<a href="${SITE}/?coin=${encodeURIComponent(al.addr)}&amp;chain=${encodeURIComponent(al.chain || '')}">open the x-ray</a>`,
    });
    done.push(al.id);
  }
  try { await alertDel(done); } catch (_) {}
  return Response.json({ ok: true, checked: alerts.length, fired });
}
