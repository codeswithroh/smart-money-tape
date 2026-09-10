export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://meme-attention-radar.vercel.app';

const DESCRIPTION =
  'Paste any memecoin contract and I send back the full read: attention score (ramping / fading), buy pressure, ' +
  'bundle and insider checks, rug screen, narrative tags and socials. Works in your DMs or drop me in a group. ' +
  'Not financial advice.';
const SHORT = 'Paste a contract, get the full read. Free.';

const COMMANDS = [
  { command: 'radar', description: '⚡ Top attention movers right now' },
  { command: 'flex', description: '📸 Shareable multiplier card — /flex <ca> [entry mc]' },
  { command: 'idea', description: '💡 Fresh coin concepts riding the hot narratives' },
  { command: 'help', description: '📖 What I can do' },
  { command: 'start', description: '👋 Show my welcome message' },
];

async function api(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export default async function handler(req) {
  if (!TOKEN) return new Response('no token', { status: 500 });
  const url = new URL(req.url);

  // GET = diagnostic only, no writes
  if (req.method === 'GET' && !url.searchParams.has('apply')) {
    const [me, hook, desc, sdesc, cmds] = await Promise.all([
      api('getMe'),
      api('getWebhookInfo'),
      api('getMyDescription'),
      api('getMyShortDescription'),
      api('getMyCommands'),
    ]);
    return Response.json({ me, webhook: hook, description: desc, shortDescription: sdesc, commands: cmds });
  }

  // ?apply=1 = set description, short description, commands, webhook
  const out = {};
  out.setMyDescription = await api('setMyDescription', { description: DESCRIPTION });
  out.setMyShortDescription = await api('setMyShortDescription', { short_description: SHORT });
  out.setWebhook = await api('setWebhook', {
    url: SITE + '/api/tg',
    allowed_updates: ['message', 'edited_message', 'channel_post', 'callback_query'],
  });
  out.commands = {};
  for (const scope of [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }]) {
    out.commands[scope.type] = await api('setMyCommands', { commands: COMMANDS, scope });
  }
  return Response.json(out);
}
