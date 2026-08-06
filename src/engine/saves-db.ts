// WHERE SAVES LIVE — IndexedDB, split meta from body.
//
// A campaign save is megabytes of JSON (every soldier in the division is in
// there by name), and localStorage's ~5 MB budget would hold roughly one of
// them. IndexedDB has no such ceiling — and splitting the record into a META
// store (a few hundred bytes: when, what, how far in) and a BODY store (the
// state itself) means the splash can list every save point without pulling a
// single body off disk. Bodies are read exactly once: when the player loads.
//
// No wrapper library — the raw IDB API is callback soup, but it is thirty
// lines of it, and this project does not take a dependency to avoid thirty
// lines (see the dependency stance).

export interface SaveMeta {
  id: string                 // `${campaign}~${ts}`
  campaign: string           // 'packId/scenarioId' — what the splash groups by
  kind: 'manual' | 'auto'
  ts: number                 // wall-clock ms at save
  simT: number               // mission clock at save
  label: string              // the tasking in progress ('SEIZE KHADRA')
  difficulty: string
}

const DB = 'toc-saves'
const META = 'meta'
const BODY = 'body'

// how many rolling autosaves each campaign keeps — enough to climb back past a
// disaster, few enough that the auto clutter never buries the manual points
const AUTO_KEEP = 5

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(META, { keyPath: 'id' }).createIndex('campaign', 'campaign')
      db.createObjectStore(BODY)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** every save point for a campaign, newest first — metas only, no bodies */
export async function listSaves(campaign: string): Promise<SaveMeta[]> {
  const db = await open()
  const tx = db.transaction(META)
  const req = tx.objectStore(META).index('campaign').getAll(campaign)
  await done(tx)
  db.close()
  return (req.result as SaveMeta[]).sort((a, b) => b.ts - a.ts)
}

export async function putSave(meta: SaveMeta, body: string): Promise<void> {
  const db = await open()
  const tx = db.transaction([META, BODY], 'readwrite')
  tx.objectStore(META).put(meta)
  tx.objectStore(BODY).put(body, meta.id)
  await done(tx)
  // prune: only the newest AUTO_KEEP autosaves per campaign survive. Manual
  // saves are the player's — they are never touched.
  const autos = (await listSaves(meta.campaign)).filter(m => m.kind === 'auto')
  for (const old of autos.slice(AUTO_KEEP)) await deleteSave(old.id)
  db.close()
}

export async function getSaveBody(id: string): Promise<string | null> {
  const db = await open()
  const tx = db.transaction(BODY)
  const req = tx.objectStore(BODY).get(id)
  await done(tx)
  db.close()
  return (req.result as string | undefined) ?? null
}

export async function deleteSave(id: string): Promise<void> {
  const db = await open()
  const tx = db.transaction([META, BODY], 'readwrite')
  tx.objectStore(META).delete(id)
  tx.objectStore(BODY).delete(id)
  await done(tx)
  db.close()
}
