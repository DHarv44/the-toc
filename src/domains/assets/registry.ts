// Division asset registry (ASSET-REQUESTS.md): the REAL pool of allocatable
// assets, built from Pack.assets at init. Pure data construction — the
// request pipeline lives in service.ts/update.ts.
import type { AssetsState, AssetInstance } from '../../engine/GameState'
import type { Pack } from '../../packs'

export function buildAssetRegistry(pack: Pack): AssetsState {
  const pool: AssetInstance[] = []
  for (const [kind, def] of Object.entries(pack.assets ?? {})) {
    for (let i = 1; i <= (def.count ?? 0); i++) {
      pool.push({ id: `${kind}-${i}`, kind, state: 'available' })
    }
  }
  return { pool, pending: [], queue: [], windows: [], unlocks: [] }
}

// Campaign scripting: hand a pooled instance to a sister formation so
// scarcity is real from mission one. (Releases come back through
// releaseFromFormation as the operation progresses.)
export function preAllocate(assets: AssetsState, kind: string, holder: string): void {
  const inst = assets.pool.find(a => a.kind === kind && a.state === 'available')
  if (inst) { inst.state = 'allocated'; inst.holder = holder }
}

// a sister formation gives an instance back to the division pool
export function releaseFromFormation(assets: AssetsState, kind: string, holder: string): AssetInstance | null {
  const inst = assets.pool.find(a => a.kind === kind && a.state === 'allocated' && a.holder === holder)
  if (!inst) return null
  inst.state = 'available'
  delete inst.holder
  return inst
}
