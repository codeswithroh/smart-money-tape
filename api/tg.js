import { tokenCard, pickAddr, resolveCoin, resolveTicker, topMovers, researchScore, scoreText } from './_token.js';
import { kvReady, newId, alertsAll, alertPut, alertDel } from './_kv.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (globalThis.process && process.env && process.env.TELEGRAM_SECRET) || '';
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://meme-attention-radar.vercel.app';

const MORTY_PIC = SITE + '/morty.png';
const BOT_USER = 'MortyRadarBot';

const HELP = [
  '<b>Morty Radar</b> — paste a contract in any chat and I drop a card:',
  'price · mc · liq · holders · buy pressure · <b>attention verdict (RAMPING/FADING + score)</b> · narrative tags · rug check · socials.',
  '',
  'Don&rsquo;t have the contract? Paste a bare ticker like <code>$CATE</code> and I&rsquo;ll find it &mdash; if the symbol is squatted by more than one coin I&rsquo;ll ask which one you mean instead of guessing.',
  '',
  '<b>Commands</b>',
  '/radar — top attention movers right now ⚡',
  '/flex &lt;ca&gt; &lt;entry mc&gt; [exit mc] — shareable card with your entry/exit on the chart + your pic (e.g. <code>/flex So111… 3.8M 40M</code>) 📸',
  '/setalert &lt;ca&gt; &lt;mc&gt; — ping me when it hits that market cap (e.g. <code>/setalert So111… 5M</code>) 🔔',
  '/alerts — your active alerts',
  '/score &lt;ca&gt; — the long-term research score breakdown (holder safety, liquidity, growth, volume, project surface) 📊',
  '/idea — fresh coin concepts riding the hot narratives 💡',
  '/help — this menu 📖',
  '',
  'Every token card has a 📸 <b>Flex card</b> button and a 🔬 <b>Full x-ray</b> link into the web app.',
].join('\n');

const START = [
  '👋 Yo. I\'m <b>Morty Radar</b> — I read the tape so you don\'t have to.',
  '',
  'Paste any <b>contract address</b> in any chat and I drop a full x-ray: price · mcap · liq · holders · <b>buy pressure</b> · <b>attention verdict</b> (RAMPING / FADING + a 0–100 score) · narrative tags · rug check · socials.',
  '',
  '👥 <b>Drop me in a group</b> — I auto-card every CA anyone pastes. Make it a <b>supergroup</b> so tracking sticks.',
  '',
  '🔥 <b>What I do</b>',
  '• <code>/radar</code> — top attention movers right now ⚡',
  '• <code>/setalert &lt;ca&gt; &lt;mc&gt;</code> — ping you when it hits a market cap 🔔',
  '• <code>/flex &lt;ca&gt; &lt;entry mc&gt; [exit mc]</code> — chart card with your entry/exit + your pic, built for X 📸',
  '• <code>/score &lt;ca&gt;</code> — long-term research score breakdown 📊',
  '• <code>/idea</code> — fresh coin concepts riding the hot narratives 💡',
  '• paste a CA — instant full x-ray 🔬',
  '• <code>/help</code> — the whole cheatsheet 📖',
  '',
  '🛰️ Full radar, discovery board & watchlist alerts live in the web app.',
  '',
  '<i>Not financial advice. DYOR.</i>',
].join('\n');

const START_KB = {
  inline_keyboard: [
    [{ text: '🛰️ Open the web app', url: SITE }],
    [{ text: '➕ Add me to a group', url: `https://t.me/${BOT_USER}?startgroup=true` }],
    [{ text: '⚡ Top movers', callback_data: 'radar' }, { text: '💡 Coin ideas', callback_data: 'idea' }],
  ],
};

