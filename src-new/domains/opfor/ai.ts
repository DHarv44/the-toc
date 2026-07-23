// Enemy AI. It is purely a COMMANDER: it never manipulates unit internals, it
// only issues the same orders the player uses (orderMove/orderAttack/orderRoe/
// orderDefend). All tactical execution — halting to fight, breaking contact,
// dismounting, resuming the mission, group pacing — runs in the shared tick
// code, identically to friendly units. This keeps behaviour symmetric and
// makes a future second human/AI commander a drop-in.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { Battlegroup, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import type { UnitTypeKey } from '../forces/catalog'
import { spawnEnemy } from '../forces/factory'
import { newMoveGroup, orderMove, orderRoe, orderDefend } from '../forces/orders'
import { templateCost, forceCap, forceCount } from '../economy/economy'

interface BgTemplate {
  name: string
  comp: readonly UnitTypeKey[]
}

const BG_TEMPLATES: readonly BgTemplate[] = [
  { name: 'MECH TEAM',    comp: ['ARM', 'ARM', 'MECH', 'SCT', 'AT'] },
  { name: 'ARMOR THRUST', comp: ['ARM', 'ARM', 'ARM', 'CAV'] },
  { name: 'INF ASSAULT',  comp: ['MECH', 'INF', 'INF', 'SCT', 'MOR'] },
  { name: 'RECON FORCE',  comp: ['CAV', 'CAV', 'SCT', 'AT'] },
]

function centroidOf(list: Unit[]): Vec2 | null {
  if (!list.length) return null
  let x = 0, y = 0
  for (const u of list) { x += u.x; y += u.y }
  return { x: x / list.length, y: y / list.length }
}

// pick the enemy's objective: nearest player installation, HQ prioritised
function enemyObjective(from: Vec2): Vec2 {
  let best: Vec2 | null = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    const w = Math.hypot(s.x - from.x, s.y - from.y) * (s.kind === 'HQ' ? 0.6 : 1)
    if (w < bd) { bd = w; best = { x: s.x, y: s.y } }
  }
  return best || { x: S.map!.fob.x, y: S.map!.fob.y }
}

function spawnBattlegroup(): void | null {
  // The OPFOR buys its battlegroups. It can only field what it has banked, so it can't
  // put everything on the board at once — and because it pays upkeep on what's already
  // out, a large standing force starves the next group. Same constraint the player has.
  // You can't field from a base you no longer hold — the same rule the player plays by.
  // Battlegroups muster at a live hostile HQ/FOB; lose them all and the OPFOR is done
  // reinforcing, whatever it has banked.
  const base = S.structures.find(s => s.side === 'hostile' && s.buildT <= 0
    && (s.kind === 'HQ' || s.kind === 'FOB'))
  if (!base) return null

  // and it lives under the same force cap — a template that would breach it isn't fielded
  const room = forceCap('hostile') - forceCount('hostile')
  const affordable = BG_TEMPLATES.filter(t =>
    templateCost(t.comp) <= S.enemyResources && t.comp.length <= room)
  if (!affordable.length) return null
  const rng = S.rng!
  const tpl = affordable[Math.floor(rng() * affordable.length)]!
  S.enemyResources -= templateCost(tpl.comp)
  const gid = newMoveGroup()
  const grp: Battlegroup = {
    id: gid, name: tpl.name, phase: 'muster',
    musterT: 10 + rng() * 8, retaskT: 0, objective: null,
    members: [], initStr: tpl.comp.length * 100, dead: false,
  }
  // muster at the base that's actually fielding them, not a fixed map coordinate
  const bx = base.x, by = base.y
  for (const t of tpl.comp) {
    const u = spawnEnemy(t, bx + (rng() - 0.5) * 500, by + (rng() - 0.5) * 300 + 150)
    u.aiRole = 'bg'
    u.bgGroup = gid
    u.bgRole = (t === 'SCT' || t === 'CAV') ? 'recon' : 'main'
    // recon screens & disengages; the main body advances to contact and fights
    orderRoe(u.id, u.bgRole === 'recon' ? 'break' : 'halt')
  }
  grp.members = S.units.filter(u => u.bgGroup === gid).map(u => u.id)
  S.enemyGroups.push(grp)
}

