// WHAT A PALETTE ROW DOES WHEN YOU CLICK IT.
//
// A base's rows are not one kind of thing: some field an element, some install
// a facility, some request an asset from division, some toggle a QRF duty, and
// some arm a DEPLOY MODE and wait for a map click. Which of those a row is, is
// carried on the row itself (ui/palette's PaletteItem flags).
//
// This was written inside the COMMAND rail's leaf component, which was fine
// while the rail was the only place a base could be operated from. The bottom
// bar's installation panel operates the same base from the same rows, so the
// rule moves out here rather than being written twice — two copies of "what
// does this row do" is how a row starts doing different things in two panels.
import { fieldSlot, fieldUnit, installFacility } from '../../domains/installations/orders'
import { fieldAerostat, fieldUnitDrone } from '../../domains/air/orders'
import { requestAsset } from '../../domains/assets/service'
import { toggleQrf } from '../../domains/defense/qrf'
import type { DroneTypeKey } from '../../domains/air/catalog'
import type { FacilityKey } from '../../domains/installations/catalog'
import type { UnitTypeKey } from '../../domains/forces/catalog'
import { useUI, type UiMode } from '../store'
import type { PaletteItem } from '../palette'

/** Does this row act on its own, or does it need a map click first? */
export const isOneClick = (it: PaletteItem, sourceId?: number): boolean =>
  !!(it.field || it.fieldSlot || it.fieldAero || it.fieldDrone
    || it.installFac || it.reqAsset || it.qrfToggle) && sourceId != null

/** Run the row against a base. One-click rows fire; the rest arm their mode. */
export function runItem(it: PaletteItem, sourceId?: number): void {
  const ui = useUI.getState()
  if (!isOneClick(it, sourceId)) {
    ui.setMode((ui.mode === it.mode ? 'select' : it.mode) as UiMode)
    return
  }
  const src = sourceId!
  if (it.fieldSlot) return void fieldSlot(it.key!, src)
  if (it.qrfToggle) return void toggleQrf(it.key!)
  if (it.reqAsset) return void requestAsset(it.key!, src)
  if (it.installFac) return void installFacility(src, it.key as FacilityKey)
  if (it.fieldDrone) {
    const d = fieldUnitDrone(src, it.key as DroneTypeKey)
    if (d && d.id != null) ui.showDrone(d.id)
    return
  }
  if (!it.fieldAero) return void fieldUnit(it.key as UnitTypeKey, src)
  const d = fieldAerostat(src)
  if (d && d.id != null) ui.showDrone(d.id)
}
