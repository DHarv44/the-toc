// Dev-console hooks: the same window.__game surface the old sim exposed, built
// from the new modules. This is a debugging/testing seam relied on constantly
// (headless advance(), scripted orders); keep it in step with the old shape.
import { S } from '../engine/state'
import { initGame, initDevGame } from '../engine/scenario'
import { advance } from '../engine/SimLoop'
import { deployUnit, fieldUnit, deployStructure, convertToHq } from '../domains/installations/orders'
import {
  deployDrone, fieldAerostat, droneStrike, droneToggleTarget, droneClearTargets,
  droneFire, droneFollow, droneLock, orderDroneMove, droneDropWp, droneSet,
  droneRTB, droneSensorMode,
} from '../domains/air/orders'
import { gunshipSelectWeapon, gunshipSetMode } from '../domains/air/gunship'
import {
  airAvailability, unitAvailability, forceCount, forceCap, incomePerMin, upkeepPerMin,
} from '../domains/economy/economy'
import {
  orderMove, orderGroupMove, orderAttack, newMoveGroup, orderHold, orderMount,
  orderRoe, orderDefend, orderWeapons, orderBridge, orderConvoy, removeLastWaypoint,
} from '../domains/forces/orders'
import { fireMission } from '../domains/fires/orders'

if (typeof window !== 'undefined') {
  ;(window as unknown as { __game?: unknown; __advance?: unknown }).__game = {
    S, initGame, initDevGame, advance, deployUnit, fieldUnit, deployStructure, deployDrone, droneStrike, droneToggleTarget, droneClearTargets, droneFire, gunshipSelectWeapon, gunshipSetMode, droneFollow, droneLock,
    orderDroneMove, droneDropWp, droneSet, droneRTB, droneSensorMode, fieldAerostat, airAvailability, unitAvailability, forceCount, forceCap, incomePerMin, upkeepPerMin,
    orderMove, orderGroupMove, orderAttack, newMoveGroup, orderHold, orderMount, orderRoe, orderDefend, orderWeapons, orderBridge, orderConvoy, convertToHq, removeLastWaypoint, fireMission,
    reveal: () => { S.fogEnabled = false },
    fog: (on: boolean) => { S.fogEnabled = on },
    setSpeed: (x: number) => { S.speed = x },
  }
  ;(window as unknown as { __advance?: unknown }).__advance = advance
}

// HMR boundary: this module imports the whole sim, and is itself imported by
// main (the entry). Without a self-accept, ANY sim edit would bubble through
// here to the entry and force a full page reload, killing the session.
// Re-running this module just reassigns window.__game with the fresh functions.
if (import.meta.hot) import.meta.hot.accept()
