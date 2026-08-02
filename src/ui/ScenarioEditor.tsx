// SCENARIO EDITOR — the war drawn on top of the geography.
//
// A pack map's .gwpack is ground; where the FOB sits and where the enemy digs
// in is SCENARIO, and it lives in the map.json sidecar beside the ground
// (GROUNDWORK.md: geography vs scenario). This is the placement step: the
// exact BFT sheet, the two base markers, click to move them, save the
// sidecar. Groundwork never learns what a FOB is.
//
// Deliberately small: no pan/zoom, the whole map in one square pane. Base
// placement is a battalion-level decision — tens of metres of pointer slop on
// a 25 km sheet is noise under the base's own footprint.
import { useEffect, useRef, useState } from 'react'
import { Box, Button, Group, Text } from '@mantine/core'
import type { PackMapEntry, PackMapSidecar } from '../packs/map-files'
import { loadGround, type Ground } from '../world/pack/loadGround'
import { mapFromPack } from '../world/pack/mapFromPack'
import { frameOf, worldToNorm, normToWorld } from '../world/pack/frame'
import { renderPackLayer } from '../map/packRender'
import type { WorldMap } from '../world/WorldMap'

const MONO = 'Consolas, monospace'
const FOB_C = '#7ec8ff', ENEMY_C = '#ff8a7e'

export default function ScenarioEditor({ entry, onClose }: {
  entry: PackMapEntry
  onClose: () => void
}) {
  const [ground, setGround] = useState<Ground | null>(null)
  const [map, setMap] = useState<WorldMap | null>(null)
  // the working sidecar — what SAVE writes
  const [sidecar, setSidecar] = useState<PackMapSidecar>(entry.sidecar)
  const [tool, setTool] = useState<'fob' | 'enemy' | null>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const g = await loadGround(entry.groundUrl)
        if (!live) return
        setGround(g)
        setMap(mapFromPack(g, entry.sidecar))
      } catch (e) {
        if (live) setMsg(`LOAD FAILED: ${String((e as Error).message ?? e)}`)
      }
    })()
    return () => { live = false }
  }, [entry])

  // the exact sheet, once the ground is open
  useEffect(() => {
    const cv = cvRef.current
    if (!cv || !map || !ground) return
    const layer = renderPackLayer(map, ground)
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(layer, 0, 0, cv.width, cv.height)
  }, [map, ground])

  if (!ground || !map) {
    return (
      <Box p="xl"><Text fz={11} c="#7ec8ff" style={{ fontFamily: MONO, letterSpacing: 2 }}>
        {msg ?? 'OPENING THE GROUND…'}
      </Text></Box>
    )
  }

  const f = frameOf(ground.files.manifest)
  // marker positions: authored sidecar first, else where mapFromPack's
  // fallback put them (which IS what the game will use if nothing is authored)
  const fobW = sidecar.fob ? normToWorld(f, sidecar.fob.x, sidecar.fob.y) : map.fob
  const enemyW = sidecar.enemyBase ? normToWorld(f, sidecar.enemyBase.x, sidecar.enemyBase.y) : map.enemyBase
  const pct = (p: { x: number; y: number }) => ({ l: (p.x / f.WORLD) * 100, t: (p.y / f.WORLD) * 100 })

  const onClick = (e: React.MouseEvent) => {
    if (!tool) return
    const r = paneRef.current!.getBoundingClientRect()
    const wx = ((e.clientX - r.left) / r.width) * f.WORLD
    const wy = ((e.clientY - r.top) / r.height) * f.WORLD
    const { nx, ny } = worldToNorm(f, wx, wy)
    setSidecar(s => tool === 'fob' ? { ...s, fob: { x: nx, y: ny } } : { ...s, enemyBase: { x: nx, y: ny } })
    setDirty(true); setTool(null)
  }

  const save = async () => {
    try {
      const put = await fetch(`/__gwmap?pack=${entry.packId}&map=${entry.mapId}&file=meta`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sidecar),
      })
      if (!put.ok) throw new Error((await put.json() as { error?: string }).error ?? `HTTP ${put.status}`)
      setDirty(false)
      setMsg('SAVED map.json — reload before starting a game on it')
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    }
  }

  return (
    <Box pos="fixed" inset={0} bg="#05080b" p="lg"
      style={{ zIndex: 150, fontFamily: MONO, display: 'flex', flexDirection: 'column' }}>
      <Group gap="md" align="center" pb={10} style={{ borderBottom: '2px solid #2a3a48' }}>
        <Box style={{ flex: 1 }}>
          <Text fz={20} fw={700} c="#dceeff" style={{ letterSpacing: 3 }}>
            SCENARIO · {entry.name}
          </Text>
          <Text fz={10} c="dark.3" style={{ letterSpacing: 1.5 }}>
            THE WAR ON TOP OF THE GROUND · BASES NOW, MSR LATER
          </Text>
        </Box>
        {msg && <Text fz={10} c={msg.startsWith('FAILED') || msg.startsWith('LOAD') ? '#e8524a' : '#7ec8ff'}>{msg}</Text>}
        <Button size="xs" variant={tool === 'fob' ? 'filled' : 'default'}
          onClick={() => setTool(t => t === 'fob' ? null : 'fob')}>PLACE FOB</Button>
        <Button size="xs" variant={tool === 'enemy' ? 'filled' : 'default'}
          onClick={() => setTool(t => t === 'enemy' ? null : 'enemy')}>PLACE ENEMY</Button>
        <Button size="sm" onClick={() => void save()} disabled={!dirty}>SAVE</Button>
        <Button size="sm" variant="default" onClick={onClose}>◀ BACK</Button>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', paddingTop: 10 }}>
        <Box ref={paneRef} pos="relative" onClick={onClick}
          style={{
            height: 'min(100%, 82vh)', aspectRatio: '1 / 1',
            border: '1px solid #22303d', borderRadius: 4, overflow: 'hidden',
            cursor: tool ? 'crosshair' : 'default',
          }}>
          <canvas ref={cvRef} width={2048} height={2048}
            style={{ display: 'block', width: '100%', height: '100%' }} />
          {([['FOB', fobW, FOB_C, !!sidecar.fob], ['ENEMY', enemyW, ENEMY_C, !!sidecar.enemyBase]] as const)
            .map(([label, at, c, authored]) => (
              <Box key={label} pos="absolute" style={{
                left: `${pct(at).l}%`, top: `${pct(at).t}%`,
                transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center',
              }}>
                <Box style={{
                  width: 14, height: 14, margin: '0 auto', borderRadius: 3, background: c,
                  border: `2px solid ${authored ? '#fff' : 'rgba(0,0,0,0.55)'}`,
                }} />
                <Text fz={10} fw={700} c={c} style={{ textShadow: '0 1px 3px #000' }}>
                  {label}{authored ? '' : ' (auto)'}
                </Text>
              </Box>
            ))}
        </Box>
      </Box>
      <Text fz={9} c="dark.4" mt={6}>
        Arm a tool, click the sheet. “(auto)” marks the engine’s fallback placement — saving an
        authored spot replaces it for every game on this map.
      </Text>
    </Box>
  )
}
