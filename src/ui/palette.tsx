// Deploy palette primitives: the shared MIL-STD-2525 icon renderer, the row/header
// chrome, and the rules for what a given selection is allowed to field.
// Ported verbatim from src/ui/palette.jsx.
import { useRef, useEffect, type ReactNode } from 'react'
import { ActionIcon, Box, Group, Text, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import type { OrgSlot } from '../engine/GameState'
import { unitAvailability, airAvailability } from '../domains/economy/economy'
import {
  availableCount, poolOf, tfInstance, orbitAuthority, windowOpen, assetDef,
  orbitAssetKind, windowAssetKind, tetherAssetKind,
} from '../domains/assets/service'
import { fmtCooldown } from '../lib/format'
import { UNIT_TYPES, type UnitType, type UnitTypeKey } from '../domains/forces/catalog'
import { playerPack } from '../packs'
import { STRUCTURES, FACILITIES, type StructureType, type StructureTypeKey, type FacilityKey } from '../domains/installations/catalog'
import { DRONE_TYPES, type DroneType, type DroneTypeKey } from '../domains/air/catalog'
import { drawUnitSymbol, drawStructure, drawDroneIcon } from '../map/symbols'

const CATS = ['MANEUVER', 'RECON', 'FIRES', 'SUPPORT'] as const

// One symbol drawn on a canvas, sized to the row it sits in. Same art as the map,
// so the palette doubles as the symbol key.
export function PaletteIcon({ unit, struct, drone, w: W = 40, h: H = 26, scale = 1 }: {
  unit?: UnitType
  struct?: StructureType
  drone?: DroneType
  w?: number
  h?: number
  scale?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    // draw centred, then scale about the centre so the same art fits any box size
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.scale(scale, scale)
    if (unit) {
      drawUnitSymbol(ctx, 0, 1, { side: 'friend', glyph: unit.glyph, scale: 0.58, echelon: 'plt', showStrength: false, label: '' })
    } else if (struct) {
      ctx.scale(0.72, 0.72)
      drawStructure(ctx, 0, 3, { side: 'friend', kind: struct.key as StructureTypeKey, label: '' })
    } else if (drone) {
      drawDroneIcon(ctx, 0, 0, -Math.PI / 2, '', false, drone.key)
    }
    ctx.restore()
  })
  return <canvas ref={ref} style={{ width: W, height: H, flex: '0 0 auto' }} />
}

export function PaletteRow({ icon, label, tag, cost, active, onClick, disabled, note, onPlus }: {
  icon?: ReactNode
  label: string
  tag?: string | null
  cost?: number | string | null
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  note?: string | null
  onPlus?: () => void
}) {
  return (
    <UnstyledButton component="div" onClick={disabled ? undefined : onClick}
      style={{
        display: 'block', width: '100%', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        borderLeft: `2px solid ${active ? 'var(--mantine-color-toc-3)' : 'transparent'}`,
        background: active ? 'var(--mantine-color-toc-8)' : undefined,
      }}>
      <Group gap={8} wrap="nowrap" align="center" pl={6} pr="xs" py={3}>
        {icon}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fz={12} lh={1.2} truncate c={active ? 'white' : 'dark.0'}>{label}</Text>
          {tag && <Text fz={8.5} c="dark.3" style={{ letterSpacing: 0.5 }}>{tag}</Text>}
        </Box>
        {note && (
          <Text span fz={8.5} c={disabled ? 'orange.5' : 'dark.2'}
            style={{ flex: '0 0 auto', letterSpacing: 0.5 }}>{note}</Text>
        )}
        {cost !== '' && cost != null && (
          <Text span fz={12} c="yellow.4" style={{ flex: '0 0 auto' }}>{cost}</Text>
        )}
        {/* one-click fielding: a real button, so the affordance is unambiguous */}
        {onPlus && (
          <ActionIcon size="sm" variant="light" color="toc" disabled={disabled}
            title={`Field ${label}`} style={{ flex: '0 0 auto' }}
            onClick={(e) => { e.stopPropagation(); onPlus() }}>
            <Text span fz={14} lh={1} fw={700}>+</Text>
          </ActionIcon>
        )}
      </Group>
    </UnstyledButton>
  )
}

