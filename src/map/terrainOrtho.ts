// The SAT view of a world with no satellite: the engine's TERRAIN mode,
// rendered top-down. A map whose sidecar says `sat: false` was authored as
// its own world (map.json — the builder's satellite toggle was off at save),
// so the BFT's SAT underlay shows the engine's procedural ground — that
// world's own orthoimagery — instead of Earth's. Baked once per map with a
// throwaway renderer, orthographic over the sim frame, north up.
import * as THREE from 'three'
import {
  TerrainSurface, DEFAULT_SURFACE_CONFIG, buildTerrain, computeSky,
} from '@dharv44/groundwork-engine'
import { frameOf } from '../world/pack/frame'
import type { WorldMap } from '../world/WorldMap'

let cache: { map: WorldMap; cv: HTMLCanvasElement } | null = null

/** Bake (session-cached per map). Callers pass THEIR map — the game passes
 *  S.map, the scenario builder its own loaded map. */
export function terrainOrtho(map: WorldMap): HTMLCanvasElement {
  if (cache && cache.map === map) return cache.cv
  const g = map.ground!
  const man = g.files.manifest
  const f = frameOf(man)

  const build = buildTerrain(g.hf, { detail: 1024, exaggeration: 1 })
  const surface = new TerrainSurface(build)
  surface.setConfig({
    ...DEFAULT_SURFACE_CONFIG,
    exaggeration: 1,
    textureMode: 'procedural',
    fogDensity: 0,
  })
  surface.setSky(computeSky(135, 55))
  surface.update(0.1) // one tick so time-driven uniforms are live

  const SIZE = 2048
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(SIZE, SIZE)
  const scene = new THREE.Scene()
  scene.add(surface.mesh)

  // the sim frame square in ENGINE coords (geometry is box-centred)
  const cx = (f.x0 - 0.5) * man.widthMetres + f.WORLD / 2
  const cz = (f.y0 - 0.5) * man.heightMetres + f.WORLD / 2
  const cam = new THREE.OrthographicCamera(
    -f.WORLD / 2, f.WORLD / 2, f.WORLD / 2, -f.WORLD / 2, 1, 30000)
  cam.position.set(cx, g.hf.max + 2000, cz)
  cam.up.set(0, 0, -1) // world -Z is north; north lands at the top row
  cam.lookAt(cx, 0, cz)
  renderer.render(scene, cam)

  // copy out and release the GL context — this bake is a one-shot
  const cv = document.createElement('canvas')
  cv.width = cv.height = SIZE
  cv.getContext('2d')!.drawImage(renderer.domElement, 0, 0)
  surface.dispose()
  build.geometry.dispose()
  build.normalTexture.dispose()
  build.heightTexture.dispose()
  renderer.dispose()

  cache = { map, cv }
  return cv
}
