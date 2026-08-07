// WHAT THIS FORCE CAN DO — one list, whether the force is one platoon or a
// company team.
//
// These lived inside the selection tray, built from whatever happened to be
// selected. That was fine for the dock and useless for a team: to put a Raven
// up you had to know WHICH platoon carried it, find that platoon, select it
// alone, and press V. A battalion commander does not task a carrier; he tells
// TEAM BRAVO to put its bird up and the team sorts out whose it is.
//
// So an action carries the ELEMENT THAT WOULD EXECUTE IT. The dock draws them
// in its fixed twelve cells because muscle memory needs fixed cells; the team
// station draws the available ones with the executing element named under each,
// because at that echelon "who is doing this" is the thing the commander is
// actually deciding. Same definitions, so the two can never offer different
// verbs for the same force.
import type { Unit } from '../../engine/GameState'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { DRONE_TYPES } from '../../domains/air/catalog'
import { orderHold, orderMount, orderDefend } from '../../domains/forces/orders'
import { taskOrganize, teamById, teamOf } from '../../domains/forces/teams'
import { underPlayerCommand } from '../../domains/forces/command'
import { toast } from '../../domains/comms/radio'
import { orderReturnToGarrison } from '../../domains/installations/orders'
import { fieldUnitDrone } from '../../domains/air/orders'
import { S } from '../../engine/state'
import { buildItems } from '../palette'
import { TUT } from '../tutTargets'
import { useUI, type UiMode, type UIState } from '../store'
import type { CmdSlot } from '../tray/controls'

export interface Action extends CmdSlot {
  /** the element the team would give this to — null when it is the whole
   *  force's to do (halt, mount, dig in) */
  who?: Unit | null
}

/** THE TWELVE, IN THIS ORDER, FOREVER — see ui/tray CommandCard for why the
 *  order and the holes matter. Row one is what you do this bound; row two is
 *  how the force carries itself; row three is what it can build, fly, and
 *  where it lives. */
export function elementActions(units: Unit[], ui: UIState): Action[] {
  const anyIndirect = units.some(u => UNIT_TYPES[u.type].indirect)
  const anyBridge = units.some(u => UNIT_TYPES[u.type].canBridge)
  // supply is inherently one truck to one FOB, so it stays a single-element act
  const logiUnit = units.length === 1 && UNIT_TYPES[units[0]!.type].logi ? units[0]! : null
  // WHO OWNS THE CAPABILITY. First one that has it: a team with two engineers
  // sends the first, which is the same answer a commander gives when he does
  // not care which — and he can always select the other one and use the dock.
  const eng = units.find(u => buildItems(u).length > 0)
  const carrier = units.find(u => (UNIT_TYPES[u.type].carries?.length ?? 0) > 0)
  const uas = carrier ? UNIT_TYPES[carrier.type].carries![0] : null
  const gunner = units.find(u => UNIT_TYPES[u.type].indirect)
  const bridger = units.find(u => UNIT_TYPES[u.type].canBridge)
  const homed = units.length > 0 && units.every(u => S.org?.slots.some(sl => sl.unitId === u.id))
  const canMount = units.some(u => UNIT_TYPES[u.type].carrier && !u.mounted)
  const canDig = units.some(u => UNIT_TYPES[u.type].def)
  const build = eng ? buildItems(eng)[0] : null
  const set = (m: UiMode) => useUI.getState().setMode(ui.mode === m ? 'select' : m)

  return [
    { key: 'move', label: 'MOVE', hot: 'Q', show: true, active: ui.cmdMode === 'move',
      title: 'Right-click orders a move', on: () => useUI.getState().setCmdMode('move') },
    { key: 'attack', label: 'ATTACK', hot: 'E', show: true, active: ui.cmdMode === 'attack',
      tone: '#c87868', tut: TUT.attackMode,
      title: 'Right-click orders an attack', on: () => useUI.getState().setCmdMode('attack') },
    { key: 'stop', label: 'STOP', hot: 'H', show: true,
      title: 'Stop where you are', on: () => units.forEach(u => orderHold(u.id)) },
    { key: 'dig', label: '⛨ DIG IN', hot: 'T', show: canDig, tut: TUT.digIn,
      active: units.every(u => u.posture === 'dig'),
      title: 'Prepare positions here — cover in exchange for staying put',
      on: () => {
        const allDug = units.every(u => u.posture === 'dig')
        units.forEach(u => orderDefend(u.id, !allDug))
      } },
    { key: 'mount', label: 'MOUNT', hot: 'R', show: canMount,
      title: 'Get back in the vehicles', on: () => units.forEach(u => orderMount(u.id, true)) },
    { key: 'dismount', label: 'DISMOUNT', hot: 'F',
      show: units.some(u => UNIT_TYPES[u.type].carrier && u.mounted),
      title: 'Put the infantry on the ground', on: () => units.forEach(u => orderMount(u.id, false)) },
    { key: 'fire', label: 'FIRE MSN', hot: 'C', show: anyIndirect, active: ui.mode === 'target',
      who: gunner, title: 'Call for fire — click the target grid',
      on: () => set('target') },
    { key: 'bridge', label: 'BRIDGE', hot: 'B', show: anyBridge, active: ui.mode === 'bridge',
      who: bridger, title: 'Throw a pontoon bridge — click the crossing',
      on: () => set('bridge') },
    { key: 'uas', label: uas ? DRONE_TYPES[uas]!.name.toUpperCase() : 'UAS', hot: 'V',
      show: !!carrier && !!uas, who: carrier,
      tut: uas === 'RAVEN' ? TUT.uasRaven : undefined,
      title: carrier ? `Launch over ${carrier.label} — live feed of the ground ahead` : undefined,
      on: () => {
        if (!carrier || !uas) return
        const d = fieldUnitDrone(carrier.id, uas)
        if (d && d.id != null) useUI.getState().showDrone(d.id)
      } },
    // ORGANIC WORK — what this force makes with its own hands. An engineer
    // builds, a truck hauls; never both, so they share the cell rather than
    // each getting one that is empty for everybody else.
    logiUnit
      ? { key: 'work', label: logiUnit.convoy ? 'END RUN' : 'SUPPLY', hot: 'N', show: true,
          who: logiUnit, tut: TUT.supplyRun, active: !!logiUnit.convoy,
          title: 'Run supply from the HQ to a chosen FOB, then repeat',
          on: () => {
            if (logiUnit.convoy) orderHold(logiUnit.id)
            else useUI.getState().setMode(`convoy:${logiUnit.id}` as never)
          } }
      : { key: 'work', label: build ? `⛏ ${build.label.toUpperCase()}` : 'BUILD', hot: 'N',
          show: !!eng && !!build, who: eng,
          tut: build?.mode === 'build:FOB' ? TUT.buildFob : undefined,
          active: !!build && ui.mode === build.mode,
          title: eng && build ? `${eng.label} builds a ${build.label} — click the map to site it` : undefined,
          on: () => { if (build) set(build.mode as UiMode) } },
    { key: 'rtb', label: 'RTB', hot: 'Y', show: homed, tut: TUT.rtb,
      title: "Return to this element's assigned garrison — stand down, refit, absorb replacements",
      on: () => units.forEach(u => orderReturnToGarrison(u.id)) },
    { key: 'garrison', label: 'GARRISON', hot: 'U', show: homed, tut: TUT.garrison,
      active: ui.mode === 'garrison',
      title: 'Reassign garrison: click a friendly base — they stand down there and it becomes home',
      on: () => set('garrison') },
  ]
}

