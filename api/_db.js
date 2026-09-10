// Supabase access layer. Uses the REST API with the service-role key (bypasses RLS).
import { createClient } from '@supabase/supabase-js';

const env = (k) => (globalThis.process && process.env && process.env[k]) || '';
const URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

export const dbReady = !!(URL && SERVICE_KEY);

let _client = null;
function db() {
  if (!dbReady) throw new Error('supabase not configured');
  if (!_client) _client = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

const TABLE = 'access';

export async function getByPrivyId(privyUserId) {
  const { data, error } = await db().from(TABLE).select('*').eq('privy_user_id', privyUserId).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getByEmail(email) {
  if (!email) return null;
  const { data, error } = await db().from(TABLE).select('*').ilike('email', email).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getByTxHash(txHash) {
  if (!txHash) return null;
  const { data, error } = await db().from(TABLE).select('*').ilike('tx_hash', txHash).maybeSingle();
  if (error) throw error;
  return data || null;
}

// create a fresh row for a first-time login
export async function createAccount({ privyUserId, email, wallet }) {
  const { data, error } = await db().from(TABLE)
    .insert({ privy_user_id: privyUserId, email: email || null, wallet: wallet || null, paid: false })
    .select().single();
  if (error) throw error;
  return data;
}

// attach a privy id (and refresh email/wallet) to an existing row (e.g. a pre-granted email row)
export async function bindAccount(id, { privyUserId, email, wallet }) {
  const patch = { privy_user_id: privyUserId };
  if (email) patch.email = email;
  if (wallet) patch.wallet = wallet;
  const { data, error } = await db().from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function markPaid(id, { txHash, chain }) {
  const { data, error } = await db().from(TABLE)
    .update({ paid: true, paid_at: new Date().toISOString(), tx_hash: txHash || null, chain: chain || null })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---- profile ----
export async function getProfile(id) {
  const { data, error } = await db().from(TABLE)
    .select('display_name,bio,socials,email,wallet').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveProfile(id, { name, bio, socials }) {
  const { error } = await db().from(TABLE)
    .update({ display_name: name || null, bio: bio || null, socials: socials || {} })
    .eq('id', id);
  if (error) throw error;
}

// ---- watchlist ----
export async function watchList(accountId) {
  const { data, error } = await db().from('watchlist')
    .select('addr,chain,sym,added_at').eq('account_id', accountId)
    .order('added_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

export async function watchCount(accountId) {
  const { count, error } = await db().from('watchlist')
    .select('addr', { count: 'exact', head: true }).eq('account_id', accountId);
  if (error) throw error;
  return count || 0;
}

export async function watchAdd(accountId, { addr, chain, sym }) {
  const { error } = await db().from('watchlist')
    .upsert({ account_id: accountId, addr, chain: chain || null, sym: sym || null }, { onConflict: 'account_id,addr' });
  if (error) throw error;
}

export async function watchRemove(accountId, addr) {
  const { error } = await db().from('watchlist')
    .delete().eq('account_id', accountId).eq('addr', addr);
  if (error) throw error;
}
