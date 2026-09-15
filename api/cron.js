import { alertsAll, alertDel, kvReady, alertedHas, alertedMark } from './_kv.js';
import { dbReady, scoreCallsPending, scoreCallResolve, deployerLookup, subscribersAll } from './_db.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (globalThis.process && process.env && process.env.CRON_SECRET) || '';
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://memexray.fun';
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

  let scoreResolved = 0;
  if (dbReady) {
    try {
      const pending = await scoreCallsPending(200);
      if (pending.length) {
        const uniq2 = [...new Set(pending.map((p) => p.addr))];
        const mc2 = {};
        for (let i = 0; i < uniq2.length; i += 30) {
          const batch = uniq2.slice(i, i + 30);
          let j = null;
          try { j = await fetch(`${DEX}/latest/dex/tokens/${batch.join(',')}`).then((r) => (r.ok ? r.json() : null)); } catch (_) {}
          for (const a of batch) mc2[a] = mcOf(j && j.pairs, a);
        }
        for (const p of pending) {
          const mcAfter = mc2[p.addr];
          // no live pair found 48h later on a coin that was still trending when scored — the
          // closest this data source gets to "rugged/delisted", a fact worth keeping, not noise
          if (mcAfter == null) {
            await scoreCallResolve(p.id, { mcAfter: null, pctChange: null, outcome: 'delisted_or_no_data' });
            scoreResolved++;
            continue;
          }
          const base = p.mc_at_call;
          const pct = base && base > 0 ? ((mcAfter - base) / base) * 100 : null;
          let outcome = 'held';
          if (pct != null) {
            if (pct <= -80) outcome = 'dumped_80';
            else if (pct <= -50) outcome = 'dumped_50';
            else if (pct >= 50) outcome = 'pumped';
          }
          await scoreCallResolve(p.id, { mcAfter, pctChange: pct, outcome });
          scoreResolved++;
        }
      }
    } catch (_) {}
  }

  let deployerPushed = 0;
  if (dbReady && TOKEN) {
    try {
      deployerPushed = await checkRepeatOffenderDeploys();
    } catch (_) {}
  }

  return Response.json({ ok: true, checked: alerts.length, fired, scoreResolved, deployerPushed });
}

// opt-in proactive push (see api/tg.js /watchdeployers): scans DexScreener's currently-boosted
// tokens for new Solana launches, and if a boosted coin's on-chain deployer wallet already has
// 2+ prior failed-safety-screen flags in this tool's own deployer_flags ledger, every subscribed
// chat gets pinged immediately — before anyone has to search that coin themselves.
async function checkRepeatOffenderDeploys() {
  let boosts = [];
  try {
    boosts = await fetch(`${DEX}/token-boosts/top/v1`).then((r) => (r.ok ? r.json() : []));
  } catch (_) { return 0; }
  const solBoosts = (Array.isArray(boosts) ? boosts : [])
    .filter((b) => b.chainId === 'solana' && b.tokenAddress)
    .slice(0, 30);
  if (!solBoosts.length) return 0;

  let subscribers = [];
  try { subscribers = await subscribersAll(); } catch (_) { return 0; }
  if (!subscribers.length) return 0; // nobody opted in — skip the RugCheck calls entirely

  let pushed = 0;
  for (const b of solBoosts) {
    const addr = String(b.tokenAddress).toLowerCase();
    if (await alertedHas(addr)) continue;
    let rc = null;
    try { rc = await fetch(`https://api.rugcheck.xyz/v1/tokens/${b.tokenAddress}/report`).then((r) => (r.ok ? r.json() : null)); } catch (_) {}
    const creator = rc && rc.creator;
    if (!creator) { await alertedMark(addr); continue; } // no creator data — mark seen, don't retry every tick
    let flag = null;
    try { flag = await deployerLookup(String(creator).toLowerCase()); } catch (_) {}
    await alertedMark(addr);
    if (!flag || (flag.flag_count || 0) < 2) continue;

    const text =
      `🕵️ <b>Repeat-offender deployer just launched</b>\n` +
      `A wallet flagged <b>${flag.flag_count}×</b> before on this tool just deployed <code>${addr.slice(0, 4)}…${addr.slice(-4)}</code>, now trending.\n` +
      `Past reasons: ${(flag.reasons || []).slice(0, 3).join(', ') || 'failed safety screen'}\n\n` +
      `<a href="${SITE}/?coin=${encodeURIComponent(addr)}&amp;chain=solana">open the x-ray</a>`;
    for (const chat of subscribers) {
      try { await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', disable_web_page_preview: true, text }); } catch (_) {}
    }
    pushed++;
  }
  return pushed;
}
