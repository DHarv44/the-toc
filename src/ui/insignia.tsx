// Insignia renderers (Packs P2): shoulder-sleeve patches and rank insignia,
// keyed by ids the PACK declares (`patch`, `rankStyle`) so pack data stays
// plain JSON while the art lives here. Everything is stylized inline SVG —
// no assets, crisp at any size.
import type { ReactNode } from 'react'
import { playerPack } from '../packs'
import type { Pack, RankDef, RankInsignia } from '../packs/types'
import { patchOf, armsOf } from '../packs/orgquery'

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

// A rank's DEVICE, drawn from the pack's description of it. The renderers
// above are the engine's (chevrons are chevrons in any army); which rank wears
// which, and what it is called, is the pack's — so a faction with its own rank
// structure ships it as data instead of waiting on an engine edit.
function rankGlyph(ins?: RankInsignia): ReactNode {
  if (!ins) return null
  const metal = ins.metal === 'gold' ? GOLD : SILVER
  const el: ReactNode[] = []
  if (ins.spec) {
    el.push(<path key="spec" d="M 4 2 H 14 L 16 5 V 11 Q 9 16 2 11 V 5 Z"
      fill={GOLD} stroke={BLACK} strokeWidth="0.6" />)
  }
  if (ins.chevrons) el.push(<g key="ch">{chevrons(ins.chevrons[0], ins.chevrons[1], ins.diamond)}</g>)
  if (ins.pip) el.push(<g key="pip">{starAt(9, 8, ins.pip, metal)}</g>)
  if (ins.warrant) el.push(<g key="wo">{warrant(ins.warrant)}</g>)
  if (ins.bars) {
    // one bar sits centred; a pair straddles the centre
    const xs = ins.bars === 1 ? [6.7] : [3.6, 9.8]
    el.push(<g key="bars">{xs.map((x, i) => <g key={i}>{bar(x, metal)}</g>)}</g>)
  }
  if (ins.leaf) el.push(<g key="leaf">{leaf(ins.leaf === 'gold' ? GOLD : SILVER)}</g>)
  if (ins.stars) {
    const s = ins.starScale ?? 1
    // stars spread evenly about the centre so two read as a pair, not a smear
    const step = 7.2
    const x0 = 9 - (step * (ins.stars - 1)) / 2
    el.push(<g key="stars">{Array.from({ length: ins.stars }, (_, i) =>
      s >= 1
        ? <path key={i} d={STAR_D} fill={SILVER} stroke={BLACK} strokeWidth="0.5" />
        : <g key={i}>{starAt(x0 + i * step, 8, s)}</g>)}</g>)
  }
  return el.length ? <>{el}</> : null
}

// Battalion coat of arms — a DUI-style shield in branch heraldry colors with a
// branch charge and the regimental motto on a scroll beneath. Procedural (same
// doctrine as the portrait/patch factories): the pack supplies designation +
// motto, the branch supplies the field.
const BRANCH: Record<string, { field: string; chief: string; charge: string }> = {
  cav: { field: '#c8a83c', chief: '#20261c', charge: 'sabers' },   // cavalry/armor yellow
  fa: { field: '#9d2933', chief: '#20261c', charge: 'cannon' },    // artillery scarlet
  en: { field: '#9d2933', chief: '#e8e4da', charge: 'castle' },    // engineer scarlet/white
  sig: { field: '#d97a28', chief: '#e8e4da', charge: 'flash' },    // signal orange
  av: { field: '#2b4c7e', chief: '#c8a83c', charge: 'wings' },     // aviation ultramarine/gold
  sus: { field: '#7a5c3c', chief: '#c8a83c', charge: 'wheel' },    // sustainment
  in: { field: '#5b84b1', chief: '#e8e4da', charge: 'muskets' },   // infantry blue
  hq: { field: '#3c6e6e', chief: '#c8a83c', charge: 'star' },      // division troops
}
// A battalion kind's BRANCH — from the kind's own entry in the pack, because
// which branch a cavalry squadron belongs to is a fact about that army, not
// about this game. Unknown/absent falls back to infantry, which is what every
// soldier is before they are anything else.
export const bnBranch = (kind?: string, pack: Pack = playerPack()): string =>
  (kind ? pack.bnKinds?.[kind]?.branch : undefined) ?? 'in'

