// Hand-drawn MIL-STD-2525-style unit symbols on canvas.
// Friendly: sky-blue filled rectangle. Hostile: red diamond. Glyphs per branch:
//   infantry = crossed diagonals, armor = oval (track), mech inf = both,
//   recon = single diagonal, artillery = filled dot. Platoon echelon = three dots.

export const COLORS = {
  friend: '#80c8ff', friendEdge: '#0a3a66',
  hostile: '#ff8080', hostileEdge: '#5c0f0f',
  stale: '#b0a8a0',
}

const FW = 30, FH = 20 // friendly frame size at scale 1

export function drawUnitSymbol(ctx, x, y, opts) {
  const {
    side = 'friend', glyph = 'inf', scale = 1,
    selected = false, stale = false, label = '', strength = 100,
    echelon = 'plt', dug = 0,
  } = opts
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineWidth = 1.6
  ctx.globalAlpha = stale ? 0.6 : 1

  const fill = stale ? COLORS.stale : (side === 'friend' ? COLORS.friend : COLORS.hostile)
  const edge = side === 'friend' ? COLORS.friendEdge : COLORS.hostileEdge

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
  if (!stale) {
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

function drawGlyph(ctx, glyph, color, w, h) {
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

// Static installation symbol: square frame (triangle for OP), abbr text inside.
export function drawStructure(ctx, x, y, opts) {
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

// small fixed-wing UAS icon + orbit ring drawn separately in MapView
export function drawDroneIcon(ctx, x, y, heading, label, selected) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading + Math.PI / 2)
  ctx.fillStyle = selected ? '#ffe97a' : '#8fd4ff'
  ctx.strokeStyle = '#0a3a66'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -7); ctx.lineTo(2, -1); ctx.lineTo(9, 1); ctx.lineTo(9, 3)
  ctx.lineTo(1.5, 3); ctx.lineTo(1, 7); ctx.lineTo(3, 8); ctx.lineTo(-3, 8)
  ctx.lineTo(-1, 7); ctx.lineTo(-1.5, 3); ctx.lineTo(-9, 3); ctx.lineTo(-9, 1)
  ctx.lineTo(-2, -1)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.restore()
  if (label) {
    ctx.font = '8px Consolas, monospace'
    ctx.fillStyle = '#2a4a66'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y + 16)
  }
}

export function drawBase(ctx, x, y, side, label) {
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