export function droneTag(dt: DroneType): string {
  if (dt.gunship) return 'GUNSHIP'
  if (dt.kamikaze) return 'LOITERING MUNITION'
  if (dt.weapons) return 'ARMED ISR'
  if (dt.src === 'field') return 'HAND-LAUNCHED'
  if (dt.src === 'tether') return 'TETHERED'
  return 'ISR'
}

export interface PaletteItem {
  mode: string
  key?: string
  field?: boolean
  fieldSlot?: boolean    // echelon-real fielding: call up THIS org element (key = slot id)
  fieldAero?: boolean
  fieldDrone?: boolean   // organic UAS: one-click launch over the carrying unit
  installFac?: boolean   // FOB facility build-out: one-click install at the site
  reqAsset?: boolean     // division asset: one-click REQUEST up the chain (key = asset kind)
  qrfToggle?: boolean    // QRF assignment toggle (key = the garrisoned unit's id)
  label: string
  tag?: string | null
  cost?: number | string | null
  icon?: ReactNode
  note?: string | null
  disabled?: boolean
  tutSel?: string        // published tutorial anchor id this row answers to (data-tut)
}

export interface DeploySection {
  header: string
  items: PaletteItem[]
}

export interface DeployContext {
  title: string
  sourceId?: number
  purse?: number | null
  sections: DeploySection[]
}

// Ground units are fielded straight from the palette (`field: true`) — no deploy mode,
// no map click. The selected installation is the origin.
// No sub-label: the symbol and the name already say what it is, the abbreviation just
// repeated it.
export const unitItem = (t: UnitType): PaletteItem => {
  const a = unitAvailability(t.key as UnitTypeKey)
  // attachments read as what they are: another formation's unit under our
  // control — the row carries the donor tag (organic rows stay clean)
  const att = playerPack().attached[t.key as UnitTypeKey]
  return {
    mode: 'deploy:' + t.key, key: t.key, field: true,
    // units aren't bought with supply (P5) — no price on the row; caps and
    // refit turnaround are the limiter and show in the note
    label: t.name, cost: null, icon: <PaletteIcon unit={t} />,
    tag: att ? `ATT — ${att.from}` : null,
    note: a.cooldown > 0 ? `⟳ ${fmtCooldown(a.cooldown)}` : a.capped ? `${a.used}/${a.max}` : null,
    disabled: !a.ready,
  }
}
// Drone rows carry live availability: `used/total` while airframes are up, or the
// remaining turnaround, so a blocked platform reads as blocked before it's clicked.
export const droneItem = (dt: DroneType): PaletteItem => {
  const a = airAvailability(dt.key as DroneTypeKey)
  const capped = isFinite(a.max)
  const note = a.cooldown > 0 ? `⟳ ${fmtCooldown(a.cooldown)}`
    : capped ? `${a.active}/${a.max}`
    : null
  return {
    mode: 'deploy:DRONE:' + dt.key, label: dt.name, tag: droneTag(dt), cost: null,
    icon: <PaletteIcon drone={dt} />, note, disabled: !a.ready,
  }
}
// no costs anywhere — construction is engineer effort + placement rules
export const structItem = (st: StructureType): PaletteItem =>
  ({ mode: 'build:' + st.key, label: st.name, cost: null, icon: <PaletteIcon struct={st} /> })

// Organic (unit-carried) UAS: a one-click ⊕ launch over the carrying unit, capped
// at the unit's single bird — reads 1/1 once it's up, like the aerostat at a site.
export const organicDroneItem = (dt: DroneType, unitId: number): PaletteItem => {
  const active = S.drones.filter(d => d.launcherId === unitId).length
  return {
    mode: 'deploy:DRONE:' + dt.key, key: dt.key, fieldDrone: true,
    label: dt.name, tag: droneTag(dt), cost: null, icon: <PaletteIcon drone={dt} />,
    note: `${active}/1`, disabled: active >= 1,
  }
}

