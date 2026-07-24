// The campaign: one battalion's operation fought as a SEQUENCE of missions on a
// single persistent world. Nothing resets between missions — the world is built
// once (the mode's setup → startCampaign) and each mission is an objective +
// allocation + OPFOR-script OVERLAY on the same live state, advanced softly in
// the tick (runCampaign) without ever routing through the match-end freeze.
//
// Objectives are DATA, not code (see CampaignState): each is an ObjectiveSpec —
// a `kind` plus flat params — evaluated by the pure `evalObjective` switch. That
// keeps campaign state fully serializable for the (deferred) Save/Continue.
import { S } from './state'
import type { GameState, CampaignState, Structure } from './GameState'

// The campaign is always fought on the SAME ground: one baked real-world theater
// (Chorwon Valley — the Iron Triangle), Large size, one fixed seed → an identical,
// hand-vetted map every playthrough. App.begin forces these when gameMode is
// 'campaign'; the per-mission AO crop (below) windows each mission on that map.
export const CAMPAIGN_THEATER = 'chorwon'
export const CAMPAIGN_SEED = 1

// Guided-tutorial choice for the NEXT campaign start. Set by the splash (via
// App.begin) just before initGame; startCampaign reads it. Kept as a module flag
// because initGame's signature is shared across modes and shouldn't grow a param.
let _tutorialPending = false
export function setCampaignTutorial(on: boolean): void { _tutorialPending = on }
import type { Vec2 } from '../world/WorldMap'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'
import { STRUCTURES } from '../domains/installations/catalog'
import { deployUnit } from '../domains/installations/orders'
import { spawnEnemy } from '../domains/forces/factory'
import { spawnCampaignGroup } from '../domains/opfor/ai'
import { nearestLand, clampWorld } from '../world/place'
import { radio, toast } from '../domains/comms/radio'

// Palette gate: outside the campaign everything is allowed; inside, the current
// mission decides what the player may do (M1 locks fielding + support to keep the
// intro clean, drones only). Checked at the order entry points. Reads the shared
// singleton — the order domains import THIS at runtime, a benign eval-safe cycle.
export function campaignAllows(kind: 'field' | 'support' | 'drone'): boolean {
  const c = S.campaign
  if (!c) return true
  return c.allow[kind]
}

// ---------------------------------------------------------------------------
// Objective specs — the six-verb vocabulary. M1+M2 use four; the rest land with
// later missions. Params are flat and plain so the whole spec serializes.
// ---------------------------------------------------------------------------
export type ObjKind = 'clear-area' | 'defeat-group' | 'build' | 'deliver'

export interface ObjectiveSpec {
  id: string
  label: string
  kind: ObjKind
  zone?: { x: number; y: number; r: number }   // clear-area / build locus
  groupTag?: string                             // defeat-group: the scripted group's name
  structKind?: StructureTypeKey                 // build: what to stand up
  amount?: number                               // deliver: supply to land at the target
}

export interface Mission {
  id: string
  name: string
  brief: string                                 // situation + task from higher (briefing modal)
  objectives: ObjectiveSpec[]
  setup(S: GameState): void                      // allocations, palette gates, OPFOR placement
  onObjComplete?(S: GameState, idx: number): void // scripted triggers (e.g. spawn the counterattack)
}

// ---------------------------------------------------------------------------
// Objective evaluation — pure reads of S. Returns 0..1 progress + a done latch.
// ---------------------------------------------------------------------------
function friendlyFob(S: GameState): Structure | null {
  return S.structures.find(s => s.side === 'friend' && s.kind === 'FOB') || null
}

function inZone(u: { x: number; y: number }, z: { x: number; y: number; r: number }): boolean {
  return Math.hypot(u.x - z.x, u.y - z.y) <= z.r
}

