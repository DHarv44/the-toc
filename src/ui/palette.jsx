// Deploy palette primitives: the shared MIL-STD-2525 icon renderer, the row/header
// chrome, and the rules for what a given selection is allowed to field.
import { useRef, useEffect } from 'react'
import { Box, Group, Text, UnstyledButton } from '@mantine/core'
import { S, airAvailability, fmtCooldown } from '../game/sim.js'
import { UNIT_TYPES, STRUCTURES, DRONE_TYPES } from '../game/units.js'
import { drawUnitSymbol, drawStructure, drawDroneIcon } from '../map/symbols.js'

const CATS = ['MANEUVER', 'RECON', 'FIRES', 'SUPPORT']

// One symbol drawn on a canvas, sized to the row it sits in. Same art as the map,
// so the palette doubles as the symbol key.
export function PaletteIcon({ unit, struct, drone, w: W = 40, h: H = 26, scale = 1 }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d')
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
      drawStructure(ctx, 0, 3, { side: 'friend', kind: struct.key, label: '' })
    } else if (drone) {
      drawDroneIcon(ctx, 0, 0, -Math.PI / 2, '', false, drone.key)
    }
    ctx.restore()
  })
  return <canvas ref={ref} style={{ width: W, height: H, flex: '0 0 auto' }} />
}

export function PaletteRow({ icon, label, tag, cost, active, onClick, disabled, note }) {
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
      </Group>
    </UnstyledButton>
  )
}

export function droneTag(dt) {
  if (dt.gunship) return 'GUNSHIP'
  if (dt.kamikaze) return 'LOITERING MUNITION'
  if (dt.weapons) return 'ARMED ISR'
  if (dt.src === 'field') return 'HAND-LAUNCHED'
  if (dt.src === 'tether') return 'TETHERED'
  return 'ISR'
}

export const unitItem = (t) => ({ mode: 'deploy:' + t.key, label: t.name, tag: t.abbr, cost: t.cost, icon: <PaletteIcon unit={t} /> })
// Drone rows carry live availability: `used/total` while airframes are up, or the
// remaining turnaround, so a blocked platform reads as blocked before it's clicked.
export const droneItem = (dt) => {
  const a = airAvailability(dt.key)
  const capped = isFinite(a.max)
  const note = a.cooldown > 0 ? `⟳ ${fmtCooldown(a.cooldown)}`
    : capped ? `${a.active}/${a.max}`
    : null
  return {
    mode: 'deploy:DRONE:' + dt.key, label: dt.name, tag: droneTag(dt), cost: dt.cost,
    icon: <PaletteIcon drone={dt} />, note, disabled: !a.ready,
  }
}
export const structItem = (st) => ({ mode: 'build:' + st.key, label: st.name, tag: st.abbr, cost: st.cost, icon: <PaletteIcon struct={st} /> })

const groundSections = () => CATS.map(cat => ({
  header: cat,
  items: Object.values(UNIT_TYPES).filter(t => t.cat === cat).map(unitItem),
}))

// what a given selection can field, or null if nothing deployable is selected
export function deployContext(selectedIds) {
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
      const aerostat = { header: 'TETHERED ISR', items: [droneItem(DRONE_TYPES.AEROSTAT)] }
      return { title: `${st.label} — ${STRUCTURES[st.kind].name.toUpperCase()}`, sections: [...groundSections(), aerostat] }
    }
    return null // OP fields nothing
  }
  const u = S.units.find(x => x.id === id && x.side === 'friend')
  if (u) {
    const t = UNIT_TYPES[u.type]
    const sections = []
    if (t.key === 'ENG') sections.push({ header: 'INSTALLATIONS', items: Object.values(STRUCTURES).map(structItem) })
    if (t.carries && t.carries.length) {
      sections.push({ header: 'ORGANIC UAS', items: t.carries.map(k => DRONE_TYPES[k]).filter(Boolean).map(droneItem) })
    }
    if (!sections.length) return null
    return { title: `${u.label} — ${t.name.toUpperCase()}`, sections }
  }
  return null
}

export function deployHint(mode) {
  if (mode.startsWith('deploy:DRONE:')) {
    const src = DRONE_TYPES[mode.slice(13)]?.src
    return src === 'field' ? 'CLICK AN ORBIT POINT NEAR THE CARRYING UNIT'
      : src === 'tether' ? 'CLICK THIS FOB / HQ TO RAISE THE AEROSTAT (1 PER SITE)'
      : 'CLICK THE MAP TO SET THE ORBIT POINT (LAUNCHES FROM AIRFIELD)'
  }
  if (mode.startsWith('deploy:')) return 'CLICK INSIDE THE DEPLOY ZONE'
  if (mode.startsWith('build:')) return mode === 'build:OP' ? 'PLACE NEAR FRIENDLY FORCES' : 'PLACE NEAR AN ACTIVE BASE'
  return 'PICK AN ITEM, THEN CLICK THE MAP TO PLACE IT'
}