function fUsd(n) {
  if (n == null || isNaN(n)) return '?';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
function fPct(n) { return (n > 0 ? '+' : '') + (+n).toFixed(0) + '%'; }
function parseMc(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase().replace(/[$,\s]/g, '');
  const m = s.match(/^([\d.]+)([kmb])?$/); if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === 'k') n *= 1e3; else if (m[2] === 'm') n *= 1e6; else if (m[2] === 'b') n *= 1e9;
  return n || null;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

const MAX_ALERTS_PER_USER = 15;

async function cmdSetAlert(chatId, from, parts, reply) {
  if (!kvReady) {
    await tg('sendMessage', { chat_id: chatId, text: "🔔 Alerts aren't switched on yet — the admin needs to add the Upstash env vars.", ...reply });
    return;
  }
  const addr = pickAddr(parts.join(' '));
  const target = parseMc(parts.find((p) => p !== addr && /[\d.]/.test(p)));
  if (!addr || !target) {
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: 'usage: <code>/setalert &lt;contract&gt; &lt;market cap&gt;</code>\ne.g. <code>/setalert So111… 5M</code>', ...reply });
    return;
  }
  let mine = [];
  try { mine = (await alertsAll()).filter((a) => a.user === from.id); } catch (_) {}
  if (mine.length >= MAX_ALERTS_PER_USER) {
    await tg('sendMessage', { chat_id: chatId, text: `you already have ${MAX_ALERTS_PER_USER} alerts — /alerts to clear some.`, ...reply });
    return;
  }
  const rc = await resolveCoin(addr);
  if (!rc) { await tg('sendMessage', { chat_id: chatId, text: "couldn't find a pair for that address.", ...reply }); return; }
  const base = rc.best.mc || 0;
  const dir = target >= base ? 'up' : 'down';
  const id = newId();
  try {
    await alertPut(id, { chat: chatId, user: from.id, addr: rc.best.addr, chain: rc.best.chain, sym: rc.best.sym, target, base, dir, ts: Date.now() });
  } catch (_) {
    await tg('sendMessage', { chat_id: chatId, text: "couldn't save that alert, try again in a moment.", ...reply });
    return;
  }
  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true,
    text:
      `🔔 <b>Alert set — $${esc(rc.best.sym)}</b>\n` +
      `I'll ping you when MC ${dir === 'up' ? 'crosses <b>above</b>' : 'falls <b>below</b>'} <b>${fUsd(target)}</b>.\n` +
      `now: ${fUsd(base)}  ·  checked every ~5 min  ·  fires once`,
    reply_markup: { inline_keyboard: [[{ text: '❌ cancel this alert', callback_data: 'da:' + id }]] },
    ...reply,
  });
}

async function cmdAlerts(chatId, from, reply) {
  if (!kvReady) {
    await tg('sendMessage', { chat_id: chatId, text: "🔔 Alerts aren't switched on yet.", ...reply });
    return;
  }
  let mine = [];
  try { mine = (await alertsAll()).filter((a) => a.user === from.id); } catch (_) {}
  if (!mine.length) {
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: 'No active alerts. Set one with <code>/setalert &lt;ca&gt; &lt;mc&gt;</code>.', ...reply });
    return;
  }
  const rows = mine.map((a) => [{ text: `❌ $${a.sym} ${a.dir === 'up' ? '▲' : '▼'} ${fUsd(a.target)}`, callback_data: 'da:' + a.id }]);
  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text: `🔔 <b>Your alerts (${mine.length})</b>\nTap one to cancel it.`,
    reply_markup: { inline_keyboard: rows }, ...reply,
  });
}

// trade-terminal deep links per chain
function tradeRow(addr, chain) {
  if (chain === 'solana') {
    return [
      { text: 'Axiom ↗', url: `https://axiom.trade/t/${addr}` },
      { text: 'GMGN ↗', url: `https://gmgn.ai/sol/token/${addr}` },
      { text: 'Photon ↗', url: `https://photon-sol.tinyastro.io/en/lens/${addr}` },
    ];
  }
  const gm = { bsc: 'bsc', base: 'base', ethereum: 'eth' }[chain];
  const row = [];
  if (gm) row.push({ text: 'GMGN ↗', url: `https://gmgn.ai/${gm}/token/${addr}` });
  row.push({ text: 'DEXTools ↗', url: `https://www.dextools.io/app/en/token/${addr}` });
  return row;
}

function coinKb(card) {
  const addr = card.addr;
  const r1 = [
    { text: '❌', callback_data: 'x' },
    { text: '♻️', callback_data: 'rf:' + addr },
  ];
  if (card.x) r1.push({ text: '𝕏', url: card.x });
  if (card.tg) r1.push({ text: '💬', url: card.tg });
  r1.push({ text: '📈 Chart', url: card.dexUrl });

  const rows = [
    r1,
    [
      { text: '🔬 Full x-ray', url: `${SITE}/?coin=${encodeURIComponent(addr)}&chain=${encodeURIComponent(card.chain || '')}` },
      { text: '📸 Flex card', callback_data: 'fx:' + addr },
    ],
    tradeRow(addr, card.chain),
  ];
  return { inline_keyboard: rows.filter((r) => r.length) };
}

