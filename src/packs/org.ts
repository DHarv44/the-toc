// Division organization builder (Packs): materialize the ENTIRE division from
// the pack's formation plan — every brigade, battalion, company and platoon
// slot, with every soldier named and billeted at build time. Deterministic and
// rng-free (hashes of stable slot paths), so the same pack always ships the
// same people. ~4–6k records at game scale: cheap to build, cheap to hold,
// and every one of them is real mutable state the campaign can touch
// (replacements, awards, cross-leveling all get honest provenance).
//
// Slots the task force is allocated (`tf`) are the fieldable pool: fielding a
// unit draws the first free slot of its type — lineage AND roster move with it
// (BY REFERENCE, see GameState.OrgSlot).
import type { DivOrg, OrgSlot, Soldier, UnitVehicle } from '../engine/GameState'
import { buildRoster, type TroopKindKey, type VehicleKey } from '../domains/forces/composition'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { BnKind, BnSlotPlan, FormationNode, Pack, SlotRole } from './types'
import { chairRung } from './types'
import { namePersonnel, nameSoldier } from './personnel'
import { seniorOf } from './ranks'

// --- template expansion (VERBS) ---------------------------------------------
// Everything below turns the PACK'S templates into slots. What a battalion is
// made of, what a staff section holds, how many snipers a battalion keeps —
// all of that is the pack's (Pack.staff / Pack.bnKinds). This file knows only
// how to expand a template, not what any template says.
interface StaffMember { kind: TroopKindKey; pos: string; rank: string; sec?: string }

/** A rostered element, from the pack's own roster table. `n` repeats a billet
 *  (ten snipers are one line in the pack, ten people here). */
function expandStaff(pack: Pack, key: string): StaffMember[] {
  const roster = pack.rosters?.[key]
  if (!roster) throw new Error(`pack '${pack.id}': no roster named '${key}'`)
  const out: StaffMember[] = []
  for (const b of roster) {
    for (let i = 0; i < (b.n ?? 1); i++) {
      out.push({ kind: b.kind, pos: b.pos, rank: b.rank, ...(b.sec ? { sec: b.sec } : {}) })
    }
  }
  return out
}

/** An aviation flight: n airframes, each manned by one crew roster, plus any
 *  element that rides the flight rather than an airframe (medics). */
function expandFlight(pack: Pack, f: NonNullable<BnSlotPlan['flight']>):
  { staff: StaffMember[]; vehicles: { type: VehicleKey; n: number }[]; crewed: true } {
  const staff: StaffMember[] = []
  for (let i = 0; i < f.n; i++) staff.push(...expandStaff(pack, f.crew))
  if (f.attach) staff.push(...expandStaff(pack, f.attach))
  return { staff, vehicles: [{ type: f.air, n: f.n }], crewed: true }
}

const PLT_ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'] as const
// --- battalion templates ----------------------------------------------------
// A slot spec inside a company: a fieldable game unit type, or a hand-rostered
// staff/aviation element. Produced from the PACK'S template — never written
// here.
type SlotSpec =
  | { name: string; role?: SlotRole; type: UnitTypeKey }
  | { name: string; role?: SlotRole; staff: StaffMember[]; vehicles?: { type: VehicleKey; n: number }[]; crewed?: boolean }
interface CoSpec { co: string; slots: SlotSpec[] }

/** The pack's template for a battalion of this kind, expanded to slots. Throws
 *  on a kind the pack does not ship — a battalion that names a template nobody
 *  wrote is a content error, and a silent empty battalion would hide it. */
