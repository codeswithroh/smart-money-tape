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
  const [b7, b8, mb] = await Promise.all([
    fetch(new URL('./Inter-700.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./Inter-800.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./morty-sm.png', import.meta.url)).then((r) => r.arrayBuffer()).catch(() => null),
  ]);
  ASSETS = {
    fonts: [
      { name: 'Inter', data: b7, weight: 700, style: 'normal' },
      { name: 'Inter', data: b8, weight: 800, style: 'normal' },
    ],
    morty: mb ? 'data:image/png;base64,' + toB64(mb) : null,
  };
  return ASSETS;
}

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const col = (style, children) => div({ flexDirection: 'column', ...style }, children);

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

const CHART_W = 1080, CHART_H = 220;
function sparklineSvg(series, entryPx, exitPx) {
  if (!series || series.length < 2) return null;
  let lo = Math.min.apply(null, series), hi = Math.max.apply(null, series);
  if (hi <= lo) hi = lo + 1;
  const n = series.length;
  const x = (i) => (i / (n - 1)) * CHART_W;
  const y = (v) => CHART_H - ((v - lo) / (hi - lo)) * (CHART_H - 24) - 12;
  let d = '';
  series.forEach((v, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1) + ' '; });
  const areaD = d + `L${CHART_W},${CHART_H} L0,${CHART_H} Z`;

  const entryI = nearestIdx(series, entryPx);
  // an exit always reads as "forward in time" from the entry, so search only the back half of
  // the chart for it; if that still collapses onto the same candle as entry (e.g. a called mc
  // far outside what this chart window covers), pin it to the most recent candle instead of
  // stacking two markers on one point.
  let exitI = n - 1;
  if (exitPx != null) {
    const from = entryI != null ? entryI : 0;
    const tail = series.slice(from);
    exitI = from + nearestIdx(tail, exitPx);
    if (exitI === entryI) exitI = n - 1;
  }
  const up = exitPx != null && entryPx != null ? exitPx >= entryPx : true;
  const lineColor = up ? '#7CFF5B' : '#ff5c4d';

  const children = [
    { type: 'path', props: { d: areaD, fill: 'url(#sparkfill)' } },
    { type: 'path', props: { d, fill: 'none', stroke: lineColor, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' } },
  ];
  if (entryI != null) {
    children.push({ type: 'circle', props: { cx: x(entryI), cy: y(series[entryI]), r: 11, fill: '#0a0c11', stroke: '#8a93a6', strokeWidth: 4 } });
  }
  if (exitI != null && exitI !== entryI) {
    children.push({ type: 'circle', props: { cx: x(exitI), cy: y(series[exitI]), r: 11, fill: lineColor, stroke: '#0a0c11', strokeWidth: 4 } });
  }
  children.unshift({
    type: 'defs', props: { children: [{
      type: 'linearGradient', props: {
        id: 'sparkfill', x1: '0', y1: '0', x2: '0', y2: '1', children: [
          { type: 'stop', props: { offset: '0%', stopColor: lineColor, stopOpacity: 0.35 } },
          { type: 'stop', props: { offset: '100%', stopColor: lineColor, stopOpacity: 0 } },
        ],
      },
    }] },
  });
  return { type: 'svg', props: { width: CHART_W, height: CHART_H, viewBox: `0 0 ${CHART_W} ${CHART_H}`, children } };
}

// o: { sym, chain, entryMc, exitMc, nowMc, peakMc, by, ago, avatar, series }
export async function flexImage(o) {
  const A = await assets();
  const hasExit = o.entryMc != null && o.exitMc != null;
  const mult = hasExit ? o.exitMc / o.entryMc
    : (o.entryMc && o.peakMc ? o.peakMc / o.entryMc : (o.nowMc && o.entryMc ? o.nowMc / o.entryMc : 1));
  const multStr = (mult >= 100 ? Math.round(mult) : mult.toFixed(mult >= 10 ? 1 : 2)) + 'x';
  const green = mult >= 1;
  const accent = green ? '#7CFF5B' : '#ff5c4d';

  const header = div({ alignItems: 'center' }, [
    div({ width: 22, height: 22, borderRadius: 11, background: accent, marginRight: 14 }, []),
    div({ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#8a93a6' }, 'MORTY RADAR  ·  @MortyRadarBot'),
  ]);

  // entry/exit price implied from the called mc, using the live price:mc ratio (not the last
  // candle's close, which can lag the live quote enough to skew the ratio and misplace both markers)
  let entryPx = null, exitPx = null;
  if (o.series && o.series.length && o.nowMc && o.nowPrice) {
    const ratio = o.nowPrice / o.nowMc;
    if (o.entryMc) entryPx = o.entryMc * ratio;
    if (o.exitMc) exitPx = o.exitMc * ratio;
  }
  const chart = sparklineSvg(o.series, entryPx, exitPx);

  const kids = [
    header,
    // middle
    col({}, [
      div({ fontSize: 100, fontWeight: 800, lineHeight: 1 }, '$' + (o.sym || '???')),
      div({ fontSize: 34, fontWeight: 700, color: '#8a93a6', marginTop: 8 },
        (o.entryMc ? 'in @ ' + fUsd(o.entryMc) : 'now ' + fUsd(o.nowMc)) +
        (hasExit ? '   ·   out @ ' + fUsd(o.exitMc) : '') +
        (o.by ? '   ·   ' + o.by : '') + (o.ago ? '   ·   ' + o.ago : '')),
    ]),
    // chart
    chart
      ? div({ marginTop: 8, marginBottom: 4 }, [chart])
      : div({ fontSize: 26, color: '#55607a', marginTop: 20, marginBottom: 20 }, 'chart unavailable for this chain — numbers only'),
    // bottom row
    div({ alignItems: 'flex-end', justifyContent: 'space-between' }, [
      col({}, [
        div({ fontSize: 42, fontWeight: 800 }, hasExit ? 'Exited ' + fUsd(o.exitMc) : (o.peakMc ? 'Reached ' + fUsd(o.peakMc) : 'MC ' + fUsd(o.nowMc))),
        div({ fontSize: 28, fontWeight: 700, color: '#8a93a6', marginTop: 6 },
          o.nowMc ? 'now ' + fUsd(o.nowMc) + (o.chain ? '  ·  ' + o.chain : '') : (o.chain || '')),
      ]),
      div({ fontSize: 150, fontWeight: 800, color: accent, lineHeight: 1 }, multStr),
    ]),
    // footer
    div({ fontSize: 22, fontWeight: 700, color: '#55607a' }, 'meme-attention-radar.vercel.app   ·   not financial advice'),
  ];

  const avatarSrc = o.avatar || A.morty;
  if (avatarSrc) {
    kids.push({
      type: 'img',
      props: {
        src: avatarSrc, width: 120, height: 120,
        style: { position: 'absolute', top: 44, right: 52, borderRadius: 60, border: '3px solid ' + accent, objectFit: 'cover' },
      },
    });
  }

  const el = col(
    {
      width: 1200, height: 630, padding: 60, position: 'relative',
      background: 'linear-gradient(135deg,#0a0c11 0%,#12161f 55%,#0d1b12 100%)',
      color: '#ffffff', fontFamily: 'Inter', justifyContent: 'space-between',
    },
    kids,
  );

  const img = new ImageResponse(el, { width: 1200, height: 630, fonts: A.fonts });
  return await img.arrayBuffer();
}
