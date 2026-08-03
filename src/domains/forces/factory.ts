// Unit construction. Ported verbatim from src/game/sim.js newUnit/spawnEnemy;
// the id/designator counters read from S.counters (the flagged GameState
// deviation) instead of module-level variables.
import { S } from '../../engine/state'
import type { OrgSlot, Side, Unit } from '../../engine/GameState'
import { nearestLand } from '../../world/place'
import { UNIT_TYPES, type UnitTypeKey } from './catalog'
import { buildRoster, initialStowage } from './composition'
import { initElements } from './elements'
import { playerPack, lineageFor } from '../../packs'
import { activePack } from '../../packs/install'
import { assignPersonnel, assignCallsigns } from '../../packs/personnel'
import { drawSlot } from '../../packs/org'

// WHAT A FIELDED ELEMENT IS CALLED ON THE NET. The style is the side's own
// (Pack.callsigns): a force that NAMES its elements cycles a pool and numbers
// them — ALPHA-1, BRAVO-2 — while a force that only COUNTS them takes a
// prefix and a zero-padded number. The engine owns the counter, never the
// vocabulary; a pack with neither falls back to the plain count.
function designator(side: Side, n: number): string {
  const cs = activePack(side)?.callsigns
  if (cs?.pool?.length) return `${cs.pool[(n - 1) % cs.pool.length]}-${n}`
  return `${cs?.prefix ?? ''}${String(n).padStart(cs?.pad ?? 0, '0')}`
}

export function newUnit(
  typeKey: UnitTypeKey, side: Side, x: number, y: number,
  // noSlot: a unit that is NOT task-force troops (division asset delivery
  // convoys) — never draws an org slot, never burns pack lineage.
  // slot: field THIS org element (echelon-real fielding — the COMMAND rail
  // names the platoon; no first-free-of-type draw)
  opts?: { noSlot?: boolean; slot?: OrgSlot },
): Unit {
  const type = UNIT_TYPES[typeKey]
  S.counters.designators[side]++
  const label = designator(side, S.counters.designators[side])
  // Fielding a friendly unit DRAWS a garrisoned slot from the division org:
  // the unit takes the slot's lineage and its roster (same records — shared
  // by reference, so the S1 garrison view and the fielded unit never diverge).
  // Slot-exhausted overflow (dev sandbox spamming) falls back to the old
  // counter lineage with a fresh provisional roster.
  let lineage: string | undefined, attFrom: string | undefined
  const slot = opts?.slot
    ?? (side === 'friend' && S.org && !opts?.noSlot ? drawSlot(S.org, typeKey) : null)
  if (slot) {
    lineage = slot.lin
    attFrom = slot.from
  } else if (side === 'friend' && !opts?.noSlot) {
    const n = S.counters.lineage[typeKey] ?? 0
    S.counters.lineage[typeKey] = n + 1
    const lin = lineageFor(playerPack(), typeKey, n)
    lineage = lin.text
    attFrom = lin.from ?? undefined
  }
  const u: Unit = {
    id: S.counters.nextId++, side, type: typeKey, label, lineage, attFrom,
    x, y, heading: side === 'friend' ? -Math.PI / 2 : Math.PI / 2,
    strength: 100, path: [], legs: [], state: 'hold',
    mounted: !!type.carrier,
    roe: type.logi ? 'break' : 'halt', // supply trucks run, they don't fight
    heldRoute: null, autoDismounted: false, lastCombatT: -99, breaking: false, convoy: null,
    attackId: null, attackMove: false, attackRepathT: 0, groupId: null,
    colIdx: null, leadId: null,   // slot in a shared-route column, if marching in one
    posture: 'mobile', digT: 0, dugRadioed: false, weapons: 'free',
    fireCooldown: 0, missionCooldown: 0, targetId: null,
    bridging: null,
    lastContactT: -99, lastReqT: -99, lastSpotT: -99, lastFiredT: null, strMark: 100,
    aiRole: null, aiRepathT: 0,
    formSeed: S.rng ? S.rng() * 1000 : Math.random() * 1000,
    _spd: type.speed,
    odo: 0,
    elements: [],
    // composition roster (FORCE-MODEL Phase 2): deterministic, rng-free build
    ...buildRoster(typeKey),
    stowage: initialStowage(typeKey), // consumable munitions basic load (Phase 3)
  }
  if (type.indirect) u.ammo = type.indirect.load // basic load, both sides
  initElements(u)
  if (slot) {
    // the slot's people ARE the unit's people (shared arrays); they bring their
    // garrison names/billets and only pick up fielded callsigns here
    u.soldiers = slot.soldiers
    u.vehicles = slot.vehicles
    slot.unitId = u.id
    assignCallsigns(u)
    // TASK ORG: the element's commanding formation is its slot's, and the org
    // already knows what is task-force. A TF slot commanded by anyone other
    // than the chair IS an attachment (the engineers) — that is what `tf`
    // means — so it comes under the player's command; a slot that is not
    // task-force belongs to a sister formation fighting its own fight.
    u.cmd = slot.cmd
    if (slot.tf && slot.cmd !== S.chair) u.attached = true
  } else {
    assignPersonnel(u) // names/ranks/billets/callsigns — deterministic, digest-invisible
  }
  if (side === 'friend' && !opts?.noSlot) S.stats.fielded++ // after-action counter
  return u
}

export function spawnEnemy(typeKey: UnitTypeKey, x: number, y: number): Unit {
  // same placement service the player's start force uses: random muster/garrison
  // offsets never drop a unit into a river, a lake — or, for a vehicle, inside
  // a city block (urban is walls to vics now). Placement uses the unit's OWN
  // mobility: infantry may legally garrison the blocks, armor takes the street.
  const p = S.map ? nearestLand(S.map, x, y, UNIT_TYPES[typeKey].mob) : { x, y }
  const u = newUnit(typeKey, 'hostile', p.x, p.y)
  u.aiRole = 'garrison'
  u.anchorX = p.x; u.anchorY = p.y
  S.units.push(u)
  return u
}
