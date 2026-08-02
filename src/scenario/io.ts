// SCENARIO I/O — the seam between the builder's world-metre entities and the
// pack-norm scenario.json on disk. Conversion goes through the SAME frame
// math the sim uses (world/pack/frame), so a scenario lands exactly where it
// was authored on any rebuild of the same box.
import type { Ground } from '../world/pack/loadGround'
import { frameOf, normToWorld, worldToNorm } from '../world/pack/frame'
import type { ScenarioSpec, ScenarioStructure, ScenarioUnit } from './types'
import { type Entity, freshId } from './edit'

export function entitiesFromSpec(spec: ScenarioSpec, ground: Ground): Entity[] {
  const f = frameOf(ground.files.manifest)
  const w = (p: { x: number; y: number }) => normToWorld(f, p.x, p.y)
  return [
    ...spec.structures.map((s): Entity => ({ ...s, id: freshId(), ent: 'structure', ...w(s) })),
    ...spec.units.map((u): Entity => ({
      ...u, id: freshId(), ent: 'unit', ...w(u),
      route: u.route?.map(p => w(p)),
    })),
  ]
}

export function specFromEntities(
  meta: Pick<ScenarioSpec, 'name' | 'map' | 'mode' | 'sides' | 'fog'>,
  entities: Entity[], ground: Ground,
): ScenarioSpec {
  const f = frameOf(ground.files.manifest)
  const n = (p: { x: number; y: number }) => {
    const { nx, ny } = worldToNorm(f, p.x, p.y)
    return { x: nx, y: ny }
  }
  const structures: ScenarioStructure[] = []
  const units: ScenarioUnit[] = []
  for (const e of entities) {
    if (e.ent === 'structure') {
      const { id: _id, ent: _e, x: _x, y: _y, ...rest } = e
      structures.push({ ...rest, ...n(e) })
    } else {
      const { id: _id, ent: _e, x: _x, y: _y, route, ...rest } = e
      units.push({ ...rest, ...n(e), ...(route?.length ? { route: route.map(p => n(p)) } : {}) })
    }
  }
  return { ...meta, structures, units }
}

/** Write through the dev route (pack-io) — dev-only, like every pack save. */
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