function bnTemplate(pack: Pack, kind: BnKind): CoSpec[] {
  const plan = pack.bnKinds?.[kind]
  if (!plan) throw new Error(`pack '${pack.id}': no battalion kind named '${kind}'`)
  return plan.companies.map(co => {
    const slots: SlotSpec[] = []
    // the platoon shorthand first: n numbered platoons of one type
    if (co.plts) {
      for (let i = 0; i < (co.plts.n ?? 3); i++) {
        slots.push({ name: `${PLT_ORD[i] ?? `${i + 1}th`} PLT`, type: co.plts.type })
      }
    }
    for (const s of co.slots ?? []) {
      if (s.type) slots.push({ name: s.name, role: s.role, type: s.type })
      else if (s.flight) slots.push({ name: s.name, role: s.role, ...expandFlight(pack, s.flight) })
      else if (s.roster) slots.push({ name: s.name, role: s.role, staff: expandStaff(pack, s.roster) })
      else throw new Error(`pack '${pack.id}': slot '${co.co}/${s.name}' in '${kind}' has no type, roster or flight`)
    }
    return { co: co.co, slots }
  })
}


// --- builder ----------------------------------------------------------------
function buildStaffSlot(spec: Extract<SlotSpec, { staff: StaffMember[] }>, slotId: string, side: 'friend' | 'hostile'):
  { soldiers: Soldier[]; vehicles: UnitVehicle[] } {
  const vehicles: UnitVehicle[] = []
  let vid = 1
  for (const v of spec.vehicles ?? []) for (let i = 0; i < v.n; i++) vehicles.push({ id: vid++, type: v.type, status: 'OK' })
  const soldiers: Soldier[] = spec.staff.map((m, i) => {
    const s: Soldier = {
      id: i + 1, kind: m.kind, status: 'FIT', vehId: null, pos: m.pos, rank: m.rank,
      ...(m.sec ? { sec: m.sec } : {}),
    }
    nameSoldier(s, slotId, side)
    return s
  })
  // aviation crews ride their airframes: pilots/chiefs are dealt to vehicles in
  // recipe order (flight() emits them airframe by airframe)
  if (spec.crewed && vehicles.length) {
    const per = Math.ceil(soldiers.filter(s => s.kind !== 'MEDIC').length / vehicles.length)
    let n = 0
    for (const s of soldiers) {
      if (s.kind === 'MEDIC') continue
      s.vehId = vehicles[Math.min(vehicles.length - 1, Math.floor(n / per))]!.id
      n++
    }
  }
  return { soldiers, vehicles }
}

