// Deploy palette primitives: the shared MIL-STD-2525 icon renderer, the row/header
// chrome, and the rules for what a given selection is allowed to field.
// Ported verbatim from src/ui/palette.jsx.
import { useRef, useEffect, type ReactNode } from 'react'
import { ActionIcon, Box, Group, Text, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import { unitAvailability, airAvailability } from '../domains/economy/economy'
import { fmtCooldown } from '../lib/format'
import { UNIT_TYPES, type UnitType, type UnitTypeKey } from '../domains/forces/catalog'
import { STRUCTURES, type StructureType, type StructureTypeKey } from '../domains/installations/catalog'
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
  fieldAero?: boolean
  label: string
  tag?: string | null
  cost?: number | string | null
  icon?: ReactNode
  note?: string | null
  disabled?: boolean
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
  return {
    mode: 'deploy:' + t.key, key: t.key, field: true,
    label: t.name, cost: t.cost, icon: <PaletteIcon unit={t} />,
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
    mode: 'deploy:DRONE:' + dt.key, label: dt.name, tag: droneTag(dt), cost: dt.cost,
    icon: <PaletteIcon drone={dt} />, note, disabled: !a.ready,
  }
}
export const structItem = (st: StructureType): PaletteItem =>
  ({ mode: 'build:' + st.key, label: st.name, cost: st.cost, icon: <PaletteIcon struct={st} /> })

const groundSections = (): DeploySection[] => CATS.map(cat => ({
  header: cat,
  items: Object.values(UNIT_TYPES).filter(t => t.cat === cat).map(unitItem),
}))

// what a given selection can field, or null if nothing deployable is selected
export function deployContext(selectedIds: number[]): DeployContext | null {
  if (selectedIds.length !== 1) return null
  const id = selectedIds[0]
  const st = S.structures.find(s => s.id === id && s.side === 'friend')
  if (st) {
    if (st.buildT > 0) return null
    if (st.kind === 'AFLD') {
      const air = Object.values(DRONE_TYPES).filter(dt => dt.src === 'airfield').map(droneItem)
      return { title: `${st.label} — AIRFIELD`, sections: [{ header: 'FIXED-WING & UAS', items: air }] }
    }
    if (st.kind === 'HQ' || st.kind === 'FOB') {
      // the aerostat tethers at this very site, so it's a one-click field like the ground
      // units (⊕) — no map placement. One per site: greyed out when this site flies one.
      const taken = S.drones.some(d => d.tether === st.id)
      const aerostat: DeploySection = {
        header: 'TETHERED ISR',
        items: [{ ...droneItem(DRONE_TYPES.AEROSTAT), key: 'AEROSTAT', fieldAero: true,
          disabled: taken, note: taken ? '1/1' : null }],
      }
      return {
        title: `${st.label} — ${STRUCTURES[st.kind].name.toUpperCase()}`,
        sourceId: st.id, purse: st.kind === 'FOB' ? Math.floor(st.stock || 0) : null,
        sections: [...groundSections(), aerostat],
      }
    }
    return null // OP fields nothing
  }
  const u = S.units.find(x => x.id === id && x.side === 'friend')
  if (u) {
    const t = UNIT_TYPES[u.type]
    const sections: DeploySection[] = []
    if (t.key === 'ENG') sections.push({ header: 'INSTALLATIONS', items: Object.values(STRUCTURES).map(structItem) })
    if (t.carries && t.carries.length) {
      sections.push({ header: 'ORGANIC UAS', items: t.carries.map(k => DRONE_TYPES[k]).filter(Boolean).map(droneItem) })
    }
    if (!sections.length) return null
    return { title: `${u.label} — ${t.name.toUpperCase()}`, sections }
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
