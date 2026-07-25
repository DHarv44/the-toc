// Personnel pipeline service (P3): combat experience, battlefield promotions,
// and the automatic replacement flow. The commander doesn't manage this — the
// rear detachment does. The LTC's lever is WHERE the force refits: units only
// absorb replacements while sitting at a friendly HQ/FOB, and garrisoned org
// slots (including a recovered DUSTWUN platoon's cadre) refill at the HQ.
//
// Chain of events on a leadership casualty: the most experienced FIT junior
// steps up — a real battlefield promotion (rank bump once they've earned it,
// "(Acting)" until then) — and the pipeline backfills the JUNIOR billet with
// a fresh named replacement, not the leader's.
//
// Determinism: hash-named replacements, fixed clocks — zero rng draws.
import { S } from '../../engine/state'
import type { OrgSlot, Soldier, Unit } from '../../engine/GameState'
import { COMPOSITIONS } from './composition'
import { deriveElements, deriveStrength } from './casualties'
import { nameSoldier, dismountBillet } from '../../packs/personnel'
import { hashStr } from '../../lib/math'
import { radio } from '../comms/radio'

// --- combat experience ------------------------------------------------------
// seconds in contact, per FIT soldier. Simple and honest: the platoon that has
// been in the fights carries the NCOs who can step up.
const XP_PROMO = 240 // enough combat time to hold the rank, not just the job

function xpUpdate(u: Unit, dt: number): void {
  if (S.t - u.lastCombatT > 10) return
  for (const s of u.soldiers) if (s.status === 'FIT') s.xp = (s.xp ?? 0) + dt
}

// --- battlefield promotions -------------------------------------------------
// leadership billets that must not stay empty, senior first
const LEAD_BILLETS: ReadonlyArray<{ pos: string; rank: string; from: (s: Soldier) => boolean }> = [
  { pos: 'Platoon Leader', rank: 'SFC', from: s => s.pos === 'Platoon Sergeant' || s.pos === 'Squad Leader' },
  { pos: 'Platoon Sergeant', rank: 'SFC', from: s => s.pos === 'Squad Leader' },
  { pos: 'Squad Leader', rank: 'SGT', from: s => s.vehId === null && s.pos !== 'Platoon Medic' && !s.pos?.includes('Leader') && !s.pos?.includes('Sergeant') },
  { pos: 'Vehicle Commander', rank: 'SSG', from: s => s.pos === 'Gunner' || s.pos === 'Driver' },
]

function promotionUpdate(u: Unit): void {
  for (const b of LEAD_BILLETS) {
    const held = u.soldiers.some(s => s.status === 'FIT' && (s.pos === b.pos || s.pos === `${b.pos} (Acting)`))
    if (held) continue
    // was the billet ever part of this platoon? (tank crews have no squad leaders)
    if (!u.soldiers.some(s => s.pos === b.pos || s.pos === `${b.pos} (Acting)`)) continue
    // the most combat-experienced qualified FIT junior steps up
    const cands = u.soldiers.filter(s => s.status === 'FIT' && b.from(s))
    if (!cands.length) continue
    const pick = cands.reduce((a, c) => ((c.xp ?? 0) > (a.xp ?? 0) ? c : a))
    const earned = (pick.xp ?? 0) >= XP_PROMO
    const oldRank = pick.rank
    pick.pos = earned ? b.pos : `${b.pos} (Acting)`
    if (earned) pick.rank = b.rank
    if (u.side === 'friend') S.stats.promotions = (S.stats.promotions ?? 0) + 1
    if (b.pos === 'Platoon Leader') pick.cs = `${u.label}-6`
    else if (b.pos === 'Platoon Sergeant') pick.cs = `${u.label}-7`
    if (u.side === 'friend' && (b.pos === 'Platoon Leader' || b.pos === 'Platoon Sergeant')) {
      radio(u.label, 'damage', earned
        ? `${b.pos.toUpperCase()} DOWN — ${pick.rank} ${pick.name} FIELD PROMOTED (WAS ${oldRank}), ASSUMING ${pick.cs}`
        : `${b.pos.toUpperCase()} DOWN — ${pick.rank} ${pick.name} ACTING, ASSUMING ${pick.cs}`, u.x, u.y)
    }
  }
}

// --- replacements -----------------------------------------------------------
// Packets arrive on a fixed clock; each unit (or garrisoned slot) refitting at
// a base absorbs a few soldiers per packet. Replacements are REAL records:
// named, junior-billeted, flagged repl, seeded from the roster they join.
const PACKET_SEC = 150   // a replacement packet lands about every 2.5 minutes
const PER_PACKET = 3     // how many empty billets one packet fills per element

