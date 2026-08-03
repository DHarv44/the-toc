// Casualty service (FORCE-MODEL P2.5): the roster is the source of truth.
// Damage happens to ELEMENTS, element losses happen to PEOPLE (deterministic
// hash rolls, difficulty-dialed — see CasualtyDials), and strength/elements
// DERIVE from the roster. Nothing resurrects: KIA are gone, evacuated wounds
// leave the mission, DESTROYED vehicles stay wrecks. Recovery is honest —
// medical care returns LIGHT wounds to duty, motorpools repair DAMAGED vics,
// and the P3 replacement pipeline fills what's left.
//
// Determinism: every roll is hashStr of (unit, subject, sim time) — no rng
// stream draws, so the golden path only moves where combat outcomes genuinely
// changed (documented re-baseline).
import { S } from '../../engine/state'
import type { DownedSite, ShellKind, Soldier, Unit, UnitElement, UnitVehicle, WoundSev } from '../../engine/GameState'
import { T_FOREST, T_URBAN } from '../../world/WorldMap'
import { UNIT_TYPES } from './catalog'
import { elemWorld, exposedList, postureFactor } from './elements'
import { DIFFICULTIES, type CasualtyDials, type Difficulty } from '../economy/difficulty'
import { grantAward, awardFor } from '../../packs/awards'
import { hashStr } from '../../lib/math'
import { radio } from '../comms/radio'

const dials = (): CasualtyDials =>
  (DIFFICULTIES as Record<string, Difficulty>)[S.difficulty]?.casualty
  ?? DIFFICULTIES.regular.casualty

// event-unique deterministic roll in [0,1): keyed on sim time, no rng draws
const roll = (u: Unit, tag: string): number =>
  (hashStr(`${u.id}:${tag}:${S.t.toFixed(2)}`) >>> 8) % 10000 / 10000

const WOUND_KINDS = ['GSW', 'SHRAPNEL', 'BLAST CONCUSSION', 'BURNS', 'CRUSH INJURY'] as const

// --- individual fates -------------------------------------------------------
function woundSoldier(u: Unit, s: Soldier, kindHint?: string): void {
  const d = dials()
  const r = roll(u, `sev:${s.id}`)
  // LIGHT recovers in-mission; SERIOUS/CRITICAL are evacuated out
  const sev: WoundSev = r < d.lightFrac ? 'LIGHT'
    : r < d.lightFrac + (1 - d.lightFrac) * 0.7 ? 'SERIOUS' : 'CRITICAL'
  s.status = 'WIA'
  s.wound = {
    sev, t: S.t, care: 0,
    kind: kindHint ?? WOUND_KINDS[Math.abs(hashStr(`${u.id}:${s.id}:wk:${S.t.toFixed(1)}`)) % WOUND_KINDS.length]!,
  }
  if (sev !== 'LIGHT') s.evac = true
  casualtyAward(u.side, s)
}

// A casualty earns their army's wound decoration. WHO the casualty is decides
// which: a CIVILIAN contractor is not eligible for a soldier's, and receives
// the civilian one (a real rule, not a nicety). Both are named by the pack.
function casualtyAward(side: Unit['side'], s: Soldier): void {
  const army = side === 'hostile' ? 'hostile' : 'friend'
  grantAward(s, awardFor(s.kind === 'CIV' ? 'wound-civ' : 'wound', army))
}

function killSoldier(u: Unit, s: Soldier): void {
  s.status = 'KIA'
  casualtyAward(u.side, s) // posthumous
}

// --- element ↔ roster mapping -----------------------------------------------
// veh element[i] ↔ vehicles[i] + its crew; troop element k ↔ its even slice of
// the dismounts (≈ a fire team). Same deterministic layout buildRoster emits.
function elementSlice(u: Unit, el: UnitElement): { veh: UnitVehicle | null; soldiers: Soldier[] } {
  if (el.kind === 'veh') {
    const vi = u.elements.filter(e => e.kind === 'veh').indexOf(el)
    const veh = u.vehicles[vi] ?? null
    return { veh, soldiers: veh ? u.soldiers.filter(s => s.vehId === veh.id) : [] }
  }
  // replaced casualty records leave the partition domain — their billet is
  // held by a pipeline replacement appended later (P3), keeping D authorized
  const dismounts = u.soldiers.filter(s => s.vehId === null && !s.replaced)
  const troopEls = u.elements.filter(e => e.kind === 'troop')
  const k = troopEls.indexOf(el), T = troopEls.length, D = dismounts.length
  if (k < 0 || !T || !D) return { veh: null, soldiers: [] }
  return { veh: null, soldiers: dismounts.slice(Math.floor(k * D / T), Math.floor((k + 1) * D / T)) }
}

