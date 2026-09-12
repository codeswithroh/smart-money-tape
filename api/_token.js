// Server-side token card for the Telegram bot. Same public data as Rick, plus a verdict.
const DEX = 'https://api.dexscreener.com';
const RUG = 'https://api.rugcheck.xyz/v1/tokens';
const HP = 'https://api.honeypot.is/v2/IsHoneypot';
const GOPLUS = 'https://api.gopluslabs.io/api/v1/token_security';
const GOPLUS_ID = { ethereum: 1, bsc: 56, base: 8453, polygon: 137, arbitrum: 42161, avalanche: 43114, optimism: 10 };
const BURN_ADDR = '0x000000000000000000000000000000000000dead';
const EVM_ID = { ethereum: 1, bsc: 56, base: 8453, polygon: 137, arbitrum: 42161, avalanche: 43114, optimism: 10, blast: 81457 };

const THEMES = [
  { k: 'ai', name: 'AI/chips', kw: ['ai', 'gpt', 'openai', 'chatgpt', 'claude', 'gemini', 'grok', 'llm', 'agi', 'nvidia', 'chip', 'compute', 'neural', 'model', 'agent', 'anthropic', 'deepseek'] },
  { k: 'gta', name: 'GTA', kw: ['gta', 'gta6', 'rockstar', 'vice city', 'lucia', 'leak'] },
  { k: 'trump', name: 'Trump/politics', kw: ['trump', 'maga', 'potus', 'biden', 'election', 'tariff', 'vance'] },
  { k: 'elon', name: 'Elon/xAI', kw: ['elon', 'musk', 'xai', 'grok', 'tesla', 'starship', 'optimus', 'doge'] },
  { k: 'stream', name: 'streamers', kw: ['kai', 'cenat', 'speed', 'ishowspeed', 'mrbeast', 'adin', 'jynxzi', 'xqc'] },
  { k: 'hood', name: 'Robinhood', kw: ['robinhood', 'hood', 'vlad'] },
  { k: 'dog', name: 'dogs', kw: ['dog', 'doge', 'shiba', 'inu', 'bonk', 'wif', 'floki', 'cheems'] },
  { k: 'frog', name: 'frogs', kw: ['pepe', 'frog', 'wojak', 'chad', 'brett', 'apu'] },
  { k: 'china', name: 'China', kw: ['china', 'chinese', 'mao', 'panda', 'labubu'] },
  { k: 'anime', name: 'anime', kw: ['anime', 'waifu', 'naruto', 'goku', 'senpai', 'miku'] },
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function fUsd(n) { if (n == null || isNaN(n)) return '-'; const a = Math.abs(n); if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'; return '$' + n.toFixed(0); }
function fPrice(n) { if (!n) return '-'; if (n >= 1) return '$' + n.toFixed(3); if (n >= 0.001) return '$' + n.toFixed(5); if (n >= 1e-7) return '$' + n.toFixed(9); return '$' + n.toExponential(2); }
function fNum(n) { if (n == null || isNaN(n)) return '-'; const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return '' + Math.round(n); }
function fPct(n) { if (n == null || isNaN(n)) return '-'; return (n > 0 ? '+' : '') + (+n).toFixed(Math.abs(n) >= 100 ? 0 : 1) + '%'; }
function fAge(ms) { if (ms == null) return '?'; const m = ms / 6e4; if (m < 90) return Math.round(m) + 'm'; const h = m / 60; if (h < 48) return h.toFixed(0) + 'h'; return (h / 24).toFixed(0) + 'd'; }

export function pickAddr(text) {
  const m = String(text || '').match(/(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/);
  return m ? m[1] : null;
}

async function jget(url) { try { const r = await fetch(url, { headers: { accept: 'application/json' } }); return r.ok ? r.json() : null; } catch (_) { return null; } }

function parsePair(p) {
  const liq = (p.liquidity && +p.liquidity.usd) || 0;
  return {
    addr: (p.baseToken && p.baseToken.address) || '',
    sym: (p.baseToken && p.baseToken.symbol) || '?',
    name: (p.baseToken && p.baseToken.name) || '',
    chain: String(p.chainId || '').toLowerCase(),
    dex: p.dexId || '',
    liq, price: +p.priceUsd || 0,
    mc: +p.marketCap || +p.fdv || 0,
    vol: p.volume || {}, txns: p.txns || {}, pc: p.priceChange || {},
    ageMs: p.pairCreatedAt ? Date.now() - p.pairCreatedAt : null,
    pairAddr: p.pairAddress || '',
    socials: ((p.info && p.info.socials) || []).map((s) => String(s.type || '').toLowerCase()),
    socialUrls: ((p.info && p.info.socials) || []).map((s) => ({ type: String(s.type || '').toLowerCase(), url: s.url || '' })).filter((s) => s.url),
    siteUrl: ((p.info && p.info.websites) || [])[0] ? (p.info.websites[0].url || '') : '',
    sites: ((p.info && p.info.websites) || []).length,
    img: (p.info && p.info.imageUrl) || (p.info && p.info.openGraph) || '',
    url: p.url || '',
  };
}

const GT_PROXY = ((globalThis.process && process.env && process.env.SITE_URL) || 'https://memexray.fun') + '/api/gt?path=';
const GT_NET = { solana: 'solana', bsc: 'bsc', base: 'base', ethereum: 'eth' };

// peak market cap estimate from OHLCV highs since the pool was created
export async function peakMc(best) {
  const net = GT_NET[best.chain];
  if (!net || !best.pairAddr || !best.price || !best.mc) return null;
  const path = `/networks/${net}/pools/${best.pairAddr}/ohlcv/minute?aggregate=15&limit=300&currency=usd`;
  const j = await jget(GT_PROXY + encodeURIComponent(path));
  const rows = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
  if (!rows.length) return null;
  let hi = 0;
  for (const r of rows) hi = Math.max(hi, +r[2] || 0);
  if (hi <= best.price) return best.mc;
  return best.mc * (hi / best.price);
}

// closing-price series since pool creation, oldest -> newest, for a flex-card sparkline
export async function priceSeries(best, n) {
  const net = GT_NET[best.chain];
  if (!net || !best.pairAddr) return [];
  const path = `/networks/${net}/pools/${best.pairAddr}/ohlcv/minute?aggregate=15&limit=${n || 200}&currency=usd`;
  const j = await jget(GT_PROXY + encodeURIComponent(path));
  const rows = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
  if (!rows.length) return [];
  // GeckoTerminal returns newest-first; flip to chronological
  return rows.slice().reverse().map((r) => +r[4] || 0).filter((c) => c > 0);
}

// top attention movers right now (for /radar)
export async function topMovers() {
  const paths = [
    '/networks/solana/trending_pools?page=1',
    '/networks/base/trending_pools?page=1',
    '/networks/bsc/trending_pools?page=1',
  ];
  const addrs = [];
  const seen = {};
  await Promise.all(paths.map(async (p) => {
    const j = await jget(GT_PROXY + encodeURIComponent(p));
    const d = (j && j.data) || [];
    for (const pool of d.slice(0, 12)) {
      const rel = pool.relationships && pool.relationships.base_token && pool.relationships.base_token.data;
      const a = rel ? String(rel.id || '').split('_').pop() : '';
      if (a && !seen[a]) { seen[a] = 1; addrs.push(a); }
    }
  }));
  const b = await jget(`${DEX}/token-boosts/top/v1`);
  (Array.isArray(b) ? b : []).slice(0, 10).forEach((x) => {
    const a = x.tokenAddress || '';
    if (a && !seen[a]) { seen[a] = 1; addrs.push(a); }
  });
  const out = [];
  await Promise.all(addrs.slice(0, 24).map(async (a) => {
    try {
      const c = await resolveCoin(a);
      if (c && c.best.mc && c.best.mc < 8e7) out.push({ sym: c.best.sym, chain: c.best.chain, mc: c.best.mc, addr: c.best.addr, ch1: +c.best.pc.h1 || 0, ...c.a });
    } catch (_) {}
  }));
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, 6);
}

function attn(p) {
  const t1 = p.txns.h1 || {}; const b1 = +t1.buys || 0; const s1 = +t1.sells || 0;
  const skew1 = (b1 + s1) ? b1 / (b1 + s1) : 0.5;
  const vh1 = +p.vol.h1 || 0; const vm5 = +p.vol.m5 || 0;
  const accel = vh1 > 0 ? (vm5 * 12) / vh1 : (vm5 > 0 ? 2 : 1);
  const ch = p.pc || {};
  const slope = (+ch.m5 || 0) * 0.5 + (+ch.h1 || 0) * 0.3 + (+ch.h6 || 0) * 0.2;
  let traj = 'STEADY';
  if (accel >= 1.25 && skew1 >= 0.53 && slope > -2) traj = 'RAMPING';
  else if (accel < 0.7 || skew1 < 0.42 || (+ch.h1 || 0) < -18) traj = 'FADING';
  let score = 30 + 38 * (Math.min(3, accel) - 1) + 34 * ((skew1 - 0.5) / 0.3) + slope * 0.35;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { skew1, accel, slope, traj, score, b1, s1 };
}

function tagThemes(p) {
  const hay = ((p.sym || '') + ' ' + (p.name || '')).toLowerCase();
  const hits = [];
  for (const t of THEMES) for (const w of t.kw) {
    const hit = w.length <= 3 ? new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(hay) : hay.indexOf(w) >= 0;
    if (hit) { hits.push(t); break; }
  }
  return hits;
}

async function safety(addr, chain) {
  if (chain === 'solana') {
    const j = await jget(`${RUG}/${addr}/report`);
    if (!j) return null;
    const risks = j.risks || [];
    const danger = risks.filter((x) => String(x.level || '').toLowerCase() === 'danger').map((x) => x.name);
    const allH = (j.topHolders || []).filter((h) => h.pct != null);
    const top = allH.filter((h) => !h.insider);
    const topPct = top.length ? top[0].pct : null;
    const lp = j.lpLockedPct != null ? j.lpLockedPct : (j.markets && j.markets[0] && j.markets[0].lp && j.markets[0].lp.lpLockedPct);
    // same holder-analysis depth as the dashboard's client-side rug check, so the bot's score
    // and the web x-ray's score agree on the same coin
    const nonLp = top.filter((h) => h.pct < 40);
    const creator = j.creator || (j.fileMeta && j.fileMeta.creator) || '';
    const devH = creator ? allH.filter((h) => String(h.address || h.owner || '') === String(creator))[0] : null;
    const devPct = devH ? devH.pct : (j.creatorBalancePct != null ? j.creatorBalancePct : null);
    let insiderPct = allH.filter((h) => h.insider).reduce((s, h) => s + (+h.pct || 0), 0);
    insiderPct = insiderPct || null;
    const cl = nonLp.slice(0, 10).filter((h) => h.pct >= 0.25 && h.pct <= 5).map((h) => h.pct);
    let bundle = false;
    if (cl.length >= 4) { const mn = Math.min(...cl), mx = Math.max(...cl); if (mx - mn <= 0.6) bundle = true; }
    const ok = !j.rugged && !j.mintAuthority && !j.freezeAuthority && !(topPct != null && topPct > 35) && !danger.length;
    return {
      ok, holders: j.totalHolders, renounced: !j.mintAuthority && !j.freezeAuthority, lpPct: lp, topPct, reasons: danger,
      devPct, insiderPct, bundle, creator: creator || null, creatorTokens: j.creatorTokens || null, src: 'rugcheck',
    };
  }
  const cid = EVM_ID[chain];
  if (!cid) return null;
  // honeypot.is alone only ever caught tax/honeypot mechanics, never holder concentration —
  // EVM chains got zero holder-safety signal while Solana got a full RugCheck breakdown. GoPlus
  // Security (free, no key) fills that gap: top real holder %, LP lock %, renounce, dev balance.
  const [j, gp] = await Promise.all([
    jget(`${HP}?address=${addr}&chainID=${cid}`),
    GOPLUS_ID[chain] ? jget(`${GOPLUS}/${GOPLUS_ID[chain]}?contract_addresses=${addr}`) : null,
  ]);
  const g = gp && gp.result && gp.result[addr.toLowerCase()];
  let topPct = null, lpPct = null, renounced = null, devPct = null, blacklisted = false;
  if (g) {
    const realHolders = (g.holders || []).filter((h) => String(h.address || '').toLowerCase() !== BURN_ADDR && !h.is_contract);
    topPct = realHolders.length ? +realHolders[0].percent * 100 : null;
    const lpSum = (g.lp_holders || []).filter((h) => h.is_locked).reduce((s, h) => s + (+h.percent || 0), 0);
    lpPct = (g.lp_holders || []).length ? lpSum * 100 : null;
    renounced = !g.owner_address || g.owner_address === '0x0000000000000000000000000000000000000000';
    devPct = g.creator_percent != null ? +g.creator_percent * 100 : null;
    blacklisted = g.is_blacklisted === '1' || g.is_honeypot === '1';
  }
  if (!j && !g) return null;
  const hp = (j && j.honeypotResult && j.honeypotResult.isHoneypot) || blacklisted;
  const sim = (j && j.simulationResult) || {};
  const reasons = [];
  if (hp) reasons.push('honeypot/blacklisted');
  if (topPct != null && topPct > 25) reasons.push('top holder ' + topPct.toFixed(0) + '%');
  if (lpPct != null && lpPct < 50) reasons.push('LP ' + lpPct.toFixed(0) + '% locked');
  return {
    ok: !hp && !(sim.sellTax > 25) && !(sim.buyTax > 25) && !(topPct != null && topPct > 35),
    holders: j && j.holderAnalysis && +j.holderAnalysis.holders,
    sellTax: sim.sellTax, buyTax: sim.buyTax, honeypot: !!hp,
    topPct, lpPct, renounced, devPct, reasons, src: 'goplus',
  };
}

/* ---------- long-term research score (server-side, for the /score Telegram command) ----------
   Same five factors and weights as the dashboard's X-ray panel, so a coin never disagrees with
   itself between the web app and the bot. Growth has no server-side history (that's tracked
   client-side in the browser), so it's always the neutral default here with a note saying so. */
function fServerHolderSafety(sf) {
  if (!sf || (sf.src !== 'rugcheck' && sf.src !== 'goplus')) return { v: 0.5, note: sf ? 'safety data limited on this chain' : 'safety data unavailable' };
  let v = 1; const notes = [];
  if (sf.topPct != null) { notes.push('top holder ' + sf.topPct.toFixed(1) + '%'); v -= Math.max(0, sf.topPct - 8) / 40; }
  if (sf.devPct != null) { notes.push('dev ' + sf.devPct.toFixed(1) + '%'); v -= Math.min(0.3, sf.devPct / 12); }
  if (sf.insiderPct != null) { notes.push('insiders ' + sf.insiderPct.toFixed(0) + '%'); v -= Math.min(0.3, sf.insiderPct / 70); }
  if (sf.bundle) { notes.push('bundle pattern'); v -= 0.35; }
  if (sf.renounced === false) { notes.push('not renounced'); v -= 0.15; }
  if (sf.lpPct != null && sf.lpPct < 50) { notes.push('LP ' + Math.round(sf.lpPct) + '% locked'); v -= 0.15; }
  if (sf.ok === false) v = Math.min(v, 0.15);
  return { v: Math.max(0, Math.min(1, v)), note: notes.length ? notes.join(' · ') : 'no rug-check flags' };
}
function fServerLiquidity(best) {
  if (!best.liq || !best.mc) return { v: 0.3, note: 'liquidity/mc unavailable' };
  const ratio = best.liq / best.mc; let v = Math.min(1, ratio / 0.12);
  if (best.liq < 5000) v = Math.min(v, 0.15);
  return { v, note: fUsd(best.liq) + ' liq · ' + (ratio * 100).toFixed(1) + '% of mc' };
}
function fServerVolume(best, a) {
  let v = 1; const notes = [];
  const skewDist = Math.abs(a.skew1 - 0.5);
  if (skewDist > 0.35) { v -= 0.3; notes.push('lopsided buy/sell'); }
  const vmc = best.mc ? (best.vol.h24 || 0) / best.mc : 0;
  if (vmc > 6) { v -= 0.35; notes.push('vol/mc ' + vmc.toFixed(1) + 'x — wash-trade risk'); }
  else if (vmc < 0.02) { v -= 0.2; notes.push('vol/mc thin — low real interest'); }
  else notes.push('vol/mc ' + vmc.toFixed(2) + 'x');
  return { v: Math.max(0, Math.min(1, v)), note: notes.join(' · ') };
}
function fServerProject(best) {
  const hasX = best.socials.some((s) => s.type === 'twitter' || s.type === 'x');
  const hasTg = best.socials.some((s) => s.type === 'telegram');
  const hasSite = (best.sites && best.sites.length > 0) || !!best.siteUrl;
  const n = [hasX, hasTg, hasSite].filter(Boolean).length;
  return { v: n / 3, note: n + '/3 surface (x/telegram/site)' };
}
export async function researchScore(addr) {
  const rc = await resolveCoin(addr);
  if (!rc) return null;
  const best = rc.best, a = rc.a;
  const sf = await safety(best.addr, best.chain);
  const H = fServerHolderSafety(sf), L = fServerLiquidity(best);
  const G = { v: 0.35, note: 'not tracked in Telegram — open the x-ray for holder-growth history' };
  const V = fServerVolume(best, a), P = fServerProject(best);
  let pct = Math.round(100 * (0.32 * H.v + 0.20 * L.v + 0.18 * G.v + 0.15 * V.v + 0.15 * P.v));
  // next to no liquidity means the position can't be exited, period — no other factor gets to
  // outvote that into looking "fine"
  if (best.liq != null && best.liq < 500) pct = Math.min(pct, 20);
  let label, cls;
  if (pct >= 68) { label = 'BUILT TO LAST'; cls = 'pos'; }
  else if (pct >= 48) { label = 'HAS SOME LEGS'; cls = ''; }
  else if (pct >= 28) { label = 'SPECULATIVE'; cls = 'watch'; }
  else { label = 'HIGH RUG RISK'; cls = 'neg'; }
  return {
    pct, label, cls, best, tags: rc.tags,
    factors: [
      { k: 'Holder safety', ...H },
      { k: 'Liquidity depth', ...L },
      { k: 'Organic growth', ...G },
      { k: 'Volume authenticity', ...V },
      { k: 'Project surface', ...P },
    ],
  };
}
function bar(pct) {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / 5);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}
export function scoreText(s) {
  const L = [];
  L.push(`<b>$${esc(s.best.sym)}</b> · long-term research score`);
  L.push('━━━━━━━━━━━━━━');
  L.push(`<b>${s.pct}/100 — ${esc(s.label)}</b>`);
  L.push('Weighted from holder safety, liquidity, growth, volume authenticity, project surface — not age.');
  L.push('');
  s.factors.forEach((f) => {
    const pct = Math.round(f.v * 100);
    L.push(`<code>${bar(pct)}</code> ${pct}  ${esc(f.k)}`);
    L.push(`   <i>${f.note}</i>`);
  });
  L.push('━━━━━━━━━━━━━━');
  L.push('Same weighting as the dashboard’s X-ray panel. A heuristic score from public on-chain data — not financial advice.');
  return L.join('\n');
}

// tiny spinoff-idea generator
const PRE = ['turbo', 'mega', 'based', 'giga', 'hyper', 'micro'];
const SUF = ['inu', 'pepe', 'fi', 'ai', '69', 'coin', 'max', 'god'];
const BANK = { ai: ['grok', 'agent', 'llm', 'vector', 'oracle'], dog: ['inu', 'bonk', 'woof', 'paw'], frog: ['pepe', 'kek', 'ribbit'], trump: ['maga', 'eagle', '47'], elon: ['grok', 'mars', 'doge'], stream: ['kai', 'rizz', 'clip'], _: ['moon', 'chad', 'wojak', 'giga'] };
function spinoff(tags) {
  const key = tags[0] ? tags[0].k : '_';
  const words = BANK[key] || BANK._;
  const core = words[Math.floor(Math.random() * words.length)];
  const r = Math.random();
  let name = r < 0.4 ? PRE[Math.floor(Math.random() * PRE.length)] + core
    : r < 0.75 ? core + SUF[Math.floor(Math.random() * SUF.length)]
      : core + words[Math.floor(Math.random() * words.length)];
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  const tk = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'MEME';
  return `${name} $${tk}`;
}

// resolve a bare ticker ($CATE) to real candidate coins. Memecoin tickers are squatted constantly
// (fake pools cloning a popular symbol, sometimes with spoofed liquidity numbers), so this ranks by
// real trading volume rather than liquidity alone and returns several candidates instead of
// silently picking one — the caller decides whether the top hit is dominant enough to auto-open.
export async function resolveTicker(sym) {
  const clean = String(sym || '').replace(/^\$/, '').trim();
  if (!clean || clean.length > 20) return [];
  const j = await jget(`${DEX}/latest/dex/search?q=${encodeURIComponent(clean)}`);
  const pairs = (j && j.pairs) || [];
  const matches = pairs
    .filter((p) => String((p.baseToken && p.baseToken.symbol) || '').toLowerCase() === clean.toLowerCase())
    .map(parsePair)
    .filter((p) => p.addr && p.liq > 200); // drop dust/empty pools
  const byAddr = {};
  for (const p of matches) { if (!byAddr[p.addr] || p.liq > byAddr[p.addr].liq) byAddr[p.addr] = p; }
  // volume alone rewards wash-traded ticker-squat pools (real cases seen: $9k liquidity showing
  // $500k+ "volume"), so cap each candidate's effective score at a multiple of its own liquidity —
  // a coin can't out-rank a properly-liquid one just by faking trades against a thin pool.
  return Object.values(byAddr)
    .map((p) => { p.rank = Math.min(p.vol.h24 || 0, p.liq * 10) || p.liq; return p; })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5);
}

