// Hand-drawn MIL-STD-2525-style unit symbols on canvas.
// Friendly: sky-blue filled rectangle. Hostile: red diamond. Glyphs per branch:
//   infantry = crossed diagonals, armor = oval (track), mech inf = both,
//   recon = single diagonal, artillery = filled dot. Platoon echelon = three dots.
// Ported verbatim from src/map/symbols.js.
import type { Side } from '../engine/GameState'
import type { UnitGlyph } from '../domains/forces/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'
import type { DroneTypeKey } from '../domains/air/catalog'

type Ctx2D = CanvasRenderingContext2D

export const COLORS = {
  friend: '#80c8ff', friendEdge: '#0a3a66',
  hostile: '#ff8080', hostileEdge: '#5c0f0f',
  stale: '#b0a8a0',
}

const FW = 30, FH = 20 // friendly frame size at scale 1

export interface UnitSymbolOpts {
  side?: Side
  glyph?: UnitGlyph
  scale?: number
  selected?: boolean
  stale?: boolean
  label?: string
  strength?: number
  echelon?: 'plt' | ''
  dug?: number
  showStrength?: boolean
  contact?: number
}

export function drawUnitSymbol(ctx: Ctx2D, x: number, y: number, opts: UnitSymbolOpts): void {
  const {
    side = 'friend', glyph = 'inf', scale = 1,
    selected = false, stale = false, label = '', strength = 100,
    echelon = 'plt', dug = 0, showStrength = true, contact = 0,
  } = opts
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineWidth = 1.6
  ctx.globalAlpha = stale ? 0.6 : 1

  const fill = stale ? COLORS.stale : (side === 'friend' ? COLORS.friend : COLORS.hostile)
  const edge = side === 'friend' ? COLORS.friendEdge : COLORS.hostileEdge

  // In contact: a ring outside the frame that sits red and snaps to muzzle-yellow as the
  // unit fires. `contact` is 0 (out of contact) → 1 (firing this instant), so the flicker
  // is driven by actual gunfire rather than a decorative timer — a unit trading shots
  // strobes, one pinned but not shooting glows steady red.
  if (contact > 0) {
    const k = Math.min(1, contact)
    const r = Math.round(255)
    const g = Math.round(40 + 195 * k)   // red -> yellow
    ctx.strokeStyle = `rgba(${r},${g},60,${0.55 + 0.45 * k})`
    ctx.lineWidth = 1.6 + 2.2 * k
    ctx.strokeRect(-FW / 2 - 3, -FH / 2 - 3, FW + 6, FH + 6)
    ctx.lineWidth = 1.6
  }

  if (selected) {
    ctx.strokeStyle = '#ffe97a'
    ctx.lineWidth = 2.2
    ctx.strokeRect(-FW / 2 - 5, -FH / 2 - 5, FW + 10, FH + 10)
    ctx.lineWidth = 1.6
  }

  if (side === 'friend') {
    ctx.fillStyle = fill
    ctx.strokeStyle = edge
    ctx.fillRect(-FW / 2, -FH / 2, FW, FH)
    if (stale) ctx.setLineDash([3, 2])
    ctx.strokeRect(-FW / 2, -FH / 2, FW, FH)
    ctx.setLineDash([])
    drawGlyph(ctx, glyph, edge, FW, FH)
  } else {
    // diamond
    const R = 15
    ctx.beginPath()
    ctx.moveTo(0, -R); ctx.lineTo(R, 0); ctx.lineTo(0, R); ctx.lineTo(-R, 0)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = edge
    ctx.fill()
    if (stale) ctx.setLineDash([3, 2])
    ctx.stroke()
    ctx.setLineDash([])
    drawGlyph(ctx, glyph, edge, 17, 12)
  }

  // entrenchment arc (2525 fortified/dug-in modifier): dashed while preparing
  if (dug > 0) {
    ctx.strokeStyle = side === 'friend' ? COLORS.friendEdge : COLORS.hostileEdge
    ctx.lineWidth = 1.8
    if (dug < 1) ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.arc(0, -2, 21, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // echelon (platoon: three dots above frame)
  if (echelon === 'plt') {
    ctx.fillStyle = edge
    const ey = side === 'friend' ? -FH / 2 - 5 : -19
    for (const dx of [-5, 0, 5]) {
      ctx.beginPath(); ctx.arc(dx, ey, 1.6, 0, Math.PI * 2); ctx.fill()
    }
  }

  // strength bar
  if (!stale && showStrength) {
    const w = FW * (Math.max(0, strength) / 100)
    ctx.fillStyle = strength > 60 ? '#39d353' : strength > 30 ? '#e8c547' : '#e8524a'
    const by = side === 'friend' ? FH / 2 + 3 : 17
    ctx.fillRect(-FW / 2, by, w, 2.5)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(-FW / 2, by, FW, 2.5)
  }

  // label
  if (label) {
    ctx.font = '9px Consolas, monospace'
    ctx.fillStyle = stale ? '#8a857d' : '#1a2530'
    ctx.strokeStyle = 'rgba(240,245,250,0.75)'
    ctx.lineWidth = 2.5
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const lx = side === 'friend' ? FW / 2 + 5 : 20
    ctx.strokeText(label, lx, 0)
    ctx.fillText(label, lx, 0)
  }

  if (stale) {
    ctx.font = 'bold 10px Consolas, monospace'
    ctx.fillStyle = '#6a655d'
    ctx.textAlign = 'center'
    ctx.fillText('?', 12, -12)
  }
  ctx.restore()
}

function drawGlyph(ctx: Ctx2D, glyph: UnitGlyph, color: string, w: number, h: number): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.4
  const hw = w / 2 - 2, hh = h / 2 - 2
  switch (glyph) {
    case 'inf':
      ctx.beginPath()
      ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh)
      ctx.moveTo(-hw, hh); ctx.lineTo(hw, -hh)
      ctx.stroke()
      break
    case 'arm':
      ctx.beginPath()
      ctx.ellipse(0, 0, hw * 0.8, hh * 0.62, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'mech':
      ctx.beginPath()
      ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh)
      ctx.moveTo(-hw, hh); ctx.lineTo(hw, -hh)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, 0, hw * 0.8, hh * 0.62, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'sct':
      ctx.beginPath()
      ctx.moveTo(-hw, hh); ctx.lineTo(hw, -hh)
      ctx.stroke()
      break
    case 'cav':
      ctx.beginPath()
      ctx.moveTo(-hw, hh); ctx.lineTo(hw, -hh)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, 0, hw * 0.8, hh * 0.62, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'arty':
      ctx.beginPath()
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'mor':
      // mortar: filled circle with upward arrow
      ctx.beginPath()
      ctx.arc(0, hh * 0.25, 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(0, hh * 0.1); ctx.lineTo(0, -hh)
      ctx.moveTo(-2.5, -hh + 3); ctx.lineTo(0, -hh); ctx.lineTo(2.5, -hh + 3)
      ctx.stroke()
      break
    case 'at':
      // anti-tank: full-frame upward chevron
      ctx.beginPath()
      ctx.moveTo(-hw, hh); ctx.lineTo(0, -hh); ctx.lineTo(hw, hh)
      ctx.stroke()
      break
    case 'eng':
      // engineer: bar with three teeth down
      ctx.beginPath()
      ctx.moveTo(-hw * 0.7, -2); ctx.lineTo(hw * 0.7, -2)
      for (const fx of [-0.7, 0, 0.7]) {
        ctx.moveTo(hw * fx, -2); ctx.lineTo(hw * fx, 3)
      }
      ctx.stroke()
      break
    case 'sig':
      // signal: lightning zigzag
      ctx.beginPath()
      ctx.moveTo(-hw, -hh * 0.6); ctx.lineTo(-hw * 0.2, -hh * 0.6)
      ctx.lineTo(hw * 0.2, hh * 0.6); ctx.lineTo(hw, hh * 0.6)
      ctx.stroke()
      break
    case 'log':
      // supply: horizontal bar across the frame
      ctx.beginPath()
      ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0)
      ctx.stroke()
      break
  }
}

