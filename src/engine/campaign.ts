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
import type { GameState, CampaignState, Soldier, StaffShop, Structure } from './GameState'

// The campaign is CONTENT, and content lives in the PACK (packs/README.md,
// src/PACK-MISSIONS.md): the active pack's campaign folder ships the map
// (theater + seed + authored layout = the gazetteer), the missions (objectives,
// triggers, briefs), and every word of the story. This file keeps the VERBS:
// objective evaluation, the trigger/effect moments, the runner, the reports.
import type { CampaignSpec, MissionSpec, MissionCondition, PlaceRef } from '../packs/types'

// the campaign being played: the player pack's first campaign (a campaign
// PICKER lands when a pack ships more than one)
export function activeCampaign(): CampaignSpec {
  const list = playerPack().campaigns
  if (!list?.length) throw new Error(`pack '${playerPack().id}' ships no campaigns`)
  return list[0]!
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
import type { StructureTypeKey } from '../domains/installations/catalog'
import { STRUCTURES } from '../domains/installations/catalog'
import { nearestLand } from '../world/place'
import { radio, toast } from '../domains/comms/radio'
import { playerPack } from '../packs'
import { buildDivisionOrg, setBnCommander } from '../packs/org'
import { locRef } from '../world/ref'
import { hashStr } from '../lib/math'
import { pipelineBacklog } from '../domains/forces/pipeline'
import { preAllocate } from '../domains/assets/registry'
import { resolveAnchor, resolvePlace } from './missions/places'
import { runEffects } from './missions/effects'

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
  zone?: { x: number; y: number; r: number }   // clear-area / build locus (resolved at activation)
  groupTag?: string                             // defeat-group: the scripted group's name
  structKind?: StructureTypeKey                 // build: what to stand up
  amount?: number                               // deliver: supply to land at the target
}

// The runtime operation view: the campaign's MAINLINE missions flattened into
// one objective stream (today's model; concurrent mission INSTANCES — the
// side-mission enabler — are stage S4 of PACK-MISSIONS.md). Each runtime
// objective remembers its mission, so activation/completion fire that
// mission's triggers, and its zone SPEC, resolved to world coords when it
// goes active.
export interface RuntimeObjective extends ObjectiveSpec {
  missionId: string
  zoneSpec?: { place: PlaceRef; r: number }
  // a FRAGO-bearing mission's first objective — the tracker reveals the
  // stream only up to the next one of these (taskings pop up, no spoilers)
  revealPoint?: boolean
}

export interface Operation {
  name: string
  brief: string                                  // the opening OPORD (the one modal, campaign start)
  objectives: RuntimeObjective[]
}

let _op: Operation | null = null
export function operation(): Operation {
  if (!_op) buildOperation()
  return _op!
}
function buildOperation(): void {
  const spec = activeCampaign()
  const objectives: RuntimeObjective[] = []
  for (const mid of spec.manifest.mainline) {
    const m = spec.missions[mid]
    if (!m) throw new Error(`campaign '${spec.manifest.id}': mainline mission '${mid}' not found`)
    m.objectives.forEach((o, i) => {
      objectives.push({
        id: o.id, label: o.label, kind: o.kind, groupTag: o.groupTag,
        structKind: o.structKind, amount: o.amount,
        missionId: mid, zoneSpec: o.zone,
        revealPoint: i === 0 && !!m.frago,
      })
    })
  }
  _op = {
    name: spec.manifest.operation,
    brief: spec.missions[spec.manifest.mainline[0]!]?.brief ?? '',
    objectives,
  }
}

