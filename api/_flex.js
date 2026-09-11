import { ImageResponse } from '@vercel/og';

let ASSETS = null;
function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
async function assets() {
  if (ASSETS) return ASSETS;
  const [b7, b8, mb, bg] = await Promise.all([
    fetch(new URL('./Inter-700.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./Inter-800.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./morty-sm.png', import.meta.url)).then((r) => r.arrayBuffer()).catch(() => null),
    fetch(new URL('./flex-bg.jpg', import.meta.url)).then((r) => r.arrayBuffer()).catch(() => null),
  ]);
  ASSETS = {
    fonts: [
      { name: 'Inter', data: b7, weight: 700, style: 'normal' },
      { name: 'Inter', data: b8, weight: 800, style: 'normal' },
    ],
    morty: mb ? 'data:image/png;base64,' + toB64(mb) : null,
    bg: bg ? 'data:image/jpeg;base64,' + toB64(bg) : null,
  };
  return ASSETS;
}

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const col = (style, children) => div({ flexDirection: 'column', ...style }, children);

// palette — dark, moody, cool-toned (not the loud neon-green/red pump-card look)
const BG_TOP = '#0c1420', BG_BOT = '#05070d';
const POS = '#8fe6c8', NEG = '#ff9d8a', INK = '#eaf2ff', FAINT = '#6d7c98', META = '#9db0c9';

