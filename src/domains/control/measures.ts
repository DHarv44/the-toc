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
//
// A BOUNDARY is the one that is not about progress at all. It divides ground
// into whose it is, and the two things that follows from that are the whole
// reason a staff draws one: you do not MANOEUVRE across it without coordinating,
// and you do not SHOOT across it without clearance. The second is the sharper of
// the two — clearance of fires is a TOC function, and until there were
// boundaries there was nothing on this map that could say whose sector a target
// grid was in. So a boundary here is not a decoration that reports crossings; it
// is the thing that can stop a fire mission.
import { S } from '../../engine/state'
import type { ControlMeasure, MeasureKind, Team, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { radio } from '../comms/radio'
import { teamById, teamOf, teamUnits } from '../forces/teams'

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
  return kind === 'checkpoint' ? String(n).padStart(2, '0')
    : kind === 'boundary' ? String(n)
      : `OBJ ${n}`
}

/** Lines have two points; markers have one. */
export const isLine = (kind: MeasureKind): boolean =>
  kind === 'phaseline' || kind === 'boundary'

/** Put a measure on the sheet. A phase line wants two points; a checkpoint and
 *  an objective want one. */
export function addMeasure(kind: MeasureKind, pts: Vec2[], name?: string): ControlMeasure | null {
  if (!pts.length) return null
  if (isLine(kind) && pts.length < 2) return null
  const m: ControlMeasure = {
    id: S.counters.nextId++,
    kind,
    name: name ?? nextName(kind),
    pts: pts.map(p => ({ x: p.x, y: p.y })),
    crossed: [],
  }
  if (kind === 'boundary') m.owners = assignSectors(m)
  S.measures.push(m)
  return m
}

/** WHOSE GROUND IS ON EACH SIDE, decided once, when the line goes down.
 *
 *  A boundary is drawn BETWEEN two adjacent elements — that is the only reason
 *  to draw one — so the two elements are already sitting there when the
 *  commander strokes the line, and asking them where they are is a better
 *  answer than making the player fill in a form. Nearest team by distance from
 *  the line on each side; a side with nobody on it stays unowned, and unowned
 *  ground governs nothing. */
function assignSectors(m: ControlMeasure): { neg: number | null; pos: number | null } {
  const out: { neg: number | null; pos: number | null } = { neg: null, pos: null }
  let dNeg = Infinity, dPos = Infinity
  for (const t of S.teams) {
    const live = teamUnits(t)
    if (!live.length) continue
    const cx = live.reduce((a, u) => a + u.x, 0) / live.length
    const cy = live.reduce((a, u) => a + u.y, 0) / live.length
    const s = side(m, cx, cy)
    if (s === 0) continue
    const d = perp(m, cx, cy)
    if (s < 0 && d < dNeg) { dNeg = d; out.neg = t.id }
    if (s > 0 && d < dPos) { dPos = d; out.pos = t.id }
  }
  return out
}

export function removeMeasure(id: number): void {
  const i = S.measures.findIndex(m => m.id === id)
  if (i >= 0) S.measures.splice(i, 1)
}

export const measureLabel = (m: ControlMeasure): string =>
  m.kind === 'phaseline' ? `PL ${m.name}`
    : m.kind === 'checkpoint' ? `CP ${m.name}`
      : m.kind === 'boundary' ? `BOUNDARY ${m.name}`
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

/** Perpendicular distance to the line's SEGMENT (clamped, like the picker). */
function perp(m: ControlMeasure, x: number, y: number): number {
  const a = m.pts[0]!, b = m.pts[1] ?? a
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
}

/** WHOSE SECTOR IS THIS GRID IN?
 *
 *  The nearest boundary that actually governs the point — within its span,
 *  because a boundary is a finite line and the ground off the end of one is
 *  nobody's by this rule. Null means unowned, which is the honest answer for a
 *  map with no boundaries on it and the reason nothing below fires until the
 *  commander has drawn one. */
