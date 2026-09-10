export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;
const SITE = (globalThis.process && process.env && process.env.SITE_URL) || 'https://meme-attention-radar.vercel.app';
const ADMIN = (globalThis.process && process.env && process.env.CRON_SECRET) || '';
const TG_SECRET = (globalThis.process && process.env && process.env.TELEGRAM_SECRET) || '';

const DESCRIPTION =
  "Aw geez... ok. I'm Morty. Rick's got the portal gun, I've got the data. A genius with no Morty " +
  'just YOLOs into the first bundle he sees, so somebody has to check the holders first.\n\n' +
  'Paste any contract and I send the full read: attention score (ramping or fading), buy pressure, ' +
  'bundle and insider checks, rug screen, narrative tags and socials. Works in your DMs, or drop me in a group ' +
  'and I card every contract anyone pastes.\n\n' +
  'Data over emotions. Same degens, higher standards. Not financial advice.';
const SHORT = "Every Rick needs a Morty. I read the chart before you ape. Aw geez.";

const COMMANDS = [
  { command: 'radar', description: '⚡ Top attention movers right now' },
  { command: 'setalert', description: '🔔 Alert me at a market cap — /setalert <ca> <mc>' },
  { command: 'alerts', description: '🔔 Your active market-cap alerts' },
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

  // admin-only: needs ?key=<CRON_SECRET>
  if (!ADMIN || url.searchParams.get('key') !== ADMIN) {
    return new Response('unauthorized', { status: 401 });
  }

  // GET (no ?apply) = diagnostic only, no writes
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
    secret_token: TG_SECRET || undefined,
    drop_pending_updates: true,
  });
  out.webhookSecretSet = !!TG_SECRET;
  out.commands = {};
  for (const scope of [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }]) {
    out.commands[scope.type] = await api('setMyCommands', { commands: COMMANDS, scope });
  }
  return Response.json(out);
}
