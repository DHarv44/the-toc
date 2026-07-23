// End-of-match overlay: the active mode declares the outcome and text, this
// screen lands it — full-screen modal in the splash's visual language with an
// after-action summary. CONTINUE WATCHING collapses it to a reopenable pill;
// the sim is frozen at match end (speed 0) but the time controls still work
// for anyone who wants to watch the aftermath run.
import { useState } from 'react'
import { S } from '../engine/state'
import { MODES } from '../engine/modes'
import { DIFFICULTIES, type DifficultyKey } from '../domains/economy/difficulty'
import { useUI } from './store'
import { fmtClock } from './styles'

const SIZE_LABEL: Record<number, string> = { 96: 'SMALL', 160: 'MEDIUM', 256: 'LARGE' }

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 118, textAlign: 'center' }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: '#5f7d95' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 'bold', color: '#dceeff', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

export default function EndScreenGate({ onNewGame }: { onNewGame: () => void }) {
  useUI((s) => s.tick) // poll for the match ending
  const [dismissed, setDismissed] = useState(false)
  if (!S.won && !S.lost) return null
  const outcome = S.won ? 'won' as const : 'lost' as const
  const mode = MODES[S.mode]
  const text = mode.endText[outcome]
  const accent = outcome === 'won' ? '#7ec87e' : '#ff5a5a'

  if (dismissed) {
    // slim reopenable pill so the verdict stays one click away while reviewing the map
    return (
      <button onClick={() => setDismissed(false)}
        style={{
          position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)', zIndex: 90,
          background: 'rgba(10,14,18,0.94)', color: accent, border: `1px solid ${accent}55`,
          borderRadius: 3, padding: '4px 16px', fontSize: 10, letterSpacing: 2,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>■ {text.title} — REVIEW</button>
    )
  }

  const st = S.stats
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, rgba(14,26,36,0.96) 0%, rgba(5,8,11,0.97) 70%)',
      color: '#c8d8e8', fontFamily: 'Consolas, monospace', userSelect: 'none',
    }}>
      {/* faint grid backdrop, matching the splash */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(#2a3a48 1px, transparent 1px), linear-gradient(90deg, #2a3a48 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: '#54708a' }}>{mode.label} — MATCH COMPLETE</div>
        <div style={{ fontSize: 44, fontWeight: 'bold', letterSpacing: 8, color: accent, marginTop: 14 }}>
          {text.title}
        </div>
        <div style={{ fontSize: 12, letterSpacing: 1.5, color: '#7f97ab', marginTop: 10 }}>{text.sub}</div>

        {/* after-action summary */}
        <div style={{
          display: 'flex', gap: 26, justifyContent: 'center', flexWrap: 'wrap',
          margin: '34px auto 0', padding: '18px 26px', maxWidth: 640,
          background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48', borderRadius: 3,
        }}>
          <StatCell label="MISSION TIME" value={fmtClock(S.endT ?? S.t)} />
          <StatCell label="UNITS FIELDED" value={st.fielded} />
          <StatCell label="UNITS LOST" value={st.lost} />
          <StatCell label="ENEMY DESTROYED" value={st.enemyDestroyed} />
          <StatCell label="SUPPLY SPENT" value={st.supplySpent.toLocaleString()} />
        </div>
        <div style={{ fontSize: 9.5, letterSpacing: 2, color: '#54708a', marginTop: 12 }}>
          {SIZE_LABEL[S.map?.GRID ?? 0] || `${S.map?.GRID ?? '?'} CELLS`} MAP
          {' · '}{(DIFFICULTIES[S.difficulty as DifficultyKey]?.label) || S.difficulty}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 30 }}>
          <button onClick={onNewGame}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2a5a8a'; e.currentTarget.style.borderColor = '#7ec8ff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,26,36,0.85)'; e.currentTarget.style.borderColor = '#2a3a48' }}
            style={{
              padding: '10px 30px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
              borderLeft: '3px solid #2a5a8a', color: '#e6f0f8',
              fontSize: 13, letterSpacing: 3, fontWeight: 'bold',
              transition: 'background 0.12s, border-color 0.12s',
            }}>NEW GAME</button>
          <button onClick={() => setDismissed(true)}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#9ab8d0' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#54708a' }}
            style={{
              padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit',
              background: 'none', border: 'none', color: '#54708a',
              fontSize: 10, letterSpacing: 2,
            }}>CONTINUE WATCHING</button>
        </div>
      </div>
    </div>
  )
}
