// APPLY A SCENARIO — authored content enters the sim through this ONE path:
// the campaign's situation.json (startCampaign), the skirmish scenario flow,
// the builder's PLAY loop, and (E3) Zeus placements all call the same verbs
// the player's own orders use — addStructure / deployUnit / spawnEnemy —
// so nothing placed by an author behaves differently from something placed
// in play. Composition-root family (like engine/scenario.ts): allowed to
// import the domains.
import type { GameState, Unit, Roe, WeaponsControl } from './GameState'
import type { ScenarioSpec, ScenarioUnit } from '../scenario/types'
import type { UnitTypeKey } from '../domains/forces/catalog'
import { frameOf, normToWorld } from '../world/pack/frame'
import { R_TRACK } from '../world/WorldMap'
import { nearestRoadVertex, stampTrack } from '../world/access'
import { invalidateRoadGraph } from '../world/pack/roadGraph'
import { addStructure, deployUnit } from '../domains/installations/orders'
import { spawnEnemy } from '../domains/forces/factory'
import { orderMove } from '../domains/forces/orders'
import { formBattlegroup } from '../domains/opfor/ai'
import { siteAssetAt } from '../domains/assets/service'
import { drawSlotIn } from '../packs/org'
import { playerPack } from '../packs'
import { defaultStructureLabel } from '../packs/orgquery'

function applyUnitAttrs(unit: Unit, u: ScenarioUnit): void {
  if (u.heading != null) unit.heading = u.heading
  if (u.dug) { unit.posture = 'dig'; unit.digT = 1 } // fortified BEFORE H-hour
  if (u.roe) unit.roe = u.roe as Roe
  if (u.weapons) unit.weapons = u.weapons as WeaponsControl
}

// H-hour intel: what the BLUFOR picture already holds about a hostile.
// 'known' = a stale contact at truth, type identified; 'suspected' = the
// last-known template — an UNKNOWN contact scattered off truth (the marker is
// deliberately not where the unit is; scouts still have to find them).
function seedIntel(S: GameState, unit: Unit, u: ScenarioUnit): void {
  if (!u.intel) return
  const scatter = u.intel === 'suspected' ? (u.scatter ?? 400) : 0
  S.contacts.set(unit.id, {
    x: unit.x + (S.rng!() - 0.5) * scatter,
    y: unit.y + (S.rng!() - 0.5) * scatter,
    type: unit.type, lastSeen: 0, live: false, strength: 100,
    unknown: u.intel === 'suspected',
  })
}

// Field an authored friendly platoon FROM ITS OWN FORMATION. The pack ships
// the whole division, so a sister brigade's platoon is a real element with
// real people — it draws that battalion's slot, not one of the player's. When
// the formation has no such platoon free (an authoring error, or a formation
// that simply does not field the type), it is placed WITHOUT a draw and says
// so, rather than quietly consuming the player's task force.
function fieldForFormation(S: GameState, u: ScenarioUnit, p: { x: number; y: number }): Unit | null {
  const type = u.type as UnitTypeKey
  const bn = u.formation
  if (!bn || bn === S.chair) return deployUnit(type, p.x, p.y, true)

  const slot = S.org ? drawSlotIn(S.org, type, bn) : null
  const unit = deployUnit(type, p.x, p.y, true, slot ? { slot } : { noSlot: true })
  if (!unit) return null
  if (!slot) {
    console.warn(`[scenario] ${bn} has no ${type} platoon free — placed without an org slot`)
    unit.lineage = bn
  }
  unit.cmd = bn
  if (u.attached) unit.attached = true
  return unit
}

/** Apply a scenario's SITUATION — the H-hour placement — onto a BUILT world
 *  (S.map ready). Deterministic: scatter draws go through S.rng in
 *  declaration order. */
