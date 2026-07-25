// FORCES rail (component): THE FORCE, by state — battle groups (with ADD
// UNIT task-organization), independents, and the CALL UP picker over the
// garrison. CommandRail manages bases; this rail manages the force; S1 is
// the deep dive. Collapses to its own strip, JBC-P style.
import { useState } from 'react'
import { Box, Text } from '@mantine/core'
import { S } from '../engine/state'
import type { OrgSlot, Unit } from '../engine/GameState'
import { fieldSlot } from '../domains/installations/orders'
import { releaseQrf } from '../domains/defense/qrf'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { useUI } from './store'
import Rail, { RailSection } from './Rail'
import { PaletteIcon, PaletteRow, garrisonSections, garrisonSlots, slotItem } from './palette'
import { centerView } from '../map/view'

// Manual deployment of a DEDICATED QRF element: warn first (unless the
// commander checked "don't warn again"), and deploying releases the duty.
// `warn` receives the slot id to render the inline confirm; `after` runs on
// the fielded unit (e.g. joining a battle group).
function guardedFieldSlot(slotId: string, warn: (id: string) => void, after?: (u: Unit) => void): void {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl) return
  if (sl.qrf && !useUI.getState().qrfWarnOff) return warn(slotId)
  if (sl.qrf) releaseQrf(sl)
  const u = fieldSlot(slotId)
  if (u && after) after(u)
}
function proceedFieldSlot(slotId: string, after?: (u: Unit) => void): void {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (sl?.qrf) releaseQrf(sl)
  const u = fieldSlot(slotId)
  if (u && after) after(u)
}

// the in-rail QRF warning (no popouts): amber block with the release
// consequence, a session-wide "don't warn again", and the two calls
function QrfWarning({ slotId, onProceed, onCancel }: {
  slotId: string; onProceed: () => void; onCancel: () => void
}) {
  const ui = useUI()
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl) return null
  const btn: React.CSSProperties = {
    padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
    background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
    color: '#dceeff', fontSize: 9, letterSpacing: 1,
  }
  return (
    <Box mx={6} my={4} px={8} py={6}
      style={{ border: '1px solid #6a4a2a', borderLeft: '3px solid #e8b34a', borderRadius: 3, background: 'rgba(40,28,14,0.45)' }}>
      <Text fz={10} fw={700} c="#e8b34a" style={{ letterSpacing: 1 }}>
        ⚠ {sl.name.toUpperCase()} IS DEDICATED QRF
      </Text>
      <Text fz={9.5} c="dark.1" lh={1.5}>
        Deploying releases it from QRF — its base loses that reaction force.
      </Text>
      <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 9, color: '#9ab8d0', margin: '5px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={ui.qrfWarnOff}
          onChange={e => useUI.setState({ qrfWarnOff: e.currentTarget.checked })} />
        DON'T WARN ME AGAIN
      </label>
      <Box style={{ display: 'flex', gap: 6 }}>
        <button style={{ ...btn, borderColor: '#6a4a2a', color: '#e8b34a' }} onClick={onProceed}>DEPLOY ANYWAY</button>
        <button style={btn} onClick={onCancel}>CANCEL</button>
      </Box>
    </Box>
  )
}

export default function ForcesRail() {
  const ui = useUI()
  return (
    <>
      <Rail side="left" title="FORCES" width={270} open={ui.bgOpen} onToggle={ui.toggleBg}
        footer={
          // CALL UP is a BUTTON pinned to the rail's bottom — the picker is a
          // flyout panel to the right; the rail's body belongs to the force
          <div data-tut="call-up">
            <PaletteRow label="＋ CALL UP" tag="FIELD AN ELEMENT FROM GARRISON" cost=""
              active={ui.callupOpen}
              onClick={() => useUI.setState({ callupOpen: !ui.callupOpen })} />
          </div>
        }>
        <BattleGroups />
        <Box h={8} />
      </Rail>
      {ui.bgOpen && ui.callupOpen && <CallUpFlyout />}
    </>
  )
}