// send a token card: photo + caption when the token has an image, else plain message
async function sendCard(chatId, addr, extra) {
  const card = await tokenCard(addr, SITE);
  if (!card.ok) {
    await tg('sendMessage', { chat_id: chatId, text: card.text, ...(extra || {}) });
    return;
  }
  const kb = coinKb(card);
  const cap = card.text.length > 1020 ? card.text.slice(0, 1020) + '…' : card.text;
  if (card.img) {
    const r = await tg('sendPhoto', {
      chat_id: chatId, photo: card.img, caption: cap, parse_mode: 'HTML', reply_markup: kb, ...(extra || {}),
    });
    if (r.ok) return;
  }
  await tg('sendMessage', {
    chat_id: chatId, text: card.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb, ...(extra || {}),
  });
}

async function refreshCard(cq) {
  const addr = cq.data.slice(3);
  const m = cq.message;
  if (!m) return;
  const card = await tokenCard(addr, SITE);
  if (!card.ok) return;
  const kb = coinKb(card);
  const body = { chat_id: m.chat.id, message_id: m.message_id, parse_mode: 'HTML', reply_markup: kb };
  if (m.photo) {
    const cap = card.text.length > 1020 ? card.text.slice(0, 1020) + '…' : card.text;
    await tg('editMessageCaption', { ...body, caption: cap });
  } else {
    await tg('editMessageText', { ...body, text: card.text, disable_web_page_preview: true });
  }
}

async function sendFlex(chatId, addr, entryMc, exitMc, by) {
  const rc = await resolveCoin(addr);
  const sym = rc ? rc.best.sym : '???';
  let url = `${SITE}/api/flexcard?ca=${encodeURIComponent(addr)}`;
  if (entryMc) url += `&entry=${entryMc}`;
  if (exitMc) url += `&exit=${exitMc}`;
  if (by) url += `&by=${encodeURIComponent(by)}`;
  const shareText =
    `$${sym} on Morty Radar 📡\n\n${url}\n\nfind the next one → ${SITE}`;
  const r = await tg('sendPhoto', {
    chat_id: chatId,
    photo: url,
    caption: `$${sym} — flex it 👇`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🐦 Share on X', url: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) }],
        [{ text: '🔬 Full x-ray', url: `${SITE}/?coin=${encodeURIComponent(addr)}` }],
      ],
    },
  });
  // Telegram fetches `photo` itself and can fail (our endpoint hiccups, a timeout, a bad param) —
  // that comes back as a non-ok response here, not a thrown error, so it has to be checked
  // explicitly or the caller sees nothing and the user gets no card and no explanation.
  if (!r.ok) {
    let desc = '';
    try { const j = await r.json(); desc = (j && j.description) || ''; } catch (_) {}
    await tg('sendMessage', { chat_id: chatId, text: `couldn't build that card${desc ? ' (' + desc + ')' : ''} — try again in a moment.` });
  }
}

const CHAIN_EMOJI = { solana: '◉', ethereum: '◇', base: '◆', bsc: '◈', arbitrum: '●' };
// $TICKER -> real coin. Memecoin symbols get squatted constantly (fake pools cloning a popular
// ticker, sometimes with spoofed liquidity), so this never silently guesses when it's ambiguous —
// it auto-opens only when one candidate's volume clearly dominates, otherwise it asks.
async function sendTickerMatch(chatId, sym, reply) {
  const candidates = await resolveTicker(sym);
  if (!candidates.length) {
    await tg('sendMessage', { chat_id: chatId, text: `no coin found for $${sym.toUpperCase()} — paste the contract address instead.`, ...reply });
    return;
  }
  const top = candidates[0], second = candidates[1];
  const dominant = candidates.length === 1 || top.rank > (second ? second.rank : 0) * 5;
  if (dominant) {
    await sendCard(chatId, top.addr, reply);
    return;
  }
  const rows = candidates.map((c) => ([{
    text: `${CHAIN_EMOJI[c.chain] || '○'} $${c.sym} · ${c.chain} · ${fUsd(c.mc)} mc · ${fUsd(c.vol.h24)} 24h`,
    callback_data: `tk:${c.addr}`,
  }]));
  await tg('sendMessage', {
    chat_id: chatId,
    text: `Found ${candidates.length} coins trading as <b>$${esc(sym.toUpperCase())}</b> — same ticker gets reused/squatted a lot, so pick the one you mean:`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows },
  });
}
async function sendRadar(chatId) {
  let movers;
  try { movers = await topMovers(); } catch (_) { movers = []; }
  if (!movers.length) { await tg('sendMessage', { chat_id: chatId, text: 'radar is quiet or rate-limited — try again in a min.' }); return; }
  const L = ['🔥 <b>Attention movers — right now</b>', '━━━━━━━━━━━━━━'];
  const em = { RAMPING: '🔥', FADING: '🩸', STEADY: '➖' };
  movers.forEach((m, i) => {
    L.push(`${i + 1}. <b>$${m.sym}</b> · ${m.chain} · ${fUsd(m.mc)} · ${fPct(m.ch1)} 1h`);
    L.push(`   ${em[m.traj]} ${m.traj} (${m.score}) · ${m.accel.toFixed(1)}x accel · ${Math.round(m.skew1 * 100)}% buys`);
    L.push(`   🔬 <a href="${SITE}/?coin=${encodeURIComponent(m.addr)}&amp;chain=${encodeURIComponent(m.chain)}">x-ray</a>`);
  });
  L.push('━━━━━━━━━━━━━━');
  L.push(`Full radar + discovery + watchlist alerts → ${SITE}`);
  await tg('sendMessage', { chat_id: chatId, text: L.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });
}