// Fire a mission's triggers for an objective MOMENT (activation/completion).
// Effects run in declaration order (engine/missions/effects.ts). The wider
// per-tick condition vocabulary (timers, structure-exists…) lands with the
// side-mission pool (S4).
function momentMatches(when: MissionCondition, kind: 'objective-active' | 'objective-complete', objective: string): boolean {
  if (when.kind === 'all') return when.of.every(w => momentMatches(w, kind, objective))
  if (when.kind === 'any') return when.of.some(w => momentMatches(w, kind, objective))
  return when.kind === kind && when.objective === objective
}
function fireTriggers(S: GameState, mission: MissionSpec, kind: 'objective-active' | 'objective-complete', objective: string): void {
  for (const t of mission.triggers) {
    if (momentMatches(t.when, kind, objective)) runEffects(S, t.do)
  }
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

// (Mission content — briefs, force lists, garrisons, triggers — lives in the
// pack: src/packs/<id>/campaigns/<campaign>/missions/*.json. The old OPERATION
// table's scripted bodies became mission triggers executed by
// engine/missions/effects.ts.)

// ---------------------------------------------------------------------------
// Runner — called from the campaign ModeSpec (setup / update / checkEnd).
// ---------------------------------------------------------------------------

// Build the campaign world ONCE and start mission 1. Called from the mode's
// setup (which runs after initGame staged the default map + friendly HQ).
export function startCampaign(S: GameState): void {
  const spec = activeCampaign()
  _op = null // rebuild the runtime operation view for this campaign
  buildOperation()
  // strip the default A&D staging down to the campaign's clean slate: the
  // friendly command post AND its airstrip — the lodgment's airfield is
  // division-echelon infrastructure that exists at H-hour (a battalion doesn't
  // build one; that would be its own tasking) — plus the ENEMY HQ far north,
  // which stays on the board as KNOWN intel (a battalion knows where the
  // enemy's main base is; it's why the operation exists). The campaign places
  // every hostile unit.
  S.structures = S.structures.filter(s =>
    (s.side === 'friend' && (s.kind === 'HQ' || s.kind === 'AFLD'))
    || (s.side === 'hostile' && s.kind === 'HQ'))
  for (const st of S.structures) if (st.side === 'hostile') S.structContacts.add(st.id)
  // the battalion CP gets a NAME, like every real position does — and the
  // strip carries the same one (it's the CP's airfield). Names are CAMPAIGN data.
  for (const st of S.structures) {
    if (st.side === 'friend' && st.kind === 'HQ') st.label = spec.manifest.hqLabel
    if (st.side === 'friend' && st.kind === 'AFLD') st.label = spec.manifest.airfieldLabel
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
  // scarcity is real from mission one: sister formations hold most of the
  // division's assets at H-hour; the operation's progress frees them
  // (mission triggers release with net traffic). The list is CAMPAIGN data.
  for (const pa of spec.manifest.preAllocations) preAllocate(S.assets, pa.asset, pa.formation)

  // campaign anchors: named points resolved once against the built map and
  // stored — mission place refs resolve against them by name
  const anchors: Record<string, Vec2> = {}
  for (const [name, q] of Object.entries(spec.manifest.anchors)) anchors[name] = resolveAnchor(S, q)
  const town = anchors.strongpoint ?? resolveAnchor(S, { query: 'town-nearest', to: 'player-hq' })
  const op = operation()
  S.campaign = {
    objIdx: 0, briefed: false, frago: null, complete: false,
    // the opening OPORD is the first entry in the recallable orders log
    fragoLog: [{ title: op.name, text: op.brief, t: 0 }],
    status: op.objectives.map(() => 'pending'),
    hold: 0, delivered: 0, deliverBase: 0, eventT: null,
    opforObj: null, allow: { field: true, support: false, drone: true },
    frontY: town.y + 500, // provisional; objective activations re-anchor it
    commander: _commanderPending,
    // DIVISION MAIN sits in the deep rear — higher headquarters as a place on
    // the map (inert: it does nothing, it is simply THERE). Position is
    // CAMPAIGN data (fraction of the world).
    divHq: nearestLand(S.map!,
      S.map!.WORLD * spec.manifest.divHq.atFrac.x, S.map!.WORLD * spec.manifest.divHq.atFrac.y),
    tutorial: _tutorialPending, tutStep: 0, tutBreakShown: false, dustwunSeen: [],
    reports: { pending: [], log: [] },
    anchors, strongpoint: town, crossing: null, centerTown: null,
    rearStructIds: [], rearUnitIds: [],
  }
  activateObjective(S, S.campaign) // objective 1 stages the opening fight
  S.speed = 0                      // hold for the opening briefing; ackBriefing resumes
}

// Make the objective at c.objIdx ACTIVE: resolve its zone, fire its mission's
// activation triggers, capture any measurement baseline, and (after the
// opener) drop the mission's FRAGO card when its FIRST objective goes active.
// The sim is never paused here — new taskings pop up while the world runs.
function activateObjective(S: GameState, c: CampaignState): void {
  const obj = operation().objectives[c.objIdx]
  if (!obj) return
  const mission = activeCampaign().missions[obj.missionId]!
  c.status[c.objIdx] = 'active'
  c.hold = 0
  c.delivered = 0
  if (obj.zoneSpec) {
    const p = resolvePlace(S, obj.zoneSpec.place)
    obj.zone = { x: p.x, y: p.y, r: obj.zoneSpec.r }
  }
  fireTriggers(S, mission, 'objective-active', obj.id)
  if (obj.kind === 'deliver') {
    const fob = friendlyFob(S)
    c.deliverBase = fob ? (fob.stock || 0) : 0
  }
  if (mission.frago && mission.objectives[0]!.id === obj.id && c.briefed) {
    c.frago = { title: mission.frago.title, text: mission.frago.text }
    c.fragoLog.push({ ...mission.frago, t: S.t })
    radio('NET', 'arrive', `FRAGO — ${mission.frago.title}. DIV HQ ON THE VTC.`, undefined, undefined)
    toast(`FRAGO — ${mission.frago.title}`)
  }
}

// Reopen a received order from the log — as a DOCUMENT, not a call: the deck
// for review, no connect beat, no CG on the line.
export function recallFrago(S: GameState, idx: number): void {
  const c = S.campaign
  const e = c?.fragoLog[idx]
  if (c && e) c.frago = { title: e.title, text: e.text, review: true }
}

// ---------------------------------------------------------------------------
// Staff reports (P3 follow-on). Each shop produces ITS report — the S1's is
// the PERSTAT. Request (or post-mission auto) → prep delay → alert; the FIRST
// open is a VTC with the S1 on the line reading it, afterwards it's just the
// document. ROADMAP: the prep delay scales with the OIC's experience.
// ---------------------------------------------------------------------------
const dtgOf = (t: number): string =>
  `${String(Math.floor(t / 3600)).padStart(2, '0')}${String(Math.floor(t / 60) % 60).padStart(2, '0')}Z`

// the BILLET that owns each shop (org-structure wiring — engine machinery);
// everything human-facing (names, report titles, descriptions) is PACK data
const SHOPS: Record<StaffShop, { pos: string; alt?: string }> = {
  s1: { pos: 'S1 — Personnel', alt: 'S1 NCOIC' },
  s2: { pos: 'S2 — Intelligence' },
  s3: { pos: 'S3 — Operations', alt: 'Operations NCO' },
  s4: { pos: 'S4 — Logistics' },
}

const reportName = (shop: StaffShop): string =>
  playerPack().staff?.[shop]?.report ?? shop.toUpperCase()
const shopTitle = (shop: StaffShop): string =>
  (playerPack().staff?.[shop]?.full ?? shop).toUpperCase()

// the officer holding a shop's billet (or its NCOIC when the OIC is down)
export function shopOfficer(S: GameState, shop: StaffShop): Soldier | null {
  const bn = playerPack().formation?.playerBn
  const spec = SHOPS[shop]
  for (const sl of S.org?.slots ?? []) {
    if (sl.bn !== bn) continue
    const s = sl.soldiers.find(x => x.pos === spec.pos && x.status === 'FIT')
      ?? (spec.alt ? sl.soldiers.find(x => x.pos === spec.alt && x.status === 'FIT') : undefined)
    if (s) return s
  }
  return null
}
export const s1Officer = (S: GameState): Soldier | null => shopOfficer(S, 's1')

const officerCall = (S: GameState, shop: StaffShop): string => {
  const o = shopOfficer(S, shop)
  return o ? `${o.rank} ${(o.name ?? '').split(' ').pop()}` : shop.toUpperCase()
}

export function queueReport(S: GameState, auto = false, shop: StaffShop = 's1'): void {
  const c = S.campaign
  if (!c) return
  if (c.reports.pending.some(p => p.shop === shop)) return // that desk is already drafting
  const delay = 20 + (Math.abs(hashStr(`${shop}:${S.t.toFixed(1)}`)) % 100) / 10 // 20–30 s
  c.reports.pending.push({ shop, readyT: S.t + delay, auto })
  if (!auto) {
    radio(officerCall(S, shop), 'request',
      `ROGER — ${reportName(shop)} IN PREP, FIGURES TO FOLLOW`, undefined, undefined)
  }
}

// The PERSTAT: personnel ONLY (vics belong to the S4's LOGSTAT). Composed from
// the live roster the moment it lands.
function composePerstat(S: GameState): string {
  let asg = 0, fit = 0, wiaRtd = 0, wiaEvac = 0, kia = 0, mia = 0, repl = 0, ph = 0
  const tally = (list: Soldier[]) => {
    for (const s of list) {
      if (!s.replaced) asg++
      if (s.status === 'FIT') fit++
      else if (s.status === 'WIA') { if (s.evac) wiaEvac++; else wiaRtd++ }
      else if (s.status === 'KIA') kia++
      else if (s.status === 'MIA') mia++
      if (s.repl) repl++
      if ((s.awards ?? []).includes('PURPLE_HEART')) ph++
    }
  }
  for (const u of S.units) if (u.side === 'friend') tally(u.soldiers)
  for (const sl of S.org?.slots ?? []) if (sl.tf && sl.type && sl.unitId == null) tally(sl.soldiers)
  const backlog = pipelineBacklog()
  const nextPkt = Math.max(0, Math.ceil((S.replT - S.t) / 60))
  const dustwun = S.downed.filter(d => d.side === 'friend' && !d.resolved)
  const promos = S.stats.promotions ?? 0
  const s1 = s1Officer(S)
  const pct = asg ? Math.round(fit / asg * 100) : 100
  return (
    `PERSTAT AS OF ${dtgOf(S.t)}.\n\n`
    + `1. STRENGTH. Task force assigned ${asg}, fit for duty ${fit} — ${pct} percent.\n\n`
    + `2. LOSSES. ${kia} KIA. ${wiaRtd + wiaEvac} WIA — ${wiaRtd} under care expected to return, `
    + `${wiaEvac} evacuated out of theater. ${mia} MIA.\n\n`
    + `3. DUSTWUN. ${dustwun.length ? dustwun.map(d => `${d.label} unresolved, LKP ${locRef(S.map!, d.x, d.y)}`).join('; ') + '. Recovery is the fastest thing we can do for those soldiers.'
      : 'No open cases.'}\n\n`
    + `4. REPLACEMENTS. ${backlog} billets requested with rear detachment. `
    + `${repl} replacements integrated to date. Next packet estimated ${nextPkt} minutes. `
    + 'Units absorb at a friendly base only.\n\n'
    + `5. PERSONNEL ACTIONS. ${promos} battlefield promotion${promos === 1 ? '' : 's'} processed. `
    + `${ph} Purple Heart${ph === 1 ? '' : 's'} awarded to date.\n\n`
    + `S1 SENDS. ${s1 ? `${(s1.name ?? '').split(' ').pop()}, ${s1.rank}.` : ''}`
  )
}

// The LOGSTAT: materiel ONLY — motorpool, munitions posture, forward stock,
// and the division asset board. Personnel belong to the S1.
function composeLogstat(S: GameState): string {
  let ok = 0, dam = 0, dest = 0
  const stow: Record<string, number> = {}
  let idfRounds = 0
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    for (const v of u.vehicles) {
      if (v.status === 'OK') ok++
      else if (v.status === 'DAMAGED') dam++
      else dest++
    }
    for (const [k, n] of Object.entries(u.stowage)) stow[k] = (stow[k] ?? 0) + (n ?? 0)
    idfRounds += u.ammo ?? 0
  }
  const orPct = ok + dam + dest ? Math.round(ok / (ok + dam + dest) * 100) : 100
  const fobs = S.structures.filter(s => s.side === 'friend' && s.kind === 'FOB')
  const stock = fobs.reduce((n, s) => n + Math.floor(s.stock || 0), 0)
  const convoys = S.units.filter(u => u.side === 'friend' && u.convoy).length
  const clv = Object.entries(stow).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => `${k} ${Math.floor(n)}`).join(', ')
  const A = S.assets
  const alloc = A.pool.filter(a => a.holder === 'TF' && a.state === 'allocated').length
  const moving = A.pool.filter(a => a.state === 'enroute' || a.state === 'setup').length
  return (
    `LOGSTAT AS OF ${dtgOf(S.t)}.\n\n`
    + `1. EQUIPMENT. ${ok} vehicles mission capable, ${dam} in maintenance, ${dest} combat losses — `
    + `OR rate ${orPct} percent.\n\n`
    + `2. CLASS V. Fires basic load ${idfRounds} rounds across the tubes. `
    + `Stowage on hand: ${clv || 'nominal'}.\n\n`
    + `3. FORWARD STOCK. ${stock} at ${fobs.length} FOB${fobs.length === 1 ? '' : 'S'}; ${convoys} convoy${convoys === 1 ? '' : 's'} running.\n\n`
    + `4. DIVISION ASSETS. ${alloc} allocated to the task force, ${moving} inbound or emplacing, `
    + `${A.queue.length} on the waiting list${A.favor > 0 ? `; command favor is working for us` : ''}.\n\n`
    + `S4 SENDS.`
  )
}

