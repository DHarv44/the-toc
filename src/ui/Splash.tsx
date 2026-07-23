// Start screen. New game runs in three steps — mode, map size, difficulty — with
// the dev sandbox as a separate entry that skips all three.
import { useState, type ReactNode } from 'react'
import type { MapSizeKey } from '../world/WorldMap'
import { MODES, MODE_ORDER, type ModeId } from '../engine/modes'
import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, type DifficultyKey,
} from '../domains/economy/difficulty'

export type StartFn = (
  mode: 'dev' | 'new', size?: MapSizeKey, difficulty?: DifficultyKey, gameMode?: ModeId,
) => void

// modes on the roadmap but not yet playable — shown greyed so the selector reads
// as a real choice with a future, not a single lonely button
const COMING_SOON = [
  { label: 'ZONE CAPTURE', sub: 'Contested-line control · push the front zone by zone' },
  { label: 'SPEC OPS', sub: 'Small team, one objective, night · get in, get it done, get out' },
  { label: 'SKIRMISH', sub: 'Build your own scenario · pick the victory condition, save and share' },
  { label: 'CAMPAIGN', sub: 'One large map, one long war · missions and losses carry forward' },
]

const SIZES: ReadonlyArray<{ key: MapSizeKey; label: string; sub: string }> = [
  { key: 'small', label: 'SMALL', sub: '4.8 km · quick skirmish' },
  { key: 'medium', label: 'MEDIUM', sub: '8.0 km' },
  { key: 'large', label: 'LARGE', sub: '12.8 km · full theatre' },
]

// difficulty accent runs cool -> hot as it gets harder
const DIFF_ACCENT: Record<DifficultyKey, string> = {
  recruit: '#3a5a3a', regular: '#2a5a8a', veteran: '#8a6a2a', elite: '#8a3a2a',
}

export default function Splash({ onStart }: { onStart: StartFn }) {
  const [gameMode, setGameMode] = useState<ModeId | null>(null)
  const [size, setSize] = useState<MapSizeKey | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, #0e1a24 0%, #05080b 70%)',
      color: '#c8d8e8', fontFamily: 'Consolas, monospace', userSelect: 'none',
    }}>
      {/* faint grid backdrop */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(#2a3a48 1px, transparent 1px), linear-gradient(90deg, #2a3a48 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 38 }}>
        <div style={{ fontSize: 52, fontWeight: 'bold', letterSpacing: 10, color: '#7ec8ff' }}>TOC</div>
        <div style={{ fontSize: 13, letterSpacing: 6, color: '#54708a', marginTop: 4 }}>TACTICAL OPERATIONS CENTER</div>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#3d5265', marginTop: 10 }}>
          COMMAND-AND-CONTROL · v0.1
        </div>
      </div>

      {gameMode == null ? (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>NEW GAME · STEP 1 OF 3 · MODE</SectionLabel>
          {MODE_ORDER.map((id) => (
            <SplashButton key={id} label={MODES[id].label} sub={MODES[id].sub} accent="#2a5a8a"
              onClick={() => setGameMode(id)} />
          ))}
          {COMING_SOON.map((m) => (
            <div key={m.label} style={{
              padding: '10px 16px', borderRadius: 3, marginBottom: 8, opacity: 0.4,
              background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
              borderLeft: '3px solid #35414d', cursor: 'default',
            }}>
              <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 'bold', color: '#e6f0f8' }}>
                {m.label}
                <span style={{ fontSize: 8.5, letterSpacing: 1, color: '#7f97ab', marginLeft: 8 }}>IN DEVELOPMENT</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}

          <div style={{ height: 18 }} />
          <SectionLabel>SANDBOX</SectionLabel>
          <SplashButton label="DEV SANDBOX" sub="Staged test map · fog off · full supply · dev controls"
            accent="#3a5a3a" onClick={() => onStart('dev')} />
        </div>
      ) : size == null ? (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>NEW GAME · STEP 2 OF 3 · MAP SIZE</SectionLabel>
          {SIZES.map((s) => (
            <SplashButton key={s.key} label={s.label} sub={s.sub} accent="#2a5a8a"
              onClick={() => setSize(s.key)} />
          ))}
          <BackButton onClick={() => setGameMode(null)}>
            ← {MODES[gameMode].label} — CHANGE
          </BackButton>
        </div>
      ) : (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>NEW GAME · STEP 3 OF 3 · DIFFICULTY</SectionLabel>
          {DIFFICULTY_ORDER.map((k) => {
            const d = DIFFICULTIES[k]
            return (
              <SplashButton key={k} label={d.label} sub={d.sub} accent={DIFF_ACCENT[k]}
                stats={`${d.supplies.toLocaleString()} SUPPLY · ${d.startForce.length} UNIT${d.startForce.length > 1 ? 'S' : ''} · ${toughness(d.damageMul)}`}
                recommended={k === DEFAULT_DIFFICULTY}
                onClick={() => onStart('new', size, k, gameMode)} />
            )
          })}
          <BackButton onClick={() => setSize(null)}>
            ← {SIZES.find((s) => s.key === size)!.label} MAP — CHANGE
          </BackButton>
        </div>
      )}

      <div style={{ position: 'relative', marginTop: 34, fontSize: 10, color: '#3d5265', letterSpacing: 1 }}>
        {gameMode == null ? 'SELECT A MODE TO BEGIN'
          : size == null ? 'MAP SIZE SETS THE ROOM — AND THE FORCE CAPS THAT COME WITH IT'
          : 'DIFFICULTY SETS SUPPLY, STARTING FORCE AND HOW LONG FIREFIGHTS RUN'}
      </div>
    </div>
  )
}

// damageMul is the "unit health" knob inverted — render it as how long fights last
function toughness(mul: number): string {
  if (mul <= 0.6) return 'LONG FIGHTS'
  if (mul <= 0.8) return 'STEADY FIGHTS'
  if (mul <= 1) return 'SHARP FIGHTS'
  return 'LETHAL'
}

function SectionLabel({ children }: { children?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px',
      color: '#5f7d95', fontSize: 10, letterSpacing: 2,
    }}>
      <span>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#2a3a48,transparent)' }} />
    </div>
  )
}

function SplashButton({ label, sub, stats, accent, recommended, onClick }: {
  label: string
  sub: string
  stats?: string
  accent: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.borderColor = '#7ec8ff' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,26,36,0.85)'; e.currentTarget.style.borderColor = '#2a3a48' }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '10px 16px', borderRadius: 3, color: '#e6f0f8', marginBottom: 8,
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        fontFamily: 'inherit', transition: 'background 0.12s, border-color 0.12s',
        borderLeft: `3px solid ${accent}`,
      }}>
      <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 'bold' }}>
        {label}
        {recommended && <span style={{ fontSize: 8.5, letterSpacing: 1, color: '#7ec8ff', marginLeft: 8 }}>DEFAULT</span>}
      </div>
      <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>{sub}</div>
      {stats && (
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#54708a', marginTop: 4 }}>{stats}</div>
      )}
    </button>
  )
}

function BackButton({ children, onClick }: { children?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#9ab8d0' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#54708a' }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'none', border: 'none', padding: '8px 2px 0', marginTop: 4,
        color: '#54708a', fontFamily: 'inherit', fontSize: 10, letterSpacing: 1.5,
      }}>{children}</button>
  )
}
