// Enemy AI. It is purely a COMMANDER: it never manipulates unit internals, it
// only issues the same orders the player uses (orderMove/orderAttack/orderRoe/
// orderDefend). All tactical execution — halting to fight, breaking contact,
// dismounting, resuming the mission, group pacing — runs in the shared tick
// code, identically to friendly units. This keeps behaviour symmetric and
// makes a future second human/AI commander a drop-in.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { Battlegroup, Structure, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import type { UnitTypeKey } from '../forces/catalog'
import { spawnEnemy } from '../forces/factory'
import { newMoveGroup, orderMove, orderRoe, orderDefend } from '../forces/orders'
import { templateCost, forceCap, forceCount } from '../economy/economy'
import { commanderDecide, garrisonFires } from './decide'

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

// pick the enemy's objective: nearest player installation, HQ prioritised.
// When the mode has a hill (King of the Hill), the hill IS the objective —
// battlegroups fight for it instead of marching on the player's bases.
function enemyObjective(from: Vec2): Vec2 {
  if (S.hill) return { x: S.hill.x, y: S.hill.y }
  let best: Vec2 | null = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    const w = Math.hypot(s.x - from.x, s.y - from.y) * (s.kind === 'HQ' ? 0.6 : 1)
    if (w < bd) { bd = w; best = { x: s.x, y: s.y } }
  }
  return best || { x: S.map!.fob.x, y: S.map!.fob.y }
}

// --- operational commander -------------------------------------------------
// One level above the battlegroups: a persistent main effort so groups
// converge, and a defensive posture that recalls attackers when the player
// masses on the OPFOR base. Only chooses objectives — the groups fight.

// the operational objective of an attack: the player's command post
// (decapitation, HQ discounted so it's preferred), else the FOB nearest home.
function pickMainEffort(): number | null {
  const base = S.map!.enemyBase
  let best: Structure | null = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0) continue
    if (s.kind !== 'HQ' && s.kind !== 'FOB') continue
    const w = Math.hypot(s.x - base.x, s.y - base.y) * (s.kind === 'HQ' ? 0.5 : 1)
    if (w < bd) { bd = w; best = s }
  }
  return best ? best.id : null
}

// economy of force: a secondary objective to FIX with one group while the main
// body concentrates. The most forward player installation that ISN'T the main
// effort — a FOB/OP/airfield the player pushed out — and only if it's a genuine
// second axis (well clear of the main effort), else none.
function pickSupportingEffort(mainId: number | null): number | null {
  const base = S.map!.enemyBase
  const main = mainId != null ? S.structures.find(s => s.id === mainId) : null
  let best: Structure | null = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || s.id === mainId) continue
    if (!s.sight && s.kind !== 'FOB' && s.kind !== 'HQ') continue // real installations only
    const d = Math.hypot(s.x - base.x, s.y - base.y) // most forward = nearest home
    if (d < bd) { bd = d; best = s }
  }
  if (!best) return null
  // not a distinct axis if it sits on top of the main effort
  if (main && Math.hypot(best.x - main.x, best.y - main.y) < 1800) return null
  return best.id
}

function updateOpforCmd(dt: number): void {
  const cmd = S.opforCmd
  // posture: a player force massing on our base (≳2.5 platoons within 2.6 km)
  // flips the whole OPFOR to the defensive — committed groups get recalled to
  // crush the overextension. Wave modes never defend (no base of their own).
  if (!S.waves && S.map) {
    const base = S.map.enemyBase
    let threat = 0
    for (const u of S.units) {
      if (u.side === 'friend' && u.strength > 0
        && Math.hypot(u.x - base.x, u.y - base.y) < 2600) threat += u.strength
    }
    cmd.posture = threat > 260 ? 'defend' : 'attack'
  } else {
    cmd.posture = 'attack'
  }
  // main + supporting efforts: persistent, re-evaluated slowly and whenever the
  // main target falls
  cmd.effortT -= dt
  const alive = cmd.effortId != null
    && S.structures.some(s => s.id === cmd.effortId && s.side === 'friend' && s.buildT <= 0)
  if (!alive || cmd.effortT <= 0) {
    cmd.effortT = 45
    cmd.effortId = pickMainEffort()
    cmd.supportId = pickSupportingEffort(cmd.effortId)
  }
}

