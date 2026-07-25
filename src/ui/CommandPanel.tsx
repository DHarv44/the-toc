// The left side (P5, reworked task #34): TWO independent flyout rails side by
// side, JBC-P style — COMMAND (bases, the GARRISON by echelon — fielding calls
// up real org elements — plus each base's facilities/ISR/QRF) and BATTLE
// GROUPS (the fielded force — formed groups first, then independents, with
// ADD UNIT task-organization). Each collapses to its own strip.
import { useState } from 'react'
import { Box, Text } from '@mantine/core'
import { S } from '../engine/state'
import { fieldSlot, fieldUnit, installFacility } from '../domains/installations/orders'
import { fieldAerostat, fieldUnitDrone } from '../domains/air/orders'
import { requestAsset } from '../domains/assets/service'
import { toggleQrf } from '../domains/defense/qrf'
import type { DroneTypeKey } from '../domains/air/catalog'
import type { FacilityKey } from '../domains/installations/catalog'
import { forceCount, forceCap } from '../domains/economy/economy'
import { STRUCTURES, type StructureTypeKey } from '../domains/installations/catalog'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { useUI, type UiMode } from './store'
import { RAIL_W } from './styles'
import Rail, { RailSection } from './Rail'
import { PaletteIcon, PaletteRow, deployContext, deployHint } from './palette'

const ROSTER_KINDS: readonly StructureTypeKey[] = ['HQ', 'FOB', 'AFLD', 'OP']

export default function CommandPanel() {
  const ui = useUI()
  return (
    <Rail side="left" title="COMMAND" width={RAIL_W.left} open={ui.leftOpen} onToggle={ui.toggleLeft}
      footer={
        <>
          <Text fz={9} c={forceCount() >= forceCap() ? 'orange.5' : 'dark.2'} lh={1.5}>
            FORCE {forceCount()}/{forceCap()}
          </Text>
          <Text fz={9} c="dark.2" lh={1.5}>{deployHint(ui.mode)}</Text>
        </>
      }>
      <InstallationsRoster />
      <DeploySection />
      <Box h={8} />
    </Rail>
  )
}

// The second left rail: the fielded force. Sits beside INSTALLATIONS — both,
// one or neither open, JBC-P style.
export function BattleGroupsPanel() {
  const ui = useUI()
  return (
    <Rail side="left" title="BATTLE GROUPS" width={240} open={ui.bgOpen} onToggle={ui.toggleBg}>
      <BattleGroups />
      <Box h={8} />
    </Rail>
  )
}

// Live list of friendly installations: click to select and centre, which also drives
// what the deploy palette below offers.
function InstallationsRoster() {
  const ui = useUI()
  const sites = S.structures
    .filter(s => s.side === 'friend')
    .sort((a, b) => ROSTER_KINDS.indexOf(a.kind) - ROSTER_KINDS.indexOf(b.kind))

  return (
    <RailSection label={`Installations (${sites.length})`}>
      {sites.length === 0 && (
        <Text fz={10} c="dark.3" px="xs">NONE ESTABLISHED</Text>
      )}
      {sites.map(st => {
        const spec = STRUCTURES[st.kind]
        const active = ui.selectedIds.length === 1 && ui.selectedIds[0] === st.id
        const facs = (st.facilities ?? []).length
        return (
          <PaletteRow key={st.id} active={active}
            icon={<PaletteIcon struct={spec} w={34} h={24} scale={0.82} />}
            label={st.label}
            // build countdown or the facility count — the changing facts
            tag={st.buildT > 0 ? `BUILDING ${Math.ceil(st.buildT)}s`
              : facs > 0 ? `${facs} ${facs === 1 ? 'FACILITY' : 'FACILITIES'}` : null}
            cost=""
            onClick={() => {
              ui.select(st.id)
              const v = (window as unknown as { __view?: { cx: number; cy: number } }).__view
              if (v) { v.cx = st.x; v.cy = st.y }
            }} />
        )
      })}
    </RailSection>
  )
}