/** THE ONE MOUTH FOR THE ONE VERB. The G key and the dock's FORM TEAM button
 *  both organize a selection through this, so the outcomes — and the words the
 *  commander hears about them — cannot drift apart. */
export function runTaskOrganize(unitIds: number[]): void {
  const r = taskOrganize(unitIds)
  if (r.kind === 'formed') toast(`${r.team!.name} TASK ORGANIZED`)
  else if (r.kind === 'joined') toast(`${r.n} ATTACHED TO ${r.team!.name}`)
  else if (r.kind === 'ambiguous') {
    const names = (r.teams ?? []).map(id => teamById(id)?.name ?? '?').join(' AND ')
    toast(`SELECTION SPANS ${names} — RIGHT-CLICK AN ELEMENT TO CHOOSE`)
  } else toast('ALREADY ONE TEAM — ADD WHAT IS JOINING IT, OR SHIFT+G TO DETACH')
}

/** What G would DO with this selection, so the dock can put it on a button
 *  before it is pressed. Mirrors taskOrganize's own reading rung for rung.
 *  Null when the press would change nothing — fewer than two elements, the
 *  selection already one whole team, or a tie between teams that only the
 *  right-click menu may resolve. A button that could only apologize is worse
 *  than no button. */
export function taskOrgLabel(units: Unit[]): string | null {
  const mine = units.filter(u => u.strength > 0 && underPlayerCommand(u))
  if (mine.length < 2) return null
  const count = new Map<number, number>()
  for (const u of mine) {
    const t = teamOf(u)
    if (t) count.set(t.id, (count.get(t.id) ?? 0) + 1)
  }
  let destId: number | null = null, best = 0
  for (const [id, n] of count) if (n > best) { best = n; destId = id }
  if (destId != null && [...count.values()].filter(n => n === best).length > 1) return null
  if (destId != null) {
    const dest = teamById(destId)
    const joining = mine.filter(u => teamOf(u)?.id !== destId)
    return dest && joining.length ? `JOIN ${dest.name}` : null
  }
  return mine.filter(u => !teamOf(u)).length >= 2 ? 'FORM TEAM' : null
}

/** EVERYTHING ELSE THIS ENGINEER COULD BUILD. The card has one cell for work,
 *  so the second and third structure types are unreachable from it — which is
 *  fine in a dock the player uses at speed and not fine in a team station,
 *  where siting a FOB is exactly the kind of deliberate act you came here for. */
export function buildChoices(units: Unit[]): { label: string; mode: string; who: Unit }[] {
  const eng = units.find(u => buildItems(u).length > 0)
  if (!eng) return []
  return buildItems(eng).map(b => ({ label: b.label, mode: b.mode, who: eng }))
}