// The fielded force, as the S3 sees it: formed battle groups first (units
// sharing a groupId), then the independents. Click = select + centre.
// ADD UNIT: task-organize into an existing group — attach a fielded
// independent, or call an element up FROM GARRISON (field + join in one
// click). Forces are generated at a base, organized out here.
function BattleGroups() {
  const ui = useUI()
  const [adding, setAdding] = useState<number | null>(null)
  const [qrfPending, setQrfPending] = useState<{ slotId: string; gid: number } | null>(null)
  const units = S.units.filter(u => u.side === 'friend' && u.strength > 0)
  const groups = new Map<number, typeof units>()
  const solo: typeof units = []
  for (const u of units) {
    if (u.groupId != null) {
      if (!groups.has(u.groupId)) groups.set(u.groupId, [])
      groups.get(u.groupId)!.push(u)
    } else solo.push(u)
  }
  const row = (u: (typeof units)[number]) => {
    const type = UNIT_TYPES[u.type]
    const active = ui.selectedIds.includes(u.id)
    return (
      <PaletteRow key={u.id} active={active}
        icon={<PaletteIcon unit={type} w={56} h={38} scale={1.55} />}
        label={`${u.label} · ${type.abbr}`}
        tag={`${u.lineage ?? ''}${u.attFrom ? ` · ATT ${u.attFrom}` : ''}`}
        note={`${Math.max(0, Math.round(u.strength))}%`}
        cost=""
        onClick={() => {
          ui.select(u.id)
          centerView(u)
        }} />
    )
  }
  return (
    <>
      {/* INDEPENDENT leads; the commander's formed groups follow. (Deliberate
          NAMED group creation — "＋ NEW GROUP" — is a coming feature; groups
          currently form from group move orders / box-select.) */}
      <RailSection label={`Independent (${solo.length})`}>
        {solo.length === 0 && <Text fz={10} c="dark.3" px="xs">NONE FIELDED</Text>}
        {solo.map(row)}
      </RailSection>
      {[...groups.entries()].map(([gid, list]) => (
        <RailSection key={gid} label={`BG ${gid} (${list.length})`}>
          {list.map(row)}
          {adding !== gid && (
            <PaletteRow label="＋ ADD UNIT" tag="ATTACH AN INDEPENDENT OR CALL UP FROM GARRISON" cost=""
              onClick={() => setAdding(gid)} />
          )}
          {adding === gid && (
            <>
              <Text fz={9} c="dark.3" px="xs" pt={4} style={{ letterSpacing: 1 }}>
                ATTACH TO THIS GROUP:
              </Text>
              {solo.map(u => {
                const t = UNIT_TYPES[u.type]
                return (
                  <PaletteRow key={u.id}
                    icon={<PaletteIcon unit={t} w={34} h={24} scale={0.9} />}
                    label={`${u.label} · ${t.abbr}`} tag={u.lineage ?? null} cost=""
                    onClick={() => { u.groupId = gid; setAdding(null) }} />
                )
              })}
              {/* garrisoned elements can join too: fielding + tasking in one
                  click — they stage from their base and rally to the group */}
              {qrfPending?.gid === gid && (
                <QrfWarning slotId={qrfPending.slotId}
                  onProceed={() => {
                    proceedFieldSlot(qrfPending.slotId, u => { u.groupId = gid })
                    setQrfPending(null); setAdding(null)
                  }}
                  onCancel={() => setQrfPending(null)} />
              )}
              {garrisonSections(true).flatMap(sec => sec.items).filter(it => !it.disabled).map(it => (
                <PaletteRow key={it.key} icon={it.icon} label={it.label}
                  tag={`FROM GARRISON · ${it.tag ?? ''}`} cost=""
                  onClick={() => {
                    guardedFieldSlot(it.key!, id => setQrfPending({ slotId: id, gid }), u => {
                      u.groupId = gid
                      setAdding(null)
                    })
                  }} />
              ))}
              <PaletteRow label="CANCEL" cost="" onClick={() => { setAdding(null); setQrfPending(null) }} />
            </>
          )}
        </RailSection>
      ))}
    </>
  )
}

