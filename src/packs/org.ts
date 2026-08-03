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
import type { BnKind, BnPlan, Pack } from './types'
import { namePersonnel, nameSoldier } from './personnel'

// --- staff/aviation slot recipes -------------------------------------------
// `sec` is the SUB-ELEMENT this person belongs to inside the slot — the rung
// below a staff element is its SECTIONS, and a battalion staff is not nine
// people in a heap: it is the S1 shop, the S2 shop, the S3 shop and so on,
// each with an officer and their NCOs. Untagged members hang directly off the
// slot (a command group IS the element; it has nothing under it).
interface StaffMember { kind: TroopKindKey; pos: string; rank: string; sec?: string }

const BN_CMD_GRP: StaffMember[] = [
  { kind: 'STAFF', pos: 'Battalion Commander', rank: 'LTC' },
  { kind: 'STAFF', pos: 'Executive Officer', rank: 'MAJ' },
  { kind: 'STAFF', pos: 'Command Sergeant Major', rank: 'CSM' },
  { kind: 'STAFF', pos: 'Commander’s Driver', rank: 'SPC' },
  { kind: 'STAFF', pos: 'Command RTO', rank: 'SPC' },
]
const BN_STAFF: StaffMember[] = [
  { kind: 'STAFF', pos: 'S1 — Personnel', rank: 'CPT', sec: 'S1 SEC' },
  { kind: 'STAFF', pos: 'S1 NCOIC', rank: 'SSG', sec: 'S1 SEC' },
  { kind: 'STAFF', pos: 'S1 Clerk', rank: 'SPC', sec: 'S1 SEC' },
  { kind: 'STAFF', pos: 'S2 — Intelligence', rank: 'CPT', sec: 'S2 SEC' },
  { kind: 'STAFF', pos: 'S2 Analyst', rank: 'SGT', sec: 'S2 SEC' },
  { kind: 'STAFF', pos: 'S3 — Operations', rank: 'MAJ', sec: 'S3 SEC' },
  { kind: 'STAFF', pos: 'Operations NCO', rank: 'SFC', sec: 'S3 SEC' },
  { kind: 'STAFF', pos: 'Battle Captain RTO', rank: 'SPC', sec: 'S3 SEC' },
  { kind: 'STAFF', pos: 'S4 — Logistics', rank: 'CPT', sec: 'S4 SEC' },
  { kind: 'STAFF', pos: 'S4 NCOIC', rank: 'SSG', sec: 'S4 SEC' },
  { kind: 'STAFF', pos: 'S6 — Signal', rank: 'CPT', sec: 'S6 SEC' },
  // the FIRE SUPPORT ELEMENT: the battalion's own fires cell, and the reason
  // a call for fire has anyone to answer it. A CAB staff without an FSO is
  // missing the officer who plans every target on the sheet.
  { kind: 'STAFF', pos: 'Fire Support Officer', rank: 'CPT', sec: 'FS ELEMENT' },
  { kind: 'STAFF', pos: 'Fire Support NCO', rank: 'SSG', sec: 'FS ELEMENT' },
  // the UNIT MINISTRY TEAM — a real two-person section on every battalion MTOE
  { kind: 'STAFF', pos: 'Chaplain', rank: 'CPT', sec: 'UMT' },
  { kind: 'STAFF', pos: 'Religious Affairs NCO', rank: 'SGT', sec: 'UMT' },
]
const DIV_CMD_GRP: StaffMember[] = [
  { kind: 'STAFF', pos: 'Commanding General', rank: 'MG' },
  { kind: 'STAFF', pos: 'Deputy CG (Maneuver)', rank: 'BG' },
  { kind: 'STAFF', pos: 'Deputy CG (Support)', rank: 'BG' },
  { kind: 'STAFF', pos: 'Division Command Sergeant Major', rank: 'CSM' },
  { kind: 'STAFF', pos: 'Aide-de-Camp', rank: 'CPT' },
  { kind: 'STAFF', pos: 'CG’s Driver', rank: 'SPC' },
]
const gSection = (g: string, name: string): StaffMember[] => [
  { kind: 'STAFF', pos: `${g} — ${name}`, rank: g === 'G3' ? 'COL' : 'LTC' },
  { kind: 'STAFF', pos: `${g} Deputy`, rank: 'MAJ' },
  { kind: 'STAFF', pos: `${g} Plans Officer`, rank: 'CPT' },
  { kind: 'STAFF', pos: `${g} Sergeant Major`, rank: 'SGM' },
  { kind: 'STAFF', pos: `${g} NCO`, rank: 'SFC' },
  { kind: 'STAFF', pos: `${g} Clerk`, rank: 'SPC' },
]
const medPlt = (): StaffMember[] => [
  { kind: 'STAFF', pos: 'Medical Officer', rank: 'CPT' },
  ...Array.from({ length: 8 }, () => ({ kind: 'MEDIC' as TroopKindKey, pos: 'Medic', rank: 'SPC' })),
]
const maintPlt = (): StaffMember[] => [
  { kind: 'STAFF', pos: 'Maintenance Technician', rank: 'CW2' },
  ...Array.from({ length: 10 }, () => ({ kind: 'MECHANIC' as TroopKindKey, pos: 'Mechanic', rank: 'SPC' })),
]
const netOps = (): StaffMember[] => [
  { kind: 'STAFF', pos: 'NETOPS Officer', rank: 'CPT' },
  ...Array.from({ length: 8 }, () => ({ kind: 'SIGNALLER' as TroopKindKey, pos: 'Signaller', rank: 'SPC' })),
]

