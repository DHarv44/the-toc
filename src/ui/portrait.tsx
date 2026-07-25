// Profile-pic factory (Packs P2): a stylized DA-photo portrait per soldier,
// generated from a hash — no assets, every soldier's face is stable for the
// whole campaign (seeded by unit id + soldier id). Deliberately low-fi and
// abstract (flag-blue backdrop, uniform shoulders, varied head/skin/hair/
// features) — reads as a personnel-record photo, not an uncanny face.
import { useEffect, useRef } from 'react'
import { hashStr } from '../lib/math'

const SKIN = ['#c9a17c', '#a87c56', '#8a5f3f', '#6e4a30', '#dcb391', '#5a3c27']
const HAIR = ['#1c1712', '#2e2218', '#4a3826', '#171717', '#3b2c1e', '#553f28']

export function drawPortrait(cv: HTMLCanvasElement, seed: string, kia = false): void {
  const W = 28, H = 34
  const dpr = 2
  cv.width = W * dpr; cv.height = H * dpr
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const h = (salt: string) => Math.abs(hashStr(seed + ':' + salt))
  const pickN = (salt: string, n: number) => h(salt) % n

  // flag-blue studio backdrop
  ctx.fillStyle = '#25324a'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(0, 0, W, 12)

  const skin = SKIN[pickN('skin', SKIN.length)]!
  const hair = HAIR[pickN('hair', HAIR.length)]!
  const faceW = 10 + pickN('fw', 4)          // 10..13
  const jaw = 0.72 + pickN('jaw', 3) * 0.07  // face roundness

  // uniform shoulders (OCP-ish)
  ctx.fillStyle = '#4a4a38'
  ctx.beginPath()
  ctx.moveTo(2, H); ctx.quadraticCurveTo(3, 24, W / 2, 23.5)
  ctx.quadraticCurveTo(W - 3, 24, W - 2, H); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#3d3d2e'
  ctx.fillRect(W / 2 - 2, 25, 4, 4) // collar zip

  // head
  const cx = W / 2, cy = 14
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.ellipse(cx, cy, faceW / 2, (faceW / 2) * 1.22 * jaw + 3, 0, 0, Math.PI * 2)
  ctx.fill()
  // neck
  ctx.fillRect(cx - 2.5, cy + 6, 5, 5)

  // hair / high-and-tight variants (some shaved)
  const hairStyle = pickN('hs', 4)
  if (hairStyle > 0) {
    ctx.fillStyle = hair
    ctx.beginPath()
    ctx.ellipse(cx, cy - 4.5, faceW / 2 - 0.4, 3 + hairStyle * 0.6, 0, Math.PI, 0)
    ctx.fill()
  }

  // features: brow shadow, eyes, mouth — minimal, varied
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  const eyeY = cy - 1 + pickN('ey', 2)
  const eyeDx = 2 + pickN('ed', 2) * 0.5
  ctx.fillRect(cx - eyeDx - 1.2, eyeY, 2.4, 1.1)
  ctx.fillRect(cx + eyeDx - 1.2, eyeY, 2.4, 1.1)
  if (pickN('brow', 3) > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(cx - eyeDx - 1.5, eyeY - 2, 3, 0.8)
    ctx.fillRect(cx + eyeDx - 1.5, eyeY - 2, 3, 0.8)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(cx - 1.6 + pickN('m', 2) * 0.5, cy + 3.6, 3.2, 0.9)

  if (kia) {
    // the record photo of the fallen: desaturating slash-banner
    ctx.fillStyle = 'rgba(10,12,16,0.55)'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(200,60,60,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(2, H - 3); ctx.lineTo(W - 2, 3); ctx.stroke()
  }
}

export function Portrait({ seed, kia, w = 28, h = 34 }: { seed: string; kia?: boolean; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawPortrait(ref.current, seed, kia) }, [seed, kia])
  return <canvas ref={ref} style={{ width: w, height: h, borderRadius: 2, flex: '0 0 auto' }} />
}