// The INTSUM: the enemy picture as the COP actually knows it.
function composeIntsum(S: GameState): string {
  let live = 0, stale = 0, unknown = 0
  const notable: string[] = []
  for (const [, ct] of S.contacts) {
    if (ct.unknown) unknown++
    else if (ct.live) live++
    else stale++
    if (ct.live && notable.length < 6) notable.push(`${ct.type} ${locRef(S.map!, ct.x, ct.y)}`)
  }
  const drones = S.drones.filter(d => !d.tether)
  const aero = S.drones.some(d => d.tether != null)
  return (
    `INTSUM AS OF ${dtgOf(S.t)}.\n\n`
    + `1. ENEMY. ${live} contacts held LIVE, ${stale} stale last-known, ${unknown} assessed but unidentified. `
    + `${S.stats.enemyDestroyed} enemy elements destroyed to date.\n\n`
    + `2. CURRENT TRACKS. ${notable.length ? notable.join('; ') + '.' : 'No live tracks this period.'}\n\n`
    + `3. COLLECTION. ${drones.length} UAS airborne${aero ? ', aerostat coverage over the base network' : ''}. `
    + 'Assessment confidence follows coverage — what we cannot see, we do not know.\n\n'
    + `S2 SENDS.`
  )
}

// The OPSUM: the fight as it stands — objectives, posture, forces committed.
function composeOpsum(S: GameState, c: CampaignState): string {
  const obj = operation().objectives[c.objIdx]
  const done = c.status.filter(s => s === 'done').length
  const inContact = S.units.filter(u => u.side === 'friend' && S.t - u.lastCombatT < 60).length
  const fielded = S.units.filter(u => u.side === 'friend' && !u.respFrom).length
  const dustwun = S.downed.filter(d => d.side === 'friend' && !d.resolved).length
  return (
    `OPSUM AS OF ${dtgOf(S.t)}.\n\n`
    + `1. OPERATION ${operation().name}. ${done}/${operation().objectives.length} objectives complete. `
    + `Current: ${obj ? obj.label : 'OPERATION COMPLETE'}.\n\n`
    + `2. FORCES. ${fielded} elements fielded, ${inContact} in contact this hour.\n\n`
    + `3. INCIDENTS. ${dustwun ? `${dustwun} personnel recovery site${dustwun === 1 ? '' : 's'} OPEN.` : 'No open recovery tasks.'}\n\n`
    + `S3 SENDS.`
  )
}