export function sectorOf(x: number, y: number): Team | null {
  let best: ControlMeasure | null = null, bd = Infinity
  for (const m of S.measures) {
    if (m.kind !== 'boundary' || !m.owners) continue
    if (!within(m, x, y)) continue
    const d = perp(m, x, y)
    if (d < bd) { bd = d; best = m }
  }
  if (!best) return null
  const id = side(best, x, y) < 0 ? best.owners!.neg : best.owners!.pos
  return id == null ? null : (teamById(id) ?? null)
}

/** CLEARANCE OF FIRES.
 *
 *  A battalion TOC clears every mission that lands in one of its subordinates'
 *  sectors, and it is the one staff function where saying no is the job. The
 *  rule is not "never shoot across a boundary" — it is "the owner of that
 *  ground gets asked first", and the owner refuses when their people are close
 *  enough to be inside the sheaf.
 *
 *  `danger` is the gun's own figure (dispersion + blast + margin), passed in
 *  rather than assumed here, so a 155 clears differently from a mortar.
 *
 *  Returns null when the mission is cleared with nothing to say; otherwise the
 *  call to make, and whether the mission goes. */
export function clearFires(from: Unit, x: number, y: number, danger: number):
{ ok: boolean; call: string; who: string } | null {
  const holder = sectorOf(x, y)
  if (!holder) return null                       // no boundary governs this grid
  const mine = teamOf(from)
  if (mine && holder.id === mine.id) return null // our own sector, our own call
  const near = teamUnits(holder).filter(u => Math.hypot(u.x - x, u.y - y) < danger)
  if (near.length) {
    return {
      ok: false,
      who: holder.name,
      // the call goes out UNDER the owner's callsign, so it does not name them
      // again in the body — a radio operator says "we", not their own name
      call: `CHECK FIRE, CHECK FIRE — WE HAVE ${
        near.map(u => u.label).slice(0, 2).join(', ')} VIC TGT`,
    }
  }
  return { ok: true, who: holder.name, call: 'CLEARED TO FIRE, OUR SECTOR' }
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
      if (m.kind === 'phaseline' || m.kind === 'boundary') {
        const s = side(m, u.x, u.y)
        const prev = u.plSide?.[m.id]
        if (!u.plSide) u.plSide = {}
        u.plSide[m.id] = s
        // a crossing is a sign change WHILE within the line's span
        const crossing = prev !== undefined && prev !== 0 && s !== 0 && prev !== s
          && within(m, u.x, u.y)
        if (!crossing) continue
        if (m.kind === 'phaseline') {
          if (done) continue
          m.crossed.push(u.id)
          report(u, m)
        } else {
          // A BOUNDARY IS CROSSED BOTH WAYS AND CROSSED AGAIN. Passing a phase
          // line is a milestone that happens once; leaving your sector and
          // coming back are two separate things the net needs to hear, every
          // time. So `crossed` here means "currently on the far side" and the
          // entry comes back off when they do.
          if (done) m.crossed.splice(m.crossed.indexOf(u.id), 1)
          else m.crossed.push(u.id)
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
    // On a phase line this means "somebody already called it". On a boundary it
    // reads the same way in both directions: the team has already crossed, or
    // the team is not all back yet. Either way this element is not the event.
    const already = t.members.some(id => id !== u.id && m.crossed.includes(id))
    if (already) return
  }
  const who = t?.name ?? u.label
  if (m.kind === 'boundary') {
    const into = sectorOf(u.x, u.y)
    const msg = !into ? `CROSSING ${measureLabel(m)}`
      : t && into.id === t.id ? `BACK INSIDE OUR BOUNDARY`
        : `CROSSING INTO ${into.name}'S SECTOR — REQUEST COORDINATION`
    radio(who, 'move', msg, u.x, u.y)
    return
  }
  const verb = m.kind === 'checkpoint' ? 'AT' : m.kind === 'objective' ? 'ON' : 'CROSSED'
  radio(who, 'move', `${verb} ${measureLabel(m)}`, u.x, u.y)
}

/** Wipe the crossing record — a fresh operation re-uses the same graphics. */
export function resetCrossings(): void {
  for (const m of S.measures) m.crossed = []
  for (const u of S.units) u.plSide = undefined
}
