// The campaign: one battalion's OPERATION on a single persistent world — a
// STREAM OF OBJECTIVES that activate in sequence on the live state, not a set
// of missions-as-game-modes. The world is built once (the mode's setup →
// startCampaign); each objective's activation is a scripted overlay (allocations,
// palette gates, OPFOR placement, FRAGO card) advanced softly in the tick
// (runCampaign) without ever routing through the match-end freeze.
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

// The authored campaign geography (designed 2026-07-24 with the layout-preview
// harness): the SE window of the chorwon patch — an open southern valley walled
// by the HILL 894 ridge east and hill country west, a major river system
// mid-map, opening north toward the plain. The town chain IS the campaign
// spine, south → north: ASHFORD (the lodgment fight — OBJ KEATON / FOB KEATON)
// → BREVIK (river crossing) → CALDER (crossroads) → DORAN (valley mouth) → the
// enemy base on the northern edge; ELMSTED hangs west off the MSR as a flank
// objective. Roads/hamlets/features still generate procedurally from these nodes.
import type { MapLayout } from '../world/mapgen'
export const CAMPAIGN_LAYOUT: MapLayout = {
  window: { ox: 256, oy: 224 },
  fob: { gx: 128, gy: 232 },
  enemyBase: { gx: 148, gy: 18 },
  // spacing math (2026-07-24): ASHFORD sits 3.1 km up the MSR — ~4× the
  // garrison's 800 m sight/weapon bubble, ~12-16 min of game time for the whole
  // M1 arc — NORTH of the southern river branch, with the MSR bridge 1.35 km
  // short of town (the approach march crosses unobserved). Later bounds run
  // 1.8-2.7 km each up the spine.
  // spine towns first (order = road-node indices), then the wider world:
  // VALEMONT is the big city in the enemy's northwest — a later-campaign prize;
  // FALKE and GARWICK flesh out the west and the northern approaches.
  towns: [
    { gx: 130, gy: 170, name: 'ASHFORD', size: 7 },
    { gx: 104, gy: 143, name: 'BREVIK', size: 6 },
    { gx: 130, gy: 104, name: 'CALDER', size: 7 },
    { gx: 158, gy: 60, name: 'DORAN', size: 6 },
    { gx: 62, gy: 132, name: 'ELMSTED', size: 5 },
    { gx: 52, gy: 44, name: 'VALEMONT', size: 11 },
    { gx: 38, gy: 92, name: 'FALKE', size: 5 },
    { gx: 96, gy: 26, name: 'GARWICK', size: 6 },
  ],
  // the MSR is AUTHORED: HQ → ASHFORD → BREVIK → CALDER → DORAN → enemy base.
  // (Node ids: 0 = fob, 1.. = towns in order, last = enemy base.) Without this
  // the MST would reroute the trunk through the western towns.
  msr: [0, 1, 2, 3, 4, 9],
  // NON-DEPLOYABLE infrastructure in the emptier parts of the theater — named
  // places that later missions anchor on (and where unknown threats wait):
  // the dam on the western river, VALEMONT's power plant, the northern rail
  // yard, a depot in the far NE, the comm site on the east ridge, a ford on
  // the southern branch east of ASHFORD, a refugee camp south of FALKE.
  features: [
    { gx: 44, gy: 118, kind: 'dam', name: 'HANGYE DAM' },
    { gx: 63, gy: 52, kind: 'power', name: 'VALEMONT POWER' },
    { gx: 108, gy: 14, kind: 'rail', name: 'NORTH RAILHEAD' },
    { gx: 214, gy: 44, kind: 'depot', name: 'DEPOT 9' },
    { gx: 224, gy: 132, kind: 'comm', name: 'RELAY SITE ECHO' },
    { gx: 168, gy: 186, kind: 'ford', name: 'HORSESHOE FORD' },
    { gx: 34, gy: 110, kind: 'camp', name: 'CAMP HOPE' },
  ],
}

