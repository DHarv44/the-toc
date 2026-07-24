// Campaign UI: the briefing / debrief modals and the persistent objectives
// tracker. All of it reads S.campaign and the campaign runner (engine/campaign);
// it renders nothing outside campaign mode. Visual language matches EndScreen.
import { S } from '../engine/state'
import { useUI } from './store'
import {
  MISSIONS, evalObjective, ackBriefing, continueCampaign, type ObjectiveSpec,
} from '../engine/campaign'
import type { CampaignState } from '../engine/GameState'

const ACCENT = '#7ec8ff'
const bump = () => useUI.setState((s) => ({ tick: s.tick + 1 }))

// progress suffix for the objective row, by verb
function progressText(o: ObjectiveSpec, c: CampaignState): string {
  const { progress, done } = evalObjective(o, S, c)
  if (done) return ''
  if (o.kind === 'build') return `${Math.round(progress * 100)}%`
  if (o.kind === 'deliver') return `${Math.floor(progress * (o.amount || 0))}/${o.amount}`
  return ''
}

// ---------------------------------------------------------------------------
// Persistent tracker — anchored top-left of the map column.
// ---------------------------------------------------------------------------
export function CampaignObjectives() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete) return null
  const m = MISSIONS[c.mission - 1]
  if (!m) return null

  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 30, width: 258,
      background: 'rgba(9,14,19,0.9)', border: '1px solid #24343f', borderLeft: `3px solid ${ACCENT}`,
      borderRadius: 3, padding: '9px 12px', fontFamily: 'Consolas, monospace', userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 8.5, letterSpacing: 2.5, color: '#5f7d95' }}>
        MISSION {c.mission} · {MISSIONS.length > 1 ? `${c.mission}/${MISSIONS.length}` : ''}
      </div>
      <div style={{ fontSize: 13, letterSpacing: 2, color: '#dceeff', fontWeight: 'bold', marginTop: 2 }}>
        {m.name}
      </div>
      <div style={{ height: 1, background: '#24343f', margin: '7px 0' }} />
      {m.objectives.map((o, i) => {
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Briefing / debrief full-screen modal — holds the sim (speed 0) until dismissed.
// ---------------------------------------------------------------------------
function ModalShell({ tag, title, children, actionLabel, onAction }: {
  tag: string; title: string; children: React.ReactNode; actionLabel: string; onAction: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 105,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, rgba(14,26,36,0.97) 0%, rgba(5,8,11,0.98) 70%)',
      color: '#c8d8e8', fontFamily: 'Consolas, monospace', userSelect: 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(#2a3a48 1px, transparent 1px), linear-gradient(90deg, #2a3a48 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div style={{
        position: 'relative', width: 560, maxWidth: '90vw',
        background: 'rgba(12,20,28,0.9)', border: '1px solid #2a3a48', borderTop: `3px solid ${ACCENT}`,
        borderRadius: 3, padding: '26px 30px 22px',
      }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: '#54708a' }}>{tag}</div>
        <div style={{ fontSize: 26, fontWeight: 'bold', letterSpacing: 5, color: '#dceeff', marginTop: 8 }}>
          {title}
        </div>
        <div style={{ height: 1, background: '#24343f', margin: '16px 0' }} />
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onAction}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2a5a8a'; e.currentTarget.style.borderColor = ACCENT }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,26,36,0.85)'; e.currentTarget.style.borderColor = '#2a3a48' }}
            style={{
              padding: '10px 30px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48', borderLeft: `3px solid ${ACCENT}`,
              color: '#e6f0f8', fontSize: 12, letterSpacing: 3, fontWeight: 'bold',
              transition: 'background 0.12s, border-color 0.12s',
            }}>{actionLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default function CampaignGate() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete) return null // campaign victory routes through EndScreen

  // debrief takes precedence: a mission just completed
  if (c.debrief) {
    const done = MISSIONS[c.mission - 1]
    const next = MISSIONS[c.mission] // the one continueCampaign will start
    return (
      <ModalShell tag={`MISSION ${c.mission} — COMPLETE`} title={done?.name || 'MISSION COMPLETE'}
        actionLabel={next ? 'CONTINUE' : 'FINISH'} onAction={() => { continueCampaign(S); bump() }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#a8c0d4' }}>
          All objectives met. The battalion holds the ground it took — nothing stands down.
        </div>
        {next && (
          <div style={{ marginTop: 16, fontSize: 11, letterSpacing: 1, color: '#7f97ab' }}>
            NEXT: <span style={{ color: ACCENT }}>MISSION {c.mission + 1} — {next.name}</span>
          </div>
        )}
      </ModalShell>
    )
  }

  // otherwise, an un-acknowledged briefing
  if (!c.briefed) {
    const m = MISSIONS[c.mission - 1]
    if (!m) return null
    return (
      <ModalShell tag={`MISSION ${c.mission} — BRIEFING`} title={m.name}
        actionLabel="ACKNOWLEDGE" onAction={() => { ackBriefing(S); bump() }}>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: '#b6cce0' }}>{m.brief}</div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: 2.5, color: '#5f7d95', marginBottom: 6 }}>OBJECTIVES</div>
          {m.objectives.map((o, i) => (
            <div key={o.id} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: '#cfe2f2', margin: '3px 0' }}>
              <span style={{ color: '#5f7d95' }}>{i + 1}.</span>{o.label}
            </div>
          ))}
        </div>
      </ModalShell>
    )
  }
  return null
}