const COMPOSERS: Record<StaffShop, (S: GameState, c: CampaignState) => string> = {
  s1: (S) => composePerstat(S),
  s2: (S) => composeIntsum(S),
  s3: (S, c) => composeOpsum(S, c),
  s4: (S) => composeLogstat(S),
}

function deliverReports(S: GameState, c: NonNullable<GameState['campaign']>): void {
  for (let i = c.reports.pending.length - 1; i >= 0; i--) {
    const p = c.reports.pending[i]!
    if (S.t < p.readyT) continue
    c.reports.pending.splice(i, 1)
    const name = reportName(p.shop)
    c.reports.log.push({
      id: S.counters.nextId++, shop: p.shop, title: `${name} ${dtgOf(S.t)}`,
      t: S.t, text: COMPOSERS[p.shop](S, c), read: false,
    })
    radio(officerCall(S, p.shop), 'arrive',
      `${name} COMPLETE — ${p.auto ? 'POST-MISSION FIGURES' : 'AS REQUESTED'}, STANDING BY TO BRIEF`,
      undefined, undefined)
    toast(`${p.shop.toUpperCase()} ${name} READY`)
  }
}

// Open a report: first time is the CALL (the shop officer on the line, no
// operation deck), afterwards just the document. Never stomps a live FRAGO.
export function openReport(S: GameState, id: number): void {
  const c = S.campaign
  const e = c?.reports.log.find(x => x.id === id)
  if (!c || !e || c.frago) return
  const o = shopOfficer(S, e.shop)
  const speaker = o
    ? { name: `${o.rank} ${o.name ?? ''}`.trim(), title: shopTitle(e.shop) }
    : { name: e.shop.toUpperCase(), title: shopTitle(e.shop) }
  c.frago = { title: e.title, text: e.text, speaker, docOnly: true, review: e.read, shop: e.shop }
  e.read = true
}

