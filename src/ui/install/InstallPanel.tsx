// ONE BASE, EVERYTHING IT CAN DO, OPENING UPWARD OUT OF THE BOTTOM BAR.
//
// The bottom bar is where the commander looks for what is available to commit:
// the independent elements on the top row, the installations on the second.
// Clicking an installation opens THIS — the base's garrison, its reaction
// force, its facilities and what it can put in the air, all at once.
//
// UPWARD, because it hangs off a bar at the bottom of the screen and a panel
// that opened downward would go off it. WIDE AND IN COLUMNS, because the bar it
// hangs from is the full width of the map: a base's four answers side by side
// is a two-second read, and the same four stacked in a 340 px rail was a scroll.
// That rail is what this replaces.
//
// THE QUICK PATH, NOT THE LEDGER. This operates ONE base, now, with no
// navigation — the fielding decision you make with a contact report on the
// screen. Comparing every base, and building the force deliberately, is the
// COMMAND console's job. A watch and a review are different jobs.
import { useState } from 'react'
import { S } from '../../engine/state'
import type { OrgSlot, Structure } from '../../engine/GameState'
import { STRUCTURES } from '../../domains/installations/catalog'
import { UNIT_TYPES, type UnitTypeKey } from '../../domains/forces/catalog'
import { qrfRoster, toggleQrf } from '../../domains/defense/qrf'
import { ownerOf } from '../../packs/orgquery'
import { deployContext, garrisonSlots, slotItem, unitCats, PaletteIcon, type PaletteItem } from '../palette'
import { QrfWarning, guardedFieldSlot, proceedFieldSlot } from '../forces/callup'
import { isOneClick, runItem } from './actions'
import { FZ } from '../styles'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'

/** One actionable row. Deliberately not the rail's TreeLeaf: there is no tree
 *  here — a base's capabilities are four flat lists, and drawing them with
 *  indentation would imply a hierarchy that does not exist. */