const PRE = ['turbo', 'mega', 'based', 'giga', 'hyper', 'micro'];
const SUF = ['inu', 'pepe', 'fi', 'ai', '69', 'coin', 'max', 'god'];
const WORDS = ['grok', 'agent', 'oracle', 'pepe', 'kek', 'inu', 'bonk', 'chad', 'wojak', 'giga', 'moon', 'mars', 'maga', 'kai', 'rizz', 'vector'];
function idea() {
  const c = WORDS[Math.floor(Math.random() * WORDS.length)];
  const r = Math.random();
  let n = r < 0.4 ? PRE[Math.floor(Math.random() * PRE.length)] + c
    : r < 0.75 ? c + SUF[Math.floor(Math.random() * SUF.length)]
      : c + WORDS[Math.floor(Math.random() * WORDS.length)];
  n = n.replace(/\b\w/g, (x) => x.toUpperCase());
  const tk = n.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'MEME';
  return `${n} $${tk}`;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok');
  if (!TOKEN) return new Response('no token', { status: 500 });
  // fail closed: only accept updates that carry Telegram's secret_token (set via setWebhook)
  if (!SECRET) return new Response('webhook secret not configured', { status: 503 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('unauthorized', { status: 401 });

  let u;
  try { u = await req.json(); } catch (_) { return new Response('ok'); }

  // button taps
  if (u.callback_query) {
    const cq = u.callback_query;
    const data = cq.data || '';
    const cid = cq.message && cq.message.chat.id;
    try {
      if (data.startsWith('fx:')) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'building your flex card…' });
        await sendFlex(cid, data.slice(3), null, null, '@' + (cq.from.username || cq.from.first_name || 'anon'));
      } else if (data.startsWith('rf:')) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'refreshed ♻️' });
        await refreshCard(cq);
      } else if (data.startsWith('tk:')) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await sendCard(cid, data.slice(3), {});
      } else if (data === 'x') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        if (cq.message) await tg('deleteMessage', { chat_id: cq.message.chat.id, message_id: cq.message.message_id });
      } else if (data === 'radar') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await sendRadar(cid);
      } else if (data === 'idea') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await tg('sendMessage', { chat_id: cid, text: '💡 spinoff ideas:\n\n• <b>' + [idea(), idea(), idea()].join('</b>\n• <b>') + '</b>', parse_mode: 'HTML' });
      } else if (data.startsWith('da:')) {
        const id = data.slice(3);
        let ok = false;
        try {
          const a = (await alertsAll()).find((x) => x.id === id);
          if (a && a.user === cq.from.id) { await alertDel([id]); ok = true; }
        } catch (_) {}
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: ok ? 'alert cancelled' : 'that alert is already gone' });
        const m = cq.message;
        if (m && m.reply_markup && m.reply_markup.inline_keyboard) {
          const rows = m.reply_markup.inline_keyboard
            .map((r) => r.filter((b) => b.callback_data !== 'da:' + id))
            .filter((r) => r.length);
          if (!rows.length && (m.text || '').indexOf('Alert set') >= 0) {
            await tg('editMessageText', {
              chat_id: m.chat.id, message_id: m.message_id, parse_mode: 'HTML', disable_web_page_preview: true,
              text: esc(m.text).replace(/^🔔/, '🔕') + '\n\n<i>cancelled.</i>',
            });
          } else {
            await tg('editMessageReplyMarkup', { chat_id: m.chat.id, message_id: m.message_id, reply_markup: { inline_keyboard: rows } });
          }
        }
      } else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
      }
    } catch (_) {}
    return new Response('ok');
  }

  const msg = u.message || u.channel_post || u.edited_message;
  if (!msg || !msg.text) return new Response('ok');
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const reply = { reply_to_message_id: msg.message_id, allow_sending_without_reply: true };

  if (/^\/start\b/i.test(text)) {
    const r = await tg('sendPhoto', { chat_id: chatId, photo: MORTY_PIC, caption: START, parse_mode: 'HTML', reply_markup: START_KB });
    if (!r.ok) await tg('sendMessage', { chat_id: chatId, text: START, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: START_KB });
    return new Response('ok');
  }
  if (/^\/help\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML', disable_web_page_preview: true });
    return new Response('ok');
  }
  if (/^\/radar\b/i.test(text)) { await sendRadar(chatId); return new Response('ok'); }
  if (/^\/(setalert|set_alert|alert)\b/i.test(text)) {
    await cmdSetAlert(chatId, msg.from || {}, text.split(/\s+/).slice(1), reply);
    return new Response('ok');
  }
  if (/^\/(alerts|myalerts)\b/i.test(text)) {
    await cmdAlerts(chatId, msg.from || {}, reply);
    return new Response('ok');
  }
  if (/^\/(delalert|delelert|rmalert)\b/i.test(text)) {
    const id = (text.split(/\s+/)[1] || '').trim();
    if (id && kvReady) {
      try {
        const a = (await alertsAll()).find((x) => x.id === id);
        if (a && a.user === (msg.from && msg.from.id)) { await alertDel([id]); await tg('sendMessage', { chat_id: chatId, text: 'alert removed.', ...reply }); }
        else await tg('sendMessage', { chat_id: chatId, text: 'no alert with that id.', ...reply });
      } catch (_) {}
    } else await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: 'usage: <code>/delalert &lt;id&gt;</code> — or use /alerts and tap one.', ...reply });
    return new Response('ok');
  }
  if (/^\/idea\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: '💡 spinoff ideas:\n\n• <b>' + [idea(), idea(), idea()].join('</b>\n• <b>') + '</b>', parse_mode: 'HTML' });
    return new Response('ok');
  }
  if (/^\/(score|analyst)\b/i.test(text)) {
    const addr = pickAddr(text);
    if (!addr) { await tg('sendMessage', { chat_id: chatId, text: 'usage: /score &lt;contract&gt;\ne.g. /score So111…', parse_mode: 'HTML' }); return new Response('ok'); }
    try {
      const s = await researchScore(addr);
      if (!s) { await tg('sendMessage', { chat_id: chatId, text: "couldn't find a pair for that address.", ...reply }); return new Response('ok'); }
      await tg('sendMessage', {
        chat_id: chatId, text: scoreText(s), parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🔬 Full x-ray', url: `${SITE}/?coin=${encodeURIComponent(addr)}` }]] },
      });
    } catch (_) { await tg('sendMessage', { chat_id: chatId, text: "couldn't score that one — try again in a moment.", ...reply }); }
    return new Response('ok');
  }
  if (/^\/flex\b/i.test(text)) {
    const parts = text.split(/\s+/).slice(1);
    const addr = pickAddr(parts.join(' '));
    if (!addr) { await tg('sendMessage', { chat_id: chatId, text: 'usage: /flex &lt;contract&gt; &lt;entry mcap&gt; [exit mcap]\ne.g. /flex So111… 3.8M 40M', parse_mode: 'HTML' }); return new Response('ok'); }
    const nums = parts.filter((p) => p !== addr && /[\d.]/.test(p)).map(parseMc).filter((n) => n != null);
    const entry = nums[0] || null;
    const exit = nums[1] || null;
    try { await sendFlex(chatId, addr, entry, exit, '@' + (msg.from && (msg.from.username || msg.from.first_name) || 'anon')); }
    catch (_) { await tg('sendMessage', { chat_id: chatId, text: "couldn't build that card.", ...reply }); }
    return new Response('ok');
  }

  const addr = pickAddr(text);
  if (addr) {
    try { await sendCard(chatId, addr, reply); }
    catch (e) { await tg('sendMessage', { chat_id: chatId, text: "couldn't pull that one — bad address or no pair.", ...reply }); }
    return new Response('ok');
  }

  // a bare $TICKER (nothing else in the message) — resolve it to a real coin, same as pasting a CA
  const tickerM = text.trim().match(/^\$([A-Za-z0-9_]{1,20})$/);
  if (tickerM) {
    try { await sendTickerMatch(chatId, tickerM[1], reply); }
    catch (_) { await tg('sendMessage', { chat_id: chatId, text: "couldn't look that ticker up — try pasting the contract address instead.", ...reply }); }
  }
  return new Response('ok');
}
