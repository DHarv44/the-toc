// Start screen: pick a map size for a new game, or load the dev sandbox.
const SIZES = [
  { key: 'small', label: 'SMALL', sub: '4.8 km · quick skirmish' },
  { key: 'medium', label: 'MEDIUM', sub: '8.0 km' },
  { key: 'large', label: 'LARGE', sub: '12.8 km · full theatre' },
]

export default function Splash({ onStart }) {
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

      <div style={{ position: 'relative', width: 300 }}>
        <SectionLabel>NEW GAME · MAP SIZE</SectionLabel>
        {SIZES.map((s) => (
          <SplashButton key={s.key} label={s.label} sub={s.sub} accent="#2a5a8a"
            onClick={() => onStart('new', s.key)} />
        ))}

        <div style={{ height: 18 }} />
        <SectionLabel>SANDBOX</SectionLabel>
        <SplashButton label="DEV SANDBOX" sub="Staged test map · fog off · full supply"
          accent="#3a5a3a" onClick={() => onStart('dev')} />
      </div>

      <div style={{ position: 'relative', marginTop: 34, fontSize: 10, color: '#3d5265', letterSpacing: 1 }}>
        SELECT A MODE TO BEGIN
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
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

function SplashButton({ label, sub, accent, onClick }) {
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
      <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 'bold' }}>{label}</div>
      <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>{sub}</div>
    </button>
  )
}