export function unreadReports(S: GameState, shop?: StaffShop): number {
  return S.campaign?.reports.log.filter(e => !e.read && (!shop || e.shop === shop)).length ?? 0
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
  // PERSONNEL RECOVERY taskings: a platoon going DUSTWUN raises a FRAGO —
  // higher wants that ground secured and those soldiers accounted for.
  // (Resolution reports come from the recovery sweep itself.)
  for (const site of S.downed) {
    if (site.side !== 'friend' || c.dustwunSeen.includes(site.id)) continue
    c.dustwunSeen.push(site.id)
    if (site.respFrom) {
      // a HIGHER-echelon convoy down in the AO: their people, your ground.
      // Helping is a CHOICE — favor with division and a salvage chance if
      // you do, no mark against you if you don't.
      const text =
        `TASK FORCE, THIS IS HIGHER. A ${site.respFrom} convoy is down in your AO — `
        + `last known ${locRef(S.map!, site.x, site.y)}, personnel status UNKNOWN. `
        + 'This is DIVISION\'S problem, not your tasking — but you are the closest force. '
        + 'If you can put an element on that grid, division will remember it, and there '
        + 'may be equipment worth recovering. Your call, commander. NO TASKING FOLLOWS.'
      c.fragoLog.push({ title: `DIVISION CONVOY DOWN — ${site.label}`, text, t: S.t })
      if (!c.frago) c.frago = { title: `DIVISION CONVOY DOWN — ${site.label}`, text }
      radio('NET', 'request', `${site.respFrom} CONVOY DOWN IN AO — ASSIST OPTIONAL, ${site.label} LKP`, site.x, site.y)
      continue
    }
    const text =
      `TASK FORCE, THIS IS HIGHER. We show ${site.label} — ${site.lineage ?? 'UNKNOWN ELEMENT'} — `
      + `off the net, last known ${locRef(S.map!, site.x, site.y)}. Status of personnel UNKNOWN. `
      + 'Get an element to that grid and SECURE IT. Every minute matters for the wounded; '
      + 'if the enemy holds that ground, our people become prisoners. '
      + 'A medical element on the recovery will save lives. FIND THEM. BRING THEM HOME.'
    c.fragoLog.push({ title: `PERSONNEL RECOVERY — ${site.label}`, text, t: S.t })
    if (!c.frago) c.frago = { title: `PERSONNEL RECOVERY — ${site.label}`, text }
    radio('NET', 'request', `PERSONNEL RECOVERY TASKED — ${site.label} LKP, SECURE AND SWEEP`, site.x, site.y)
  }
  // staff reports: a pending PERSTAT lands after its prep delay
  deliverReports(S, c)

  const obj = operation().objectives[c.objIdx]
  if (!obj) return
  const { done } = evalObjective(obj, S, c)
  if (!done) return

  c.status[c.objIdx] = 'done'
  radio('NET', 'arrive', `OBJECTIVE COMPLETE — ${obj.label}`, undefined, undefined)
  fireTriggers(S, activeCampaign().missions[obj.missionId]!, 'objective-complete', obj.id)
  // the WHOLE staff drafts post-mission figures unprompted — in parallel
  for (const shop of ['s1', 's2', 's3', 's4'] as const) queueReport(S, true, shop)
  c.objIdx++

  if (c.objIdx >= operation().objectives.length) {
    c.complete = true // operation complete: checkEnd lands the win
    return
  }
  activateObjective(S, c) // the next tasking pops up; the world keeps running
}
