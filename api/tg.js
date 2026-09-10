import { tokenCard, pickAddr, resolveCoin, topMovers } from './_token.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (globalThis.process && process.env && process.env.TELEGRAM_SECRET) || '';
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://meme-attention-radar.vercel.app';

const HELP = [
  '<b>Morty Radar</b> — paste a contract in any chat and I drop a card:',
  'price · mc · liq · holders · buy pressure · <b>attention verdict (RAMPING/FADING + score)</b> · narrative tags · rug check · socials.',
  '',
  '<b>Commands</b>',
  '/radar — top attention movers right now',
  '/flex &lt;ca&gt; [entry mc] — shareable multiplier card (e.g. <code>/flex So111… 3.8M</code>)',
  '/idea — fresh coin concepts riding the hot narratives',
  '',
  'Every token card has a 📸 <b>Flex card</b> button and a 🔬 <b>Full x-ray</b> link into the web app.',
].join('\n');

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

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function coinKb(addr) {
  return {
    inline_keyboard: [[
      { text: '📸 Flex card', callback_data: 'fx:' + addr },
      { text: '🔬 Full x-ray', url: `${SITE}/?coin=${encodeURIComponent(addr)}` },
    ]],
  };
}

async function sendFlex(chatId, addr, entryMc, by) {
  const rc = await resolveCoin(addr);
  const sym = rc ? rc.best.sym : '???';
  let url = `${SITE}/api/flexcard?ca=${encodeURIComponent(addr)}`;
  if (entryMc) url += `&entry=${entryMc}`;
  if (by) url += `&by=${encodeURIComponent(by)}`;
  const shareText =
    `$${sym} on Morty Radar 📡\n\n${url}\n\nfind the next one → ${SITE}`;
  await tg('sendPhoto', {
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
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('no', { status: 401 });

  let u;
  try { u = await req.json(); } catch (_) { return new Response('ok'); }

  // button taps
  if (u.callback_query) {
    const cq = u.callback_query;
    const data = cq.data || '';
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    if (data.startsWith('fx:')) {
      const addr = data.slice(3);
      try { await sendFlex(cq.message.chat.id, addr, null, '@' + (cq.from.username || cq.from.first_name || 'anon')); } catch (_) {}
    }
    return new Response('ok');
  }

  const msg = u.message || u.channel_post || u.edited_message;
  if (!msg || !msg.text) return new Response('ok');
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const reply = { reply_to_message_id: msg.message_id, allow_sending_without_reply: true };

  if (/^\/(start|help)\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML', disable_web_page_preview: true });
    return new Response('ok');
  }
  if (/^\/radar\b/i.test(text)) { await sendRadar(chatId); return new Response('ok'); }
  if (/^\/idea\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: '💡 spinoff ideas:\n\n• <b>' + [idea(), idea(), idea()].join('</b>\n• <b>') + '</b>', parse_mode: 'HTML' });
    return new Response('ok');
  }
  if (/^\/flex\b/i.test(text)) {
    const parts = text.split(/\s+/).slice(1);
    const addr = pickAddr(parts.join(' '));
    if (!addr) { await tg('sendMessage', { chat_id: chatId, text: 'usage: /flex &lt;contract&gt; [entry mcap]\ne.g. /flex So111… 3.8M', parse_mode: 'HTML' }); return new Response('ok'); }
    const entry = parseMc(parts.find((p) => p !== addr && /[\d.]/.test(p)));
    try { await sendFlex(chatId, addr, entry, '@' + (msg.from && (msg.from.username || msg.from.first_name) || 'anon')); }
    catch (_) { await tg('sendMessage', { chat_id: chatId, text: "couldn't build that card.", ...reply }); }
    return new Response('ok');
  }

  const addr = pickAddr(text);
  if (!addr) return new Response('ok');
  try {
    const card = await tokenCard(addr, SITE);
    await tg('sendMessage', {
      chat_id: chatId, text: card.text, parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: card.ok ? coinKb(addr) : undefined, ...reply,
    });
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: "couldn't pull that one — bad address or no pair.", ...reply });
  }
  return new Response('ok');
}