export async function resolveCoin(addr) {
  let j = await jget(`${DEX}/latest/dex/tokens/${encodeURIComponent(addr)}`);
  let pairs = (j && j.pairs) || [];
  if (!pairs.length) {
    j = await jget(`${DEX}/latest/dex/search?q=${encodeURIComponent(addr)}`);
    pairs = (j && j.pairs) || [];
  }
  if (!pairs.length) return null;
  const best = pairs.map(parsePair).sort((a, b) => b.liq - a.liq)[0];
  return { best, a: attn(best), tags: tagThemes(best), _needSafety: true };
}

export async function tokenCard(addr, site) {
  const rc = await resolveCoin(addr);
  if (!rc) return { ok: false, text: "Couldn't find a pair for that address." };
  const best = rc.best;
  const a = rc.a;
  const tags = rc.tags;
  const sf = await safety(best.addr, best.chain);

  const holders = sf && sf.holders;
  const trajEmoji = a.traj === 'RAMPING' ? '🔥' : a.traj === 'FADING' ? '🩸' : '➖';
  const soc = [];
  if (best.socials.includes('twitter') || best.socials.includes('x')) soc.push('X');
  if (best.socials.includes('telegram')) soc.push('TG');
  if (best.sites || best.socials.includes('website')) soc.push('site');

  let rug = 'not checked';
  if (sf) {
    if (best.chain === 'solana') rug = (sf.ok ? '✅ passed' : '⚠️ ' + (sf.reasons[0] || 'flags')) +
      (sf.renounced ? ' · renounced' : ' · not renounced') + (sf.lpPct != null ? ` · LP ${Math.round(sf.lpPct)}%` : '') +
      (sf.topPct != null ? ` · top ${sf.topPct.toFixed(0)}%` : '');
    else rug = (sf.honeypot ? '⚠️ honeypot' : sf.ok ? '✅ passed' : '⚠️ ' + ((sf.reasons && sf.reasons[0]) || 'high tax')) +
      (sf.sellTax != null ? ` · sell tax ${Math.round(sf.sellTax)}%` : '') +
      (sf.renounced != null ? (sf.renounced ? ' · renounced' : ' · not renounced') : '') +
      (sf.lpPct != null ? ` · LP ${Math.round(sf.lpPct)}%` : '') +
      (sf.topPct != null ? ` · top ${sf.topPct.toFixed(0)}%` : '');
  }

  const L = [];
  L.push(`<b>$${esc(best.sym)}</b> · ${esc(best.chain.toUpperCase())}${best.dex ? ' · ' + esc(best.dex) : ''}`);
  L.push('━━━━━━━━━━━━━━');
  L.push(`💵 ${fPrice(best.price)}  ·  MC ${fUsd(best.mc)}  ·  LIQ ${fUsd(best.liq)}`);
  L.push(`📊 24h ${fUsd(+best.vol.h24 || 0)}  ·  1h ${fPct(+best.pc.h1 || 0)}  ·  6h ${fPct(+best.pc.h6 || 0)}  ·  ${fAge(best.ageMs)} old`);
  L.push(`👥 ${holders ? fNum(holders) + ' holders' : 'holders n/a'}  ·  ${a.b1}/${a.s1} buys/sells 1h`);
  L.push(`${trajEmoji} <b>Attention: ${a.traj} (${a.score})</b>`);
  L.push(`   ${a.accel.toFixed(1)}x vol accel · ${Math.round(a.skew1 * 100)}% buys 1h`);
  if (tags.length) L.push(`🏷️ ${tags.map((t) => esc(t.name)).join(', ')}`);
  L.push(`🛡️ ${esc(rug)}`);
  if (soc.length) L.push(`🔗 ${soc.join(' · ')}`);
  L.push('━━━━━━━━━━━━━━');
  L.push(`🔬 <a href="${site}/?coin=${encodeURIComponent(best.addr)}&amp;chain=${encodeURIComponent(best.chain)}">Full x-ray + live trades</a>`);
  L.push(`💡 spinoff idea: <b>${esc(spinoff(tags))}</b>`);
  L.push(`<i>Not financial advice.</i>`);
  const x = (best.socialUrls.find((s) => s.type === 'twitter' || s.type === 'x') || {}).url || '';
  const tgUrl = (best.socialUrls.find((s) => s.type === 'telegram') || {}).url || '';
  return {
    ok: true,
    text: L.join('\n'),
    addr: best.addr,
    chain: best.chain,
    sym: best.sym,
    img: best.img || '',
    dexUrl: best.url || `https://dexscreener.com/${best.chain}/${best.addr}`,
    x, tg: tgUrl, site: best.siteUrl || '',
  };
}
