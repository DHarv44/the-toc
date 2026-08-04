// The sub-element layer: each unit is a formation of individual vics/troops.
// The unit stays the command/movement/AI entity; elements are the SPATIAL and
// exposure layer — where each platform stands, which set is exposed in the
// current posture. Pure geometry/stat helpers only: damage, casualties and
// recovery live in casualties.ts (the roster is the source of truth, P2.5).
import type { Formation, Unit, UnitElement } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { UNIT_TYPES, type UnitType, type UnitTypeKey } from './catalog'

// Effective stats for a unit's current posture. Carrier types swap between
// mounted (vehicle mobility/protection, scaled firepower) and dismounted
// (base infantry stats). DEVIATION (flagged): the old sim cached the variants
// as _mtd/_dis fields ON the catalog object; here they live in a module cache
// so the catalog stays immutable data. Same inputs, same outputs.
const effCache = new Map<UnitTypeKey, { mtd: UnitType; dis: UnitType }>()
export function effStats(u: Unit): UnitType {
  const t = UNIT_TYPES[u.type]
  if (!t.carrier) return t
  let v = effCache.get(u.type)
  if (!v) {
    const c = t.carrier
    v = {
      mtd: {
        ...t, mob: c.mob, speed: c.speed, soft: c.soft,
        sight: t.sight * 0.85, dpsSoft: t.dpsSoft * c.fireMul, dpsHard: t.dpsHard * c.fireMul,
      },
      dis: { ...t },
    }
    effCache.set(u.type, v)
  }
  return u.mounted ? v.mtd : v.dis
}

// damage taken multiplier for a prepared defender
export function postureFactor(t: Unit): number {
  if (t.posture !== 'dig' || !t.digT) return 1
  const def = UNIT_TYPES[t.type].def
  if (!def) return 1
  return 1 - (1 - def.factor) * t.digT
}

// --- movement formations ---------------------------------------------------
// A formation is a trade, and every one of these is the same trade struck
// differently: control and speed against how much of the unit can shoot, and
// which way. Column is fastest and easiest to hold together and can barely fire
// to the front; line is the opposite. What a commander picks says what they
// expect to happen in the next thousand metres.

export interface FormationSpec {
  key: Formation
  label: string
  hint: string
  halt?: boolean   // a security posture for a stopped element, not a march order
}

export const FORMATIONS: readonly FormationSpec[] = [
  { key: 'column', label: 'COLUMN', hint: 'Single file. Fastest, tightest control, almost no fire forward — roads and rear areas.' },
  { key: 'stagger', label: 'STAGGERED COLUMN', hint: 'Column offset either side of the axis. Road speed, but fire to both flanks.' },
  { key: 'wedge', label: 'WEDGE', hint: 'Lead vic forward, the rest back to both sides. Enemy situation vague — good all round.' },
  { key: 'vee', label: 'VEE', hint: 'Two up, commander in the notch behind. Enemy expected to the front.' },
  { key: 'echL', label: 'ECHELON LEFT', hint: 'Stepped back to the left. Covers an open left flank.' },
  { key: 'echR', label: 'ECHELON RIGHT', hint: 'Stepped back to the right. Covers an open right flank.' },
  { key: 'line', label: 'LINE', hint: 'Abreast. Every weapon forward, control is hardest — the assault.' },
  { key: 'coil', label: 'COIL', hint: 'Long halt: a ring facing outward, 360° security.', halt: true },
  { key: 'herringbone', label: 'HERRINGBONE', hint: 'Short halt on a route: alternate off the axis, guns to the flanks.', halt: true },
]

export const FORMATION = Object.fromEntries(
  FORMATIONS.map(f => [f.key, f]),
) as Record<Formation, FormationSpec>

// absent = wedge, so units built before formations existed still lay out
export const formOf = (u: Unit): Formation => u.formation ?? 'wedge'

const SPACING = 55   // metres nose-to-nose in single file
const LATERAL = 26   // metres either side of the axis in a staggered column

interface Slot { fwd: number; lat: number; face: number }

