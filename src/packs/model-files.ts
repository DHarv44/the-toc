// PACK MODEL FILES — what art a pack actually ships, and the URL for it.
//
// Discovery is import.meta.glob over the pack folders, so this is the FOLDER
// itself rather than a list someone remembered to update: drop a GLB into
// src/packs/<id>/models/ and it exists. Vite emits each one as a real served
// asset (hashed in a build), which is why nothing here builds a path by hand.
//
// A manifest stores PACK-RELATIVE paths ('models/vehicles/pack.glb'); the
// browser needs the emitted URL. That translation lives here, once, because
// both the pack builder and the drone feed have to agree on it.
const MODEL_FILES = import.meta.glob('./*/models/**/*.glb', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

export interface PackModelFile {
  path: string   // '<packId>/models/vehicles/pack.glb'
  rel: string    // 'models/vehicles/pack.glb' — the form a manifest stores
  url: string
}

const ALL: PackModelFile[] = Object.entries(MODEL_FILES)
  .map(([k, url]) => {
    const path = k.replace(/^\.\//, '')
    return { path, url, rel: path.slice(path.indexOf('/') + 1) }
  })
  .sort((a, b) => a.path.localeCompare(b.path))

export function packModelFiles(packId: string): PackModelFile[] {
  return ALL.filter(f => f.path.startsWith(`${packId}/`))
}

export function packModelUrl(packId: string, rel: string): string | undefined {
  return ALL.find(f => f.path === `${packId}/${rel}`)?.url
}
