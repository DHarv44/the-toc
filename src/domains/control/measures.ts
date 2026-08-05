// CONTROL MEASURES — the graphics a commander draws to control a fight.
//
// The map could show terrain, units and routes, and nothing a staff actually
// draws on a map: no phase lines, no checkpoints, no objectives. Which means it
// could be watched but not PLANNED on, and every coordination the player wanted
// to express had to be held in their head.
//
// A phase line is the first one worth having, because it is the one that pays
// immediately against the march order already here: a line across the axis with
// a name, which elements REPORT CROSSING. That report is the whole point — it
// is how a TOC knows a column is where it said it would be without asking, and
// it is what turns "somewhere on the road" into "past PL BLUE, short of PL
// AMBER".
//
// Checkpoints and objectives ride the same structure: named geometry the player
// puts on the sheet and the sim can reason about. What separates them is what
// crossing one MEANS, and that lives here rather than in the renderer.
import { S } from '../../engine/state'
import type { ControlMeasure, MeasureKind, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { radio } from '../comms/radio'
import { teamOf } from '../forces/teams'

/** Phase lines take their names from a pack-free, unmistakable-on-the-net list.
 *  Colours are the convention because they are short, distinct under noise, and
 *  nobody mishears BLUE for AMBER. */
const PL_NAMES = [
  'BLUE', 'AMBER', 'GREEN', 'RED', 'WHITE', 'BLACK', 'SILVER', 'GOLD',
  'COPPER', 'IRON', 'JADE', 'CORAL',
]

export const measures = (): ControlMeasure[] => S.measures

const nextName = (kind: MeasureKind): string => {
  if (kind === 'phaseline') {
    const used = new Set(S.measures.filter(m => m.kind === 'phaseline').map(m => m.name))
    return PL_NAMES.find(n => !used.has(n)) ?? `PL${S.measures.length + 1}`
  }
  const n = S.measures.filter(m => m.kind === kind).length + 1
  return kind === 'checkpoint' ? String(n).padStart(2, '0') : `OBJ ${n}`
}

/** Put a measure on the sheet. A phase line wants two points; a checkpoint and
 *  an objective want one. */
export function addMeasure(kind: MeasureKind, pts: Vec2[], name?: string): ControlMeasure | null {
  if (!pts.length) return null
  if (kind === 'phaseline' && pts.length < 2) return null
  const m: ControlMeasure = {
    id: S.counters.nextId++,
    kind,
    name: name ?? nextName(kind),
    pts: pts.map(p => ({ x: p.x, y: p.y })),
    crossed: [],
  }
  S.measures.push(m)
  return m
}

export function removeMeasure(id: number): void {
  const i = S.measures.findIndex(m => m.id === id)
  if (i >= 0) S.measures.splice(i, 1)
}

export const measureLabel = (m: ControlMeasure): string =>
  m.kind === 'phaseline' ? `PL ${m.name}`
    : m.kind === 'checkpoint' ? `CP ${m.name}`
    : m.name

/** Which side of the line a point falls on. The sign is arbitrary and only has
 *  to be CONSISTENT — a crossing is a change of sign, not a direction. */
function side(m: ControlMeasure, x: number, y: number): number {
  const a = m.pts[0]!, b = m.pts[1] ?? a
  return Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x))
}

/** Is this point within the segment's span, rather than off the end of it? A
 *  phase line is a finite line on the ground; driving round the end of one is
 *  not crossing it. */
function within(m: ControlMeasure, x: number, y: number): boolean {
  const a = m.pts[0]!, b = m.pts[1] ?? a
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 0) return false
  const t = ((x - a.x) * dx + (y - a.y) * dy) / len2
  return t >= 0 && t <= 1
}

// A checkpoint is reached rather than crossed, so it has a radius. Wide enough
// that a column on a road passes through it, tight enough to mean a place.
const CP_R = 220

/** Watch the force against the graphics and REPORT. Crossings are recorded per
 *  element so a line is called once, by the element that crossed it — a column
 *  reporting the same phase line four times is noise, so the report names the
 *  TEAM and fires on its lead. */
export function measureUpdate(): void {
  if (!S.measures.length) return
  for (const m of S.measures) {
    for (const u of S.units) {
      if (u.side !== 'friend' || u.strength <= 0) continue
      const done = m.crossed.includes(u.id)
      if (m.kind === 'phaseline') {
        const s = side(m, u.x, u.y)
        const prev = u.plSide?.[m.id]
        if (!u.plSide) u.plSide = {}
        u.plSide[m.id] = s
        // a crossing is a sign change WHILE within the line's span
        if (prev !== undefined && prev !== 0 && s !== 0 && prev !== s
          && within(m, u.x, u.y) && !done) {
          m.crossed.push(u.id)
          report(u, m)
        }
      } else if (!done) {
        const a = m.pts[0]!
        if (Math.hypot(u.x - a.x, u.y - a.y) < CP_R) {
          m.crossed.push(u.id)
          report(u, m)
        }
      }
    }
  }
}

/** ONE CALL PER GROUPING. A team crossing a phase line is one event that the
 *  column reports, not four platoons each getting on the net. The lead makes
 *  the call; everyone behind it is already accounted for by being in the team. */
function report(u: Unit, m: ControlMeasure): void {
  const t = teamOf(u)
  if (t) {
    const already = t.members.some(id => id !== u.id && m.crossed.includes(id))
    if (already) return
  }
  const who = t?.name ?? u.label
  const verb = m.kind === 'checkpoint' ? 'AT' : m.kind === 'objective' ? 'ON' : 'CROSSED'
  radio(who, 'move', `${verb} ${measureLabel(m)}`, u.x, u.y)
}

/** Wipe the crossing record — a fresh operation re-uses the same graphics. */
export function resetCrossings(): void {
  for (const m of S.measures) m.crossed = []
  for (const u of S.units) u.plSide = undefined
}