// Every layout is authored in the unit's BODY frame: +fwd is the direction of
// travel, +lat is to the LEFT, and `face` is radians off the unit's heading.
// Slot 0 is the commander's vic — it sits on the unit's own point, because that
// is the position the sim moves and everything else is measured from it.
//
// The jitter terms are not decoration. Nobody drives a perfect lattice, and a
// formation that holds its geometry to the metre reads as a spreadsheet from
// the air. They are seeded per element, so a unit's untidiness is its own.
function slot(form: Formation, n: number, total: number, seed: number): Slot {
  const j = ((seed * 13) % 9) - 4   // ±4 m of drift
  const k = seed % 7                // ±7 m of slop along the axis
  const row = Math.ceil(n / 2)
  const side = n === 0 ? 0 : (n % 2 === 1 ? -1 : 1)
  switch (form) {
    case 'column':
      return { fwd: -n * SPACING - k, lat: j, face: 0 }
    case 'stagger':
      return { fwd: -n * SPACING * 0.9 - k, lat: (n % 2 ? -LATERAL : LATERAL) + j, face: 0 }
    case 'vee':
      // the wedge inverted: the outer vics lead, the commander rides the notch
      return { fwd: (n === 0 ? 0 : row * 28) - k, lat: side * (22 + row * 14) + j, face: 0 }
    case 'echL':
    case 'echR':
      return { fwd: -n * 40 - k, lat: (form === 'echL' ? 1 : -1) * n * 40 + j, face: 0 }
    case 'line':
      return { fwd: -k, lat: (n - (total - 1) / 2) * 45 + j, face: 0 }
    case 'coil': {
      // a ring, every vic looking out of it
      const a = (n / Math.max(1, total)) * Math.PI * 2
      const r = 45 + total * 3
      return { fwd: (Math.cos(a) - 1) * r, lat: Math.sin(a) * r, face: a }
    }
    case 'herringbone':
      // alternating 45° off the route, so the guns cover both shoulders
      return {
        fwd: -n * 45 - k,
        lat: (n % 2 ? -1 : 1) * 30 + j,
        face: (n % 2 ? -1 : 1) * Math.PI / 4,
      }
    default: // wedge — the original layout, kept to the metre
      return { fwd: -row * 28 - k, lat: side * (22 + row * 14) + j, face: 0 }
  }
}

// (Re)place every element in the unit's current formation. Safe to call on a
// unit that has already taken losses: it lays out the elements that are there
// and leaves `alive` alone, so a formation change does not resurrect anyone.
export function layoutElements(u: Unit): void {
  const seed = u.formSeed | 0
  const form = formOf(u)
  const veh = u.elements.filter(el => el.kind === 'veh')
  const trp = u.elements.filter(el => el.kind === 'troop')
  veh.forEach((el, n) => {
    const s = slot(form, n, veh.length, (seed * 10 + n) | 0)
    el.ox = s.fwd; el.oy = s.lat; el.oh = s.face
  })
  // Dismounts hold a fraction of the frontage their carriers needed — a squad
  // on the ground works in tighter than the vehicle it got out of.
  trp.forEach((el, n) => {
    const s = slot(form, n + 1, trp.length + 1, (seed * 17 + n * 3) | 0)
    el.ox = s.fwd * 0.5; el.oy = s.lat * 0.7; el.oh = s.face
  })
}

// --- the short halt --------------------------------------------------------
// A column that stops on a route does NOT sit in file. It herringbones: vics
// alternate forty-five degrees off the axis, guns covering both shoulders,
// which is the difference between a halted convoy and a queue of targets. The
// formation has been in the table since formations were written and nothing
// ever adopted it, because nothing knew when a column had gone firm.
//
// It is a DRILL, not an order. The crews do it without being told and they undo
// it without being told, so it restores whatever the commander had actually
// asked for rather than leaving the column in a security posture it never
// chose.
export function goFirm(u: Unit): void {
  if (u.haltForm != null) return
  u.haltForm = formOf(u)
  u.formation = 'herringbone'
  layoutElements(u)
}

export function unfirm(u: Unit): void {
  if (u.haltForm == null) return
  u.formation = u.haltForm
  u.haltForm = undefined
  layoutElements(u)
}

