// The new sim's harness surface — the same shape runGolden drives on the old
// window.__game. Browser-agnostic so the Node parity runner can import it too.
import { S } from '../engine/state'
import { initGame, initDevGame } from '../engine/scenario'
import { advance } from '../engine/SimLoop'
import { fieldUnit, deployUnit, deployStructure } from '../domains/installations/orders'
import { deployDrone, fieldAerostat } from '../domains/air/orders'
import { orderMove, orderGroupMove, orderAttack } from '../domains/forces/orders'
import { fireMission } from '../domains/fires/orders'
import type { GoldenApi } from './golden'

// GoldenApi loosens key params to string (it must fit the untyped old sim), so
// the typed order functions go through one structural cast here.
export const newGameApi = {
  S, initGame, initDevGame, advance,
  fieldUnit, deployUnit, deployStructure,
  deployDrone, fieldAerostat,
  orderMove, orderGroupMove, orderAttack,
  fireMission,
} as unknown as GoldenApi
