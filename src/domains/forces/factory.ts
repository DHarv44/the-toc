// Unit construction. Ported verbatim from src/game/sim.js newUnit/spawnEnemy;
// the id/designator counters read from S.counters (the flagged GameState
// deviation) instead of module-level variables.
import { S } from '../../engine/state'
import type { Side, Unit } from '../../engine/GameState'
import { nearestLand } from '../../world/place'
import { UNIT_TYPES, type UnitTypeKey } from './catalog'
import { initElements } from './elements'

const FRIEND_CALLS = [
  'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOX', 'GOLF', 'HOTEL', 'INDIA',
  'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVA', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO',
  'SIERRA', 'TANGO',
]

export function newUnit(typeKey: UnitTypeKey, side: Side, x: number, y: number): Unit {
  const type = UNIT_TYPES[typeKey]
  S.counters.designators[side]++
  const label = side === 'friend'
    ? FRIEND_CALLS[(S.counters.designators.friend - 1) % FRIEND_CALLS.length] + '-' + S.counters.designators.friend
    : 'E' + String(S.counters.designators.hostile).padStart(2, '0')
  const u: Unit = {
    id: S.counters.nextId++, side, type: typeKey, label,
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
    elements: [],
  }
  if (type.indirect) u.ammo = type.indirect.load // basic load, both sides
  initElements(u)
  if (side === 'friend') S.stats.fielded++ // after-action counter
  return u
}

export function spawnEnemy(typeKey: UnitTypeKey, x: number, y: number): Unit {
  // same placement service the player's start force uses: random muster/garrison
  // offsets never drop a unit into a river or lake
  const p = S.map ? nearestLand(S.map, x, y) : { x, y }
  const u = newUnit(typeKey, 'hostile', p.x, p.y)
  u.aiRole = 'garrison'
  u.anchorX = p.x; u.anchorY = p.y
  S.units.push(u)
  return u
}