export function applyScenario(S: GameState, spec: ScenarioSpec): void {
  const f = frameOf(S.map!.ground!.files.manifest)
  const w = (p: { x: number; y: number }) => normToWorld(f, p.x, p.y)
  const sit = spec.situation

  if (spec.fog != null) S.fogEnabled = spec.fog

  // the authored gazetteer — script place refs resolve against these names
  // (engine/missions/places.ts checks it right after the builtin anchors)
  S.scenarioPlaces = new Map((sit.places ?? []).map(p => {
    const pt = w(p)
    return [p.name, { x: pt.x, y: pt.y, ...(p.r != null ? { r: p.r } : {}) }]
  }))

  // AUTHOR-DRAWN ROADS, laid BEFORE the structures so a base sited on one
  // gates onto it. Through the same machinery an in-game road-building
  // element uses: ends junction-snapped onto the network, pushed to
  // S.engRoads (serialized — restore re-lays them for free) and the map,
  // stamped into the raster, and the router re-junctioned once.
  const m = S.map!
  for (const line of sit.engineerRoads ?? []) {
    if (line.length < 2) continue
    let pts = line.map(p => w(p))
    const s0 = nearestRoadVertex(m, pts[0]!)
    if (s0) pts = [{ x: s0.x, y: s0.y }, ...pts]
    const s1 = nearestRoadVertex(m, pts[pts.length - 1]!)
    if (s1) pts = [...pts, { x: s1.x, y: s1.y }]
    S.engRoads.push(pts)
    m.roads.push({ cls: R_TRACK, pts })
    stampTrack(m, pts)
  }
  if (sit.engineerRoads?.length) invalidateRoadGraph(m)

  for (const st of sit.structures) {
    const p = w(st)
    // an unnamed installation belonging to somebody else names itself by
    // echelon — DIV MAIN, 1ABCT MAIN — rather than HQ-7
    const label = st.label
      ?? (st.side === 'friend'
        ? defaultStructureLabel(playerPack(), st.kind, st.formation, S.chair)
        : undefined)
    const s = addStructure(st.side, st.kind, p.x, p.y, label, !st.building, st.formation)
    if (st.stock != null) s.stock = st.stock
    // AUTHORED anatomy: the author dragged facilities to these spots in the
    // builder (metre offsets from the anchor) — pre-fill what the lazy
    // default layout would otherwise derive; unauthored keys still derive.
    if (st.fac) {
      s.facPts = {}
      for (const [k, o] of Object.entries(st.fac)) {
        s.facPts[k] = { x: p.x + o.dx, y: p.y + o.dy }
      }
    }
    if (st.side === 'hostile' && st.intel === 'known') S.structContacts.add(s.id)
    // assets the author sited here are already emplaced and operational — the
    // same effects a delivered one applies (facility/tether/unlock), through
    // the same service. Asking for more than the division owns is an
    // authoring error, reported rather than silently swallowed.
    for (const a of st.assets ?? []) {
      for (let i = 0; i < Math.max(0, a.qty); i++) {
        if (!siteAssetAt(a.asset, s)) {
          console.warn(`[scenario] ${s.label}: no ${a.asset} left in the division pool`)
          break
        }
      }
    }
  }
  // the builtin anchors follow the placed HQs (same rule as the dev sandbox):
  // player-hq / enemy-base resolve to where the author put the headquarters
  const hq = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  if (hq) S.map!.fob = { x: hq.x, y: hq.y }
  const ehq = S.structures.find(s => s.side === 'hostile' && s.kind === 'HQ')
  if (ehq) S.map!.enemyBase = { x: ehq.x, y: ehq.y }

  // units — friendly through the fielding verb (free placement, garrison
  // troops stay home), hostiles through the factory (garrison AI role)
  const placed: { unit: Unit; authored: ScenarioUnit }[] = []
  for (const u of sit.units) {
    const p = w(u)
    let unit: Unit | null = null
    if (u.side === 'friend') {
      if (u.garrison) continue // in garrison at H-hour — the commander calls it up
      unit = fieldForFormation(S, u, p)
    } else {
      unit = spawnEnemy(u.type as UnitTypeKey, p.x, p.y)
      seedIntel(S, unit, u)
    }
    if (!unit) continue
    placed.push({ unit, authored: u })
    for (const wp of u.route ?? []) {
      const q = w(wp)
      orderMove(unit.id, q.x, q.y, true)
    }
  }

  // tagged hostiles become BATTLEGROUPS in place — defeat-group objectives
  // and triggers reference the tag
  const tagged = new Map<string, Unit[]>()
  for (const { unit, authored } of placed) {
    if (authored.side === 'hostile' && authored.tag) {
      tagged.set(authored.tag, [...(tagged.get(authored.tag) ?? []), unit])
    }
  }
  for (const [tag, units] of tagged) formBattlegroup(tag, units)

  // authored attributes LAST: the author's explicit heading/dug/ROE/weapons
  // outlive any default the factory or group formation set
  for (const { unit, authored } of placed) applyUnitAttrs(unit, authored)
}