export function evalObjective(o: ObjectiveSpec, S: GameState, c: CampaignState): { progress: number; done: boolean } {
  switch (o.kind) {
    case 'clear-area': {
      const z = o.zone
      if (!z) return { progress: 0, done: false } // zone is filled at mission setup
      const live = S.units.filter(u => u.side === 'hostile' && u.strength > 0 && inZone(u, z)).length
      return { progress: live === 0 ? 1 : 0, done: live === 0 }
    }
    case 'defeat-group': {
      // only defeatable once the scripted group has actually been spawned
      // (onObjComplete stamps c.eventT at spawn — see below)
      if (c.eventT == null) return { progress: 0, done: false }
      const exists = S.enemyGroups.some(g => !g.dead && g.name === o.groupTag)
      return { progress: exists ? 0 : 1, done: !exists }
    }
    case 'build': {
      const z = o.zone
      const s = S.structures.find(st => st.side === 'friend' && st.kind === o.structKind
        && (!z || inZone(st, z)))
      if (!s) return { progress: 0, done: false }
      if (s.buildT <= 0) return { progress: 1, done: true }
      const total = STRUCTURES[o.structKind!].buildTime || 1
      return { progress: Math.max(0, Math.min(0.99, 1 - s.buildT / total)), done: false }
    }
    case 'deliver': {
      const fob = friendlyFob(S)
      const amt = o.amount || 1
      if (!fob) return { progress: 0, done: false }
      const delivered = Math.max(0, (fob.stock || 0) - c.deliverBase)
      return { progress: Math.min(1, delivered / amt), done: delivered >= amt }
    }
  }
}

// ---------------------------------------------------------------------------
// Mission content — M1 (CLEAR & HOLD) and M2 (SET UP THE FOB). More land later.
// ---------------------------------------------------------------------------
const M1_FORCE: readonly UnitTypeKey[] = ['MECH', 'INF', 'INF', 'SCT'] // carries drones; enough to clear + hold
const M1_GARRISON: readonly UnitTypeKey[] = ['INF', 'INF']            // the 1–2 defenders holding the town
const M1_REINFORCE: readonly UnitTypeKey[] = ['MECH', 'INF']          // the counterattack that tries to retake

// muster point for the counterattack: off the enemy-ward side of the town so it
// advances IN, not a march from the far map edge
function reinforceFrom(S: GameState, town: Vec2): Vec2 {
  const eb = S.map!.enemyBase
  const dx = eb.x - town.x, dy = eb.y - town.y
  const L = Math.hypot(dx, dy) || 1
  const x = clampWorld(S.map, town.x + (dx / L) * 1300)
  const y = clampWorld(S.map, town.y + (dy / L) * 1300)
  return nearestLand(S.map!, x, y)
}

// the M1/M2 mission window: the pocket enclosing the HQ and the objective town.
// Both early missions are fought here, so they share this AO crop.
function pocketAO(S: GameState, town: Vec2): { x0: number; y0: number; x1: number; y1: number } {
  const hq = S.map!.fob, pad = 750, W = S.map!.WORLD
  return {
    x0: Math.max(0, Math.min(hq.x, town.x) - pad),
    y0: Math.max(0, Math.min(hq.y, town.y) - pad),
    x1: Math.min(W, Math.max(hq.x, town.x) + pad),
    y1: Math.min(W, Math.max(hq.y, town.y) + pad),
  }
}

// place a small starting force in a shallow arc facing the map interior
function placeForce(S: GameState, comp: readonly UnitTypeKey[], around: Vec2, radius: number): void {
  const n = comp.length
  const toward = Math.atan2(S.map!.WORLD / 2 - around.y, S.map!.WORLD / 2 - around.x)
  comp.forEach((k, i) => {
    const a = toward + (n > 1 ? (i / (n - 1) - 0.5) * 1.4 : 0)
    const p = nearestLand(S.map!, around.x + Math.cos(a) * radius, around.y + Math.sin(a) * radius)
    deployUnit(k, p.x, p.y, true)
  })
}

