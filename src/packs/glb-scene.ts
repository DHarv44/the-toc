// GLB SCENE CACHE — parse each model file once, for the whole app.
//
// Two very different consumers read the same files: the pack builder draws
// thumbnails of them, and the drone feed bakes them into instanced geometry.
// Both go through here, so a 15 MB tank is fetched and parsed ONCE no matter
// how many places look at it.
//
// No Meshopt/KTX2 decoders are wired: nothing in the packs uses either (the
// builder's own extensionsUsed column reads NO COMPRESSION). They go in with
// an optimize pipeline, against files that actually exercise them.
import * as THREE from 'three'
import { PropertyBinding } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const sceneCache = new Map<string, Promise<THREE.Group>>()

export function loadGlbScene(url: string): Promise<THREE.Group> {
  let hit = sceneCache.get(url)
  if (!hit) {
    hit = new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(url, g => resolve(g.scene), undefined, reject)
    })
    sceneCache.set(url, hit)
  }
  return hit
}

// three SANITIZES node names on load (dots and spaces are reserved in animation
// binding paths), so a raw glTF name like 'desirefx.me_002_1' never matches.
// Try as authored, then as three rewrote it.
export function findGlbNode(scene: THREE.Group, node?: string): THREE.Object3D | null {
  if (!node) return scene
  return scene.getObjectByName(node)
    ?? scene.getObjectByName(PropertyBinding.sanitizeNodeName(node))
    ?? null
}
