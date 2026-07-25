// Asset pipeline tick (ASSET-REQUESTS.md): staff decisions land, convoys
// arrive (or die), sections emplace, refits complete, the waiting list
// promotes, sortie windows expire. Called from SimLoop each tick.
import { S } from '../../engine/state'
import { radio, toast } from '../comms/radio'
import { deployDrone } from '../air/orders'
import {
  assetDef, assetDesk, relevance, approve, availableCount,
  DEFAULT_SETUP, REFIT_TIME,
} from './service'

const ARRIVE_RANGE = 220

export function assetsUpdate(_dt: number): void {
  const A = S.assets
  if (!A.pool.length && !A.pending.length && !A.windows.length) return

  // --- staff decisions ------------------------------------------------------
  for (let i = A.pending.length - 1; i >= 0; i--) {
    const p = A.pending[i]!
    if (S.t < p.decideT) continue
    A.pending.splice(i, 1)
    const def = assetDef(p.kind)
    if (!def) continue
    const rel = relevance(p.kind)
    if (!rel.ok) {
      radio(assetDesk(p.kind), 'request', `${def.name.toUpperCase()} — DENIED. ${rel.reason}`, undefined, undefined)
      toast(`${def.name.toUpperCase()} DENIED`)
      continue
    }
    if (!def.sortie && availableCount(p.kind) === 0) {
      A.queue.push({ kind: p.kind, structId: p.structId })
      radio(assetDesk(p.kind), 'request',
        `ALL ${def.name.toUpperCase()}S COMMITTED — REQUEST HELD, YOU ARE ${A.queue.filter(q => q.kind === p.kind).length} ON THE LIST`,
        undefined, undefined)
      toast(`${def.name.toUpperCase()} — ON THE WAITING LIST`)
      continue
    }
    approve(p.kind, p.structId, false)
  }

  // --- iron in motion -------------------------------------------------------
  for (const inst of A.pool) {
    const def = assetDef(inst.kind)
    if (!def) continue
    if (inst.state === 'enroute') {
      const convoy = S.units.find(u => u.id === inst.convoyId)
      const st = S.structures.find(s => s.id === inst.structId && s.side === 'friend')
      if (!convoy || convoy.strength <= 0) {
        // the convoy died on the road: the asset is GONE — long CL VII clock
        // (the pack's number for this asset, engine fallback otherwise)
        inst.state = 'refit'
        inst.refitT = S.t + (def.refitTime ?? REFIT_TIME)
        delete inst.holder; delete inst.structId; delete inst.convoyId
        radio(assetDesk(inst.kind), 'loss',
          `${def.name.toUpperCase()} CONVOY DESTROYED EN ROUTE — ASSET LOST, REPLACEMENT ON THE CL VII CLOCK`,
          undefined, undefined)
        toast(`${def.name.toUpperCase()} CONVOY LOST`)
        continue
      }
      if (!st) {
        // destination died: convoy turns around, asset back to the pool
        S.units.splice(S.units.indexOf(convoy), 1)
        inst.state = 'available'
        delete inst.holder; delete inst.structId; delete inst.convoyId
        radio(convoy.label, 'move', `${def.name.toUpperCase()} DELIVERY ABORTED — DESTINATION LOST, RETURNING TO DIVISION`, convoy.x, convoy.y)
        continue
      }
      if (Math.hypot(convoy.x - st.x, convoy.y - st.y) <= ARRIVE_RANGE) {
        // trucks are in the wire: crew dismounts and starts EMPLACING —
        // approval never helped the attack that prompted it
        S.units.splice(S.units.indexOf(convoy), 1)
        inst.state = 'setup'
        delete inst.convoyId
        const setup = def.setupTime ?? DEFAULT_SETUP
        inst.setupT = S.t + setup
        radio(convoy.label, 'arrive',
          `${def.name.toUpperCase()} ON SITE AT ${st.label} — EMPLACING, ${Math.max(1, Math.round(setup / 60))} MIKES TO OPERATIONAL`,
          st.x, st.y)
      }
    } else if (inst.state === 'setup') {
      if (S.t < (inst.setupT ?? 0)) continue
      const st = S.structures.find(s => s.id === inst.structId && s.side === 'friend')
      inst.state = 'allocated'
      delete inst.setupT
      if (!st) { inst.state = 'available'; delete inst.holder; delete inst.structId; continue }
      const d = def.delivers
      if (d.facility && !st.facilities?.includes(d.facility)) {
        st.facilities = [...(st.facilities ?? []), d.facility]
      }
      if (d.tether) deployDrone(def.delivers.tether!, st.x, st.y)
      if (d.unlock && !A.unlocks.includes(d.unlock)) A.unlocks.push(d.unlock)
      radio('NET', 'arrive', `${def.name.toUpperCase()} OPERATIONAL AT ${st.label}`, st.x, st.y)
      toast(`${def.name.toUpperCase()} OPERATIONAL`)
    } else if (inst.state === 'refit') {
      if (S.t < (inst.refitT ?? 0)) continue
      inst.state = 'available'
      delete inst.refitT
      radio(assetDesk(inst.kind), 'arrive', `${def.name.toUpperCase()} REPLACEMENT FIELDED — BACK IN THE DIVISION POOL`, undefined, undefined)
    }
  }

  // --- waiting list: promote the head when its pool has an instance free ----
  for (let i = 0; i < A.queue.length; i++) {
    const q = A.queue[i]!
    if (availableCount(q.kind) === 0) continue
    A.queue.splice(i, 1)
    const rel = relevance(q.kind)
    if (!rel.ok) {
      const def = assetDef(q.kind)
      if (def) radio(assetDesk(q.kind), 'request', `${def.name.toUpperCase()} FREED BUT — DENIED. ${rel.reason}`, undefined, undefined)
      break
    }
    approve(q.kind, q.structId, true)
    break // one promotion per tick keeps the traffic readable
  }

  // --- sortie windows expire ------------------------------------------------
  for (let i = A.windows.length - 1; i >= 0; i--) {
    const w = A.windows[i]!
    if (S.t < w.closesT) continue
    A.windows.splice(i, 1)
    const def = assetDef(w.kind)
    if (def) radio(assetDesk(w.kind), 'request', `${def.name.toUpperCase()} WINDOW CLOSED — RE-REQUEST FOR THE NEXT ATO CYCLE`, undefined, undefined)
  }
}
