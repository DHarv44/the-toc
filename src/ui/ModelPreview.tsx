// MODEL PREVIEW — a still of one model out of a pack GLB.
//
// This is the project's first GLTF load. The drone feed still draws its
// procedural shapes; when models go in there, this loader is what it will use.
//
// WHY A THUMBNAIL AND NOT A LIVE CANVAS: a browser page shows dozens of
// models, and every live <Canvas> is its own WebGL context. Browsers cap those
// at around 16 and then start killing the oldest, which is exactly what a wall
// of blank white boxes looks like. So there is ONE renderer for the whole app,
// each model is drawn through it once, and the page holds plain <img> data —
// no per-card context, no per-card render loop, and it scales to any number of
// models.
//
// Two caches, both keyed and shared: the parsed GLB per URL (a file holding
// five vehicles is fetched and parsed once, not five times) and the rendered
// thumbnail per url+node. Object3D.clone() SHARES geometry and material with
// the cached original, so nothing here disposes what it draws — the cache owns
// those, and disposing would break every later preview of the same file.
//
// No Meshopt/KTX2 decoders are wired: nothing in the packs uses either (the
// browser's own extensionsUsed column reads NO COMPRESSION). They go in with
// the optimize pipeline, against files that actually exercise them.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { PropertyBinding } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 320

const sceneCache = new Map<string, Promise<THREE.Group>>()
const thumbCache = new Map<string, Promise<string>>()

function loadScene(url: string): Promise<THREE.Group> {
  let hit = sceneCache.get(url)
  if (!hit) {
    hit = new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(url, g => resolve(g.scene), undefined, reject)
    })
    sceneCache.set(url, hit)
  }
  return hit
}

// one context for the whole app, made on first use
let _renderer: THREE.WebGLRenderer | null = null
function renderer(): THREE.WebGLRenderer {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true,
      preserveDrawingBuffer: true, // required to read the pixels back out
    })
    _renderer.setPixelRatio(1)
    _renderer.setSize(SIZE, SIZE)
  }
  return _renderer
}

// Frame whatever we were handed: centre it and scale so its largest dimension
// is 1, which lets one camera suit a 460-triangle jeep and a 216k-triangle
// tank without knowing anything about either.
function fit(obj: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group()
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  obj.position.sub(centre)
  holder.scale.setScalar(1 / (Math.max(size.x, size.y, size.z) || 1))
  holder.add(obj)
  return holder
}

function drawThumb(url: string, node?: string): Promise<string> {
  const key = `${url}|${node ?? ''}`
  let hit = thumbCache.get(key)
  if (hit) return hit
  hit = loadScene(url).then(scene => {
    // three SANITIZES node names on load (dots and spaces are reserved in
    // animation binding paths), so a raw glTF name like 'desirefx.me_002_1'
    // never matches. Try as authored, then as three rewrote it.
    const src = !node ? scene
      : scene.getObjectByName(node) ?? scene.getObjectByName(PropertyBinding.sanitizeNodeName(node))
    if (!src) throw new Error(`node "${node}" not found`)

    const s = new THREE.Scene()
    s.add(fit(src.clone(true)))
    // neutral studio light — the builder shows the ART, not the game's IR/EO
    s.add(new THREE.HemisphereLight(0xdceeff, 0x0b1118, 2.2))
    const key1 = new THREE.DirectionalLight(0xffffff, 2.2); key1.position.set(3, 5, 2)
    const key2 = new THREE.DirectionalLight(0xffffff, 0.7); key2.position.set(-3, 2, -2)
    s.add(key1, key2)

    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
    cam.position.set(1.1, 0.75, 1.4)
    cam.lookAt(0, 0, 0)

    const r = renderer()
    r.render(s, cam)
    const png = r.domElement.toDataURL('image/png')
    s.clear() // drop references; the shared geometry/material stay cached
    return png
  })
  thumbCache.set(key, hit)
  return hit
}

export default function ModelPreview({ url, node, h = 150 }: {
  url: string
  node?: string   // a named node inside the file; absent = the whole scene
  h?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setSrc(null); setErr(null)
    drawThumb(url, node)
      .then(d => { if (live) setSrc(d) })
      .catch(e => { if (live) setErr(String(e?.message ?? e)) })
    return () => { live = false }
  }, [url, node])

  const box: React.CSSProperties = {
    height: h, borderRadius: 3, overflow: 'hidden',
    border: '1px solid #22303d', background: '#0b1118',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const label = (t: string, c: string) => (
    <div style={box}><span style={{ color: c, fontSize: 10, fontFamily: 'Consolas, monospace' }}>{t}</span></div>
  )
  if (err) return label(err, '#e8524a')
  if (!src) return label('rendering…', '#54708a')
  return (
    <div style={box}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  )
}