// the objective for a battlegroup, per the operational commander: the hill in
// KotH, the base in defensive posture (rally home to counterattack), the
// supporting objective for the designated fixing group, else the shared main
// effort — falling back to the group's own nearest target only if none is set.
function groupObjective(grp: Battlegroup, mem: Unit[]): Vec2 {
  if (S.hill) return { x: S.hill.x, y: S.hill.y }
  // campaign scripts the objective directly (e.g. the reinforcement retaking a town)
  if (S.campaign?.opforObj) return S.campaign.opforObj
  const cmd = S.opforCmd
  if (cmd.posture === 'defend' && S.map) return { x: S.map.enemyBase.x, y: S.map.enemyBase.y }
  if (grp.effort === 'support' && cmd.supportId != null) {
    const sup = S.structures.find(s => s.id === cmd.supportId)
    if (sup) return { x: sup.x, y: sup.y }
  }
  if (cmd.effortId != null) {
    const eff = S.structures.find(s => s.id === cmd.effortId)
    if (eff) return { x: eff.x, y: eff.y }
  }
  return enemyObjective(centroidOf(mem.filter(u => u.bgRole === 'main')) || centroidOf(mem)!)
}

// assign a fresh group its operational role: the single fixing element when a
// supporting effort exists and none is currently live, otherwise part of the
// main body. Economy of force — at most one supporting group at a time.
function assignEffort(grp: Battlegroup): void {
  const cmd = S.opforCmd
  const supportLive = S.enemyGroups.some(g => g !== grp && !g.dead && g.effort === 'support')
  grp.effort = (cmd.supportId != null && !supportLive) ? 'support' : 'main'
}

function groupStrength(g: Battlegroup): number {
  let s = 0
  for (const id of g.members) {
    const u = S.units.find(x => x.id === id)
    if (u && u.strength > 0) s += u.strength
  }
  return s
}

// hold this fresh group as the reserve? Only once there's real pressure already
// committed (≥2 groups advancing) and no reserve is live — never hold back the
// opening blow. Not while defending (everything commits) or in wave modes.
function shouldReserve(grp: Battlegroup): boolean {
  if (S.opforCmd.posture === 'defend' || S.waves) return false
  const committed = S.enemyGroups.filter(g => g !== grp && !g.dead && g.phase === 'advance').length
  const reserveLive = S.enemyGroups.some(g => g !== grp && !g.dead && g.phase === 'reserve')
  return committed >= 2 && !reserveLive
}

// commit the reserve when it can be decisive: counterattack a defensive
// posture, sustain a culminating attack (committed force worn below half), or
// on a staleness timeout so it never just sits.
function reserveShouldCommit(grp: Battlegroup, dt: number): boolean {
  if (S.opforCmd.posture === 'defend') return true
  grp.reserveT = (grp.reserveT ?? 180) - dt
  if (grp.reserveT <= 0) return true
  const committed = S.enemyGroups.filter(g => g !== grp && !g.dead && g.phase === 'advance')
  if (committed.length) {
    const str = committed.reduce((s, g) => s + groupStrength(g), 0)
    const init = committed.reduce((s, g) => s + g.initStr, 0)
    if (init > 0 && str < init * 0.5) return true
  } else {
    return true // nothing left committed — commit the reserve rather than idle
  }
  return false
}

// Muster a battlegroup of the given composition at a base. Shared by the
// economy-driven spawner below and the wave scheduler (Base Defense mode).
function raiseGroup(
  comp: readonly UnitTypeKey[], name: string,
  base: { x: number; y: number }, musterT: number,
): number {
  const rng = S.rng!
  const gid = newMoveGroup()
  const grp: Battlegroup = {
    id: gid, name, phase: 'muster',
    musterT, retaskT: 0, objective: null,
    members: [], initStr: comp.length * 100, dead: false,
  }
  // muster at the base that's actually fielding them, not a fixed map coordinate
  const bx = base.x, by = base.y
  for (const t of comp) {
    const u = spawnEnemy(t, bx + (rng() - 0.5) * 500, by + (rng() - 0.5) * 300 + 150)
    u.aiRole = 'bg'
    u.bgGroup = gid
    u.bgRole = (t === 'SCT' || t === 'CAV') ? 'recon' : 'main'
    // recon screens & disengages; the main body advances to contact and fights
    orderRoe(u.id, u.bgRole === 'recon' ? 'break' : 'halt')
  }
  grp.members = S.units.filter(u => u.bgGroup === gid).map(u => u.id)
  S.enemyGroups.push(grp)
  return gid
}

// a live hostile HQ/FOB to field from — lose them all and the OPFOR is done reinforcing
function fieldingBase() {
  return S.structures.find(s => s.side === 'hostile' && s.buildT <= 0
    && (s.kind === 'HQ' || s.kind === 'FOB'))
}