export interface StructureSymbolOpts {
  side?: Side
  kind?: StructureTypeKey
  label?: string
  building?: boolean
  progress?: number
  hpFrac?: number
  spotted?: boolean
}

// Static installation symbol: square frame (triangle for OP), abbr text inside.
export function drawStructure(ctx: Ctx2D, x: number, y: number, opts: StructureSymbolOpts): void {
  const { side = 'friend', kind = 'FOB', label = '', building = false, progress = 0, hpFrac = 1, spotted = true } = opts
  if (!spotted) return
  ctx.save()
  ctx.translate(x, y)
  const fill = side === 'friend' ? COLORS.friend : COLORS.hostile
  const edge = side === 'friend' ? COLORS.friendEdge : COLORS.hostileEdge
  ctx.fillStyle = fill
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.8
  if (building) ctx.setLineDash([4, 3])
  if (kind === 'OP') {
    // observation post: flag triangle
    ctx.beginPath()
    ctx.moveTo(0, -12); ctx.lineTo(9, 6); ctx.lineTo(-9, 6)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = edge
    ctx.font = 'bold 7px Consolas, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('OP', 0, 1.5)
  } else {
    ctx.fillRect(-13, -11, 26, 22)
    ctx.strokeRect(-13, -11, 26, 22)
    ctx.setLineDash([])
    ctx.fillStyle = edge
    ctx.font = 'bold 8px Consolas, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    if (kind === 'AFLD') {
      // runway glyph + label
      ctx.save()
      ctx.rotate(-0.5)
      ctx.fillRect(-9, -1.5, 18, 3)
      ctx.restore()
      ctx.fillText('AF', 0, 7)
    } else {
      ctx.fillText(kind === 'HQ' ? 'HQ' : 'FOB', 0, 0)
    }
    // HQ staff flag
    if (kind === 'HQ') {
      ctx.beginPath()
      ctx.moveTo(-13, -11); ctx.lineTo(-13, -19); ctx.lineTo(-3, -19); ctx.lineTo(-3, -15); ctx.lineTo(-13, -15)
      ctx.stroke()
    }
  }
  // build progress / hp bar
  if (building) {
    ctx.fillStyle = '#8fb8d8'
    ctx.fillRect(-13, 14, 26 * progress, 2.5)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(-13, 14, 26, 2.5)
  } else if (hpFrac < 1) {
    ctx.fillStyle = hpFrac > 0.6 ? '#39d353' : hpFrac > 0.3 ? '#e8c547' : '#e8524a'
    ctx.fillRect(-13, 14, 26 * Math.max(0, hpFrac), 2.5)
  }
  if (label) {
    ctx.font = '8px Consolas, monospace'
    ctx.fillStyle = '#1a2530'
    ctx.strokeStyle = 'rgba(240,245,250,0.75)'
    ctx.lineWidth = 2.5
    ctx.textAlign = 'center'
    ctx.strokeText(label, 0, 26)
    ctx.fillText(label, 0, 26)
  }
  ctx.restore()
}