function fUsd(n) {
  if (n == null || isNaN(n)) return '?';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

// closest index in a chronological price series to a target price (used to place the
// entry/exit markers on the sparkline from a called market cap, not an exact timestamp)
function nearestIdx(series, target) {
  if (!series.length || target == null) return null;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < series.length; i++) {
    const d = Math.abs(series[i] - target);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// the sparkline doubles as this card's atmosphere — rendered big, faint and off to one side,
// the way a moody photo would sit behind a stat card, but it's the coin's own real price history
function sparklineSvg(series, entryPx, exitPx, w, h, lineColor) {
  if (!series || series.length < 2) return null;
  let lo = Math.min.apply(null, series), hi = Math.max.apply(null, series);
  if (hi <= lo) hi = lo + 1;
  const n = series.length;
  const MARK_R = 9;
  const x = (i) => Math.min(w - MARK_R, Math.max(MARK_R, (i / (n - 1)) * w));
  const y = (v) => h - ((v - lo) / (hi - lo)) * (h - 20) - 10;
  let d = '';
  series.forEach((v, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1) + ' '; });
  const areaD = d + `L${w},${h} L0,${h} Z`;

  const entryI = nearestIdx(series, entryPx);
  let exitI = n - 1;
  if (exitPx != null) {
    const from = entryI != null ? entryI : 0;
    const tail = series.slice(from);
    exitI = from + nearestIdx(tail, exitPx);
    if (exitI === entryI) exitI = n - 1;
  }

  const children = [
    { type: 'path', props: { d: areaD, fill: 'url(#sparkfill)' } },
    { type: 'path', props: { d, fill: 'none', stroke: lineColor, strokeWidth: 4, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.85 } },
  ];
  if (entryI != null) {
    children.push({ type: 'circle', props: { cx: x(entryI), cy: y(series[entryI]), r: 8, fill: BG_BOT, stroke: FAINT, strokeWidth: 3 } });
  }
  if (exitI != null && exitI !== entryI) {
    children.push({ type: 'circle', props: { cx: x(exitI), cy: y(series[exitI]), r: 8, fill: lineColor, stroke: BG_BOT, strokeWidth: 3 } });
  }
  children.unshift({
    type: 'defs', props: { children: [{
      type: 'linearGradient', props: {
        id: 'sparkfill', x1: '0', y1: '0', x2: '0', y2: '1', children: [
          { type: 'stop', props: { offset: '0%', stopColor: lineColor, stopOpacity: 0.28 } },
          { type: 'stop', props: { offset: '100%', stopColor: lineColor, stopOpacity: 0 } },
        ],
      },
    }] },
  });
  return { type: 'svg', props: { width: w, height: h, viewBox: `0 0 ${w} ${h}`, children } };
}

function ringIcon(color) {
  return {
    type: 'svg', props: {
      width: 26, height: 26, viewBox: '0 0 24 24', children: [
        { type: 'circle', props: { cx: 12, cy: 12, r: 9.5, stroke: color, strokeWidth: 2, fill: 'none' } },
        { type: 'line', props: { x1: 12, y1: 12, x2: 12, y2: 6, stroke: color, strokeWidth: 2, strokeLinecap: 'round' } },
        { type: 'line', props: { x1: 12, y1: 12, x2: 16.5, y2: 12, stroke: color, strokeWidth: 2, strokeLinecap: 'round' } },
      ],
    },
  };
}

// o: { sym, chain, entryMc, exitMc, nowMc, peakMc, by, ago, avatar, series }
export async function flexImage(o) {
  const A = await assets();
  const hasEntry = o.entryMc != null;
  const hasExit = hasEntry && o.exitMc != null;
  const compareMc = hasExit ? o.exitMc : o.nowMc;
  const delta = hasEntry && compareMc != null ? compareMc - o.entryMc : null;
  const pct = hasEntry && o.entryMc ? (compareMc / o.entryMc - 1) * 100 : null;
  const up = delta == null || delta >= 0;
  const stat = up ? POS : NEG;

  // entry/exit price implied from the called mc, using the live price:mc ratio (not the last
  // candle's close, which can lag the live quote enough to skew the ratio and misplace both markers)
  let entryPx = null, exitPx = null;
  if (o.series && o.series.length && o.nowMc && o.nowPrice) {
    const ratio = o.nowPrice / o.nowMc;
    if (o.entryMc) entryPx = o.entryMc * ratio;
    if (o.exitMc) exitPx = o.exitMc * ratio;
  }
  const bigNum = hasEntry
    ? (delta >= 0 ? '+' : '−') + fUsd(Math.abs(delta))
    : (o.nowMc ? 'MC ' + fUsd(o.nowMc) : '$' + (o.sym || '???'));

  const metaBits = [];
  metaBits.push('$' + (o.sym || '???'));
  if (hasEntry) metaBits.push('IN ' + fUsd(o.entryMc) + '  →  ' + (hasExit ? 'OUT ' : 'NOW ') + fUsd(compareMc));
  else if (o.nowMc) metaBits.push('now ' + fUsd(o.nowMc));
  if (!hasExit && o.peakMc) metaBits.push('peak ' + fUsd(o.peakMc));
  if (o.chain) metaBits.push(o.chain);
  if (o.ago) metaBits.push(o.ago);

  const topRow = div({ alignItems: 'center', gap: 10 }, [
    ringIcon(FAINT),
    div({ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, color: FAINT, textTransform: 'uppercase' }, hasExit ? 'closed' : hasEntry ? 'open' : 'snapshot'),
  ]);

  // stacked rows, not a wrapping flex row — guarantees the %% stat can never float off to
  // an unrelated position regardless of how long the meta text is or whether it wraps
  const metaRow = col({ marginTop: 18, maxWidth: 460 }, [
    div({ fontSize: 21, fontWeight: 700, color: META, letterSpacing: 0.3 }, metaBits.join('   ·   ')),
    pct != null ? div({ fontSize: 26, fontWeight: 800, color: stat, marginTop: 6 }, (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%') : null,
  ].filter(Boolean));

  // size the big number to its own string length so it never wraps inside the 460px column —
  // a wrapped "+$X" onto two lines was overlapping the meta text below it
  const bigSize = bigNum.length <= 6 ? 104 : bigNum.length <= 8 ? 82 : bigNum.length <= 10 ? 66 : 52;

  const content = col({ position: 'absolute', left: 64, bottom: 60, maxWidth: 460 }, [
    topRow,
    div({ fontSize: bigSize, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', color: hasEntry ? stat : INK, marginTop: 14 }, bigNum),
    metaRow,
  ]);

  const kids = [
    // a soft left-side scrim over the photo so the stat block stays legible against any sky tone
    A.bg ? div({
      position: 'absolute', inset: 0,
      background: 'linear-gradient(90deg, rgba(3,6,12,.72) 0%, rgba(3,6,12,.45) 38%, rgba(3,6,12,0) 62%)',
    }, []) : null,
    // top-right brand mark
    div({ position: 'absolute', top: 40, right: 48, alignItems: 'center', gap: 10 }, [
      o.avatar
        ? { type: 'img', props: { src: o.avatar, width: 40, height: 40, style: { borderRadius: 20, objectFit: 'cover', border: '2px solid ' + FAINT } } }
        : div({ width: 14, height: 14, borderRadius: 7, background: stat }, []),
      div({ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: FAINT, textTransform: 'uppercase' }, 'Morty Radar'),
    ]),
    content,
    // footer
    div({ position: 'absolute', right: 48, bottom: 40, fontSize: 15, fontWeight: 700, color: FAINT }, 'meme-attention-radar.vercel.app  ·  not financial advice'),
  ].filter(Boolean);

  const el = div(
    {
      width: 1200, height: 630, position: 'relative',
      background: A.bg ? undefined : `linear-gradient(165deg, ${BG_TOP} 0%, ${BG_BOT} 75%)`,
      backgroundImage: A.bg ? `url(${A.bg})` : undefined,
      backgroundSize: '1200px 630px',
      backgroundColor: BG_BOT,
      color: INK, fontFamily: 'Inter',
    },
    kids,
  );

  const img = new ImageResponse(el, { width: 1200, height: 630, fonts: A.fonts });
  return await img.arrayBuffer();
}
