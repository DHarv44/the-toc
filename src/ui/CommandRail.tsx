// COMMAND rail (component): BASE management — every friendly installation and
// what it can put up: tethered ISR, division requests, facilities, and the
// Quick Reaction Force standing at its wire. The FORCE lives in ForcesRail;
// the deep dive is S1. Collapses to its own strip, JBC-P style.
//
// Same TREE grammar as CALL UP (ui/tree.tsx): the commander picks the PLACE
// first, then the capability, then the thing. A base is a place with several
// answers hanging off it — listing all of them flat was a wall of rows.
import { Box, Text } from '@mantine/core'
import { S } from '../engine/state'
import { fieldSlot, fieldUnit, installFacility } from '../domains/installations/orders'
import { fieldAerostat, fieldUnitDrone } from '../domains/air/orders'
import { requestAsset } from '../domains/assets/service'
import { toggleQrf, qrfRoster } from '../domains/defense/qrf'
import type { DroneTypeKey } from '../domains/air/catalog'
import type { FacilityKey } from '../domains/installations/catalog'
import { forceCount, forceCap } from '../domains/economy/economy'
import { STRUCTURES, type StructureTypeKey } from '../domains/installations/catalog'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { useUI, type UiMode } from './store'
import { RAIL_W } from './styles'
import Rail, { RailSection } from './Rail'
import { DrillRow, TreeLeaf } from './tree'
import {
  deployContext, deployHint, unitCats, slotItem,
  type PaletteItem, type DeployContext,
} from './palette'
import { slotStrength } from '../packs/org'
import { ownerOf } from '../packs/orgquery'
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
      <InstallationsTree />
      <Box h={8} />
    </Rail>
  )
}