// CALL UP: the garrison stays out of sight until the commander reaches for it
// (deep dive = S1). The picker is IN-RAIL (no popouts): choose the garrison
// to pull from (chips — only when more than one base holds troops), filter by
// unit type (small icon tabs), click ⊕ to field. Stays open for multiple
// call-ups; DONE closes it. State lives in the UI store so the tutorial's
// conditions can see it.
// The CALL UP picker: a FLYOUT PANEL to the right of the FORCES rail (the
// rail's body belongs to active units). Choose the garrison to pull from
// (chips — only when more than one base holds troops), filter by unit type
// (small icon tabs), click ⊕ to field. Stays open for multiple call-ups.
function CallUpFlyout() {
  const ui = useUI()
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const slots = garrisonSlots(true)
  const close = () => useUI.setState({ callupOpen: false, callupBase: null, callupType: null })
  const hqId = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')?.id ?? null
  const baseOf = (sl: OrgSlot) =>
    S.structures.some(s => s.id === sl.garrisonAt && s.side === 'friend') ? sl.garrisonAt! : hqId
  const bases = [...new Set(slots.map(baseOf))]
    .map(id => S.structures.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
  const inBase = ui.callupBase != null ? slots.filter(sl => baseOf(sl) === ui.callupBase) : slots
  const types = [...new Set(inBase.map(sl => sl.type as UnitTypeKey))]
  const list = ui.callupType ? inBase.filter(sl => sl.type === ui.callupType) : inBase
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '2px 7px', borderRadius: 2, fontSize: 9, letterSpacing: 1, cursor: 'pointer',
    border: `1px solid ${active ? '#3d5a75' : '#22303d'}`,
    background: active ? '#101c28' : 'transparent',
    color: active ? '#7ec8ff' : '#54708a',
  })
  return (
    <Box w={250} style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'var(--mantine-color-dark-7)',
      borderRight: '1px solid var(--mantine-color-dark-4)',
    }}>
      {/* flyout header: what this panel is + the way out */}
      <Box px="xs" py={6} style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--mantine-color-dark-5)', background: 'var(--mantine-color-dark-8)',
      }}>
        <Text span fz={10} fw={700} c="toc.3" style={{ letterSpacing: 1.8, flex: 1 }}>
          GARRISON — CALL UP
        </Text>
        <Text span fz={12} c="dark.2" style={{ cursor: 'pointer' }} onClick={close}>✕</Text>
      </Box>
      <Box px="xs" pt={6} style={{ flex: '0 0 auto' }}>
        {bases.length > 1 && (
          <Box pb={4} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <div style={chip(ui.callupBase == null)}
              onClick={() => useUI.setState({ callupBase: null })}>ALL BASES</div>
            {bases.map(b => (
              <div key={b.id} style={chip(ui.callupBase === b.id)}
                onClick={() => useUI.setState({ callupBase: b.id })}>{b.label}</div>
            ))}
          </Box>
        )}
        {/* unit-type filter: one small icon tab per type present in the garrison */}
        <Box pb={4} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={chip(ui.callupType == null)}
            onClick={() => useUI.setState({ callupType: null })}>ALL</div>
          {types.map(t => {
            const spec = UNIT_TYPES[t]
            const n = inBase.filter(sl => sl.type === t).length
            const active = ui.callupType === t
            return (
              <div key={t} title={`${spec.name} (${n})`}
                style={{ ...chip(active), display: 'flex', alignItems: 'center', gap: 3, padding: '1px 5px' }}
                onClick={() => useUI.setState({ callupType: active ? null : t })}>
                <PaletteIcon unit={spec} w={26} h={18} scale={0.7} />
                <span>{n}</span>
              </div>
            )
          })}
        </Box>
      </Box>
      {qrfPending && (
        <QrfWarning slotId={qrfPending}
          onProceed={() => { proceedFieldSlot(qrfPending); setQrfPending(null) }}
          onCancel={() => setQrfPending(null)} />
      )}
      {/* the callable elements — the tutorial rings the WHOLE list (the pick
          is the commander's, not one prescribed row). The anchor sits on an
          INNER div that hugs the rows, so the ring stops at the last unit
          instead of swallowing the panel's empty space. */}
      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div data-tut="garrison-list">
        {list.map(sl => {
          const it = slotItem(sl)
          const call = () => { if (!it.disabled) guardedFieldSlot(it.key!, setQrfPending) }
          const row = (
            <PaletteRow key={it.key} icon={it.icon} label={it.label}
              tag={sl.qrf ? `✓ QRF · ${it.tag ?? ''}` : it.tag}
              note={it.note} cost="" disabled={it.disabled}
              onPlus={it.disabled ? undefined : call}
              onClick={call} />
          )
          return it.tutSel ? <div key={it.key} data-tut={it.tutSel}>{row}</div> : row
        })}
        {list.length === 0 && <Text fz={10} c="dark.3" px="xs" py={6}>NONE AVAILABLE HERE</Text>}
      </div>
      </Box>
    </Box>
  )
}