// --- losses -----------------------------------------------------------------
// An element is lost: roll what that MEANS. Vehicles may be repairable
// (DAMAGED) unless the hit was catastrophic (direct precision kill); people
// take a WIA/KIA mix — crews fare worse in a destroyed vic.
export function applyElementLoss(u: Unit, el: UnitElement, catastrophic = false, kindHint?: string): void {
  if (!el.alive) return
  el.alive = false
  const d = dials()
  const { veh, soldiers } = elementSlice(u, el)
  if (el.kind === 'veh' && veh) {
    const repairable = !catastrophic && roll(u, `rep:${veh.id}`) < d.vehRepairFrac
    veh.status = repairable ? 'DAMAGED' : 'DESTROYED'
    if (!repairable) {
      const w = elemWorld(u, el)
      S.wrecks.push({ x: w.x, y: w.y, side: u.side, type: u.type, t: S.t })
      while (S.wrecks.length > 140) S.wrecks.shift()
    }
    for (const s of soldiers) {
      if (s.status !== 'FIT') continue
      const r = roll(u, `crew:${s.id}`)
      if (veh.status === 'DESTROYED') {
        // catastrophic loss: half the crew doesn't get out
        if (r < 0.5) killSoldier(u, s)
        else if (r < 0.85) woundSoldier(u, s, 'BURNS')
        // else bailed out unhurt
      } else {
        // mobility/firepower kill: the crew mostly survives it
        if (r < 0.1) killSoldier(u, s)
        else if (r < 0.45) woundSoldier(u, s, 'BLAST CONCUSSION')
      }
    }
  } else {
    for (const s of soldiers) {
      if (s.status !== 'FIT') continue
      if (roll(u, `cas:${s.id}`) < d.kiaFrac) killSoldier(u, s)
      else woundSoldier(u, s, kindHint)
    }
  }
}

// direct element kill (gunship strafes, precision direct hits): catastrophic
export function killElement(u: Unit, el: UnitElement): void {
  applyElementLoss(u, el, true)
}

// --- derivation -------------------------------------------------------------
// Element aliveness DERIVES from the roster (both directions — a repaired vic
// or a returned fire team revives its element):
export function deriveElements(u: Unit): void {
  let vi = 0
  const dismounts = u.soldiers.filter(s => s.vehId === null && !s.replaced)
  const troopEls = u.elements.filter(e => e.kind === 'troop')
  const T = troopEls.length, D = dismounts.length
  for (const el of u.elements) {
    if (el.kind === 'veh') {
      const v = u.vehicles[vi++]
      if (v) el.alive = v.status === 'OK'
    }
  }
  if (T && D) {
    troopEls.forEach((el, k) => {
      const slice = dismounts.slice(Math.floor(k * D / T), Math.floor((k + 1) * D / T))
      el.alive = slice.some(s => s.status === 'FIT')
    })
  }
}

// strength is a READOUT: live exposed elements minus the partial-damage
// accumulator. Still 0-100 everywhere — just no longer a ledger.
export function deriveStrength(u: Unit): void {
  const exp = exposedList(u)
  if (!exp.length) { u.strength = 0; return }
  const alive = exp.reduce((n, el) => n + (el.alive ? 1 : 0), 0)
  u.strength = Math.max(0, (alive / exp.length) * 100 - (u.dmgAcc ?? 0))
}

// --- damage entry points ----------------------------------------------------
// Continuous fire damage: accumulate strength points; each full element's
// worth of damage kills the front-most exposed element (and rolls its people).
export function damageUnit(u: Unit, pts: number, kindHint?: string): void {
  if (pts <= 0 || u.strength <= 0) return
  u.dmgAcc = (u.dmgAcc ?? 0) + pts
  const exp = exposedList(u)
  if (!exp.length) return
  const per = 100 / exp.length
  while ((u.dmgAcc ?? 0) >= per) {
    u.dmgAcc! -= per
    const el = exp.find(e => e.alive)
    if (!el) { u.dmgAcc = 0; break }
    applyElementLoss(u, el, false, kindHint)
  }
  deriveStrength(u)
}