// Guided-tutorial choice for the NEXT campaign start. Set by the splash (via
// App.begin) just before initGame; startCampaign reads it. Kept as a module flag
// because initGame's signature is shared across modes and shouldn't grow a param.
let _tutorialPending = false
export function setCampaignTutorial(on: boolean): void { _tutorialPending = on }

// The player's name — the task force commander. Set by the splash's COMMANDER
// box just before initGame; startCampaign reads it (same pattern as the
// tutorial flag).
let _commanderPending = 'HARMON'
export function setCampaignCommander(name: string): void {
  _commanderPending = name.trim().toUpperCase() || 'HARMON'
}
import type { Vec2 } from '../world/WorldMap'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'
import { STRUCTURES } from '../domains/installations/catalog'
import { deployUnit } from '../domains/installations/orders'
import { orderMove } from '../domains/forces/orders'
import { spawnEnemy } from '../domains/forces/factory'
import { spawnCampaignGroup } from '../domains/opfor/ai'
import { nearestLand, clampWorld } from '../world/place'
import { radio, toast } from '../domains/comms/radio'
import { playerPack } from '../packs'
import { buildDivisionOrg, setBnCommander } from '../packs/org'

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

// An operation objective: the six-verb spec plus the scripted moment it goes
// ACTIVE. There are no mission containers — activation is where allocations
// arrive, palette gates open, OPFOR gets placed, the phase line moves, and (for
// follow-on taskings) the FRAGO card drops. The world never stops for any of it.
export interface CampaignObjective extends ObjectiveSpec {
  frago?: { title: string; text: string }        // tasking card dropped at activation (after the opener)
  onActivate?(S: GameState): void                // scripted setup the moment this objective goes active
  onComplete?(S: GameState): void                // scripted beat the moment it completes (e.g. naming the FOB)
}