// an aviation flight: n airframes, 2 pilots per airframe + crew chiefs (and
// medevac flights carry flight medics)
function flight(air: VehicleKey, n: number, chiefsPer: number, medics = 0):
  { staff: StaffMember[]; vehicles: { type: VehicleKey; n: number }[]; crewed: true } {
  const staff: StaffMember[] = []
  for (let i = 0; i < n; i++) {
    staff.push({ kind: 'PILOT', pos: i === 0 ? 'Flight Lead' : 'Pilot in Command', rank: i === 0 ? 'CPT' : 'CW3' })
    staff.push({ kind: 'PILOT', pos: 'Pilot', rank: 'CW2' })
    for (let k = 0; k < chiefsPer; k++) staff.push({ kind: 'CREW_CHIEF', pos: 'Crew Chief', rank: 'SGT' })
  }
  for (let i = 0; i < medics; i++) staff.push({ kind: 'MEDIC', pos: 'Flight Medic', rank: 'SGT' })
  return { staff, vehicles: [{ type: air, n }], crewed: true }
}

// --- battalion templates ----------------------------------------------------
// A slot spec inside a company: either a fieldable game unit type, or a
// hand-rostered staff/aviation element.
type SlotSpec =
  | { name: string; type: UnitTypeKey }
  | { name: string; staff: StaffMember[]; vehicles?: { type: VehicleKey; n: number }[]; crewed?: boolean }
interface CoSpec { co: string; slots: SlotSpec[] }

const plts = (type: UnitTypeKey, n = 3): SlotSpec[] =>
  Array.from({ length: n }, (_, i) => ({ name: `${['1st', '2nd', '3rd', '4th'][i]} PLT`, type }))

