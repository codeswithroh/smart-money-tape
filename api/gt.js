// CORS + edge-cache proxy for GeckoTerminal (free tier blocks browser CORS under load).
// /api/gt?path=/networks/solana/trending_pools%3Fpage%3D1
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const u = new URL(req.url);
  let path = u.searchParams.get('path') || '';
  if (!path.startsWith('/networks/') || path.length > 300 || path.includes('..') || /[<>"'`\\\s]/.test(path)) {
    return new Response(JSON.stringify({ error: 'bad path' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const target = 'https://api.geckoterminal.com/api/v2' + path;
  try {
    const r = await fetch(target, { headers: { accept: 'application/json' } });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        ...cors,
        'content-type': 'application/json',
        // shared edge cache: one upstream call serves every viewer for ~8s
        'Cache-Control': r.ok ? 'public, s-maxage=8, stale-while-revalidate=30' : 'public, s-maxage=2',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream' }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } });
  }
}