export interface Operation {
  name: string
  brief: string                                  // the opening OPORD (the one modal, campaign start)
  objectives: CampaignObjective[]
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
      // (activation stamps c.eventT at spawn — see the operation table)
      if (c.eventT == null) return { progress: 0, done: false }
      // beaten = destroyed OR broken: a group the AI has put into WITHDRAW is
      // combat-ineffective and running — chasing its last survivor across the
      // map is not the mission
      const g = S.enemyGroups.find(g => !g.dead && g.name === o.groupTag)
      const beaten = !g || g.phase === 'withdraw'
      return { progress: beaten ? 1 : 0, done: beaten }
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
// 2-8 CAV organic slice, nothing borrowed (re-scoped 2026-07-25): the scouts
// screen, two Bradley platoons clear, the mortars support the hold. Fielding
// is OPEN from H-hour — the commander may call up any TF asset at any time.
const M1_FORCE: readonly UnitTypeKey[] = ['SCT', 'MECH', 'MECH', 'MOR']
// One second-line rifle platoon holds the town (tuned 2026-07-24 after the
// Phase 3 playtest: a full-AT urban garrison beats even proper tactics — see
// play-test_Mission1.md). Its Javelins are stripped in setup (AT4s only).
const M1_GARRISON: readonly UnitTypeKey[] = ['INF']
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

// The operation: one continuous fight, four objectives that pop up in turn.
// Follow-on taskings (the FOB and the supply line) drop as FRAGOs mid-battle —
// they are not a separate mission, just the next thing higher wants done.
export const OPERATION: Operation = {
  name: 'LODGMENT',
  brief:
    'TASK FORCE, THIS IS HIGHER. You have a foothold ashore. Push inland and '
    + 'seize the crossroads town to your front, designated OBJECTIVE KEATON — '
    + 'it owns the road net. Intel has marked UNKNOWN enemy contacts in the '
    + 'town, but they are CONCEALED in the buildings: you will not see them '
    + 'until your scouts find them or they open fire. Scouts screen forward — '
    + 'they are set to break contact if engaged. Expect a counterattack once '
    + 'you take the town. Your lead elements are 2-8 CAV: scouts, two Bradley '
    + 'platoons and the mortars. The rest of the task force is yours to call '
    + 'up from garrison as you see fit — no fires support yet. Follow-on '
    + 'taskings will come by FRAGO. FIND THEM. CLEAR OBJ KEATON. HOLD IT.',
  objectives: [
    {
      id: 'clear', label: 'CLEAR OBJ KEATON', kind: 'clear-area',
      onActivate(S) {
        const c = S.campaign!
        const town = c.strongpoint
        // opening posture: fielding OPEN (the TF is yours to commit), no fires
        // support yet; organic drones fly free
        c.allow = { field: true, support: false, drone: true }
        // COP baseline at H-hour: the objective town itself is assessed enemy —
        // the line runs just south of it, everything north shades red
        c.frontY = town.y + 500
        // the town garrison — loose defenders that hold where they sit.
        // Second-line troops: Javelins stripped (AT4s only), so armor that
        // respects the close-ambush band can actually break them. North side
        // of town (enemy-ward, away from the MSR bridge south of it — the
        // approach march must stay outside their 800 m sight/MG envelope).
        M1_GARRISON.forEach((k, i) => {
          const p = nearestLand(S.map!, town.x + (i - 0.5) * 160, town.y - 80)
          const g = spawnEnemy(k, p.x, p.y)
          g.stowage.M_JAVELIN = 0
          // pre-battle intel: the COP starts with what a battalion would know —
          // the garrison is a SUSPECTED position (stale contact, templated with
          // a couple hundred meters of error), not a live track. Scouts still
          // have to FIND them; contact goes live only when actually spotted.
          S.contacts.set(g.id, {
            x: p.x + (S.rng!() - 0.5) * 380, y: p.y + (S.rng!() - 0.5) * 380,
            type: k, lastSeen: 0, live: false, strength: 100,
            unknown: true, // presence assessed, composition unidentified — a "?"
          })
        })
        // the fixed force, near the HQ
        placeForce(S, M1_FORCE, S.map!.fob, 260)
        // scouts screen, they don't slug: the recon platoon starts on BREAK so
        // a concealed garrison springing on it triggers a break-contact drill,
        // not a stand-up fight (the tutorial's recon-forward flow depends on it)
        for (const u of S.units) {
          if (u.side === 'friend' && u.type === 'SCT') u.roe = 'break'
        }
        // scripted OPFOR (the counterattack, later) will advance on the town
        c.opforObj = { x: town.x, y: town.y }
        OPERATION.objectives[0]!.zone = { x: town.x, y: town.y, r: 420 }
        // the wider theater is NOT empty: garrisons sit on the infrastructure
        // out there, known to intel only as UNKNOWN contacts — reasons to go,
        // threats when you do. Far outside the M1 fight; they hold their ground.
        for (const site of [
          { x: 108 * 50, y: 14 * 50, comp: ['MECH', 'INF'] as const },   // NORTH RAILHEAD
          { x: 214 * 50, y: 44 * 50, comp: ['INF'] as const },           // DEPOT 9
          { x: 44 * 50, y: 118 * 50, comp: ['INF'] as const },           // HANGYE DAM
        ]) {
          site.comp.forEach((k, i) => {
            const p = nearestLand(S.map!, site.x + i * 140 - 70, site.y + 90)
            const g = spawnEnemy(k, p.x, p.y)
            S.contacts.set(g.id, {
              x: p.x + (S.rng!() - 0.5) * 500, y: p.y + (S.rng!() - 0.5) * 500,
              type: k, lastSeen: 0, live: false, strength: 100, unknown: true,
            })
          })
        }
      },
    },
    {
      id: 'hold', label: 'DEFEAT THE COUNTERATTACK', kind: 'defeat-group', groupTag: 'REINFORCEMENT',
      onActivate(S) {
        // town cleared → the enemy counterattacks to retake it
        const c = S.campaign!
        const from = reinforceFrom(S, c.strongpoint)
        spawnCampaignGroup(M1_REINFORCE, 'REINFORCEMENT', from)
        c.eventT = S.t // mark the group live so defeat-group can latch
        radio('NET', 'contact', 'COUNTERATTACK INBOUND — HOSTILE ARMOR MOVING ON THE TOWN', from.x, from.y)
        toast('COUNTERATTACK INBOUND')
      },
    },
    {
      id: 'fob', label: 'ESTABLISH FOB KEATON', kind: 'build', structKind: 'FOB',
      frago: {
        title: 'LINES OF SUPPLY',
        text:
          'GOOD WORK ON THE CROSSROADS. Make it stick. Engineers and a logistics '
          + 'platoon are pushing up to you from the rear — bring them forward and '
          + 'establish FOB KEATON in the town, then run a supply line up to it. '
          + 'You may field a unit or two off the allocation if you need them. '
          + 'ESTABLISH FOB KEATON. OPEN THE SUPPLY LINE.',
      },
      onActivate(S) {
        const c = S.campaign!
        const town = c.strongpoint
        // the town is held: fielding opens up, and the assessed line rolls
        // north, halfway to the next bound
        c.allow = { field: true, support: false, drone: true }
        c.opforObj = null // the counterattack is beaten; no scripted pressure now
        c.frontY = town.y - 1400
        S.resources += 400 // allocation from higher
        // engineers + logistics push up from the rear IN-WORLD: they enter at
        // the south map edge below the HQ and drive themselves to it —
        // reinforcements are something you watch arrive, not something that
        // materializes
        const W = S.map!.WORLD
        const entry = nearestLand(S.map!, S.map!.fob.x, W - 120)
        const rvEng = nearestLand(S.map!, S.map!.fob.x - 140, S.map!.fob.y + 220)
        const rvLog = nearestLand(S.map!, S.map!.fob.x + 140, S.map!.fob.y + 220)
        const eng = deployUnit('ENG', entry.x - 90, entry.y, true)
        if (eng) orderMove(eng.id, rvEng.x, rvEng.y)
        const log = deployUnit('LOG', entry.x + 90, entry.y, true)
        if (log) orderMove(log.id, rvLog.x, rvLog.y)
        OPERATION.objectives[2]!.zone = { x: town.x, y: town.y, r: 520 }
      },
      onComplete(S) {
        // the finished installation takes its name from the order
        const c = S.campaign!
        const fob = S.structures.find(st => st.side === 'friend' && st.kind === 'FOB'
          && Math.hypot(st.x - c.strongpoint.x, st.y - c.strongpoint.y) <= 520)
        if (fob) fob.label = 'FOB KEATON'
        radio('NET', 'arrive', 'FOB KEATON IS OPEN FOR BUSINESS', fob?.x, fob?.y)
      },
    },
    { id: 'route', label: 'OPEN THE SUPPLY LINE', kind: 'deliver', amount: 200 },
  ],
}

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
  // strip the default A&D staging down to the campaign's clean slate: the
  // friendly command post, plus the ENEMY HQ far north — which stays on the
  // board as KNOWN intel (a battalion knows where the enemy's main base is;
  // it's why the operation exists). The campaign places every hostile unit.
  S.structures = S.structures.filter(s =>
    (s.side === 'friend' && s.kind === 'HQ') || (s.side === 'hostile' && s.kind === 'HQ'))
  for (const st of S.structures) if (st.side === 'hostile') S.structContacts.add(st.id)
  // the battalion CP gets a NAME, like every real position does
  for (const st of S.structures) {
    if (st.side === 'friend' && st.kind === 'HQ') st.label = 'CP GARRYOWEN'
  }
  S.units = []
  S.counters.lineage = {} // the staged pre-campaign force never existed — slots start fresh
  // …and neither did its slot draws: reissue the division org, then put the
  // player's name on the 2-8 CAV command group (the player IS that battalion's CO)
  S.org = buildDivisionOrg(playerPack())
  if (S.org) setBnCommander(S.org, playerPack().formation?.playerBn ?? '2-8 CAV', _commanderPending)
  S.enemyGroups = []
  S.nextWave = Infinity        // no economy-driven waves — missions script the OPFOR
  S.enemyResources = 0
  S.enemySupplyLift = 0
  S.opforCmd.posture = 'attack'

