// AIR THREAT — ground fire against low-flying airframes. The packs arm both
// ends: shooters carry UnitType.aa (reach, altitude ceiling, weight of fire)
// and airframes carry DroneType.hp. This tick only does geometry and
// consequences: cumulative damage from every hostile that can actually reach
// the airframe, a break-off at half strength (aircrew self-preservation — the
// TOC does not get a vote), and shootdown.
//
// A downed airframe whose delivering asset declares a CREW (PackAsset.crew,
// e.g. the Apache team from 1-227 AVN) puts that aircrew on the ground as a
// DUSTWUN site at the crash point — recovery.ts works it like any other LKP,
// and because the site carries respFrom, the campaign frames it as a
// personnel-recovery tasking, not a battalion loss.
//
// Altitude is the defense: effective altitude (spec.alt × the ANGELS setting)
// above a shooter's ceiling is untouchable. Flying LOW buys sight and trades
// safety — that is the whole decision.
import { S } from '../../engine/state'
import type { Drone, Soldier } from '../../engine/GameState'
import { DRONE_TYPES } from './catalog'
import { endSortie } from './availability'
import { UNIT_TYPES } from '../forces/catalog'
import { assetDef, windowAssetKind, orbitAssetKind } from '../assets/service'
import { nameSoldier } from '../../packs/personnel'
import { radio, toast } from '../comms/radio'
import { grid } from '../../lib/format'

const BREAK_OFF = 0.5     // fraction of hp at which the aircrew aborts on their own
const DEFAULT_HP = 80
const REPORT_GAP = 30     // seconds of quiet before "taking fire" transmits again

export function airThreatUpdate(dt: number): void {
  if (!S.drones.length) return
  for (let i = S.drones.length - 1; i >= 0; i--) {
    const d = S.drones[i]!
    const spec = DRONE_TYPES[d.type]
    if (!spec) continue
    const effAlt = spec.alt * (d.altMul || 1)
    // weight of fire from every hostile that can reach this airframe
    let dps = 0
    for (const u of S.units) {
      if (u.side !== 'hostile' || u.strength <= 0) continue
      const aa = UNIT_TYPES[u.type]?.aa
      if (!aa || effAlt > aa.alt) continue
      if (Math.hypot(u.x - d.x, u.y - d.y) > aa.range) continue
      dps += aa.dps * (u.strength / 100)
    }
    if (dps <= 0) continue
    const maxHp = spec.hp ?? DEFAULT_HP
    if (d.hp == null) d.hp = maxHp
    const report = d.underFireT == null || S.t - d.underFireT > REPORT_GAP
    d.underFireT = S.t
    d.hp -= dps * dt
    if (d.hp <= 0) { shootDown(i, d); continue }
    if (report) radio(d.label, 'damage', `TAKING GROUND FIRE — GRID ${grid(d.x, d.y)}`, d.x, d.y)
    // the crew breaks off at half strength whatever the tasking says; a bird
    // already committed to a terminal dive stays in it
    if (d.hp <= maxHp * BREAK_OFF && d.state !== 'rtb' && d.state !== 'striking') {
      d.state = 'rtb'
      d.followId = null
      d.route = []
      radio(d.label, 'damage', 'BREAKING OFF — TAKING FIRE, RTB', d.x, d.y)
    }
  }
}

function shootDown(i: number, d: Drone): void {
  S.impacts.push({ x: d.x, y: d.y, t: S.t })
  // the delivering asset's pack entry says whether people were aboard
  const kind = windowAssetKind(d.type) ?? orbitAssetKind(d.type)
  const def = kind ? assetDef(kind) : null
  const billets = def?.crew?.billets
  if (billets?.length) {
    const soldiers: Soldier[] = []
    let sid = 1
    for (const [rank, pos] of billets) {
      const s: Soldier = { id: sid++, kind: 'STAFF', status: 'FIT', vehId: null, pos, rank }
      nameSoldier(s, `${d.label}:${d.id}:${sid}`)
      soldiers.push(s)
    }
    S.downed.push({
      id: S.counters.nextId++, unitId: -d.id, side: 'friend', type: 'INF',
      label: d.label, lineage: def ? `${def.name}, ${def.from}` : undefined,
      x: d.x, y: d.y, t: S.t, soldiers, vehicles: [], secureT: 0,
      respFrom: def?.from,
    })
    radio(d.label, 'loss',
      `MAYDAY — ${d.label} IS DOWN, GRID ${grid(d.x, d.y)}. AIRCREW ON THE GROUND — PERSONNEL RECOVERY REQUIRED`,
      d.x, d.y)
    toast(`${d.label} SHOT DOWN — AIRCREW DOWN, GRID ${grid(d.x, d.y)}`)
  } else {
    radio(d.label, 'loss', `${d.label} SHOT DOWN — GRID ${grid(d.x, d.y)}, AIRFRAME LOST`, d.x, d.y)
  }
  endSortie(d)
  S.drones.splice(i, 1)
}
