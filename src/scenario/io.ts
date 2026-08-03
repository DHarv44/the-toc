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

export function situationFromEntities(entities: Entity[], ground: Ground): ScenarioSituation {
  const f = frameOf(ground.files.manifest)
  const n = (p: { x: number; y: number }) => {
    const { nx, ny } = worldToNorm(f, p.x, p.y)
    return { x: nx, y: ny }
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
  return { structures, units, ...(places.length ? { places } : {}) }
}

/** Write a scenario through the dev route (pack-io) — dev-only, like every
 *  pack save. The server picks the disk form: flat file, or folder with
 *  missions as NN-id.json files when the scenario has missions. */
export async function saveScenario(packId: string, scenarioId: string, spec: ScenarioSpec): Promise<void> {
  const res = await fetch(`/__gwscenario?pack=${packId}&id=${scenarioId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}