// precision/blast fires resolve against individual elements by distance, so a
// direct hit kills the vic you aimed at; sub-lethal splash chips accumulate.
export function precisionBlast(
  u: Unit, ix: number, iy: number, blast: number, dmg: number,
  shell?: ShellKind, apMul = 1,
): void {
  const type = UNIT_TYPES[u.type]
  const icm = shell === 'ICM'
  const armorFactor = icm ? type.soft * 0.55 + (1 - type.soft) * 1.0 : type.soft * 1.0 + (1 - type.soft) * 0.45
  const map = S.map!
  const terr = map.terr[map.cellAt(u.x, u.y)]
  const cover = terr === T_URBAN ? 0.65 : terr === T_FOREST ? 0.85 : 1
  const post = postureFactor(u)
  const exp = exposedList(u)
  if (!exp.length) return
  let residual = 0
  for (const el of exp) {
    if (!el.alive) continue
    const w = elemWorld(u, el)
    const dEl = Math.hypot(w.x - ix, w.y - iy)
    // exposed foot mobiles catch fragmentation over a wider radius (anti-personnel splash)
    const elBlast = el.kind === 'troop' ? blast * apMul : blast
    if (dEl >= elBlast) continue
    const lethality = dmg * (1 - dEl / elBlast) * armorFactor * cover * post * (S.damageMul ?? 1)
    // a direct precision kill is catastrophic — no repairable hulk
    if (lethality >= 18) applyElementLoss(u, el, true, 'SHRAPNEL')
    else residual += lethality
  }
  deriveStrength(u)
  if (residual) damageUnit(u, residual * 0.12, 'SHRAPNEL')
}

// --- recovery (honest: nobody resurrects) -----------------------------------
// Medical care ticks LIGHT wounds toward return-to-duty. `rate` scales care
// speed by source: 1.0 = a real aid station (AID facility manned by medics),
// 0.7 = a MED detachment alongside in the field, 0.35 = the platoon's own
// medic doing buddy-aid in a prepared position. SERIOUS/CRITICAL are evac'd —
// they don't come back this mission (P3 replaces them).
export function medicalUpdate(u: Unit, dt: number, rate: number): void {
  const d = dials()
  let recovered = false
  for (const s of u.soldiers) {
    if (s.status !== 'WIA' || s.evac || !s.wound || s.wound.sev !== 'LIGHT') continue
    s.wound.care += dt * rate
    // per-soldier jitter (±25%) so a treated platoon trickles back, not steps
    const need = d.rtdMin * 60 * (0.75 + (Math.abs(hashStr(`${s.pid ?? s.id}:rtd`)) % 100) / 200)
    if (s.wound.care >= need) {
      s.status = 'FIT'
      recovered = true
      if (u.side === 'friend') radio(u.label, 'arrive', `RTD — ${s.rank ?? ''} ${s.name ?? 'CASUALTY'} BACK ON THE LINE`, u.x, u.y)
    }
  }
  if (recovered) { deriveElements(u); deriveStrength(u) }
}

// Motorpool repairs: one DAMAGED vic at a time, ~90 s each, only while at a
// base with a MOTORPOOL. DESTROYED stays destroyed.
// secsPerVic comes from the serving facility's SPEC (pack data) — the old
// hard-coded 90 s survives only as the fallback for spec-less callers
export function repairUpdate(u: Unit, dt: number, secsPerVic = 90): void {
  if (!u.vehicles.some(v => v.status === 'DAMAGED')) { u.repT = 0; return }
  u.repT = (u.repT ?? 0) + dt
  if (u.repT < secsPerVic) return
  u.repT -= secsPerVic
  const v = u.vehicles.find(x => x.status === 'DAMAGED')
  if (!v) return
  v.status = 'OK'
  if (u.side === 'friend') radio(u.label, 'arrive', `MOTORPOOL — ${u.label} VIC RETURNED TO ACTION`, u.x, u.y)
  deriveElements(u); deriveStrength(u)
}

// Scripted destruction (campaign events, harnesses): the roster is the source
// of truth, so "set strength to 0" must kill the PEOPLE — catastrophic loss of
// every element, then derive.
export function destroyUnit(u: Unit): void {
  for (const el of u.elements) applyElementLoss(u, el, true)
  u.dmgAcc = 0
  deriveStrength(u)
}