/** How much of this element is actually protected — the fraction of its live
 *  vics that are hardened. Foot and fully soft-skinned elements answer 0, which
 *  is the honest answer to "can it cover anybody". */
export function hardness(u: Unit): number {
  const veh = u.elements.filter(e => e.kind === 'veh' && e.alive)
  if (!veh.length) return 0
  return veh.filter(e => e.hard).length / veh.length
}

export function initElements(u: Unit): void {
  const type = UNIT_TYPES[u.type]
  const els: UnitElement[] = []
  const nVeh = type.carrier ? type.carrier.veh : type.veh
  // WHICH vics are hardened, not just how many. `soft` is the fraction that is
  // soft-skinned; spend it on real vehicles so an event that hits ONE of them
  // has something to ask. Hardened first — a mixed element leads with its
  // protected vehicles, which is also the answer the march order will want when
  // it asks what is up front.
  //
  // READ IT OFF THE CARRIER WHERE THERE IS ONE. A carrier type's own `soft` is
  // its DISMOUNTED figure — infantry on foot, which is 1.0 for a rifle platoon
  // — and using it here hardened the platoon's VEHICLES as though they were the
  // men walking beside them. A Stryker platoon came out with zero hardened
  // vics against a carrier that is 0.45 soft, which meant every mine strike on
  // one was catastrophic (hazards/update reads exactly this flag). effStats has
  // always made this distinction for damage; this did not.
  const softFrac = type.carrier ? type.carrier.soft : (type.soft ?? 0)
  const nHard = Math.round(nVeh * (1 - softFrac))
  for (let n = 0; n < nVeh; n++) {
    els.push({ ox: 0, oy: 0, oh: 0, kind: 'veh', alive: true, hard: n < nHard })
  }
  const nTrp = type.troops > 0 ? Math.max(1, Math.round(type.troops / 4)) : 0
  for (let n = 0; n < nTrp; n++) els.push({ ox: 0, oy: 0, oh: 0, kind: 'troop', alive: true })
  u.elements = els
  layoutElements(u)
  // a unit that fields neither vics nor squads still needs one thing to draw
  if (!els.length) els.push({ ox: 0, oy: 0, oh: 0, kind: 'troop', alive: true })
}

// Where an element actually is.
//
// This is SHARED TRUTH, not a drawing helper: it decides which vic a blast
// kills (casualties.ts), what the gunner lays the gun on (air/gunship.ts,
// air/targeting.ts), and where the pip goes in the feed (ui/HUD.tsx,
// drone/DroneView.tsx). Everything must read the same answer or the vic that
// burns is not the vic that was hit.
//
// A unit under way has driven its vics into real positions and they are
// authoritative — the unit's own heading has nothing to say about where its
// trail vic sits three hundred metres back round a bend. A unit that has never
// moved has no route to have driven along, so it falls back to the rigid
// body-frame transform, which is the layout laid down by layoutElements.
//
// Takes a POSE, not a whole unit: the drone feed draws off a smoothed copy of
// the unit's position, and the fallback only ever needed x/y/heading. A Unit
// satisfies it as it stands.
export function elemWorld(u: { x: number; y: number; heading: number }, el: UnitElement): Vec2 {
  if (el.wx !== undefined) return { x: el.wx, y: el.wy! }
  const s = Math.sin(u.heading), c = Math.cos(u.heading)
  return { x: u.x + c * el.ox - s * el.oy, y: u.y + s * el.ox + c * el.oy }
}

// Facing of an element in world radians — its own hull heading once it is
// driving, the formation's wanted facing off the unit's axis until then.
export function elemHeading(u: { heading: number }, el: UnitElement): number {
  return el.wh !== undefined ? el.wh : u.heading + (el.oh ?? 0)
}

// which elements are "exposed": carrier units show vics when mounted, troops when
// dismounted; integral units (recon/armor/guns) always show their full set.
export function elemExposed(u: Unit, el: UnitElement): boolean {
  const type = UNIT_TYPES[u.type]
  if (!type.carrier) return true
  return u.mounted ? el.kind === 'veh' : el.kind === 'troop'
}

export function exposedList(u: Unit): UnitElement[] {
  return u.elements.filter(el => elemExposed(u, el))
}