const atBase = (x: number, y: number): boolean =>
  S.structures.some(st => st.side === 'friend' && st.buildT <= 0
    && (st.kind === 'HQ' || st.kind === 'FOB') && Math.hypot(st.x - x, st.y - y) < 450)

// an empty billet = a KIA/MIA/evac'd soldier's slot. The replacement takes the
// JUNIOR version of the kind's billet (promotions already covered leadership).
function fillVacancies(soldiers: Soldier[], type: Unit['type'], seedKey: string, n: number): number {
  let filled = 0
  const comp = COMPOSITIONS[type]
  for (const s of soldiers) {
    if (filled >= n) break
    if (s.replaced) continue // billet already backfilled
    if (!(s.status === 'KIA' || s.status === 'MIA' || (s.status === 'WIA' && s.evac))) continue
    if (s.vehId !== null) continue // crew replacement needs the vehicle chain — motorpool first (v2)
    // a NEW soldier record takes the billet slot (the fallen keep their name in
    // the slot history via the AAR later; ids extend past the original run)
    const id = Math.max(0, ...soldiers.map(x => x.id)) + 1
    const kindN = comp.dismounts.find(d => d.kind === s.kind)?.n ?? 1
    const nu: Soldier = { id, kind: s.kind, status: 'FIT', vehId: null, repl: true, xp: 0 }
    nameSoldier(nu, `${seedKey}:repl`, 'friend')
    const b = dismountBillet(s.kind, 0, kindN + 1, hashStr(`${seedKey}:${id}:rb`))
    nu.pos = b.pos; nu.rank = b.rank
    soldiers.push(nu)
    // the fallen soldier's record leaves the active roster count by staying in
    // its terminal state; mark it replaced so we don't double-fill
    s.replaced = true
    filled++
  }
  return filled
}

function replacementUpdate(): void {
  if (S.t < S.replT) return
  S.replT = S.t + PACKET_SEC
  let landed = 0
  // fielded units refitting at a base
  for (const u of S.units) {
    if (u.side !== 'friend' || u.strength <= 0) continue
    if (u.targetId || S.t - u.lastCombatT < 20) continue
    if (!atBase(u.x, u.y)) continue
    const got = fillVacancies(u.soldiers, u.type, u.lineage ?? `${u.id}`, PER_PACKET)
    if (got) {
      landed += got
      deriveElements(u); deriveStrength(u)
      radio(u.label, 'arrive', `${got} REPLACEMENT${got > 1 ? 'S' : ''} INTEGRATED FROM REAR DET`, u.x, u.y)
    }
  }
  // garrisoned org slots (incl. a recovered platoon's cadre) rebuild at the HQ
  for (const sl of S.org?.slots ?? []) {
    if (!sl.tf || !sl.type || sl.unitId != null) continue
    const got = fillVacancies(sl.soldiers, sl.type, sl.id, PER_PACKET)
    landed += got
  }
  if (landed > 0) {
    const hq = S.structures.find(st => st.side === 'friend' && st.kind === 'HQ')
    radio('NET', 'arrive', `REPLACEMENT PACKET PROCESSED — ${landed} PAX FORWARD FROM REAR DETACHMENT`, hq?.x ?? 0, hq?.y ?? 0)
  }
}

// vacancies that still need filling — the S1 pipeline readout
export function pipelineBacklog(): number {
  let n = 0
  const count = (list: Soldier[]) => {
    for (const s of list) {
      if (s.replaced) continue
      if (s.status === 'KIA' || s.status === 'MIA' || (s.status === 'WIA' && s.evac)) n++
    }
  }
  for (const u of S.units) if (u.side === 'friend') count(u.soldiers)
  for (const sl of S.org?.slots ?? []) if (sl.tf && sl.type && sl.unitId == null) count(sl.soldiers)
  return n
}

export function pipelineUpdate(dt: number): void {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    xpUpdate(u, dt)
    promotionUpdate(u)
  }
  replacementUpdate()
}

// recovery hook: a resolved DUSTWUN slot frees for re-fielding — the platoon
// keeps its colors, rebuilds on its cadre in garrison
export function releaseSlot(unitId: number): void {
  const sl = S.org?.slots.find(x => x.unitId === unitId)
  if (sl) sl.unitId = null
}