function Row({ it, onClick }: { it: PaletteItem; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={it.disabled} title={it.tag ?? undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
        padding: '3px 7px', borderRadius: 2, fontFamily: 'inherit',
        border: '1px solid transparent', background: 'none',
        cursor: it.disabled ? 'default' : 'pointer',
        opacity: it.disabled ? 0.45 : 1,
      }}
      onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = 'rgba(30,44,58,0.7)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
      {it.icon && <span style={{ flex: '0 0 auto', display: 'flex' }}>{it.icon}</span>}
      <span style={{
        flex: 1, minWidth: 0, fontFamily: UI, fontSize: FZ.label, color: '#c8d8e8',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{it.label}</span>
      {it.note && (
        <span style={{ flex: '0 0 auto', fontFamily: UI, fontSize: FZ.hint, color: '#6d8296' }}>
          {it.note}
        </span>
      )}
    </button>
  )
}

function Column({ label, count, children }: {
  label: string; count?: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, padding: '0 7px 3px',
        borderBottom: '1px solid #1e2c3a', marginBottom: 3,
      }}>
        <span style={{ fontFamily: UI, fontSize: FZ.hint, letterSpacing: 1.2, color: '#7ec8ff' }}>
          {label}
        </span>
        {count && (
          <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#3d4f60' }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  )
}

export default function InstallPanel({ st, onClose }: { st: Structure; onClose: () => void }) {
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const [dedicating, setDedicating] = useState(false)
  const ctx = deployContext([st.id])

  // WHOSE GARRISON THIS IS. A slot with no base of its own answers to the HQ,
  // which is also where it physically stands — same rule the call-up tree used.
  const hqId = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')?.id
  const homedHere = (sl: OrgSlot) =>
    (S.structures.some(s => s.id === sl.garrisonAt && s.side === 'friend')
      ? sl.garrisonAt : hqId) === st.id
  const garrison = garrisonSlots(true).filter(homedHere)
  const { candidates } = qrfRoster(st.id)

  // the base's own sections, minus QRF — this panel draws the duty roster with
  // its DEDICATE control attached, which the generic row cannot carry
  const sections = (ctx?.sections ?? []).filter(s => s.header !== 'QRF')
  const qrf = ctx?.sections.find(s => s.header === 'QRF')

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 8, right: 8, marginBottom: 4,
      maxHeight: '46vh', overflowY: 'auto', zIndex: 40,
      background: 'rgba(9,13,18,0.985)', border: '1px solid #2a3a48', borderRadius: 3,
      boxShadow: '0 -8px 26px rgba(0,0,0,0.55)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: '1px solid #1e2c3a', background: 'rgba(14,20,27,0.9)',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <span style={{ fontFamily: UI, fontSize: FZ.item, fontWeight: 700, color: '#dceeff', letterSpacing: 0.6 }}>
          {st.label}
        </span>
        <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#6d8296' }}>
          {STRUCTURES[st.kind].name.toUpperCase()}
          {st.buildT > 0 ? ` · BUILDING ${Math.ceil(st.buildT)}S` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} title="Close"
          style={{
            width: 22, height: 20, cursor: 'pointer', borderRadius: 2, padding: 0,
            border: '1px solid #22303d', background: 'rgba(18,26,34,0.9)', color: '#8fb0c8',
            fontFamily: 'inherit', fontSize: FZ.label, lineHeight: 1,
          }}>✕</button>
      </div>

      {qrfPending && (
        <QrfWarning slotId={qrfPending}
          onProceed={() => { proceedFieldSlot(qrfPending); setQrfPending(null) }}
          onCancel={() => setQrfPending(null)} />
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: 14, padding: '8px 10px 10px', alignItems: 'start',
      }}>
        {/* GARRISON FIRST. It is the answer to the question that gets asked
            under contact — what else can I put on the ground from here —
            and it is the longest list, so it leads. */}
        <Column label="GARRISON" count={`${garrison.length}`}>
          {garrison.length === 0 && (
            <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152', padding: '2px 7px' }}>
              NOBODY LEFT IN BARRACKS
            </span>
          )}
          {unitCats().map(c => {
            const list = garrison.filter(sl => UNIT_TYPES[sl.type as UnitTypeKey].cat === c)
            if (!list.length) return null
            return (
              <div key={c}>
                <div style={{
                  fontFamily: UI, fontSize: FZ.hint, color: '#3d4f60', letterSpacing: 1,
                  padding: '5px 7px 1px',
                }}>{c}</div>
                {list.map(sl => {
                  const it = slotItem(sl, true)
                  return (
                    <Row key={sl.id} it={{ ...it, label: `${sl.name} · ${ownerOf(sl)}` }}
                      onClick={() => { if (!it.disabled) guardedFieldSlot(it.key!, setQrfPending) }} />
                  )
                })}
              </div>
            )
          })}
        </Column>

        {/* THE REACTION FORCE. Always drawn, even empty: a base with nothing
            standing to is a fact the commander needs to see, not a section that
            quietly disappears. */}
        <Column label="QRF" count={qrf?.items.length ? `${qrf.items.length} ON DUTY` : 'NONE'}>
          {qrf?.items.map(it => (
            <Row key={it.mode} it={it} onClick={() => runItem(it, ctx?.sourceId)} />
          ))}
          {!dedicating && candidates.length > 0 && (
            <button onClick={() => setDedicating(true)}
              style={{
                textAlign: 'left', padding: '3px 7px', cursor: 'pointer', fontFamily: UI,
                fontSize: FZ.hint, color: '#8fb0c8', background: 'none', border: 'none',
              }}>＋ DEDICATE AN ELEMENT</button>
          )}
          {dedicating && candidates.map(sl => {
            const t = UNIT_TYPES[sl.type as UnitTypeKey]
            return (
              <Row key={sl.id}
                it={{
                  mode: `ded:${sl.id}`, label: `${sl.name} · ${ownerOf(sl)}`,
                  icon: <PaletteIcon unit={t} w={30} h={21} scale={0.8} />,
                }}
                onClick={() => { toggleQrf(sl.id); setDedicating(false) }} />
            )
          })}
          {!candidates.length && !qrf?.items.length && (
            <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152', padding: '2px 7px' }}>
              NO GARRISON HERE TO STAND QRF
            </span>
          )}
        </Column>

        {/* and whatever else this base is — facilities, tethered ISR, and at
            the HQ the division request lines */}
        {sections.map(sec => (
          <Column key={sec.header} label={sec.header} count={`${sec.items.length}`}>
            {sec.items.map(it => (
              <Row key={it.mode} it={it} onClick={() => {
                runItem(it, ctx?.sourceId)
                // a row that arms a map mode has to get out of the way of the
                // map click it is asking for
                if (!isOneClick(it, ctx?.sourceId)) onClose()
              }} />
            ))}
            {!sec.items.length && (
              <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152', padding: '2px 7px' }}>
                NONE
              </span>
            )}
          </Column>
        ))}
      </div>
    </div>
  )
}