// --- per-airframe UAS silhouettes ----------------------------------------
// All drawn top-down, nose toward -y. The wing()/fuse() helpers keep the
// planforms consistent; each type varies span, engines, tail and body so the
// icons read as distinct airframes on the map and act as a key in the palette.
function fuse(ctx: Ctx2D, noseY: number, tailY: number, w: number): void {
  const hw = w / 2
  ctx.beginPath()
  ctx.moveTo(-hw, noseY + hw)
  ctx.quadraticCurveTo(-hw, noseY, 0, noseY)
  ctx.quadraticCurveTo(hw, noseY, hw, noseY + hw)
  ctx.lineTo(hw, tailY)
  ctx.lineTo(-hw, tailY)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
}
// symmetric tapered wing (or stabiliser) centred on yc, optional sweep-back
function wing(ctx: Ctx2D, span: number, yc: number, root: number, tip: number, sweep = 0): void {
  ctx.beginPath()
  ctx.moveTo(0, yc - root / 2)
  ctx.lineTo(span, yc - tip / 2 + sweep)
  ctx.lineTo(span, yc + tip / 2 + sweep)
  ctx.lineTo(0, yc + root / 2)
  ctx.lineTo(-span, yc + tip / 2 + sweep)
  ctx.lineTo(-span, yc - tip / 2 + sweep)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
}
function bulbNose(ctx: Ctx2D, y: number, r: number): void {
  ctx.beginPath(); ctx.ellipse(0, y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
}

const AIRFRAMES: Record<string, (ctx: Ctx2D) => void> = {
  // RQ-7 Shadow: twin-boom pusher, straight mid-wing
  SHADOW(ctx) {
    wing(ctx, 10, -1, 3, 1.6)
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4, 8); ctx.moveTo(4, 0); ctx.lineTo(4, 8); ctx.stroke() // booms
    ctx.beginPath(); ctx.moveTo(-5.5, 8); ctx.lineTo(5.5, 8); ctx.stroke()                                   // tailplane
    ctx.lineWidth = 1
    fuse(ctx, -6, 3, 2.6)
    ctx.beginPath(); ctx.moveTo(-2.6, 3.6); ctx.lineTo(2.6, 3.6); ctx.stroke()                               // pusher prop
  },
  // RQ-4 Sentinel: high-altitude, very long slender wings, bulbous nose, V-tail
  SENTINEL(ctx) {
    wing(ctx, 15, -1, 4, 1)
    fuse(ctx, -7, 7, 3)
    bulbNose(ctx, -6.5, 2.6)
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-5, 9.5); ctx.moveTo(0, 6); ctx.lineTo(5, 9.5); ctx.stroke() // V-tail
  },
  // MQ-1 Viper: armed, swept slender wings, bulbous nose, inverted-V tail + wing pylons
  VIPER(ctx) {
    wing(ctx, 12, -1, 3, 1, 3)
    fuse(ctx, -8, 7, 2.4)
    bulbNose(ctx, -7, 2.3)
    ctx.beginPath(); ctx.moveTo(0, 5.5); ctx.lineTo(-4.5, 10); ctx.moveTo(0, 5.5); ctx.lineTo(4.5, 10); ctx.stroke() // inverted-V tail
    ctx.beginPath(); ctx.arc(-6, 1.5, 1, 0, Math.PI * 2); ctx.arc(6, 1.5, 1, 0, Math.PI * 2); ctx.fill()             // wing pylons (munitions)
  },
  // RQ-11 Raven: tiny hand-launched straight-wing
  RAVEN(ctx) {
    wing(ctx, 6.5, -0.5, 2.2, 1.4)
    fuse(ctx, -4.5, 4, 1.8)
    ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); ctx.stroke() // tailplane
  },
  // Switchblade: tube-launched loitering munition — slim body, cruciform fins
  SWITCHBLADE(ctx) {
    ctx.beginPath()                                     // pointed missile body
    ctx.moveTo(0, -9.5); ctx.lineTo(1.1, -6); ctx.lineTo(1.1, 8); ctx.lineTo(-1.1, 8); ctx.lineTo(-1.1, -6)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(-5, -0.5); ctx.lineTo(5, -0.5); ctx.stroke()   // mid wings
    ctx.beginPath(); ctx.moveTo(-3.2, 6); ctx.lineTo(3.2, 6); ctx.stroke()     // tail fins
    ctx.lineWidth = 1
  },
  // AC-130 Spectre: 4-engine gunship — wide wing, quad nacelles, port-side battery
  SPECTRE(ctx) {
    wing(ctx, 15, -2, 4.5, 2)
    for (const ex of [-10.5, -6, 6, 10.5]) {            // 4 engine nacelles
      ctx.beginPath(); ctx.rect(ex - 0.9, -4.5, 1.8, 3); ctx.fill(); ctx.stroke()
    }
    fuse(ctx, -10, 9, 3.6)
    wing(ctx, 6, 8, 2.6, 1)                             // tailplane
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 11.5); ctx.stroke() // fin
    ctx.lineWidth = 1.3                                 // port-side gun battery (left = -x)
    ctx.beginPath()
    for (const gy of [-1, 1.5, 4]) { ctx.moveTo(-1.8, gy); ctx.lineTo(-5.5, gy) }
    ctx.stroke()
    ctx.lineWidth = 1
  },
}

