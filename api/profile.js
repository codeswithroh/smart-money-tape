import { readSession, json } from './_auth.js';
import { dbReady, getProfile, saveProfile } from './_db.js';

export const config = { runtime: 'edge' };

const SOCIAL_KEYS = ['x', 'telegram', 'discord', 'website', 'github'];
const clean = (v, n) => String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, n);

export default async function handler(req) {
  const s = await readSession(req.headers.get('cookie'));
  if (!s || !s.paid) return json({ error: 'unauthorized' }, 401);
  if (!dbReady) return json({ error: 'backend not configured' }, 503);

  try {
    if (req.method === 'GET') {
      const p = await getProfile(s.aid);
      return json({
        name: (p && p.display_name) || '',
        bio: (p && p.bio) || '',
        socials: (p && p.socials) || {},
        email: (p && p.email) || null,
        wallet: (p && p.wallet) || null,
      });
    }
    if (req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
      const name = clean(b.name, 50);
      const bio = clean(b.bio, 300);
      const src = (b && b.socials) || {};
      const socials = {};
      for (const k of SOCIAL_KEYS) {
        const v = clean(src[k], 200);
        if (v) socials[k] = v;
      }
      await saveProfile(s.aid, { name, bio, socials });
      return json({ ok: true, name, bio, socials });
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    return json({ error: 'server error' }, 500);
  }
}