// The fielded force, as the S3 sees it: formed battle groups first (units
// sharing a groupId), then the independents. Click = select + centre.
// ADD UNIT (task #34): task-organize a fielded INDEPENDENT into an existing
// group — attach in the field, never field from here (forces are generated
// at a base, organized out here).
function BattleGroups() {
  const ui = useUI()
  const [adding, setAdding] = useState<number | null>(null)
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
          const v = (window as unknown as { __view?: { cx: number; cy: number } }).__view
          if (v) { v.cx = u.x; v.cy = u.y }
        }} />
    )
  }
  return (
    <>
      {[...groups.entries()].map(([gid, list]) => (
        <RailSection key={gid} label={`BG ${gid} (${list.length})`}>
          {list.map(row)}
          {solo.length > 0 && adding !== gid && (
            <PaletteRow label="＋ ADD UNIT" tag="ATTACH AN INDEPENDENT" cost=""
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
              <PaletteRow label="CANCEL" cost="" onClick={() => setAdding(null)} />
            </>
          )}
        </RailSection>
      ))}
      <RailSection label={`Independent (${solo.length})`}>
        {solo.length === 0 && <Text fz={10} c="dark.3" px="xs">NONE FIELDED</Text>}
        {solo.map(row)}
      </RailSection>
    </>
  )
}

// The contextual palette: what the current selection is allowed to field. Keeps an
// empty state now that the rail is permanent, instead of the whole panel vanishing.
function DeploySection() {
  const ui = useUI()
  const ctx = deployContext(ui.selectedIds)
  const pick = (mode: string) => ui.setMode((ui.mode === mode ? 'select' : mode) as UiMode)

  if (!ctx) {
    return (
      <RailSection label="Deploy">
        <Text fz={10} c="dark.3" lh={1.5} px="xs">
          SELECT AN HQ, FOB OR AIRFIELD ABOVE — OR AN ENGINEER / DRONE CARRIER ON THE MAP — TO FIELD FROM IT.
        </Text>
      </RailSection>
    )
  }

  return (
    <>
      <RailSection label="Deploy">
        <Text fz={9.5} c="toc.3" px="xs" pb={2} truncate style={{ letterSpacing: 1 }}>{ctx.title}</Text>
      </RailSection>
      {ctx.sections.map((sec, si) => (
        <RailSection key={si} label={sec.header}>
          {sec.items.map(it => {
            // ground units, the aerostat, organic UAS and facility build-outs all
            // act immediately from the selected site/unit — no deploy mode, no
            // map click. Airfield UAS still place an orbit point on the map.
            const oneClick = (it.field || it.fieldSlot || it.fieldAero || it.fieldDrone || it.installFac || it.reqAsset || it.qrfToggle) && ctx.sourceId != null
            const fire = () => {
              if (it.fieldSlot) return void fieldSlot(it.key!, ctx.sourceId!)
              if (it.qrfToggle) return void toggleQrf(Number(it.key))
              if (it.reqAsset) return void requestAsset(it.key!, ctx.sourceId)
              if (it.installFac) return void installFacility(ctx.sourceId!, it.key as FacilityKey)
              if (it.fieldDrone) {
                // organic UAS: launch it straight over the carrying unit and pop its feed
                const d = fieldUnitDrone(ctx.sourceId!, it.key as DroneTypeKey)
                if (d && d.id != null) ui.showDrone(d.id)
                return
              }
              if (!it.fieldAero) return void fieldUnit(it.key as UnitTypeKey, ctx.sourceId!)
              // raising the aerostat pops its feed straight up (or takes a slot at max)
              const d = fieldAerostat(ctx.sourceId!)
              if (d && d.id != null) ui.showDrone(d.id)
            }
            const row = (
              <PaletteRow key={it.mode} icon={it.icon} label={it.label} tag={it.tag} cost={it.cost}
                note={it.note} disabled={it.disabled}
                onPlus={oneClick ? fire : undefined}
                active={!oneClick && ui.mode === it.mode}
                onClick={() => (oneClick ? fire() : pick(it.mode))} />
            )
            // tag rows the campaign tutorial highlights: garrison rows carry
            // their own `field-<TYPE>` anchor (tutSel), plus the Raven launch
            // and FOB build rows
            const tutTag = it.tutSel
              ?? (it.key === 'RAVEN' ? 'uas-raven'
                : it.mode === 'build:FOB' ? 'build-fob'
                : it.field && it.key ? `field-${it.key}` : null)
            return tutTag
              ? <div key={it.mode} data-tut={tutTag}>{row}</div>
              : row
          })}
        </RailSection>
      ))}
    </>
  )
}