export const MISSIONS: readonly Mission[] = [
  {
    id: 'lodgment',
    name: 'LODGMENT',
    brief:
      'TASK FORCE, THIS IS HIGHER. You have a foothold ashore. Push inland and '
      + 'seize the crossroads town to your front — it owns the road net. Expect a '
      + 'light garrison, and a local counterattack once you take it. No fielding, no '
      + 'fires this phase; your platoons and their organic UAS are what you have. '
      + 'CLEAR THE TOWN. HOLD IT.',
    objectives: [
      { id: 'clear', label: 'CLEAR THE TOWN', kind: 'clear-area' },
      { id: 'hold', label: 'DEFEAT THE COUNTERATTACK', kind: 'defeat-group', groupTag: 'REINFORCEMENT' },
    ],
    setup(S) {
      const c = S.campaign!
      const town = c.strongpoint
      // this phase: no fielding, no support; organic drones only
      c.allow = { field: false, support: false, drone: true }
      // the town garrison — loose defenders that hold where they sit
      M1_GARRISON.forEach((k, i) => {
        const p = nearestLand(S.map!, town.x + (i - 0.5) * 160, town.y + 80)
        spawnEnemy(k, p.x, p.y)
      })
      // the fixed force, near the HQ
      placeForce(S, M1_FORCE, S.map!.fob, 260)
      // the counterattack (spawned on clear) will advance on the town
      c.opforObj = { x: town.x, y: town.y }
      // fill the objective zones now that the anchor is known
      MISSIONS[0]!.objectives[0]!.zone = { x: town.x, y: town.y, r: 420 }
      // crop the AO to the HQ + town pocket — the intro is a contained fight, not
      // a march across the whole theater (camera/pan clamp to this box)
      c.ao = pocketAO(S, town)
    },
    onObjComplete(S, idx) {
      if (idx !== 0) return // town cleared → the enemy counterattacks to retake it
      const c = S.campaign!
      const from = reinforceFrom(S, c.strongpoint)
      spawnCampaignGroup(M1_REINFORCE, 'REINFORCEMENT', from)
      c.eventT = S.t // mark the group live so defeat-group can latch
      radio('NET', 'contact', 'COUNTERATTACK INBOUND — HOSTILE ARMOR MOVING ON THE TOWN', from.x, from.y)
      toast('COUNTERATTACK INBOUND')
    },
  },
  {
    id: 'lines-of-supply',
    name: 'LINES OF SUPPLY',
    brief:
      'GOOD WORK ON THE CROSSROADS. Make it stick. Engineers and a logistics '
      + 'platoon are pushing up to you from the rear — bring them forward and '
      + 'establish a FOB in the town, then run a supply line up to it. You may '
      + 'field a unit or two off the allocation if you need them. ESTABLISH THE FOB. '
      + 'OPEN THE SUPPLY LINE.',
    objectives: [
      { id: 'fob', label: 'ESTABLISH THE FOB', kind: 'build', structKind: 'FOB' },
      { id: 'route', label: 'OPEN THE SUPPLY LINE', kind: 'deliver', amount: 200 },
    ],
    setup(S) {
      const c = S.campaign!
      const town = c.strongpoint
      // carryover: M1 units persist untouched. This phase adds only.
      c.allow = { field: true, support: false, drone: true }
      c.opforObj = null // the counterattack is beaten; no scripted pressure this phase
      c.ao = pocketAO(S, town) // same mission window as M1 — the FOB fight stays local
      S.resources += 400 // allocation from higher
      // engineers + logistics arrive at the HQ; the player moves them forward
      const eng = nearestLand(S.map!, S.map!.fob.x - 120, S.map!.fob.y + 200)
      deployUnit('ENG', eng.x, eng.y, true)
      const log = nearestLand(S.map!, S.map!.fob.x + 120, S.map!.fob.y + 200)
      deployUnit('LOG', log.x, log.y, true)
      // scope the FOB objective to the town
      MISSIONS[1]!.objectives[0]!.zone = { x: town.x, y: town.y, r: 520 }
    },
  },
]

// ---------------------------------------------------------------------------
// Runner — called from the campaign ModeSpec (setup / update / checkEnd).
// ---------------------------------------------------------------------------

// pick the campaign's anchor town: the one nearest the player's corner
function pickAnchorTown(S: GameState): Vec2 {
  const fob = S.map!.fob
  let best: Vec2 | null = null, bd = Infinity
  for (const t of S.map!.towns) {
    const d = Math.hypot(t.x - fob.x, t.y - fob.y)
    if (d < bd) { bd = d; best = { x: t.x, y: t.y } }
  }
  // fallback: a point a third of the way toward the enemy base
  if (!best) {
    const eb = S.map!.enemyBase
    best = nearestLand(S.map!, fob.x + (eb.x - fob.x) * 0.33, fob.y + (eb.y - fob.y) * 0.33)
  }
  return best
}