function bnTemplate(kind: BnKind): CoSpec[] {
  switch (kind) {
    // A COMBINED ARMS BATTALION is exactly what it says: tank companies and
    // mechanized infantry companies under ONE commander. The ABCT builds them
    // 'double-double' — two armor, two mech — precisely so the battalion can
    // cross-attach into company teams without asking brigade for anything.
    // (A pure tank battalion is the ARMOR kind; no ABCT fields one.)
    case 'CAB': return [
      { co: 'HHC', slots: [
        { name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF },
        { name: 'SCT PLT', type: 'SCT' }, { name: 'MORT PLT', type: 'MOR' },
        // the battalion aid station: fieldable as a MED detachment (P2.5 v2 —
        // it mans the HQ AID facility while garrisoned, treats forward when out)
        { name: 'MED PLT', type: 'MED' },
      ] },
      { co: 'A CO', slots: plts('ARM') },
      { co: 'B CO', slots: plts('ARM') },
      { co: 'C CO', slots: plts('MECH') },
      { co: 'D CO', slots: plts('MECH') },
    ]
    case 'ARMOR': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: plts('ARM') },
      { co: 'B CO', slots: plts('ARM') },
      { co: 'C CO', slots: plts('ARM') },
    ]
    case 'RECON': return [
      { co: 'HHT', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'SQDN STAFF', staff: BN_STAFF }] },
      { co: 'A TRP', slots: plts('CAV') },
      { co: 'B TRP', slots: plts('CAV') },
      { co: 'C TRP', slots: plts('CAV') },
    ]
    case 'FA': return [
      { co: 'HHB', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A BTRY', slots: [{ name: 'FIRING BTRY', type: 'ARTY' }] },
      { co: 'B BTRY', slots: [{ name: 'FIRING BTRY', type: 'ARTY' }] },
      { co: 'C BTRY', slots: [{ name: 'FIRING BTRY', type: 'ARTY' }] },
    ]
    // The BRIGADE ENGINEER BATTALION is not only engineers: the ABCT's organic
    // signal and military-intelligence companies live here too, which is where
    // a brigade's own network and collection actually come from. (The MI
    // company is absent until there is a unit type with something to do —
    // collection/EW is unbuilt; see the pack's S6 note.)
    case 'BEB': return [
      { co: 'HSC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: plts('ENG') },
      { co: 'B CO', slots: plts('ENG') },
      { co: 'C CO', slots: [
        { name: '1st PLT', type: 'SIG' }, { name: '2nd PLT', type: 'SIG' },
        { name: 'NETOPS', staff: netOps() },
      ] },
    ]
    case 'BSB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: plts('LOG') },
      { co: 'B CO', slots: [{ name: 'MAINT PLT', staff: maintPlt() }, { name: 'RECOVERY PLT', staff: maintPlt() }] },
      { co: 'C CO', slots: [{ name: 'MED PLT', staff: medPlt() }, { name: 'TREATMENT PLT', staff: medPlt() }] },
    ]
    case 'SIG': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }] },
      { co: 'A CO', slots: [{ name: '1st PLT', type: 'SIG' }, { name: '2nd PLT', type: 'SIG' }] },
      { co: 'B CO', slots: [{ name: 'NETOPS', staff: netOps() }] },
    ]
    case 'ARB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: [{ name: 'FLT 1', ...flight('AH64', 4, 1) }, { name: 'FLT 2', ...flight('AH64', 4, 1) }] },
      { co: 'B CO', slots: [{ name: 'FLT 1', ...flight('AH64', 4, 1) }, { name: 'FLT 2', ...flight('AH64', 4, 1) }] },
      { co: 'C CO', slots: [{ name: 'FLT 1', ...flight('AH64', 4, 1) }] },
    ]
    case 'AHB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: [{ name: 'FLT 1', ...flight('UH60', 4, 2) }, { name: 'FLT 2', ...flight('UH60', 4, 2) }] },
      { co: 'B CO', slots: [{ name: 'FLT 1', ...flight('UH60', 4, 2) }, { name: 'FLT 2', ...flight('UH60', 4, 2) }] },
    ]
    case 'GSAB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: [{ name: 'HVY LIFT FLT', ...flight('CH47', 4, 2) }] },
      { co: 'C CO', slots: [{ name: 'MEDEVAC FLT', ...flight('UH60', 4, 1, 4) }] },
    ]
    case 'ASB': return [
      { co: 'HSC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: [{ name: 'AVIM PLT', staff: maintPlt() }, { name: 'COMPONENT PLT', staff: maintPlt() }] },
    ]
    case 'CSSB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
      { co: 'A CO', slots: plts('LOG') },
      { co: 'B CO', slots: [{ name: 'SUPPLY PLT', staff: maintPlt() }] },
    ]
    case 'HHBN': return [
      { co: 'DIV CMD GRP', slots: [{ name: 'COMMAND GROUP', staff: DIV_CMD_GRP }] },
      { co: 'DIV STAFF', slots: [
        { name: 'G1 SECTION', staff: gSection('G1', 'Personnel') },
        { name: 'G2 SECTION', staff: gSection('G2', 'Intelligence') },
        { name: 'G3 SECTION', staff: gSection('G3', 'Operations') },
        { name: 'G4 SECTION', staff: gSection('G4', 'Logistics') },
        { name: 'G6 SECTION', staff: gSection('G6', 'Signal') },
      ] },
    ]
    case 'HHB-DIVARTY': return [
      { co: 'HHB', slots: [
        { name: 'CMD GRP', staff: [{ kind: 'STAFF', pos: 'DIVARTY Commander', rank: 'COL' }, ...BN_CMD_GRP.slice(1)] },
        { name: 'FIRES CELL', staff: BN_STAFF },
      ] },
    ]
    case 'STB': return [
      { co: 'HHC', slots: [{ name: 'CMD GRP', staff: BN_CMD_GRP }, { name: 'BN STAFF', staff: BN_STAFF }] },
    ]
  }
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
export function buildDivisionOrg(pack: Pack, playerBn?: string): DivOrg | null {
  const f = pack.formation
  if (!f) return null
  const chair = playerBn ?? f.playerBn
  const slots: OrgSlot[] = []

  const addBn = (bde: string, bn: BnPlan, from?: string) => {
    const allTf = bn.desig === chair
    for (const co of bnTemplate(bn.kind)) {
      const tf = allTf || (bn.tfCos ?? []).includes(co.co)
      for (const spec of co.slots) {
        const id = `${bn.desig}:${co.co}:${spec.name}`.replace(/\s+/g, '_')
        // a firing battery IS its unit — "A BTRY, 1-82 FA", not "FIRING BTRY, A BTRY, …"
        const lin = 'type' in spec && co.co.endsWith('BTRY')
          ? `${co.co}, ${bn.desig}`
          : `${spec.name}, ${co.co}, ${bn.desig}`
        const fieldable = tf && 'type' in spec
        const base: OrgSlot = {
          id, bde, bn: bn.desig, co: co.co, name: spec.name, lin,
          // A task-organized slice from a SISTER battalion is an ATTACHMENT: it
          // fights for us, it belongs to them. Marking it puts "ATT 91 BEB" on
          // the call-up row and on the fielded unit — the same treatment a
          // cross-division attachment gets. playerBn's own elements are
          // organic and stay unmarked.
          from: from ?? (fieldable && !allTf ? bn.desig : undefined),
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

  for (const bde of f.bdes) for (const bn of bde.bns) addBn(bde.desig, bn)

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
      entry.cos.push({ co: 'A CO', slots: plts(type as UnitTypeKey) })
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
          id, bde: 'ATT', bn, co: co.co, name: spec.name,
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
        id, bde: 'ATT', bn: def.from, co: def.name.toUpperCase(), name: `SEC ${i}`,
        lin: `${def.name} ${i}, ${def.from}`, from: def.from,
        tf: false, unitId: null, soldiers, vehicles: [],
      })
    }
  }

  // STANDING QRF at H-hour (pack content): the battalion does not open a war
  // with nobody on reaction duty — nor with the whole garrison on it. Named as
  // `CO:PLT` inside the player battalion; unknown names are ignored rather than
  // thrown, so a pack can rename a company without breaking the org build.
  for (const ref of f.qrf ?? []) {
    const [co, name] = ref.split(':')
    const sl = slots.find(s => s.bn === chair && s.co === co && s.name === name && s.type)
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
    && (sl.bn === formation || sl.bde === formation)
    && sl.soldiers.some(s => s.status === 'FIT')) ?? null
}

// campaign hook: the player IS this battalion's commander — put their name on
// the CMD GRP slot
export function setBnCommander(org: DivOrg, bn: string, name: string): void {
  const slot = org.slots.find(sl => sl.bn === bn && sl.name === 'CMD GRP')
  const cdr = slot?.soldiers.find(s => s.pos === 'Battalion Commander')
  if (cdr) cdr.name = name.toUpperCase()
}
