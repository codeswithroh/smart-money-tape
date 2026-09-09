import { tokenCard, pickAddr } from './_token.js';

export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (globalThis.process && process.env && process.env.TELEGRAM_SECRET) || '';
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://smart-money-tape-v4-codeswithrohs-projects.vercel.app';

const HELP = [
  '<b>Attention Radar</b> — paste a contract address in any chat and I drop a card:',
  'price · mc · liq · holders · buy pressure · <b>attention verdict (RAMPING / FADING + score)</b> · narrative tags · rug check · socials.',
  '',
  'Then tap <b>Full x-ray</b> for the live trades, chart and the whole research card.',
  '',
  'Add me to your trenches group and I answer every CA paste. Discovery radar + watchlist alerts live in the web app.',
].join('\n');

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok');
  if (!TOKEN) return new Response('no token', { status: 500 });
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('no', { status: 401 });

  let u;
  try { u = await req.json(); } catch (_) { return new Response('ok'); }
  const msg = u.message || u.channel_post || u.edited_message;
  if (!msg || !msg.text) return new Response('ok');

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (/^\/(start|help)\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML', disable_web_page_preview: true });
    return new Response('ok');
  }

  const addr = pickAddr(text);
  if (!addr) return new Response('ok'); // ignore normal chatter in groups

  try {
    const card = await tokenCard(addr, SITE);
    await tg('sendMessage', {
      chat_id: chatId,
      text: card.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id,
      allow_sending_without_reply: true,
    });
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: "couldn't pull that one — bad address or no pair.", reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
  }
  return new Response('ok');
}