// THE GARRISON (echelon-real fielding, task #34): the deployable org elements
// by company — the player calls up "1st PLT, A CO", not "a rifle platoon".
// Only the CP fields the garrison; a FOB is a forward base, not a motor pool.
// Slot state rides on the row: fielded, fit strength, type refit turnaround.
const slotItem = (sl: OrgSlot): PaletteItem => {
  const t = UNIT_TYPES[sl.type as UnitTypeKey]
  const a = unitAvailability(sl.type as UnitTypeKey)
  const fit = sl.soldiers.filter(s => s.status === 'FIT').length
  const fielded = sl.unitId != null
  const noneFit = fit === 0
  const base = S.structures.find(s => s.id === sl.garrisonAt && s.side === 'friend')
    ?? S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  return {
    mode: 'slot:' + sl.id, key: sl.id, fieldSlot: true,
    // the element's real lineage leads ("1st PLT · A CO"); tag carries the
    // platform + WHERE it is garrisoned (its assigned home base)
    label: `${sl.name} · ${sl.co}`,
    tag: [t.name, base?.label, sl.from ? `ATT ${sl.from}` : null].filter(Boolean).join(' · '),
    cost: null, icon: <PaletteIcon unit={t} />,
    note: fielded ? '✓ FIELDED'
      : noneFit ? 'NO FIT PAX'
      : a.cooldown > 0 ? `⟳ ${fmtCooldown(a.cooldown)}`
      : a.capped ? `${a.used}/${a.max}`
      : `${fit} PAX`,
    disabled: fielded || noneFit || !a.ready,
    // the tutorial's published anchor family: field-<TYPE> rings the first
    // callable row of that type
    tutSel: !fielded ? `field-${sl.type}` : undefined,
  }
}
// The GARRISON (echelon-real fielding): rendered in the FORCES rail, not
// Command — Command manages BASES, Forces manages the FORCE (deep dive = S1).
// Only what the player commander OWNS — their battalion and attachments;
// sister formations' elements come by REQUEST to division. Sections by
// WARFIGHTING FUNCTION (the catalog's realistic categories), org order inside.
export const garrisonSections = (hideFielded = false): DeploySection[] => {
  const playerBn = playerPack().formation?.playerBn
  const slots = (S.org?.slots ?? []).filter(sl => sl.tf && sl.type
    && (sl.bn === playerBn || sl.bde === 'ATT')
    && (!hideFielded || sl.unitId == null))
  return CATS.map(cat => ({
    header: cat,
    items: slots.filter(sl => UNIT_TYPES[sl.type as UnitTypeKey].cat === cat).map(slotItem),
  })).filter(sec => sec.items.length > 0)
}

// One-stop asks to higher, at the CP: every requestable division/corps/USAF
// asset in one section (context rows at the airfield/FOB stay — they carry
// site-specific state). Unit/attachment requests from sister formations are
// the NEXT system (the asset pipeline's sibling — see HANDOFF).
const divisionSections = (): DeploySection[] => {
  const items = Object.keys(playerPack().assets ?? {})
    .map(k => requestItem(k))
    .filter((r): r is PaletteItem => !!r)
  return items.length ? [{ header: 'DIVISION — REQUESTS', items }] : []
}

// --- division asset request rows (ASSET-REQUESTS.md) ------------------------
// One line of truth about where the ask stands: pool availability, a pending
// staff decision, the waiting list, the convoy, the emplacement.
function assetNote(kind: string): { note: string; busy: boolean } {
  const inst = tfInstance(kind)
  if (inst?.state === 'enroute') return { note: 'CONVOY ENROUTE', busy: true }
  if (inst?.state === 'setup') return { note: 'EMPLACING', busy: true }
  if (S.assets.pending.some(p => p.kind === kind)) return { note: 'REQ WITH HIGHER', busy: true }
  if (S.assets.queue.some(q => q.kind === kind)) return { note: 'ON THE LIST', busy: true }
  const total = poolOf(kind).length
  return total ? { note: `${availableCount(kind)}/${total} AVAIL`, busy: false } : { note: 'ATO', busy: false }
}

