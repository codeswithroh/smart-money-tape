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

// o: { sym, chain, entryMc, nowMc, peakMc, by, ago }
export async function flexImage(o) {
  const A = await assets();
  const mult = o.entryMc && o.peakMc ? o.peakMc / o.entryMc : (o.nowMc && o.entryMc ? o.nowMc / o.entryMc : 1);
  const multStr = (mult >= 100 ? Math.round(mult) : mult.toFixed(mult >= 10 ? 1 : 2)) + 'x';
  const green = mult >= 1;
  const accent = green ? '#7CFF5B' : '#ff5c4d';

  const header = div({ alignItems: 'center' }, [
    div({ width: 22, height: 22, borderRadius: 11, background: accent, marginRight: 14 }, []),
    div({ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#8a93a6' }, 'MORTY RADAR  ·  @MortyRadarBot'),
  ]);

  const kids = [
    header,
    // middle
    col({}, [
      div({ fontSize: 118, fontWeight: 800, lineHeight: 1 }, '$' + (o.sym || '???')),
      div({ fontSize: 40, fontWeight: 700, color: '#8a93a6', marginTop: 10 },
        (o.entryMc ? 'called @ ' + fUsd(o.entryMc) : 'now ' + fUsd(o.nowMc)) +
        (o.by ? '   ·   ' + o.by : '') + (o.ago ? '   ·   ' + o.ago : '')),
    ]),
    // bottom row
    div({ alignItems: 'flex-end', justifyContent: 'space-between' }, [
      col({}, [
        div({ fontSize: 46, fontWeight: 800 }, (o.peakMc ? 'Reached ' + fUsd(o.peakMc) : 'MC ' + fUsd(o.nowMc))),
        div({ fontSize: 30, fontWeight: 700, color: '#8a93a6', marginTop: 6 },
          o.nowMc ? 'now ' + fUsd(o.nowMc) + (o.chain ? '  ·  ' + o.chain : '') : (o.chain || '')),
      ]),
      div({ fontSize: 168, fontWeight: 800, color: accent, lineHeight: 1 }, multStr),
    ]),
    // footer
    div({ fontSize: 22, fontWeight: 700, color: '#55607a' }, 'meme-attention-radar.vercel.app   ·   not financial advice'),
  ];

  if (A.morty) {
    kids.push({
      type: 'img',
      props: {
        src: A.morty, width: 132, height: 132,
        style: { position: 'absolute', top: 44, right: 52, borderRadius: 26, border: '3px solid ' + accent },
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
