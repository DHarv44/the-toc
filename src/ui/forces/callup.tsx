// CALLING AN ELEMENT UP OUT OF GARRISON — the two guards and the one warning.
//
// Fielding a slot is a domain call (installations/orders.fieldSlot). What sits
// in front of it is a UI decision the game has already made once, in the FORCES
// rail, and now has to make in two places: the GARRISON rail, and a team
// station attaching straight from the garrison. So it lives here rather than
// being written twice and drifting.
//
// The guard is dedicated QRF. A slot standing as a base's reaction force can
// still be deployed — the commander is allowed to spend it — but the base loses
// its QRF when they do, and that is not a consequence anybody should discover
// afterwards.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { fieldSlot } from '../../domains/installations/orders'
import { releaseQrf } from '../../domains/defense/qrf'
import { useUI } from '../store'
import { FZ } from '../styles'

/** Field a slot, stopping first if it is dedicated QRF and the commander has
 *  not turned the warning off. `warn` renders the inline confirm; `after` runs
 *  on the fielded unit (attaching it to a team, say). */
export function guardedFieldSlot(
  slotId: string, warn: (id: string) => void, after?: (u: Unit) => void,
): void {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl) return
  if (sl.qrf && !useUI.getState().qrfWarnOff) return warn(slotId)
  if (sl.qrf) releaseQrf(sl)
  const u = fieldSlot(slotId)
  if (u && after) after(u)
}

export function proceedFieldSlot(slotId: string, after?: (u: Unit) => void): void {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (sl?.qrf) releaseQrf(sl)
  const u = fieldSlot(slotId)
  if (u && after) after(u)
}

/** THE WARNING, IN THE PANEL. No popout: a modal over a battle stops the game
 *  to ask a question about it, and this question is answerable in place. */
export function QrfWarning({ slotId, onProceed, onCancel }: {
  slotId: string
  onProceed: () => void
  onCancel: () => void
}) {
  const ui = useUI()
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl) return null
  const btn: React.CSSProperties = {
    padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
    background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
    color: '#dceeff', fontSize: FZ.hint, letterSpacing: 1,
  }
  return (
    <div style={{
      margin: '4px 6px', padding: '6px 8px', borderRadius: 3,
      border: '1px solid #6a4a2a', borderLeft: '3px solid #e8b34a',
      background: 'rgba(40,28,14,0.45)',
    }}>
      <div style={{ fontSize: FZ.label, fontWeight: 700, color: '#e8b34a', letterSpacing: 1 }}>
        ⚠ {sl.name.toUpperCase()} IS DEDICATED QRF
      </div>
      <div style={{ fontSize: FZ.hint, color: '#9ab8d0', lineHeight: 1.5 }}>
        Deploying releases it from QRF — its base loses that reaction force.
      </div>
      <label style={{
        display: 'flex', gap: 5, alignItems: 'center', margin: '5px 0',
        fontSize: FZ.hint, color: '#9ab8d0', cursor: 'pointer',
      }}>
        <input type="checkbox" checked={ui.qrfWarnOff}
          onChange={e => useUI.setState({ qrfWarnOff: e.currentTarget.checked })} />
        DON'T WARN ME AGAIN
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={{ ...btn, borderColor: '#6a4a2a', color: '#e8b34a' }}
          onClick={onProceed}>DEPLOY ANYWAY</button>
        <button style={btn} onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  )
}
