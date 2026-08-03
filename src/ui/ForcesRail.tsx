// FORCES rail (component): THE FORCE, by state — battle groups (with ADD
// UNIT task-organization), independents, and the CALL UP picker over the
// garrison. CommandRail manages bases; this rail manages the force; S1 is
// the deep dive. Collapses to its own strip, JBC-P style.
import { useState } from 'react'
import { Box, Text } from '@mantine/core'
import { S } from '../engine/state'
import { underPlayerCommand, commandsStructure } from '../domains/forces/command'
import type { OrgSlot, Unit } from '../engine/GameState'
import { fieldSlot } from '../domains/installations/orders'
import { releaseQrf } from '../domains/defense/qrf'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { useUI } from './store'
import Rail, { RailSection } from './Rail'
import { unitCats, PaletteIcon, PaletteRow, garrisonSections, garrisonSlots, slotItem } from './palette'
import { DrillRow, TreeLeaf } from './tree'
import { slotStrength } from '../packs/org'
import { ownerOf } from '../packs/orgquery'
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
      {/* the CALL UP picker flies out to the LEFT of the Forces panel */}
      {ui.bgOpen && ui.callupOpen && <CallUpFlyout />}
      <Rail side="left" title="FORCES" width={270} open={ui.bgOpen} onToggle={ui.toggleBg}
        tut="rail-forces"
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
  // YOUR force — a sister formation's platoons are on the map and on your
  // side, but they are not in your task organization and never in your rail
  const units = S.units.filter(u => underPlayerCommand(u) && u.strength > 0)
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

// The CALL UP picker: a FLYOUT PANEL to the right of the FORCES rail (the
// rail's body belongs to active units). It drills the way the question is
// actually asked — WHERE (which garrison holds troops), then WHAT (the
// capability under contact), then WHO (the company that owns the platoon).
// Everything starts shut; the panel stays open for multiple call-ups.
function CallUpFlyout() {
  const ui = useUI()
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const slots = garrisonSlots(true)
  const close = () => useUI.setState({
    callupOpen: false, callupBase: null, callupCat: null, callupCos: [],
  })
  // YOUR command post — a sister formation's installations are on the map but
  // are not places your battalion stages from
  const hqId = S.structures.find(s =>
    s.kind === 'HQ' && commandsStructure(s))?.id ?? null
  const baseOf = (sl: OrgSlot) =>
    S.structures.some(s => s.id === sl.garrisonAt && commandsStructure(s)) ? sl.garrisonAt! : hqId
  // WHERE the force sits: every base YOU command holding callable troops, HQ
  // first (a FOB only appears once it is built and has soldiers in it)
  const bases = [...new Set(slots.map(baseOf))]
    .map(id => S.structures.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s && commandsStructure(s))
    .map(b => ({ b, list: slots.filter(sl => baseOf(sl) === b.id) }))
  const catOf = (sl: OrgSlot) => UNIT_TYPES[sl.type as UnitTypeKey].cat
  const cat = ui.callupCat
  // group a category's elements the way the force is actually organized: by the
  // COMPANY that owns the platoons (order follows the org, not the alphabet)
  const cosOf = (list: OrgSlot[]) => {
    const cos: { key: string; co: string; bn: string; list: OrgSlot[] }[] = []
    for (const sl of list) {
      const key = `${sl.cmd}:${ownerOf(sl)}`
      const e = cos.find(c => c.key === key)
      if (e) e.list.push(sl)
      else cos.push({ key, co: ownerOf(sl), bn: sl.cmd, list: [sl] })
    }
    return cos
  }
  return (
    <Box w={340} style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'var(--mantine-color-dark-7)',
      borderRight: '1px solid var(--mantine-color-dark-4)',
    }}>
      {/* flyout header: what this panel is + the way out */}
      <Box px="xs" py={6} style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--mantine-color-dark-5)', background: 'var(--mantine-color-dark-8)',
      }}>
        <Text span fz={12} fw={700} c="toc.3" style={{ letterSpacing: 1.8, flex: 1 }}>
          GARRISON — CALL UP
        </Text>
        <Text span fz={14} c="dark.2" style={{ cursor: 'pointer' }} onClick={close}>✕</Text>
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
        {/* GARRISON — you cannot call up a force without saying where it is
            standing to. HQ at H-hour; a FOB joins the list once it is built. */}
        {bases.map(({ b, list: inBase }) => {
          const baseOpen = ui.callupBase === b.id
          return (
            <div key={b.id}>
              <DrillRow tut={`callup-base-${b.kind}`} label={b.label}
                n={inBase.length} str={slotStrength(inBase)} open={baseOpen}
                onClick={() => useUI.setState({
                  callupBase: baseOpen ? null : b.id, callupCat: null,
                })} />
              {/* CAPABILITY — the question under contact, one open at a time
                  (an accordion: opening ARMOR shuts whatever was open) */}
              {baseOpen && unitCats().map(c => {
                const list = inBase.filter(sl => catOf(sl) === c)
                if (!list.length) return null
                const open = cat === c
                return (
                  <div key={c}>
                    <DrillRow depth={1} tut={`callup-cat-${c}`} label={c}
                      n={list.length} str={slotStrength(list)} open={open}
                      onClick={() => useUI.setState({ callupCat: open ? null : c })} />
                    {/* COMPANY — how the force is actually organized */}
                    {open && cosOf(list).map(co => {
                      // keyed by CATEGORY too: 2-8 CAV's HHC owns scouts,
                      // mortars and medics, and opening one must not open the rest
                      const ck = `${c}|${co.key}`
                      const coOpen = ui.callupCos.includes(ck)
                      return (
                        <div key={ck}>
                          <DrillRow depth={2} tut={`callup-co-${c}-${co.co}`}
                            label={`${co.co} · ${co.bn}`} n={co.list.length}
                            str={slotStrength(co.list)} open={coOpen}
                            onClick={() => useUI.setState(s => ({
                              callupCos: coOpen
                                ? s.callupCos.filter(k => k !== ck)
                                : [...s.callupCos, ck],
                            }))} />
                          {coOpen && co.list.map(sl => {
                            const it = slotItem(sl, true)
                            const call = () => {
                              if (!it.disabled) guardedFieldSlot(it.key!, setQrfPending)
                            }
                            return (
                              <TreeLeaf key={it.key} tut={it.tutSel} icon={it.icon}
                                label={it.label} note={it.note} disabled={it.disabled}
                                onClick={call}
                                tag={sl.qrf ? `✓ QRF · ${it.tag ?? ''}` : it.tag} />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
        {bases.length === 0 && (
          <Text fz={10} c="dark.3" px="xs" py={6}>NONE AVAILABLE HERE</Text>
        )}
      </div>
      </Box>
    </Box>
  )
}
