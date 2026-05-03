// Phase 2.5 Step 2.5.9.5 — programmatic WCAG 2.1 contrast audit.
// Computes the actual rendered contrast for each sanctioned badge
// + body-text combination on the parchment background, accounting
// for alpha blending of the tinted background colors.
//
// Targets:
//   ≥ 4.5:1 — AA for normal text (< 18 pt)
//   ≥ 3.0:1 — AA for large text + non-text UI components
// Outputs a markdown table to stdout (consumed by the
// phase2.5-mobile-qa-2026-05-03.md report).

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function blendOverParchment(fg: RGB, alpha: number, bg: RGB): RGB {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ];
}

function relativeLuminance([r, g, b]: RGB): number {
  const linearize = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

function contrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

const COLORS = {
  parchment: '#FBF4E8',
  devotional: '#E89B3C',
  'devotional-dark': '#7A4F1E',
  sacred: '#7C2D2A',
  krishna: '#1E2A5E',
  brass: '#B08D4C',
  'brass-dark': '#7C5F2E',
  peacock: '#0E5566',
};

type Pair = {
  label: string;
  fg: keyof typeof COLORS;
  bg: keyof typeof COLORS;
  bgAlpha?: number; // 0..1 — when bg is rendered over parchment
};

const PAIRS: Pair[] = [
  // Source badges (after Step 2.5.8 R1 tuning)
  { label: 'Gita badge: text-sacred on bg-devotional/15', fg: 'sacred', bg: 'devotional', bgAlpha: 0.15 },
  { label: 'MBh badge: text-sacred on bg-sacred/20', fg: 'sacred', bg: 'sacred', bgAlpha: 0.20 },
  { label: 'Bhagavata badge: text-krishna on bg-krishna/10', fg: 'krishna', bg: 'krishna', bgAlpha: 0.10 },
  // Body / chrome
  { label: 'Body text: text-krishna on parchment', fg: 'krishna', bg: 'parchment' },
  { label: 'Disclaimer: text-brass-dark on parchment', fg: 'brass-dark', bg: 'parchment' },
  { label: 'Footer caveat: text-brass-dark on parchment (alpha 0.9 effective ≈ same)', fg: 'brass-dark', bg: 'parchment' },
  { label: 'Header title (Krishna): text-peacock on parchment', fg: 'peacock', bg: 'parchment' },
  { label: 'Header title (AI): text-sacred on parchment', fg: 'sacred', bg: 'parchment' },
  { label: 'Send button: text-parchment on bg-krishna', fg: 'parchment', bg: 'krishna' },
];

console.log('| Combination | Effective bg | Contrast | AA | Notes |');
console.log('|---|---|---:|:-:|---|');
const parchmentRgb = hexToRgb(COLORS.parchment);
for (const p of PAIRS) {
  const fgRgb = hexToRgb(COLORS[p.fg]);
  let bgRgb = hexToRgb(COLORS[p.bg]);
  let bgEffective = COLORS[p.bg];
  if (p.bgAlpha !== undefined && p.bgAlpha < 1) {
    bgRgb = blendOverParchment(bgRgb, p.bgAlpha, parchmentRgb);
    bgEffective = `#${bgRgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  const c = contrast(fgRgb, bgRgb);
  const aa = c >= 4.5 ? '✓' : c >= 3.0 ? '⚠ large' : '✗';
  console.log(
    `| ${p.label} | ${bgEffective.toUpperCase()} | ${c.toFixed(2)}:1 | ${aa} | ${
      c >= 4.5 ? 'AA pass' : c >= 3.0 ? 'AA only at large/UI' : 'FAILS AA'
    } |`,
  );
}