// tethered aerostat: blimp envelope with tail fins + tether tick (not heading-aligned)
function drawAerostat(ctx: Ctx2D): void {
  ctx.beginPath(); ctx.ellipse(0, -3, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath()                                        // tail fins
  ctx.moveTo(0, 4); ctx.lineTo(-3.5, 7); ctx.moveTo(0, 4); ctx.lineTo(3.5, 7); ctx.moveTo(0, 4); ctx.lineTo(0, 8)
  ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, 12); ctx.stroke() // tether
}

// UAS icon; `type` selects the airframe silhouette. Orbit ring drawn separately in MapView.
export function drawDroneIcon(
  ctx: Ctx2D, x: number, y: number, heading: number,
  label: string, selected: boolean, type: DroneTypeKey | string = 'SHADOW',
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = selected ? '#ffe97a' : '#8fd4ff'
  ctx.strokeStyle = '#0a3a66'
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  if (type === 'AEROSTAT') {
    drawAerostat(ctx)
  } else {
    ctx.rotate(heading + Math.PI / 2)
    ;(AIRFRAMES[type] || AIRFRAMES['SHADOW']!)(ctx)
  }
  ctx.restore()
  if (label) {
    ctx.font = '8px Consolas, monospace'
    ctx.fillStyle = '#2a4a66'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y + 16)
    ctx.textAlign = 'left'
  }
}

export function drawBase(ctx: Ctx2D, x: number, y: number, side: Side, label: string): void {
  ctx.save()
  ctx.translate(x, y)
  const c = side === 'friend' ? COLORS.friend : COLORS.hostile
  const e = side === 'friend' ? COLORS.friendEdge : COLORS.hostileEdge
  ctx.fillStyle = c; ctx.strokeStyle = e; ctx.lineWidth = 2
  ctx.fillRect(-12, -12, 24, 24)
  ctx.strokeRect(-12, -12, 24, 24)
  ctx.beginPath()
  ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.moveTo(-12, 12); ctx.lineTo(12, -12)
  ctx.stroke()
  ctx.font = 'bold 10px Consolas, monospace'
  ctx.fillStyle = e
  ctx.textAlign = 'center'
  ctx.fillText(label, 0, 24)
  ctx.restore()
}