// Build the campaign world ONCE and start mission 1. Called from the mode's
// setup (which runs after initGame staged the default map + friendly HQ).
export function startCampaign(S: GameState): void {
  // strip the default A&D staging down to the campaign's clean slate: keep only
  // the friendly command post; the campaign places every hostile itself.
  S.structures = S.structures.filter(s => s.side === 'friend' && s.kind === 'HQ')
  S.units = []
  S.enemyGroups = []
  S.nextWave = Infinity        // no economy-driven waves — missions script the OPFOR
  S.enemyResources = 0
  S.enemySupplyLift = 0
  S.opforCmd.posture = 'attack'

  const town = pickAnchorTown(S)
  S.campaign = {
    mission: 0, objIdx: 0, briefed: false, debrief: false, complete: false,
    status: [], hold: 0, delivered: 0, deliverBase: 0, eventT: null,
    opforObj: null, allow: { field: false, support: false, drone: true }, ao: null,
    tutorial: _tutorialPending, tutStep: 0,
    strongpoint: town, crossing: null, centerTown: null,
    rearStructIds: [], rearUnitIds: [],
  }
  startMission(S, 1)
}

// Begin mission n (1-based): reset per-mission trackers, run its setup overlay,
// and raise its briefing (which pauses the sim until acknowledged).
export function startMission(S: GameState, n: number): void {
  const c = S.campaign!
  const m = MISSIONS[n - 1]!
  c.mission = n
  c.objIdx = 0
  c.eventT = null
  c.deliverBase = 0
  c.debrief = false
  c.briefed = false
  c.ao = null // default: full theater; a mission's setup crops it if it wants
  c.tutStep = 0 // tutorial restarts its step counter each mission
  c.status = m.objectives.map((_, i) => (i === 0 ? 'active' : 'pending'))
  m.setup(S)
  onObjActivate(S, c) // capture any baseline the first objective needs
  S.speed = 0         // hold for the briefing modal; ackBriefing resumes
}

// Acknowledge the current briefing (UI ACKNOWLEDGE) and resume the sim.
export function ackBriefing(S: GameState): void {
  const c = S.campaign
  if (!c) return
  c.briefed = true
  if (S.speed === 0) S.speed = 1
}

// Continue past a mission debrief (UI CONTINUE) into the next mission.
export function continueCampaign(S: GameState): void {
  const c = S.campaign
  if (!c || !c.debrief) return
  startMission(S, c.mission + 1)
}

// capture whatever baseline the now-active objective needs to measure progress
function onObjActivate(S: GameState, c: CampaignState): void {
  const obj = MISSIONS[c.mission - 1]!.objectives[c.objIdx]
  if (obj && obj.kind === 'deliver') {
    const fob = friendlyFob(S)
    c.deliverBase = fob ? (fob.stock || 0) : 0
  }
}

// Per-tick runner. Advances objectives and missions on the live world; the
// campaign never freezes/resets between missions (that's the whole point).
export function runCampaign(S: GameState, _dt: number): void {
  const c = S.campaign
  if (!c || c.complete || c.debrief) return
  if (!c.briefed) return                    // waiting on the briefing modal
  const m = MISSIONS[c.mission - 1]!
  const obj = m.objectives[c.objIdx]
  if (!obj) return
  const { done } = evalObjective(obj, S, c)
  if (!done) return

  c.status[c.objIdx] = 'done'
  radio('NET', 'arrive', `OBJECTIVE COMPLETE — ${obj.label}`, undefined, undefined)
  m.onObjComplete?.(S, c.objIdx)
  c.objIdx++

  if (c.objIdx >= m.objectives.length) {
    // mission complete: last mission wins the campaign, otherwise debrief → next
    if (c.mission >= MISSIONS.length) {
      c.complete = true // checkEnd lands the win
    } else {
      c.debrief = true
      S.speed = 0
      toast(`${m.name} COMPLETE`)
    }
    return
  }

  c.status[c.objIdx] = 'active'
  c.hold = 0
  c.delivered = 0
  onObjActivate(S, c)
}
