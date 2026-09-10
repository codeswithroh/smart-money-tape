// Auth helpers: Privy access-token verification + our own signed session cookie.
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

const env = (k) => (globalThis.process && process.env && process.env[k]) || '';

export const PRIVY_APP_ID = env('PRIVY_APP_ID');
export const PRIVY_APP_SECRET = env('PRIVY_APP_SECRET');
const SESSION_SECRET = env('SESSION_SECRET');
export const SESSION_VERSION = env('SESSION_VERSION') || '1';
export const SESSION_COOKIE_NAME = 'ar_session';

const key = new TextEncoder().encode(SESSION_SECRET || 'insecure-dev-secret-change-me');

// ---- Privy access token ----
let _jwks = null;
function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
  return _jwks;
}

// returns { userId } or throws
export async function verifyPrivyToken(token) {
  const { payload } = await jwtVerify(token, jwks(), {
    issuer: 'privy.io',
    audience: PRIVY_APP_ID,
  });
  return { userId: payload.sub, sessionId: payload.sid || null };
}

// pull the user's linked email + first wallet from Privy (server-to-server)
export async function fetchPrivyUser(userId) {
  const basic = btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`);
  const r = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Basic ${basic}`, 'privy-app-id': PRIVY_APP_ID },
  });
  if (!r.ok) return { email: null, wallet: null };
  const j = await r.json().catch(() => ({}));
  const accts = j.linked_accounts || j.linkedAccounts || [];
  let email = null;
  let wallet = null;
  for (const a of accts) {
    const t = a.type || '';
    if (!email && (t === 'email' || t === 'google_oauth' || t === 'apple_oauth')) email = (a.address || a.email || '').toLowerCase() || null;
    if (!wallet && t === 'wallet') wallet = (a.address || '').toLowerCase() || null;
  }
  if (!email && j.email && j.email.address) email = String(j.email.address).toLowerCase();
  if (!wallet && j.wallet && j.wallet.address) wallet = String(j.wallet.address).toLowerCase();
  return { email, wallet };
}

// ---- our session cookie ----
export async function issueSession({ accountId, privyUserId, email, paid }) {
  return new SignJWT({ aid: accountId, uid: privyUserId, email: email || null, paid: !!paid, sv: SESSION_VERSION })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

export async function readSession(cookieHeader) {
  const m = String(cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE_NAME + '=([^;]+)'));
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], key);
    if (String(payload.sv || '') !== String(SESSION_VERSION)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export function sessionCookie(jwt) {
  return `${SESSION_COOKIE_NAME}=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
export const clearSessionCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });
}