function updateBattlegroup(grp: Battlegroup, dt: number): void {
  const mem = grp.members
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0)
  if (!mem.length) { grp.dead = true; return }
  const curStr = mem.reduce((s, u) => s + u.strength, 0)

  if (grp.phase === 'muster') {
    grp.musterT -= dt
    if (grp.musterT <= 0) { grp.objective = enemyObjective(centroidOf(mem)!); grp.phase = 'advance' }
    return
  }

  // combat-ineffective (< 35% of committed strength) → withdraw under break discipline
  if (grp.phase !== 'withdraw' && curStr < grp.initStr * 0.35) {
    grp.phase = 'withdraw'
    grp.objective = { x: S.map!.enemyBase.x, y: S.map!.enemyBase.y }
    for (const u of mem) orderRoe(u.id, 'break')
  }

  // refresh the objective as the player's disposition changes
  grp.retaskT -= dt
  if (grp.phase === 'advance' && grp.retaskT <= 0) {
    grp.retaskT = 10
    grp.objective = enemyObjective(centroidOf(mem.filter(u => u.bgRole === 'main')) || centroidOf(mem)!)
  }

  const obj = grp.objective
  if (!obj) return
  const mainBody = mem.filter(u => u.bgRole === 'main')
  const mainCen = centroidOf(mainBody) || centroidOf(mem)!
  const XC = { crossCountry: true } // advance off-road, dispersed

  let mainIdx = 0
  for (const u of mem) {
    // only redirect genuinely idle units — units in contact / breaking / resuming
    // are being handled by the shared SOP code and must be left alone
    const idle = !u.path.length && !u.targetId && !u.breaking && !u.heldRoute && u.attackId == null
    if (u.bgRole === 'main') mainIdx++
    if (!idle) continue
    if (grp.phase === 'withdraw') {
      if (Math.hypot(u.x - obj.x, u.y - obj.y) > 200) orderMove(u.id, obj.x, obj.y)
    } else if (u.bgRole === 'recon') {
      // screen ~750 m ahead of the main body along the axis of advance
      const ax = obj.x - mainCen.x, ay = obj.y - mainCen.y, L = Math.hypot(ax, ay) || 1
      orderMove(u.id, mainCen.x + ax / L * 750, mainCen.y + ay / L * 750, false, false, null, XC)
    } else if (Math.hypot(u.x - obj.x, u.y - obj.y) > 300) {
      // main body: attack-move to a dispersed aim point (loose line abreast the
      // axis), paced together as a group, cross-country
      const ax = obj.x - mainCen.x, ay = obj.y - mainCen.y, L = Math.hypot(ax, ay) || 1
      const px = -ay / L, py = ax / L // perpendicular to the axis of advance
      const off = ((mainIdx - 1) - (mainBody.length - 1) / 2) * 180
      orderMove(u.id, obj.x + px * off, obj.y + py * off, false, true, grp.id, XC)
    }
  }

  // a withdrawing group that reaches home reverts to garrison defence
  if (grp.phase === 'withdraw'
      && mem.every(u => Math.hypot(u.x - S.map!.enemyBase.x, u.y - S.map!.enemyBase.y) < 500)) {
    for (const u of mem) {
      u.aiRole = 'garrison'; u.anchorX = u.x; u.anchorY = u.y; u.bgGroup = null; u.groupId = null
      orderRoe(u.id, 'halt')
    }
    grp.dead = true
  }
}

export function enemyAI(dt: number): void {
  S.nextWave -= dt
  if (S.nextWave <= 0) {
    const rng = S.rng!
    S.nextWave = 110 + rng() * 70
    spawnBattlegroup()
    if (S.t > 420 && rng() < 0.5) spawnBattlegroup() // escalate the tempo later
  }

  for (const grp of S.enemyGroups) updateBattlegroup(grp, dt)
  S.enemyGroups = S.enemyGroups.filter(g => !g.dead)

  // garrison defenders: hold their anchor, dig in when a threat closes
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.aiRole !== 'garrison') continue
    if (u.targetId) continue
    u.aiRepathT -= dt
    const off = Math.hypot(u.x - (u.anchorX ?? u.x), u.y - (u.anchorY ?? u.y))
    if (off > 160 && !u.path.length && u.aiRepathT <= 0) {
      u.aiRepathT = 15
      orderMove(u.id, u.anchorX!, u.anchorY!)
    } else if (off <= 160 && !u.path.length && u.posture !== 'dig') {
      const threat = S.units.some(f => f.side === 'friend' && Math.hypot(f.x - u.x, f.y - u.y) < 1600)
      if (threat) orderDefend(u.id, true)
    }
  }
}