// --- survivors dismount -----------------------------------------------------
// A mounted carrier platoon whose last vehicle dies is NOT deleted while its
// dismounts are alive — the survivors bail out and fight on foot (shaken:
// BREAK posture, they run from contact). Cuts the "instant platoon deletion"
// wipes; the remnant can still go DUSTWUN later. Both sides.
export function remnantCheck(u: Unit): void {
  const type = UNIT_TYPES[u.type]
  if (!type.carrier || !u.mounted) return
  if (u.vehicles.some(v => v.status === 'OK')) return
  if (!u.soldiers.some(s => s.vehId === null && s.status === 'FIT')) return
  u.mounted = false
  u.autoDismounted = false // deliberate: they have nothing to remount
  u.roe = 'break'
  deriveElements(u)
  deriveStrength(u)
  if (u.side === 'friend') radio(u.label, 'damage', 'ALL VICS DOWN — SURVIVORS DISMOUNTING, BREAKING CONTACT', u.x, u.y)
}

// --- DUSTWUN ----------------------------------------------------------------
// A downed friendly platoon: fates are NOT rolled — the TOC only knows the
// signal dropped. The site keeps the unresolved roster at the LKP; securing
// the area resolves the truth (recovery.ts drives the clock).
export function downUnit(u: Unit): void {
  for (const v of u.vehicles) if (v.status === 'DAMAGED') v.status = 'DESTROYED' // abandoned hulks
  S.downed.push({
    id: (S.counters.nextId++), unitId: u.id, side: u.side, type: u.type,
    label: u.label, lineage: u.lineage, x: u.x, y: u.y, t: S.t,
    soldiers: u.soldiers, vehicles: u.vehicles, secureT: 0,
    // a higher-echelon unit down in the AO keeps its owner's name — the site
    // gets the "assist if able" framing, not the battalion-recovery one
    respFrom: u.respFrom,
  })
}

// The ground truth, rolled when the site is finally secured (or written off).
// Elapsed time decays WIA survival (the golden hour); an enemy-held site turns
// survivors into prisoners; a MED element on the recovery saves more wounded.
export function resolveDownedSite(
  site: DownedSite, opts: { medBonus?: boolean; writeOff?: boolean } = {},
): { fit: number; wia: number; kia: number; mia: number } {
  site.resolved = true
  const elapsed = S.t - site.t
  const enemyHeld = site.capturedT != null
  // WIA survival odds: full inside ~5 min, decaying to a floor by ~30 min
  const survive = Math.max(0.15, Math.min(1, 1.15 - elapsed / 1500)) + (opts.medBonus ? 0.15 : 0)
  const r = (tag: string, sid: number): number =>
    (hashStr(`${site.id}:${tag}:${sid}`) >>> 8) % 10000 / 10000
  const out = { fit: 0, wia: 0, kia: 0, mia: 0 }
  for (const s of site.soldiers) {
    if (s.status === 'KIA' || s.status === 'MIA' || s.evac) continue
    if (opts.writeOff) {
      // never secured: unaccounted — MIA-heavy, some confirmed KIA later
      if (r('wo', s.id) < 0.35) { s.status = 'KIA'; casualtyAward(site.side, s); out.kia++ }
      else { s.status = 'MIA'; out.mia++ }
      continue
    }
    if (enemyHeld && r('pow', s.id) < 0.75) { s.status = 'MIA'; out.mia++; continue } // captured
    if (s.status === 'WIA') {
      if (r('gh', s.id) < survive) { s.evac = true; out.wia++ } // recovered → medical chain
      else { s.status = 'KIA'; out.kia++ }                      // didn't make it (PH already held)
    } else {
      out.fit++ // E&E'd or held out — walks home to the slot as cadre
    }
  }
  return out
}

// --- end states -------------------------------------------------------------
// A wiped unit is overrun: remaining FIT and non-evac'd WIA are lost with it.
// MIA is RARE (the dice, not the default) — unaccounted troops can later spark
// a rescue mission (campaign hook). Abandoned DAMAGED vics are lost too.
export function processWipe(u: Unit): { mia: number } {
  let mia = 0
  for (const v of u.vehicles) if (v.status === 'DAMAGED') v.status = 'DESTROYED'
  for (const s of u.soldiers) {
    if (s.status === 'KIA' || s.status === 'MIA' || s.evac) continue
    if (roll(u, `wipe:${s.id}`) < 0.06) { s.status = 'MIA'; mia++ }
    else killSoldier(u, s)
  }
  return { mia }
}

// A surrendered unit walks into captivity: everyone still on their feet is MIA/POW.
export function processCapture(u: Unit): void {
  for (const s of u.soldiers) {
    if (s.status === 'FIT' || (s.status === 'WIA' && !s.evac)) s.status = 'MIA'
  }
}