function spawnBattlegroup(): void | null {
  // The OPFOR buys its battlegroups. It can only field what it has banked, so it can't
  // put everything on the board at once — and because it pays upkeep on what's already
  // out, a large standing force starves the next group. Same constraint the player has.
  // You can't field from a base you no longer hold — the same rule the player plays by.
  const base = fieldingBase()
  if (!base) return null

  // and it lives under the same force cap — a template that would breach it isn't fielded
  const room = forceCap('hostile') - forceCount('hostile')
  const affordable = BG_TEMPLATES.filter(t =>
    templateCost(t.comp) <= S.enemyResources && t.comp.length <= room)
  if (!affordable.length) return null
  const rng = S.rng!
  const tpl = affordable[Math.floor(rng() * affordable.length)]!
  S.enemyResources -= templateCost(tpl.comp)
  const musterT = 10 + rng() * 8
  raiseGroup(tpl.comp, tpl.name, base, musterT)
}

// Scripted assault for the wave modes: no affordability, no force cap — the
// schedule IS the difficulty. Returns null if the OPFOR has no base left.
export function spawnScriptedBattlegroup(comp: readonly UnitTypeKey[], name: string): number | null {
  const base = fieldingBase()
  if (!base) return null
  const rng = S.rng!
  const musterT = 5 + rng() * 5
  return raiseGroup(comp, name, base, musterT)
}

// Campaign spawn: muster a scripted group at a GIVEN point (not the far enemy
// base) — the campaign places the OPFOR itself, so reinforcements assemble near
// the fight and advance on S.campaign.opforObj (see groupObjective). Short muster.
export function spawnCampaignGroup(
  comp: readonly UnitTypeKey[], name: string, from: { x: number; y: number },
): number {
  const musterT = 3 + S.rng!() * 3
  return raiseGroup(comp, name, from, musterT)
}

function updateBattlegroup(grp: Battlegroup, dt: number): void {
  const mem = grp.members
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0)
  if (!mem.length) { grp.dead = true; return }
  const curStr = mem.reduce((s, u) => s + u.strength, 0)

  if (grp.phase === 'muster') {
    grp.musterT -= dt
    if (grp.musterT <= 0) {
      if (shouldReserve(grp)) {
        grp.phase = 'reserve'
        grp.reserveT = 180
      } else {
        assignEffort(grp)
        grp.objective = groupObjective(grp, mem)
        grp.phase = 'advance'
      }
    }
    return
  }

  // reserve: hold near home (dug in, a defensive backstop) until the commander
  // commits it — then it joins the fight like any other group
  if (grp.phase === 'reserve') {
    if (reserveShouldCommit(grp, dt)) {
      assignEffort(grp)
      grp.objective = groupObjective(grp, mem)
      grp.phase = 'advance'
      for (const u of mem) { u.posture = 'mobile'; u.digT = 0 }
      return
    }
    const base = S.map!.enemyBase
    for (const u of mem) {
      if (u.targetId || u.path.length) continue
      if (Math.hypot(u.x - base.x, u.y - base.y) > 700) orderMove(u.id, base.x, base.y)
      else if (u.posture !== 'dig') orderDefend(u.id, true)
    }
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
    const prev = grp.objective
    grp.objective = groupObjective(grp, mem)
    // a new objective ends a prepared defense and any maneuver scheme —
    // the idle-redirect below remobilizes everyone against the new aim
    if (prev && grp.objective
      && Math.hypot(prev.x - grp.objective.x, prev.y - grp.objective.y) > 400) {
      grp.digging = false
      grp.scheme = null
      grp.flankIds = []
    }
  }

  // commander decision cycle (the utility layer): supporting fires, smoke
  // screens, digging in on ground taken — choosing only among player-legal
  // orders (see decide.ts)
  grp.decideT = (grp.decideT ?? 0) - dt
  if (grp.phase === 'advance' && grp.decideT <= 0) {
    grp.decideT = 8 + S.rng!() * 4
    commanderDecide(grp, mem)
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
  updateOpforCmd(dt)

  S.nextWave -= dt
  if (S.nextWave <= 0) {
    const rng = S.rng!
    S.nextWave = 110 + rng() * 70
    spawnBattlegroup()
    if (S.t > 420 && rng() < 0.5) spawnBattlegroup() // escalate the tempo later
  }

  for (const grp of S.enemyGroups) updateBattlegroup(grp, dt)
  S.enemyGroups = S.enemyGroups.filter(g => !g.dead)

  // the base battery answers assaults on the base network (defensive fires —
  // same windows and racks as everything else)
  garrisonFires()

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
