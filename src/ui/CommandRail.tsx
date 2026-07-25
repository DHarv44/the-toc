// COMMAND rail (component): BASE management — the installations roster and
// the selected base's palette (facilities, tethered ISR, division requests,
// QRF). The FORCE lives in ForcesRail; the deep dive is S1. Collapses to its
// own strip, JBC-P style (ForcesRail sits beside it).
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
import { type UnitTypeKey } from '../domains/forces/catalog'
import { useUI, type UiMode } from './store'
import { RAIL_W } from './styles'
import Rail, { RailSection } from './Rail'
import { PaletteIcon, PaletteRow, deployContext, deployHint } from './palette'
import { centerView } from '../map/view'

const ROSTER_KINDS: readonly StructureTypeKey[] = ['HQ', 'FOB', 'AFLD', 'OP']

export default function CommandRail() {
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
              centerView(st)
            }} />
        )
      })}
    </RailSection>
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
            // the aerostat, organic UAS and facility build-outs all act
            // immediately from the selected site/unit — no deploy mode, no
            // map click. Airfield UAS still place an orbit point on the map.
            const oneClick = (it.field || it.fieldSlot || it.fieldAero || it.fieldDrone || it.installFac || it.reqAsset || it.qrfToggle) && ctx.sourceId != null
            const fire = () => {
              if (it.fieldSlot) return void fieldSlot(it.key!, ctx.sourceId!)
              if (it.qrfToggle) return void toggleQrf(it.key!)
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
            // tag rows the campaign tutorial highlights (published anchors):
            // the Raven launch and FOB build rows, plus any row carrying its
            // own tutSel
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