  const town = pickAnchorTown(S)
  S.campaign = {
    objIdx: 0, briefed: false, frago: null, complete: false,
    // the opening OPORD is the first entry in the recallable orders log
    fragoLog: [{ title: OPERATION.name, text: OPERATION.brief, t: 0 }],
    status: OPERATION.objectives.map(() => 'pending'),
    hold: 0, delivered: 0, deliverBase: 0, eventT: null,
    opforObj: null, allow: { field: true, support: false, drone: true },
    frontY: town.y + 500, // provisional; objective activations re-anchor it
    commander: _commanderPending,
    // DIVISION MAIN sits in the deep rear, bottom-left — higher headquarters
    // as a place on the map (inert: it does nothing, it is simply THERE)
    divHq: nearestLand(S.map!, S.map!.WORLD * 0.08, S.map!.WORLD * 0.94),
    tutorial: _tutorialPending, tutStep: 0, tutBreakShown: false,
    strongpoint: town, crossing: null, centerTown: null,
    rearStructIds: [], rearUnitIds: [],
  }
  activateObjective(S, S.campaign) // objective 1 stages the opening fight
  S.speed = 0                      // hold for the opening briefing; ackBriefing resumes
}

// Make the objective at c.objIdx ACTIVE: run its scripted setup, capture any
// measurement baseline, and (after the opener) drop its FRAGO card. The sim is
// never paused here — new taskings pop up while the world runs.
function activateObjective(S: GameState, c: CampaignState): void {
  const obj = OPERATION.objectives[c.objIdx]
  if (!obj) return
  c.status[c.objIdx] = 'active'
  c.hold = 0
  c.delivered = 0
  obj.onActivate?.(S)
  if (obj.kind === 'deliver') {
    const fob = friendlyFob(S)
    c.deliverBase = fob ? (fob.stock || 0) : 0
  }
  if (obj.frago && c.briefed) {
    c.frago = obj.frago
    c.fragoLog.push({ ...obj.frago, t: S.t })
    radio('NET', 'arrive', `FRAGO — ${obj.frago.title}. DIV HQ ON THE VTC.`, undefined, undefined)
    toast(`FRAGO — ${obj.frago.title}`)
  }
}

