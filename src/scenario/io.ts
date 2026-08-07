// SCENARIO I/O — the seam between the builder's world-metre entities and the
// pack-norm scenario file(s) on disk. Conversion goes through the SAME frame
// math the sim uses (world/pack/frame), so a scenario lands exactly where it
// was authored on any rebuild of the same box.
//
// The situation's entities are the builder's workspace; missions ride the
// spec untouched. On disk the server picks the form (SCENARIO-MODEL.md): one
// file until the scenario has missions, then a folder with missions as files.
import type { Ground } from '../world/pack/loadGround'
import { frameOf, normToWorld, worldToNorm } from '../world/pack/frame'
import type {
  ScenarioPlace, ScenarioSituation, ScenarioSpec, ScenarioStructure, ScenarioUnit,
} from './types'
import { type Entity, freshId } from './edit'
import { AUTHORING_OFF, canAuthor } from '../packs/io'

export function entitiesFromSituation(sit: ScenarioSituation, ground: Ground): Entity[] {
  const f = frameOf(ground.files.manifest)
  const w = (p: { x: number; y: number }) => normToWorld(f, p.x, p.y)
  return [
    ...sit.structures.map((s): Entity => ({ ...s, id: freshId(), ent: 'structure', ...w(s) })),
    ...sit.units.map((u): Entity => ({
      ...u, id: freshId(), ent: 'unit', ...w(u),
      route: u.route?.map(p => w(p)),
    })),
    ...(sit.places ?? []).map((p): Entity => ({ ...p, id: freshId(), ent: 'place', ...w(p) })),
  ]
}

/** The situation's author-drawn roads, in world metres for the bench. */
export function roadsFromSituation(sit: ScenarioSituation, ground: Ground): { x: number; y: number }[][] {
  const f = frameOf(ground.files.manifest)
  return (sit.engineerRoads ?? []).map(line => line.map(p => normToWorld(f, p.x, p.y)))
}

// Norm coords are written at SIX decimal places. The round trip through
// world metres and back is not bit-exact — a coordinate that went in as
// 0.1144 comes back as 0.11440000000000002 — so opening a scenario and
// saving it without touching anything produced a diff on every entity that
// had never moved. Six places is a few centimetres on any real box: far
// below the resolution of a symbol you place by hand, and far above the
// noise floor of the conversion.
const fix6 = (v: number) => Number(v.toFixed(6))

export function situationFromEntities(
  entities: Entity[], ground: Ground,
  roads: { x: number; y: number }[][] = [],
): ScenarioSituation {
  const f = frameOf(ground.files.manifest)
  const n = (p: { x: number; y: number }) => {
    const { nx, ny } = worldToNorm(f, p.x, p.y)
    return { x: fix6(nx), y: fix6(ny) }
  }
  const structures: ScenarioStructure[] = []
  const units: ScenarioUnit[] = []
  const places: ScenarioPlace[] = []
  for (const e of entities) {
    if (e.ent === 'structure') {
      const { id: _id, ent: _e, x: _x, y: _y, ...rest } = e
      structures.push({ ...rest, ...n(e) })
    } else if (e.ent === 'unit') {
      const { id: _id, ent: _e, x: _x, y: _y, route, ...rest } = e
      units.push({ ...rest, ...n(e), ...(route?.length ? { route: route.map(p => n(p)) } : {}) })
    } else {
      const { id: _id, ent: _e, x: _x, y: _y, ...rest } = e
      places.push({ ...rest, ...n(e) })
    }
  }
  return {
    structures, units,
    ...(places.length ? { places } : {}),
    ...(roads.length ? { engineerRoads: roads.map(line => line.map(p => n(p))) } : {}),
  }
}

/** Write a scenario through the dev route (pack-io) — dev-only, like every
 *  pack save. The server picks the disk form: flat file, or folder with
 *  missions as NN-id.json files when the scenario has missions. */
export async function saveScenario(packId: string, scenarioId: string, spec: ScenarioSpec): Promise<void> {
  // the route is a dev-only middleware; in a built game the request falls
  // through to the SPA and comes back as index.html with a 200, so `res.ok`
  // proves nothing. Ask first rather than trusting the status.
  if (!canAuthor) throw new Error(AUTHORING_OFF)
  const res = await fetch(`/__gwscenario?pack=${packId}&id=${scenarioId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}