const requestItem = (kind: string, icon?: ReactNode): PaletteItem | null => {
  const def = assetDef(kind)
  if (!def) return null
  const { note, busy } = assetNote(kind)
  return {
    mode: 'req:' + kind, key: kind, reqAsset: true,
    label: def.name, tag: `REQUEST — ${def.from}`, cost: null,
    icon, note, disabled: busy,
  }
}

// what a given selection can field, or null if nothing deployable is selected
export function deployContext(selectedIds: number[]): DeployContext | null {
  if (selectedIds.length !== 1) return null
  const id = selectedIds[0]
  const st = S.structures.find(s => s.id === id && s.side === 'friend')
  if (st) {
    if (st.buildT > 0) return null
    if (st.kind === 'AFLD') {
      // division/corps/USAF birds fly on GRANTED authority: without an orbit
      // allocation (or an open ATO window) the row is the REQUEST itself
      const air: PaletteItem[] = []
      for (const dt of Object.values(DRONE_TYPES).filter(d => d.src === 'airfield')) {
        const oKind = orbitAssetKind(dt.key)
        const wKind = windowAssetKind(dt.key)
        const needsOrbit = !!oKind && orbitAuthority(dt.key) === 0
        const needsWindow = !!wKind && !windowOpen(dt.key)
        if (needsOrbit || needsWindow) {
          const r = requestItem((oKind ?? wKind)!, <PaletteIcon drone={dt} />)
          if (r) { air.push(r); continue }
        }
        air.push(droneItem(dt))
      }
      return { title: `${st.label} — AIRFIELD`, sections: [{ header: 'FIXED-WING & UAS', items: air }] }
    }
    if (st.kind === 'HQ' || st.kind === 'FOB') {
      // tethered ISR rows — one per tether-src platform in the installed
      // catalogs. A balloon flies only where its det is EMPLACED: no det =
      // the row IS the division request; det at another base = locked out.
      const taken = S.drones.some(d => d.tether === st.id)
      const aeroItems: PaletteItem[] = []
      for (const dt of Object.values(DRONE_TYPES).filter(d => d.src === 'tether')) {
        const kind = tetherAssetKind(dt.key)
        const inst = kind ? tfInstance(kind) : null
        const here = !kind || S.devMode
          || (inst?.state === 'allocated' && inst.structId === st.id)
        if (here) {
          aeroItems.push({ ...droneItem(dt), key: dt.key, fieldAero: true,
            disabled: taken, note: taken ? '1/1' : null })
        } else if (inst?.state === 'allocated') {
          aeroItems.push({ ...droneItem(dt), disabled: true, note: 'DET EMPLACED ELSEWHERE' })
        } else {
          const r = requestItem(kind!, <PaletteIcon drone={dt} />)
          if (r) aeroItems.push(r)
        }
      }
      const aerostat: DeploySection = { header: 'TETHERED ISR', items: aeroItems }
      // facilities: what the base RUNS. The HQ's organic set reads as
      // operational; a FOB shows what it has and can still stand up. C-RAM is
      // never a build-out — it arrives only by division request (task #21
      // wires the request row here).
      const facItems: PaletteItem[] = (Object.keys(FACILITIES) as FacilityKey[]).map(k => {
        const spec = FACILITIES[k]
        const owned = st.facilities?.includes(k)
        const hqOrganic = st.kind === 'HQ' && k !== 'CRAM'
        // C-RAM is never a build-out: the row IS the division request, and it
        // tracks the whole pipeline (avail → pending → convoy → emplacing)
        if (k === 'CRAM' && !owned) {
          const r = requestItem('CRAM')
          if (r) return { ...r, tag: spec.desc }
        }
        return {
          mode: 'fac:' + k, key: k, installFac: !owned && !hqOrganic && k !== 'CRAM',
          label: spec.name, tag: spec.desc,
          cost: null,
          note: owned ? '✓ OPERATIONAL' : hqOrganic ? '—' : null,
          disabled: !!owned || hqOrganic || k === 'CRAM',
        }
      })
      // QRF (task #30): garrisoned units toggle onto the base's reaction
      // force — launches ITSELF when the base takes IDF or direct attack
      const qrfItems: PaletteItem[] = S.units
        .filter(u => u.side === 'friend' && u.strength > 0 && !u.respFrom
          && Math.hypot(u.x - st.x, u.y - st.y) <= 450)
        .map(u => {
          const t = UNIT_TYPES[u.type]
          return {
            mode: 'qrf:' + u.id, key: String(u.id), qrfToggle: true,
            label: `${u.label} · ${t?.abbr ?? u.type}`,
            tag: u.qrfHome === st.id ? (u.qrfOutT != null ? 'QRF — RESPONDING' : 'QRF — STANDING BY') : 'ASSIGN TO QRF',
            cost: null, icon: t ? <PaletteIcon unit={t} /> : undefined,
            note: u.qrfHome === st.id ? '✓ QRF' : null,
          }
        })
      return {
        title: `${st.label} — ${STRUCTURES[st.kind].name.toUpperCase()}`,
        sourceId: st.id, purse: st.kind === 'FOB' ? Math.floor(st.stock || 0) : null,
        // Command = BASE management: facilities, tethered ISR, division
        // requests, QRF. The garrison lives in the FORCES rail (S1 = deep dive).
        sections: [aerostat,
          ...(st.kind === 'HQ' ? divisionSections() : []),
          { header: 'FACILITIES', items: facItems },
          ...(qrfItems.length ? [{ header: 'QUICK REACTION FORCE', items: qrfItems }] : [])],
      }
    }
    return null // OP fields nothing
  }
  const u = S.units.find(x => x.id === id && x.side === 'friend')
  if (u) {
    const t = UNIT_TYPES[u.type]
    const sections: DeploySection[] = []
    // campaign: no AFLD row — the lodgment's strip exists at H-hour, and
    // another airfield would be a division tasking, not an engineer buy
    if (t.key === 'ENG') {
      sections.push({ header: 'INSTALLATIONS',
        items: Object.values(STRUCTURES).filter(st => !(S.campaign && st.key === 'AFLD')).map(structItem) })
    }
    if (t.carries && t.carries.length) {
      // organic UAS field one-click over the unit — sourceId carries the unit id
      sections.push({ header: 'ORGANIC UAS', items: t.carries.map(k => DRONE_TYPES[k]).filter(Boolean).map(dt => organicDroneItem(dt, u.id)) })
    }
    if (!sections.length) return null
    return { title: `${u.label} — ${t.name.toUpperCase()}`, sourceId: u.id, sections }
  }
  return null
}

export function deployHint(mode: string): string {
  if (mode.startsWith('deploy:DRONE:')) {
    const src = (DRONE_TYPES as Record<string, DroneType | undefined>)[mode.slice(13)]?.src
    return src === 'field' ? 'CLICK AN ORBIT POINT NEAR THE CARRYING UNIT'
      : src === 'tether' ? 'CLICK THIS FOB / HQ TO RAISE THE AEROSTAT (1 PER SITE)'
      : 'CLICK THE MAP TO SET THE ORBIT POINT (LAUNCHES FROM AIRFIELD)'
  }
  if (mode.startsWith('deploy:')) return 'CLICK INSIDE THE DEPLOY ZONE'
  if (mode.startsWith('build:')) return mode === 'build:OP' ? 'PLACE NEAR FRIENDLY FORCES' : 'PLACE NEAR AN ACTIVE BASE'
  return '⊕ FIELDS A UNIT AT THE SELECTED SITE — IT MOVES OUT TO A RALLY ON ITS OWN'
}
