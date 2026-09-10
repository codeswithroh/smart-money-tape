// Server-side token card for the Telegram bot. Same public data as Rick, plus a verdict.
const DEX = 'https://api.dexscreener.com';
const RUG = 'https://api.rugcheck.xyz/v1/tokens';
const HP = 'https://api.honeypot.is/v2/IsHoneypot';
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

const GT_PROXY = 'https://meme-attention-radar.vercel.app/api/gt?path=';
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
    const top = (j.topHolders || []).filter((h) => !h.insider && h.pct != null);
    const topPct = top.length ? top[0].pct : null;
    const lp = j.lpLockedPct != null ? j.lpLockedPct : (j.markets && j.markets[0] && j.markets[0].lp && j.markets[0].lp.lpLockedPct);
    const ok = !j.rugged && !j.mintAuthority && !j.freezeAuthority && !(topPct != null && topPct > 35) && !danger.length;
    return { ok, holders: j.totalHolders, renounced: !j.mintAuthority && !j.freezeAuthority, lpPct: lp, topPct, reasons: danger };
  }
  const cid = EVM_ID[chain];
  if (!cid) return null;
  const j = await jget(`${HP}?address=${addr}&chainID=${cid}`);
  if (!j) return null;
  const hp = j.honeypotResult && j.honeypotResult.isHoneypot;
  const sim = j.simulationResult || {};
  return {
    ok: !hp && !(sim.sellTax > 25) && !(sim.buyTax > 25),
    holders: j.holderAnalysis && +j.holderAnalysis.holders,
    sellTax: sim.sellTax, buyTax: sim.buyTax, honeypot: !!hp,
  };
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
    else rug = (sf.honeypot ? '⚠️ honeypot' : sf.ok ? '✅ no honeypot' : '⚠️ high tax') +
      (sf.sellTax != null ? ` · sell tax ${Math.round(sf.sellTax)}%` : '');
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
