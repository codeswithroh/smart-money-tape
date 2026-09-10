// Edge middleware — gates the dashboard until real (Privy + Supabase) auth ships.
// Right now: everyone gets the holding page except an owner bypass cookie.
// Later: this verifies a signed session cookie and returns undefined (pass) when valid.

export const config = {
  matcher: ['/', '/index.html', '/app.js'],
};

const SECRET = (globalThis.process && process.env && process.env.SESSION_SECRET) || '';

const HOLDING = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Attention Radar</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Patrick+Hand&display=swap">
<style>:root{--paper:#f4ecd9;--ink:#2c3550;--soft:#565d70;--accent:#cf3a26}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:var(--paper);background-image:repeating-linear-gradient(var(--paper) 0 26px,rgba(110,100,70,.14) 26px 27px);
color:var(--ink);font-family:"Patrick Hand","Comic Sans MS",cursive;padding:28px}
.card{max-width:520px;width:100%;background:#fdfaf0;border:2px solid var(--ink);
border-radius:14px 8px 15px 7px/8px 15px 7px 14px;padding:34px 30px;text-align:center;box-shadow:6px 7px 0 rgba(44,53,80,.12)}
h1{font-family:"Caveat",cursive;font-size:40px;margin:0 0 6px;transform:rotate(-1deg)}
.tag{color:var(--soft);font-size:15px;margin:0 0 20px}
.box{border:2px dashed var(--ink);border-radius:10px;padding:16px;text-align:left;font-size:15px;line-height:1.55;color:var(--soft);background:#fdf3cf}
.box b{color:var(--ink)}a{color:var(--accent)}.foot{margin-top:18px;font-size:13.5px;color:var(--soft)}</style></head>
<body><div class="card"><h1>Attention Radar</h1>
<p class="tag">Memecoins are attention markets. A radar, not a shortcut.</p>
<div class="box"><b>Access is being rebuilt.</b><br>The old passcode gate was bypassable and got shared around, so it's off.
We're moving to real accounts: connect a wallet or email, pay once, done. Back shortly.<br><br>
Already paid? Your access carries over. <b>DM <a href="https://x.com/codeswithroh" target="_blank" rel="noopener">@codeswithroh</a> on X</b>
and keep the transaction hash you paid with handy.</div>
<p class="foot">The Telegram bot is unaffected: <a href="https://t.me/MortyRadarBot" target="_blank" rel="noopener">@MortyRadarBot</a> &middot; <a href="/bot.html">about Morty</a></p>
</div></body></html>`;

export default function middleware(req) {
  const url = new URL(req.url);

  // owner bypass: /?k=<SESSION_SECRET> sets a 7-day cookie, then redirects clean
  const k = url.searchParams.get('k');
  if (SECRET && k && k === SECRET) {
    return new Response(null, {
      status: 302,
      headers: {
        location: url.origin + url.pathname,
        'set-cookie': `ar_bypass=${SECRET}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      },
    });
  }

  const cookie = req.headers.get('cookie') || '';
  if (SECRET && cookie.split(/;\s*/).indexOf('ar_bypass=' + SECRET) >= 0) {
    return; // allowed through
  }

  return new Response(HOLDING, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, must-revalidate',
      'retry-after': '3600',
    },
  });
}
