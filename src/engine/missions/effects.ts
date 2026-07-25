// Mission-effect executor (src/PACK-MISSIONS.md): every effect kind is engine
// code lifted from the old hardcoded OPERATION table, parameterized. Effects
// run in declaration order; all randomness through S.rng — the campaign
// battery gates any behavioral drift. `ctx.point` carries the point the last
// spawning/naming effect produced, for radio tagged `at: 'ctx'`.
import type { GameState } from '../GameState'
import type { Unit } from '../GameState'
import type { MissionEffect, MissionRadio } from '../../packs/types'
import type { Vec2 } from '../../world/WorldMap'
import type { UnitTypeKey } from '../../domains/forces/catalog'
import { nearestLand } from '../../world/place'
import { deployUnit } from '../../domains/installations/orders'
import { orderMove } from '../../domains/forces/orders'
import { spawnEnemy } from '../../domains/forces/factory'
import { spawnCampaignGroup } from '../../domains/opfor/ai'
import { releaseFromFormation } from '../../domains/assets/registry'
import { radio, toast } from '../../domains/comms/radio'
import { resolvePlace } from './places'

interface Ctx { point: Vec2 | null }

// a small starting force in a shallow arc facing the map interior
function placeForce(S: GameState, comp: readonly UnitTypeKey[], around: Vec2, radius: number): void {
  const n = comp.length
  const toward = Math.atan2(S.map!.WORLD / 2 - around.y, S.map!.WORLD / 2 - around.x)
  comp.forEach((k, i) => {
    const a = toward + (n > 1 ? (i / (n - 1) - 0.5) * 1.4 : 0)
    const p = nearestLand(S.map!, around.x + Math.cos(a) * radius, around.y + Math.sin(a) * radius)
    deployUnit(k, p.x, p.y, true)
  })
}

function sendRadio(r: MissionRadio, ctx: Ctx): void {
  const at = r.at === 'ctx' ? ctx.point : null
  radio(r.from, (r.cat ?? 'arrive') as Parameters<typeof radio>[1], r.text, at?.x, at?.y)
}

export function runEffects(S: GameState, effects: readonly MissionEffect[]): void {
  const c = S.campaign!
  const ctx: Ctx = { point: null }
  for (const e of effects) {
    switch (e.kind) {
      case 'set-allow':
        c.allow = { field: e.field, support: e.support, drone: e.drone }
        break
      case 'front-line':
        // offsetY rides in the place ref OR here; both land on the same point
        c.frontY = resolvePlace(S, e.place).y + (e.offsetY ?? 0)
        break
      case 'spawn-garrison': {
        // loose defenders that hold where they sit; spread on x, snapped to
        // land per position (old formula: base + i*spread - spread/2)
        const base = resolvePlace(S, e.at)
        const spread = e.spreadX ?? 0
        e.units.forEach((k, i) => {
          const p = nearestLand(S.map!, base.x + i * spread - spread / 2, base.y)
          const g = spawnEnemy(k, p.x, p.y)
          for (const key of e.strip ?? []) (g.stowage as Record<string, number>)[key] = 0
          if (e.contact) {
            // pre-battle intel: a SUSPECTED position — stale contact, templated
            // with scatter; scouts still have to FIND them
            S.contacts.set(g.id, {
              x: p.x + (S.rng!() - 0.5) * e.contact.scatter,
              y: p.y + (S.rng!() - 0.5) * e.contact.scatter,
              type: k, lastSeen: 0, live: false, strength: 100,
              unknown: e.contact.unknown ?? false,
            })
          }
          ctx.point = p
        })
        break
      }
      case 'place-force':
        placeForce(S, e.units, resolvePlace(S, e.at), e.radius)
        break
      case 'set-roe':
        for (const u of S.units) {
          if (u.side === 'friend' && u.type === e.type) u.roe = e.roe as Unit['roe']
        }
        break
      case 'opfor-objective': {
        if (e.place == null) { c.opforObj = null; break }
        const p = resolvePlace(S, e.place)
        c.opforObj = { x: p.x, y: p.y }
        break
      }
      case 'spawn-group': {
        const from = resolvePlace(S, e.at)
        spawnCampaignGroup(e.units, e.tag, from)
        c.eventT = S.t // mark the group live so defeat-group can latch
        ctx.point = from
        break
      }
      case 'deploy-column': {
        // rear reinforcements enter at a map edge IN-WORLD and drive to their
        // rendezvous — something you watch arrive, not a materialization
        const m = S.map!
        const anchor = resolvePlace(S, e.moveTo.anchor)
        const entry = nearestLand(m, anchor.x, m.WORLD - e.margin)
        const n = e.units.length
        e.units.forEach((k, i) => {
          const u = deployUnit(k, entry.x + (i - (n - 1) / 2) * 2 * e.spacing, entry.y, true)
          const off = e.moveTo.offsets[i] ?? [0, 0]
          const rv = nearestLand(m, anchor.x + off[0], anchor.y + off[1])
          if (u) orderMove(u.id, rv.x, rv.y)
        })
        break
      }
      case 'name-structure': {
        const near = resolvePlace(S, e.near)
        const st = S.structures.find(st => st.side === 'friend' && st.kind === e.struct
          && Math.hypot(st.x - near.x, st.y - near.y) <= e.r)
        if (st) st.label = e.label
        ctx.point = st ? { x: st.x, y: st.y } : null
        break
      }
      case 'release-asset':
        if (releaseFromFormation(S.assets, e.asset, e.formation) && e.radio) sendRadio(e.radio, ctx)
        break
      case 'radio':
        sendRadio(e.radio, ctx)
        break
      case 'toast':
        toast(e.text)
        break
    }
  }
}