function crestCharge(kind: string, ink: string): ReactNode {
  const sw = { stroke: ink, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round' as const }
  switch (kind) {
    case 'sabers': return <g {...sw}><path d="M 12 30 Q 20 22 28 14" /><path d="M 28 30 Q 20 22 12 14" /></g>
    case 'cannon': return <g {...sw}><path d="M 12 28 L 28 16" /><path d="M 12 16 L 28 28" /><circle cx="20" cy="22" r="3.4" fill={ink} stroke="none" /></g>
    case 'castle': return <g fill={ink}><rect x="12" y="18" width="16" height="12" /><rect x="12" y="14" width="3.6" height="5" /><rect x="18.2" y="14" width="3.6" height="5" /><rect x="24.4" y="14" width="3.6" height="5" /></g>
    case 'flash': return <path d="M 23 12 L 14 23 L 20 23 L 17 32 L 26 20 L 20 20 Z" fill={ink} />
    case 'wings': return <g {...sw}><path d="M 20 26 L 20 16" /><path d="M 10 24 Q 16 14 20 18 Q 24 14 30 24" /></g>
    case 'wheel': return <g {...sw}><circle cx="20" cy="22" r="7" /><path d="M 20 15 V 29 M 13 22 H 27" /></g>
    case 'muskets': return <g {...sw}><path d="M 15 30 L 15 13" /><path d="M 25 30 L 25 13" /></g>
    case 'star': return <path transform="translate(20 22) scale(0.9) translate(-9 -8)" d={STAR_D} fill={ink} />
    default: return null
  }
}

// motto scroll shared by every crest variant
const mottoScroll = (motto: string, y: number): ReactNode => (
  <>
    <rect x="1" y={y} width="38" height="7.4" rx="1.6" fill="#101820" stroke="#c8a83c" strokeWidth="0.8" />
    <text x="20" y={y + 5.4} textAnchor="middle" fill="#d8c88a"
      style={{ font: `700 ${motto.length > 16 ? 3.4 : 4.2}px Consolas, monospace`, letterSpacing: 0.2 }}>
      {motto}
    </text>
  </>
)

// --- unit heraldry ----------------------------------------------------------
// The ART IS PACK DATA and lives on the formation node that wears it
// (BnPlan.patch = the distinctive unit insignia, BnPlan.arms = the regimental
// coat of arms — the full achievement, so no procedural scroll is added).
// This module knows how to DRAW heraldry, never which unit has which: a pack
// that renames a battalion or ships new art needs no code change. Aspect
// comes from the file itself (height set, width auto).
// A formation with no art shows nothing (DUI) or the branch-generic procedural
// shield (arms).

export function BnDui({ bn, h = 46, title, pack = playerPack() }: {
  bn: string; h?: number; title?: string; pack?: Pack
}) {
  const src = patchOf(pack, bn)
  if (!src) return null
  return (
    <img src={src} alt={`${bn} distinctive unit insignia`} title={title ?? bn}
      style={{ height: h, width: 'auto', flex: '0 0 auto', objectFit: 'contain' }} />
  )
}

export function BnCrest({ bn, kind, motto, h = 46, pack = playerPack() }: {
  bn: string; kind?: string; motto?: string; h?: number; pack?: Pack
}) {
  const src = armsOf(pack, bn)
  if (src) {
    return (
      <img src={src} alt={`${bn} coat of arms`} title={motto ? `“${motto}”` : bn}
        style={{ height: h, width: 'auto', flex: '0 0 auto', objectFit: 'contain' }} />
    )
  }
  const W = 40, H = 60
  const b = BRANCH[bnBranch(kind)] ?? BRANCH.cav!
  const ink = b.chief === '#20261c' ? '#20261c' : b.chief
  return (
    <svg width={h * (W / H)} height={h} viewBox={`0 0 ${W} ${H}`} style={{ flex: '0 0 auto' }}
      role="img" aria-label={`${bn} coat of arms`}>
      {/* shield (generic branch arms, shifted down to leave crest space) */}
      <g transform="translate(0 8)">
        <path d="M 3 4 H 37 V 24 Q 37 36 20 42 Q 3 36 3 24 Z" fill={b.field} stroke="#c8a83c" strokeWidth="1.6" />
        <path d="M 3 4 H 37 V 11 H 3 Z" fill={b.chief} />
        {crestCharge(b.charge, ink)}
      </g>
      {motto && mottoScroll(motto, 52)}
    </svg>
  )
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

/** A rank's entry in its army's ladder. */
export const rankDef = (rank?: string, pack: Pack = playerPack()): RankDef | undefined =>
  rank ? pack.ranks?.find(r => r.key === rank) : undefined

/** SENIORITY — the rank's place in its army's ladder, junior first. Unknown
 *  ranks answer -1 so they sort BELOW the most junior soldier rather than
 *  silently landing wherever a missing table put them. */
export const rankW = (rank?: string, pack: Pack = playerPack()): number =>
  rank ? (pack.ranks?.findIndex(r => r.key === rank) ?? -1) : -1

export function RankIcon({ rank, h = 15 }: { rank?: string; h?: number }) {
  const glyph = rankGlyph(rankDef(rank)?.insignia)
  if (!glyph) return null
  return (
    <svg width={h * 1.125} height={h} viewBox="0 0 18 16" style={{ flex: '0 0 auto' }}>
      {glyph}
    </svg>
  )
}