// `playerBn` is THE CHAIR: which battalion the player commands this game.
// It decides what is task-force (fieldable through CALL UP) — a campaign
// pins it, a skirmish lets the player pick, and both hand it in here rather
// than the pack's own default being the only truth (scenario `player`).
export function buildDivisionOrg(pack: Pack, playerChair?: string): DivOrg | null {
  const f = pack.formation
  if (!f) return null
  const chair = playerChair ?? f.chair
  const slots: OrgSlot[] = []

  // ONE FORMATION expanded into slots. `path` is its lineage top-down; the
  // slot's own path adds the element under it. `cmd` — the formation that
  // commands it — is whoever sits at the pack's CHAIR RUNG on this branch, or
  // this formation itself when the branch is shallower than that (a brigade
  // headquarters is commanded by the brigade; a flat force by its one rung).
  const addBn = (path: string[], plan: { desig: string; kind?: BnKind; tfCos?: string[] }, from?: string) => {
    if (!plan.kind) return
    const desig = plan.desig
    const allTf = desig === chair
    const cmd = path[Math.min(chairRung(f), path.length - 1)] ?? desig
    for (const co of bnTemplate(pack, plan.kind)) {
      const tf = allTf || (plan.tfCos ?? []).includes(co.co)
      for (const spec of co.slots) {
        const id = `${desig}:${co.co}:${spec.name}`.replace(/\s+/g, '_')
        // a firing battery IS its unit — "A BTRY, 1-82 FA", not "FIRING BTRY, A BTRY, …"
        const lin = 'type' in spec && co.co.endsWith('BTRY')
          ? `${co.co}, ${desig}`
          : `${spec.name}, ${co.co}, ${desig}`
        const fieldable = tf && 'type' in spec
        const base: OrgSlot = {
          id, path: [...path, co.co], cmd, name: spec.name, lin, role: spec.role,
          // A task-organized slice from a SISTER formation is an ATTACHMENT: it
          // fights for us, it belongs to them. Marking it puts "ATT 91 EN BN"
          // on the call-up row and on the fielded unit — the same treatment a
          // cross-division attachment gets. The chair's own elements are
          // organic and stay unmarked.
          from: from ?? (fieldable && !allTf ? desig : undefined),
          tf: fieldable, unitId: null, soldiers: [], vehicles: [],
        }
        if ('type' in spec) {
          base.type = spec.type
          const r = buildRoster(spec.type)
          namePersonnel(r.soldiers, r.vehicles, spec.type, id, pack.side)
          base.soldiers = r.soldiers; base.vehicles = r.vehicles
        } else {
          const r = buildStaffSlot(spec, id, pack.side)
          base.soldiers = r.soldiers; base.vehicles = r.vehicles
        }
        slots.push(base)
      }
    }
  }

  // WALK THE FORMATION, however deep it goes. A formation with a `kind`
  // expands into slots — that is true of an element (a battalion, an MI
  // company) and equally of a headquarters that commands others, which is why
  // a brigade with a staff is not a folder its battalions sit in. A formation
  // with neither is a pure grouping and contributes nothing but a rung.
  const walk = (nodes: FormationNode[], path: string[]): void => {
    for (const n of nodes) {
      const here = [...path, n.desig]
      addBn(here, n)
      if (n.under) walk(n.under, here)
    }
  }
  walk(f.under, [])

  // attachments: the donor battalions' attached slices, as an 'ATT' pseudo-bde
  const attBns = new Map<string, { from: string; cos: CoSpec[] }>()
  for (const [type, slot] of Object.entries(pack.attached)) {
    if (!slot) continue
    const bn = slot.bn
    if (!attBns.has(bn)) attBns.set(bn, { from: slot.from, cos: [] })
    const entry = attBns.get(bn)!
    if ((slot.style ?? 'plt') === 'hhc') {
      let hhc = entry.cos.find(c => c.co === 'HHC')
      if (!hhc) { hhc = { co: 'HHC', slots: [] }; entry.cos.push(hhc) }
      hhc.slots.push({ name: slot.hhcName ?? 'SCT PLT', type: type as UnitTypeKey })
    } else {
      entry.cos.push({
        co: 'A CO',
        slots: PLT_ORD.slice(0, 3).map(o => ({ name: `${o} PLT`, type: type as UnitTypeKey })),
      })
    }
  }
  for (const [bn, e] of attBns) {
    for (const co of e.cos) {
      for (const spec of co.slots) {
        if (!('type' in spec)) continue
        const id = `${bn}:${co.co}:${spec.name}`.replace(/\s+/g, '_')
        const r = buildRoster(spec.type)
        namePersonnel(r.soldiers, r.vehicles, spec.type, id, pack.side)
        slots.push({
          id, path: ['ATT', bn, co.co], cmd: bn, name: spec.name,
          lin: `${spec.name}, ${co.co}, ${bn}`, type: spec.type, from: e.from,
          tf: true, unitId: null, soldiers: r.soldiers, vehicles: r.vehicles,
        })
      }
    }
  }

  // requestable-asset crews (ASSET-REQUESTS.md): ONE real slot per pooled
  // instance — named mil billets + CIV contractors. Division owns them
  // (tf: false, no type — never fieldable); they ride the delivery convoy
  // when their asset is approved and attach when it emplaces. Division being
  // "out a unit" is these people being casualties, nothing more abstract.
  for (const [kind, def] of Object.entries(pack.assets ?? {})) {
    if (!def.crew) continue
    for (let i = 1; i <= (def.count ?? 0); i++) {
      const id = `ASSET:${kind}-${i}`
      const soldiers: Soldier[] = []
      let sid = 1
      for (const [rank, pos] of def.crew.billets) {
        const s: Soldier = { id: sid++, kind: 'STAFF', status: 'FIT', vehId: null, pos, rank }
        nameSoldier(s, id, pack.side)
        soldiers.push(s)
      }
      for (let c = 0; c < (def.crew.civ ?? 0); c++) {
        const s: Soldier = { id: sid++, kind: 'CIV', status: 'FIT', vehId: null, pos: 'Field Service Rep', rank: 'CIV' }
        nameSoldier(s, id, pack.side)
        soldiers.push(s)
      }
      slots.push({
        id, path: ['ATT', def.from, def.name.toUpperCase()],
        cmd: def.from, name: `SEC ${i}`,
        lin: `${def.name} ${i}, ${def.from}`, from: def.from,
        tf: false, unitId: null, soldiers, vehicles: [],
      })
    }
  }

  // STANDING QRF at H-hour (pack content): a command does not open a war with
  // nobody on reaction duty — nor with the whole garrison on it. Named as
  // `ELEMENT:SLOT` inside the chair's own formation; unknown names are ignored
  // rather than thrown, so a pack can rename a company without breaking the
  // org build.
  for (const ref of f.qrf ?? []) {
    const [co, name] = ref.split(':')
    const sl = slots.find(s =>
      s.cmd === chair && s.path[s.path.length - 1] === co && s.name === name && s.type)
    if (sl) sl.qrf = true
  }

  return { slots }
}

