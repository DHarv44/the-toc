// Campaign UI: the persistent objectives tracker (with the recallable orders
// log). Orders themselves arrive over the DIV VTC — see ui/Vtc.tsx. Renders
// nothing outside campaign mode. Visual language matches EndScreen.
import { S } from '../engine/state'
import { useUI } from './store'
import {
  OPERATION, evalObjective, openReport, recallFrago, type ObjectiveSpec,
} from '../engine/campaign'
import type { CampaignState } from '../engine/GameState'

const ACCENT = '#7ec8ff'
const bump = () => useUI.setState((s) => ({ tick: s.tick + 1 }))

// Taskings pop up, they aren't a spoiler list: a FRAGO-bearing objective marks
// a REVEAL POINT — everything from it onward stays off the board until the
// stream reaches it. (Index of the first unreached frago objective.)
function revealedEnd(objIdx: number): number {
  for (let i = objIdx + 1; i < OPERATION.objectives.length; i++) {
    if (OPERATION.objectives[i]!.frago) return i
  }
  return OPERATION.objectives.length
}

// progress suffix for the objective row, by verb
function progressText(o: ObjectiveSpec, c: CampaignState): string {
  const { progress, done } = evalObjective(o, S, c)
  if (done) return ''
  if (o.kind === 'build') return `${Math.round(progress * 100)}%`
  if (o.kind === 'deliver') return `${Math.floor(progress * (o.amount || 0))}/${o.amount}`
  return ''
}

// ---------------------------------------------------------------------------
// Persistent tracker — anchored top-left of the map column. The card itself
// ignores the pointer so it never blocks map clicks; only the small VTC-recall
// buttons at the bottom are interactive.
// ---------------------------------------------------------------------------
export function CampaignObjectives() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete) return null

  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, width: 258, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{
      background: 'rgba(9,14,19,0.9)', border: '1px solid #24343f', borderLeft: `3px solid ${ACCENT}`,
      borderRadius: 3, padding: '9px 12px', fontFamily: 'Consolas, monospace', userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 8.5, letterSpacing: 2.5, color: '#5f7d95' }}>
        OPERATION
      </div>
      <div style={{ fontSize: 13, letterSpacing: 2, color: '#dceeff', fontWeight: 'bold', marginTop: 2 }}>
        {OPERATION.name}
      </div>
      <div style={{ height: 1, background: '#24343f', margin: '7px 0' }} />
      {OPERATION.objectives.slice(0, revealedEnd(c.objIdx)).map((o, i) => {
        const st = c.status[i] || 'pending'
        const glyph = st === 'done' ? '✓' : st === 'active' ? '▶' : '○'
        const col = st === 'done' ? '#7ec87e' : st === 'active' ? ACCENT : '#5a7085'
        const suffix = st === 'active' ? progressText(o, c) : ''
        return (
          <div key={o.id} style={{
            display: 'flex', alignItems: 'baseline', gap: 7, margin: '4px 0',
            fontSize: 10.5, color: col,
          }}>
            <span style={{ width: 10, textAlign: 'center', flexShrink: 0 }}>{glyph}</span>
            <span style={{
              flex: 1, letterSpacing: 0.5,
              textDecoration: st === 'done' ? 'line-through' : 'none',
              opacity: st === 'pending' ? 0.7 : 1,
            }}>{o.label}</span>
            {suffix && <span style={{ fontSize: 9.5, color: '#9ab8d0', fontVariantNumeric: 'tabular-nums' }}>{suffix}</span>}
          </div>
        )
      })}
      {/* orders log: reopen any received VTC (interactive island in a
          pointer-transparent card) */}
      {c.briefed && c.fragoLog.length > 0 && (
        <>
          <div style={{ height: 1, background: '#24343f', margin: '7px 0 5px' }} />
          <div style={{ fontSize: 8, letterSpacing: 2, color: '#5f7d95', marginBottom: 3 }}>ORDERS — RECALL VTC</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, pointerEvents: 'auto' }}>
            {c.fragoLog.map((e, i) => (
              <button key={i} onClick={() => { recallFrago(S, i); bump() }}
                onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = '#e8b34a'; ev.currentTarget.style.color = '#f2ddb0' }}
                onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = '#2a3a48'; ev.currentTarget.style.color = '#9ab8d0' }}
                style={{
                  padding: '2px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
                  color: '#9ab8d0', fontSize: 8.5, letterSpacing: 1,
                }}>▸ {e.title}</button>
            ))}
          </div>
        </>
      )}
    </div>

    {/* staff-report traffic: reports land here as they complete — click to
        take the brief (first open = the S1 on a VTC, afterwards the document) */}
    {c.briefed && c.reports.log.length > 0 && (
      <div style={{
        background: 'rgba(9,14,19,0.9)', border: '1px solid #24343f', borderLeft: '3px solid #d4b23a',
        borderRadius: 3, padding: '8px 12px', fontFamily: 'Consolas, monospace', userSelect: 'none',
      }}>
        <div style={{ fontSize: 8.5, letterSpacing: 2.5, color: '#5f7d95' }}>STAFF REPORTS</div>
        {[...c.reports.log].reverse().slice(0, 4).map(e => (
          <button key={e.id} onClick={() => { openReport(S, e.id); bump() }}
            onMouseEnter={(ev) => { ev.currentTarget.style.color = '#f2ddb0' }}
            onMouseLeave={(ev) => { ev.currentTarget.style.color = e.read ? '#9ab8d0' : '#dceeff' }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', margin: '4px 0 0',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              color: e.read ? '#9ab8d0' : '#dceeff', fontSize: 10, letterSpacing: 0.5, textAlign: 'left',
            }}>
            <span style={{
              width: 7, height: 7, borderRadius: 4, flexShrink: 0,
              background: e.read ? '#22303d' : '#d43a3a',
            }} />
            <span style={{ fontWeight: e.read ? 400 : 700 }}>{e.title}</span>
          </button>
        ))}
      </div>
    )}
    </div>
  )
}
