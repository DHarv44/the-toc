// Insignia renderers (Packs P2): shoulder-sleeve patches and rank insignia,
// keyed by ids the PACK declares (`patch`, `rankStyle`) so pack data stays
// plain JSON while the art lives here. Everything is stylized inline SVG —
// no assets, crisp at any size.
import type { ReactNode } from 'react'

// --- shoulder-sleeve insignia ----------------------------------------------
// '1cd' — the 1st Cavalry Division shield, stylized: yellow Norman shield,
// black diagonal band, black horse head.
const PATCHES: Record<string, (h: number) => ReactNode> = {
  '1cd': (h) => (
    <svg width={h * 0.72} height={h} viewBox="0 0 36 50" style={{ flex: '0 0 auto' }}>
      <path d="M 2 2 H 34 V 30 Q 34 44 18 48 Q 2 44 2 30 Z" fill="#f0c40a" stroke="#151515" strokeWidth="1.5" />
      {/* diagonal band, upper-left → lower-right */}
      <path d="M 2 14 L 26 46 Q 30 44 32 41 L 8 9 L 2 9 Z" fill="#151515" />
      {/* horse head, upper right (stylized) */}
      <path d="M 24 6 q 4 1 5 5 q 1 3 -1 5 l -3 -1 q -2 3 -5 2 q 1 -3 0 -5 q -2 -3 0 -5 q 2 -1 4 -1 Z" fill="#151515" />
    </svg>
  ),
}

export function PatchIcon({ id, h = 34 }: { id?: string; h?: number }) {
  const draw = id ? PATCHES[id] : null
  return draw ? <>{draw(h)}</> : null
}

// --- rank insignia ----------------------------------------------------------
// 'us' style, stylized: enlisted chevrons/rockers in OD gold, officer bars and
// leaves. Compact 18×16 viewBox, sized by `h`.
const GOLD = '#d8b84a', SILVER = '#c9d2d8', BLACK = '#20261c'

function chevrons(n: number, rockers: number, diamond = false): ReactNode {
  const el: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    el.push(<path key={`c${i}`} d={`M 2 ${5 + i * 3} L 9 ${1.6 + i * 3} L 16 ${5 + i * 3}`}
      fill="none" stroke={GOLD} strokeWidth="2" />)
  }
  for (let i = 0; i < rockers; i++) {
    el.push(<path key={`r${i}`} d={`M 2 ${10.4 + i * 3} Q 9 ${13.6 + i * 3} 16 ${10.4 + i * 3}`}
      fill="none" stroke={GOLD} strokeWidth="2" />)
  }
  if (diamond) el.push(<rect key="d" x={7.4} y={7} width={3.2} height={3.2} fill={GOLD} transform="rotate(45 9 8.6)" />)
  return <>{el}</>
}
const bar = (x: number, color: string): ReactNode =>
  <rect x={x} y={3} width={4.6} height={10} rx={0.8} fill={color} stroke={BLACK} strokeWidth="0.6" />
const leaf = (color: string): ReactNode =>
  <ellipse cx={9} cy={8} rx={4.6} ry={5.6} fill={color} stroke={BLACK} strokeWidth="0.6" />

const STAR_D = 'M 9 1 l 2 4.6 5 .4 -3.8 3.2 1.2 4.8 -4.4 -2.6 -4.4 2.6 1.2 -4.8 L 2 6 l 5 -.4 Z'
const starAt = (cx: number, cy: number, s: number, color = SILVER): ReactNode =>
  <path transform={`translate(${cx} ${cy}) scale(${s}) translate(-9 -8)`} d={STAR_D}
    fill={color} stroke={BLACK} strokeWidth={0.5 / s} />
// warrant officer bar: silver with n black squares
const warrant = (n: number): ReactNode => (
  <>
    {bar(6.7, SILVER)}
    {Array.from({ length: n }, (_, i) =>
      <rect key={i} x={7.2} y={3.8 + i * (9 / n)} width={3.6} height={9 / n - 1} fill={BLACK} />)}
  </>
)

const US_RANKS: Record<string, ReactNode> = {
  PVT: null,
  PFC: chevrons(1, 1),
  SPC: <path d="M 4 2 H 14 L 16 5 V 11 Q 9 16 2 11 V 5 Z" fill={GOLD} stroke={BLACK} strokeWidth="0.6" />,
  CPL: chevrons(2, 0),
  SGT: chevrons(3, 0),
  SSG: chevrons(3, 1),
  SFC: chevrons(3, 2),
  MSG: chevrons(3, 3),
  '1SG': chevrons(3, 3, true),
  SGM: <>{chevrons(3, 3)}{starAt(9, 8, 0.34, GOLD)}</>,
  CSM: <>{chevrons(3, 3)}{starAt(9, 8, 0.42, GOLD)}</>,
  WO1: warrant(1),
  CW2: warrant(2),
  CW3: warrant(3),
  '2LT': bar(6.7, GOLD),
  '1LT': bar(6.7, SILVER),
  CPT: <>{bar(3.6, SILVER)}{bar(9.8, SILVER)}</>,
  MAJ: leaf(GOLD),
  LTC: leaf(SILVER),
  COL: <path d={STAR_D} fill={SILVER} stroke={BLACK} strokeWidth="0.5" />,
  BG: starAt(9, 8, 0.95),
  MG: <>{starAt(5.4, 8, 0.62)}{starAt(12.6, 8, 0.62)}</>,
}

// Award ribbon bar (packs/awards): stripe colors left→right, standard ribbon
// proportions. Tooltip-titled by the caller.
export function RibbonIcon({ stripes, w = 18, h = 6 }: { stripes: readonly string[]; w?: number; h?: number }) {
  const sw = w / stripes.length
  return (
    <svg width={w} height={h} style={{ flex: '0 0 auto' }}>
      {stripes.map((c, i) => <rect key={i} x={i * sw} y={0} width={sw + 0.5} height={h} fill={c} />)}
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill="none" stroke="#0a0e12" strokeWidth={1} />
    </svg>
  )
}

export function RankIcon({ rank, style = 'us', h = 15 }: { rank?: string; style?: string; h?: number }) {
  if (!rank || style !== 'us') return null
  const glyph = US_RANKS[rank]
  if (glyph === undefined) return null
  return (
    <svg width={h * 1.125} height={h} viewBox="0 0 18 16" style={{ flex: '0 0 auto' }}>
      {glyph}
    </svg>
  )
}
