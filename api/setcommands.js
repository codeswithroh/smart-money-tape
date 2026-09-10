export const config = { runtime: 'edge' };

const TOKEN = globalThis.process && process.env && process.env.TELEGRAM_BOT_TOKEN;

const COMMANDS = [
  { command: 'radar', description: '⚡ Top attention movers right now' },
  { command: 'flex', description: '📸 Shareable multiplier card — /flex <ca> [entry mc]' },
  { command: 'idea', description: '💡 Fresh coin concepts riding the hot narratives' },
  { command: 'help', description: '📖 What I can do' },
  { command: 'start', description: '👋 Show my welcome message' },
];

export default async function handler() {
  if (!TOKEN) return new Response('no token', { status: 500 });
  const out = {};
  for (const scope of [
    { type: 'default' },
    { type: 'all_private_chats' },
    { type: 'all_group_chats' },
  ]) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands: COMMANDS, scope }),
    });
    out[scope.type] = await r.json();
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { 'content-type': 'application/json' } });
}