// the crew slot backing a pooled asset instance ('CRAM-2' → 'ASSET:CRAM-2')
export function assetCrewSlot(org: DivOrg | null, instId: string): OrgSlot | null {
  return org?.slots.find(sl => sl.id === `ASSET:${instId}`) ?? null
}

// GARRISON STRENGTH — what the call-up and the S1 both brief. A slot has no map
// elements until it is fielded, so its strength is its FILL: people fit for duty
// over billets assigned, with vehicle readiness alongside. A backfilled casualty
// still holds their billet, so they count as assigned (PERSTAT's rule) — the
// replacement shows up as FIT and the number climbs back on its own.
export interface SlotStr { pct: number; fit: number; asg: number; vOk: number; vTot: number }
export function slotStrength(slots: OrgSlot | OrgSlot[]): SlotStr {
  const list = Array.isArray(slots) ? slots : [slots]
  let fit = 0, asg = 0, vOk = 0, vTot = 0
  for (const sl of list) {
    for (const s of sl.soldiers) {
      if (!s.replaced) asg++
      if (s.status === 'FIT') fit++
    }
    vTot += sl.vehicles.length
    vOk += sl.vehicles.filter(v => v.status === 'OK').length
  }
  return { pct: asg ? (fit / asg) * 100 : 0, fit, asg, vOk, vTot }
}

// first free TF slot of a type — the fielding draw
export function drawSlot(org: DivOrg, type: UnitTypeKey): OrgSlot | null {
  return org.slots.find(sl =>
    sl.tf && sl.type === type && sl.unitId == null
    && sl.soldiers.some(s => s.status === 'FIT')) ?? null
}

// First free slot of a type inside a NAMED FORMATION, at any echelon
// (battalion designation or brigade designation). Deliberately NOT filtered
// by `tf`: a sister brigade's platoon is a real element with real people —
// it simply is not in the player's task force, which is exactly what a
// scenario places when it puts 3ABCT on the map beside you. The TF draw
// above stays the CALL UP path and is untouched.
export function drawSlotIn(org: DivOrg, type: UnitTypeKey, formation: string): OrgSlot | null {
  return org.slots.find(sl =>
    sl.type === type && sl.unitId == null
    // ANYWHERE under that formation — the path answers at any rung, so naming
    // a brigade draws from its battalions without having to say which
    && sl.path.includes(formation)
    && sl.soldiers.some(s => s.status === 'FIT')) ?? null
}

// campaign hook: the player IS this formation's commander — put their name on
// its command group. The command element is the one the PACK marked as such
// (BnSlotPlan.role), and the commander is the senior soldier standing in it;
// the engine never has to know what an army calls either.
export function setBnCommander(org: DivOrg, cmd: string, name: string): void {
  const slot = org.slots.find(sl => sl.cmd === cmd && sl.role === 'command')
  const cdr = seniorOf(slot?.soldiers ?? [])
  if (cdr) cdr.name = name.toUpperCase()
}
