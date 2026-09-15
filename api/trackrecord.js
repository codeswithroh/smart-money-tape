// Public accountability page data — no login required, on purpose. This is the receipt for
// every verdict this tool has given: a coin's label + score is logged the moment it's shown,
// with a fixed 48h revisit time set then (see score_calls.resolve_after), and cron.js resolves
// it later against DexScreener's real market cap. Nothing here can be edited after logging —
// the aggregate below is computed straight from that ledger, not curated.
import { json } from './_auth.js';
import { dbReady, scoreCallStats } from './_db.js';

export const config = { runtime: 'edge' };

const DUMP_OUTCOMES = new Set(['dumped_80', 'dumped_50', 'delisted_or_no_data']);

function bucket(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const dumped = rows.filter((r) => DUMP_OUTCOMES.has(r.outcome)).length;
  const held = rows.filter((r) => r.outcome === 'held').length;
  const pumped = rows.filter((r) => r.outcome === 'pumped').length;
  const changes = rows.map((r) => +r.pct_change).filter((v) => isFinite(v));
  const medianPct = changes.length
    ? changes.sort((a, b) => a - b)[Math.floor(changes.length / 2)]
    : null;
  return {
    n, dumped, held, pumped,
    dumpedPct: +((dumped / n) * 100).toFixed(1),
    heldPct: +((held / n) * 100).toFixed(1),
    medianPctChange: medianPct != null ? +medianPct.toFixed(1) : null,
  };
}

export default async function handler() {
  if (!dbReady) return json({ error: 'backend not configured' }, 503);
  try {
    const rows = await scoreCallStats();
    const byLabel = {};
    rows.forEach((r) => { (byLabel[r.label] = byLabel[r.label] || []).push(r); });
    const labels = ['HIGH RUG RISK', 'SPECULATIVE', 'HAS SOME LEGS', 'BUILT TO LAST'];
    const stats = {};
    labels.forEach((l) => { stats[l] = bucket(byLabel[l] || []); });
    const since30d = rows.filter((r) => Date.now() - Date.parse(r.called_at) < 30 * 86400000);
    return json({
      ok: true,
      updatedAt: new Date().toISOString(),
      totalResolved: rows.length,
      resolvedLast30d: since30d.length,
      byLabel: stats,
    });
  } catch (e) {
    return json({ error: 'server error' }, 500);
  }
}