// Reopen a received order from the log — as a DOCUMENT, not a call: the deck
// for review, no connect beat, no CG on the line.
export function recallFrago(S: GameState, idx: number): void {
  const c = S.campaign
  const e = c?.fragoLog[idx]
  if (c && e) c.frago = { title: e.title, text: e.text, review: true }
}

// Acknowledge the opening briefing (UI ACKNOWLEDGE) and resume the sim.
export function ackBriefing(S: GameState): void {
  const c = S.campaign
  if (!c) return
  c.briefed = true
  if (S.speed === 0) S.speed = 1
}

// Dismiss the current FRAGO card (read-only — the sim never stopped).
export function ackFrago(S: GameState): void {
  const c = S.campaign
  if (c) c.frago = null
}

// Per-tick runner. Advances the objective stream on the live world; nothing
// ever freezes or resets between objectives (that's the whole point).
export function runCampaign(S: GameState, _dt: number): void {
  const c = S.campaign
  if (!c || c.complete) return
  if (!c.briefed) return                    // waiting on the opening briefing
  const obj = OPERATION.objectives[c.objIdx]
  if (!obj) return
  const { done } = evalObjective(obj, S, c)
  if (!done) return

  c.status[c.objIdx] = 'done'
  radio('NET', 'arrive', `OBJECTIVE COMPLETE — ${obj.label}`, undefined, undefined)
  obj.onComplete?.(S)
  c.objIdx++

  if (c.objIdx >= OPERATION.objectives.length) {
    c.complete = true // operation complete: checkEnd lands the win
    return
  }
  activateObjective(S, c) // the next tasking pops up; the world keeps running
}