// Every friendly installation, as a drill: the base is the rung, its capability
// groups hang under it. Opening a base also SELECTS and centres it — looking at
// what a base can do and looking AT the base are the same intent.
function InstallationsTree() {
  const ui = useUI()
  const sites = S.structures
    .filter(s => s.side === 'friend')
    .sort((a, b) => ROSTER_KINDS.indexOf(a.kind) - ROSTER_KINDS.indexOf(b.kind))

  return (
    <RailSection label={`Installations (${sites.length})`}>
      {sites.length === 0 && <Text fz={10} c="dark.3" px="xs">NONE ESTABLISHED</Text>}
      {sites.map(st => {
        const key = `base:${st.id}`
        const open = ui.cmdOpen.includes(key)
        const ctx = open ? deployContext([st.id]) : null
        return (
          <div key={st.id}>
            <DrillRow label={st.label} open={open}
              note={st.buildT > 0 ? `BUILDING ${Math.ceil(st.buildT)}s`
                : STRUCTURES[st.kind].name.toUpperCase()}
              onClick={() => {
                ui.toggleCmd(key)
                ui.select(st.id)
                centerView(st)
              }} />
            {open && !ctx && (
              <Text fz={10} c="dark.3" pl={20} py={4}>
                {st.buildT > 0 ? 'UNDER CONSTRUCTION' : 'NOTHING TO FIELD FROM HERE'}
              </Text>
            )}
            {open && ctx && ctx.sections.map(sec => {
              const gk = `${key}|${sec.header}`
              const gOpen = ui.cmdOpen.includes(gk)
              const isQrf = sec.header === 'QRF'
              return (
                <div key={sec.header}>
                  <DrillRow depth={1} label={sec.header} open={gOpen}
                    note={isQrf
                      ? (sec.items.length ? `${sec.items.length} ON DUTY` : 'NONE ASSIGNED')
                      : `${sec.items.length}`}
                    onClick={() => ui.toggleCmd(gk)} />
                  {gOpen && sec.items.map(it => (
                    <PaletteLeaf key={it.mode} it={it} ctx={ctx} />
                  ))}
                  {gOpen && isQrf && <QrfDedicate structId={st.id} />}
                  {gOpen && !sec.items.length && !isQrf && (
                    <Text fz={10} c="dark.3" pl={32} py={4}>NONE</Text>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </RailSection>
  )
}

// A palette item as a tree leaf. The action is the SAME set the flat palette
// ran — one-click for anything the site does on its own (field, install,
// request, QRF toggle), deploy MODE for anything that needs a map click.
function PaletteLeaf({ it, ctx }: { it: PaletteItem; ctx: DeployContext }) {
  const ui = useUI()
  const oneClick = (it.field || it.fieldSlot || it.fieldAero || it.fieldDrone
    || it.installFac || it.reqAsset || it.qrfToggle) && ctx.sourceId != null
  const fire = () => {
    if (it.fieldSlot) return void fieldSlot(it.key!, ctx.sourceId!)
    if (it.qrfToggle) return void toggleQrf(it.key!)
    if (it.reqAsset) return void requestAsset(it.key!, ctx.sourceId)
    if (it.installFac) return void installFacility(ctx.sourceId!, it.key as FacilityKey)
    if (it.fieldDrone) {
      const d = fieldUnitDrone(ctx.sourceId!, it.key as DroneTypeKey)
      if (d && d.id != null) ui.showDrone(d.id)
      return
    }
    if (!it.fieldAero) return void fieldUnit(it.key as UnitTypeKey, ctx.sourceId!)
    const d = fieldAerostat(ctx.sourceId!)
    if (d && d.id != null) ui.showDrone(d.id)
  }
  const pick = () => ui.setMode((ui.mode === it.mode ? 'select' : it.mode) as UiMode)
  // tutorial anchors the flat palette published — keep them on the leaf
  const tut = it.tutSel
    ?? (it.key === 'RAVEN' ? 'uas-raven'
      : it.mode === 'build:FOB' ? 'build-fob'
        : it.field && it.key ? `field-${it.key}` : undefined)
  return (
    <TreeLeaf depth={2} tut={tut} icon={it.icon} label={it.label} tag={it.tag}
      note={it.note} disabled={it.disabled}
      active={!oneClick && ui.mode === it.mode}
      onClick={() => (oneClick ? fire() : pick())} />
  )
}

// ＋ DEDICATE: the candidates drill, in the same grammar as CALL UP — the
// capability first, then the company that owns the platoon. Nothing shows until
// the commander asks for it, so the duty roster above stays the short list it
// is meant to be.
function QrfDedicate({ structId }: { structId: number }) {
  const ui = useUI()
  const key = `qrf-add:${structId}`
  const open = ui.cmdOpen.includes(key)
  const { standing, candidates } = qrfRoster(structId)
  if (!candidates.length) {
    return standing.length ? null : (
      <Text fz={10} c="dark.3" pl={32} py={4}>NO GARRISON HERE TO STAND QRF</Text>
    )
  }
  const catOf = (sl: typeof candidates[number]) => UNIT_TYPES[sl.type as UnitTypeKey].cat
  return (
    <>
      <TreeLeaf depth={2} label={open ? '✕ CANCEL' : '＋ DEDICATE AN ELEMENT'}
        tag={open ? null : 'PICK FROM THIS GARRISON'}
        onClick={() => ui.toggleCmd(key)} />
      {open && unitCats().map(c => {
        const list = candidates.filter(sl => catOf(sl) === c)
        if (!list.length) return null
        const ck = `qrf-cat:${structId}|${c}`
        const cOpen = ui.cmdOpen.includes(ck)
        return (
          <div key={c}>
            <DrillRow depth={2} label={c} n={list.length} str={slotStrength(list)}
              open={cOpen} onClick={() => ui.toggleCmd(ck)} />
            {cOpen && list.map(sl => {
              const it = slotItem(sl, true)
              return (
                <TreeLeaf key={sl.id} depth={3} icon={it.icon}
                  label={`${sl.name} · ${ownerOf(sl)}`} tag={it.tag} note={it.note}
                  onClick={() => { toggleQrf(sl.id); ui.toggleCmd(key) }} />
              )
            })}
          </div>
        )
      })}
    </>
  )
}

