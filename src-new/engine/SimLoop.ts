// The sim loop: composes the per-domain tick slices in the FROZEN phase order.
// This order IS the game logic — combat resolves after movement, deaths after
// attrition, the AI sees the world only after contacts update. Do not reorder,
// insert between phases, or call a slice from anywhere else.
//
// This module (with scenario.ts) is the engine's composition root — the one
// place above the domains that may import them.
import { S } from './state'
import { supplyUpdate } from '../domains/economy/update'
import { constructionUpdate, structReports, structureDeaths } from '../domains/installations/update'
import {
  movementUpdate, drillsUpdate, casualtyReports, surrenderUpdate,
  attritionSync, unitDeaths,
} from '../domains/forces/update'
import { directFireUpdate, ballisticsUpdate } from '../domains/fires/update'
import { airUpdate } from '../domains/air/update'
import { updateContacts } from '../domains/intel/sensing'
import { enemyAI } from '../domains/opfor/ai'

export function tick(dt: number): void {
  S.t += dt
  supplyUpdate(dt)        // lifts netted against upkeep, both sides
  constructionUpdate(dt)  // construction + garrison reconstitution
  movementUpdate(dt)      // columns, movement, convoy, bridging, dig progress
  directFireUpdate(dt)    // direct-fire combat + the drills it triggers
  ballisticsUpdate(dt)    // shells, gunship rounds, impact/smoke expiry
  drillsUpdate(dt)        // pursuit, break-contact recovery, mission resumption
  casualtyReports()
  surrenderUpdate()
  structReports()
  attritionSync()         // elements brought in line with strength
  unitDeaths()
  structureDeaths()       // incl. win/lose + tethered aerostat teardown
  airUpdate(dt)           // drone state machines
  updateContacts()
  enemyAI(dt)
  S.version++
}

// --- loop -----------------------------------------------------------------

const g = globalThis as typeof globalThis & {
  __WOD2_LOOP?: ReturnType<typeof setInterval> | null
}
let loopHandle = g.__WOD2_LOOP || null // survives HMR so we don't stack loops

export function startLoop(): void {
  if (loopHandle) return
  let last = performance.now()
  loopHandle = setInterval(() => {
    const now = performance.now()
    let dt = Math.min(0.25, (now - last) / 1000) * S.speed
    last = now
    while (dt > 0) {
      const step = Math.min(dt, 0.12)
      tick(step)
      dt -= step
    }
  }, 50)
  g.__WOD2_LOOP = loopHandle
}

export function stopLoop(): void {
  if (loopHandle) { clearInterval(loopHandle); loopHandle = null; g.__WOD2_LOOP = null }
}

// Deterministic headless stepping for dev/verification (rAF-independent).
export function advance(seconds: number): { t: number; units: number; contacts: number } {
  const steps = Math.ceil(seconds / 0.1)
  for (let i = 0; i < steps; i++) tick(0.1)
  return { t: S.t, units: S.units.length, contacts: S.contacts.size }
}
