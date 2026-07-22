// Persistent left rail. Always present (collapsible to the left edge), with the
// installations roster and the contextual deploy palette as sections. Replaces the
// transient deploy panel that only existed while something deployable was selected.
import { Box, Text } from '@mantine/core'
import { S, fieldUnit, forceCount, forceCap } from '../game/sim.js'
import { STRUCTURES } from '../game/units.js'
import { useUI } from './store.js'
import { RAIL_W } from './styles.js'
import Rail, { RailSection } from './Rail.jsx'
import { PaletteIcon, PaletteRow, deployContext, deployHint } from './palette.jsx'

const ROSTER_KINDS = ['HQ', 'FOB', 'AFLD', 'OP']

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
        return (
          <PaletteRow key={st.id} active={active}
            icon={<PaletteIcon struct={spec} w={34} h={24} scale={0.82} />}
            label={st.label}
            // no static abbreviation sub-label — the symbol and name cover it. Only the
            // build countdown earns the second line, because it changes.
            tag={st.buildT > 0 ? `BUILDING ${Math.ceil(st.buildT)}s` : null}
            cost=""
            onClick={() => {
              ui.select(st.id)
              const v = window.__view
              if (v) { v.cx = st.x; v.cy = st.y }
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
  const pick = (mode) => ui.setMode(ui.mode === mode ? 'select' : mode)

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
            // ground units field immediately from the selected site — no deploy mode,
            // no map click. Everything else still picks a spot on the map.
            const oneClick = it.field && ctx.sourceId != null
            const short = oneClick && ctx.purse != null && ctx.purse < it.cost
            return (
              <PaletteRow key={it.mode} icon={it.icon} label={it.label} tag={it.tag} cost={it.cost}
                note={it.note} disabled={it.disabled || short}
                onPlus={oneClick ? () => fieldUnit(it.key, ctx.sourceId) : undefined}
                active={!oneClick && ui.mode === it.mode}
                onClick={() => (oneClick ? fieldUnit(it.key, ctx.sourceId) : pick(it.mode))} />
            )
          })}
        </RailSection>
      ))}
    </>
  )
}
