// Division asset request service (ASSET-REQUESTS.md): the TOC asks, division
// decides — relevance → availability → approve / deny(reason) / queue. Every
// outcome is deterministic (hashStr on state, no rng draws). Approval of IRON
// (facility/tether/unlock) spawns a REAL delivery convoy from division in the
// rear; orbit/window authority is paperwork and needs no trucks.
import { S } from '../../engine/state'
import type { AssetInstance, Structure } from '../../engine/GameState'
import { playerPack } from '../../packs'
import type { PackAsset } from '../../packs/types'
import { hashStr } from '../../lib/math'
import { FACILITIES } from '../installations/catalog'
import { radio, toast } from '../comms/radio'
import { nearestLand } from '../../world/place'
import { newUnit } from '../forces/factory'
import { orderMove } from '../forces/orders'
import { deriveElements, deriveStrength } from '../forces/casualties'
import { assetCrewSlot } from '../../packs/org'

// FALLBACKS only — the real numbers are pack data (PackAsset.setupTime /
// windowLen / atoLead / refitTime); the engine never dictates them
export const DEFAULT_SETUP = 60
export const DEFAULT_WINDOW = 900
export const DEFAULT_ATO_LEAD = 180
export const REFIT_TIME = 1800

export function assetDef(kind: string): PackAsset | null {
  return playerPack().assets?.[kind] ?? null
}

// reverse lookups: the engine reasons about EFFECTS, never system names — a
// facility/tether/orbit key traces back to whichever pack asset delivers it
export function assetKindWhere(pred: (a: PackAsset) => boolean): string | null {
  for (const [k, def] of Object.entries(playerPack().assets ?? {})) if (pred(def)) return k
  return null
}
export const facilityAssetKind = (fac: string): string | null =>
  assetKindWhere(d => d.delivers.facility === fac)
export const tetherAssetKind = (drone: string): string | null =>
  assetKindWhere(d => d.delivers.tether === drone)
export const orbitAssetKind = (drone: string): string | null =>
  assetKindWhere(d => d.delivers.orbit === drone)
export const windowAssetKind = (drone: string): string | null =>
  assetKindWhere(d => d.delivers.window === drone)

// division's voice on the net, by echelon
export function assetDesk(kind: string): string {
  const e = assetDef(kind)?.echelon
  return e === 'USAF' ? 'ASOC' : e === 'CORPS' ? 'CORPS G3' : 'DIV G3'
}

// --- registry reads (UI + gating) ------------------------------------------

export function poolOf(kind: string): AssetInstance[] {
  return S.assets.pool.filter(a => a.kind === kind)
}

export function tfInstance(kind: string): AssetInstance | null {
  return S.assets.pool.find(a => a.kind === kind && a.holder === 'TF'
    && (a.state === 'allocated' || a.state === 'enroute' || a.state === 'setup')) ?? null
}

export function availableCount(kind: string): number {
  return S.assets.pool.filter(a => a.kind === kind && a.state === 'available').length
}

export function requestOpen(kind: string): boolean {
  return S.assets.pending.some(p => p.kind === kind) || S.assets.queue.some(q => q.kind === kind)
}

// concurrent launch authority for a division/corps airframe: one per
// TF-allocated orbit instance (dev sandbox is exempt — everything flies)
export function orbitAuthority(droneKey: string): number {
  if (S.devMode) return Infinity
  let n = 0
  for (const a of S.assets.pool) {
    if (a.holder !== 'TF' || a.state !== 'allocated') continue
    if (assetDef(a.kind)?.delivers.orbit === droneKey) n++
  }
  return n
}

export function windowOpen(droneKey: string): boolean {
  if (S.devMode) return true
  return S.assets.windows.some(w =>
    assetDef(w.kind)?.delivers.window === droneKey && S.t >= w.opensT && S.t < w.closesT)
}

export function hasUnlock(cap: string): boolean {
  return S.devMode || S.assets.unlocks.includes(cap)
}

// --- relevance --------------------------------------------------------------
// Would division even entertain this right now? Reads the COP, not dice.
// Outside the campaign every ask is relevant — availability still rules.
export function relevance(kind: string): { ok: boolean; reason: string } {
  const def = assetDef(kind)
  if (!def) return { ok: false, reason: 'NO SUCH CAPABILITY' }
  if (!S.campaign) return { ok: true, reason: '' }
  const d = def.delivers
  if (d.tether) {
    // an aerostat needs held ground to moor over
    const holding = S.structures.some(s => s.side === 'friend' && s.kind === 'FOB' && s.buildT <= 0)
      || (S.campaign.objIdx ?? 0) >= 2
    if (!holding) return { ok: false, reason: 'NO ESTABLISHED PERIMETER TO MOOR IT — HOLD GROUND FIRST' }
  }
  if (d.window && !hasUnlock('CAS')) {
    // the more fundamental failure first: no controller, no conversation
    return { ok: false, reason: 'NO JTAC ON YOUR NET — REQUEST THE ALO TEAM' }
  }
  if (d.orbit === 'VIPER' || d.window) {
    // strike air wants a target picture: live contacts on the COP
    const picture = [...S.contacts.values()].some(c => c.live)
    if (!picture) return { ok: false, reason: 'NO TARGET PICTURE — DEVELOP THE SITUATION' }
  }
  if (d.airdrop) {
    // no cut-MSR state exists yet: ground LOC is open by definition
    return { ok: false, reason: 'MSR OPEN — GROUND RESUPPLY DIRECTED' }
  }
  return { ok: true, reason: '' }
}

// --- the ask ----------------------------------------------------------------

export function requestAsset(kind: string, structId?: number): void {
  const def = assetDef(kind)
  if (!def) return
  if (requestOpen(kind)) return void toast(`${def.name.toUpperCase()} REQUEST ALREADY WITH ${assetDesk(kind)}`)
  if (tfInstance(kind)) return void toast(`${def.name.toUpperCase()} ALREADY ALLOCATED TO THE TASK FORCE`)
  // staff processing: 15-25 s before the answer comes back — shortened by
  // FAVOR (division remembers who helped with division problems). Point-
  // defense asks are fast-tracked when the base has actually been taking
  // fire — keyed off the delivered facility's INTERCEPT effect, never a name.
  let delay = 15 + (Math.abs(hashStr(`asset:${kind}:${S.t.toFixed(1)}`)) % 100) / 10
  delay = Math.max(6, delay / (1 + 0.15 * S.assets.favor))
  const fac = def.delivers.facility ? FACILITIES[def.delivers.facility] : null
  if (fac?.effects.intercept) {
    const st = S.structures.find(s => s.id === structId)
    const hot = st && S.impacts.some(i => S.t - i.t < 120 && Math.hypot(i.x - st.x, i.y - st.y) < 1500)
    if (hot) delay = Math.max(6, delay * 0.4)
  }
  S.assets.pending.push({ kind, structId, decideT: S.t + delay })
  radio('TOC', 'request', `REQUEST TO ${assetDesk(kind)} — ${def.name.toUpperCase()}, PRIORITY, HOW COPY`, undefined, undefined)
}

// --- decision + delivery (called from update.ts) ----------------------------

// spawn the delivery convoy at DIVISION MAIN (deep rear) or the friendly map
// edge, and point it at the requesting base. It is NOT task-organized to the
// battalion (respFrom = the owning formation) — and the asset's REAL crew
// rides the trucks (shared roster records with their org slot), so a convoy
// that dies puts those people into the DUSTWUN machinery like anyone else.
function spawnDeliveryConvoy(inst: AssetInstance, def: PackAsset, st: Structure): void {
  const W = S.map!.WORLD
  const from = S.campaign?.divHq
    ?? nearestLand(S.map!, S.map!.fob.x, Math.min(W - 120, S.map!.fob.y + W * 0.2))
  const p = nearestLand(S.map!, from.x, from.y)
  const u = newUnit('LOG', 'friend', p.x, p.y, { noSlot: true })
  u.respFrom = def.from
  u.lineage = `${def.name}, ${def.from}`
  u.attFrom = def.from
  u.roe = 'break'          // delivery trucks run, they don't fight
  u.weapons = 'hold'
  const crew = assetCrewSlot(S.org, inst.id)
  if (crew) {
    // passengers, by reference: casualties on the road hit the SLOT's records
    u.soldiers = [...u.soldiers, ...crew.soldiers]
    deriveElements(u); deriveStrength(u)
  }
  S.units.push(u)
  inst.state = 'enroute'
  inst.holder = 'TF'
  inst.structId = st.id
  inst.convoyId = u.id
  orderMove(u.id, st.x, st.y)
  radio(u.label, 'move', `${def.name.toUpperCase()} MOVING FROM DIVISION — CONVOY ON THE MSR TO ${st.label}`, u.x, u.y)
}

// --- division favor + the optional assist (ASSET-REQUESTS.md) ---------------
// Securing a downed HIGHER-ECHELON convoy site is not the battalion's duty —
// doing it anyway earns FAVOR (faster staff decisions) and rolls a REAL
// chance the transported iron is recovered instead of written off (degraded
// if the enemy ever held the site; never guaranteed).
export function assetSiteSecured(site: { id: number; respFrom?: string }): void {
  S.assets.favor++
  radio('DIV G3', 'arrive',
    `${site.respFrom ?? 'DIVISION'} CONVOY SITE SECURED BY TASK FORCE — DIVISION NOTES THE ASSIST`, undefined, undefined)
  const inst = S.assets.pool.find(a => a.siteId === site.id)
  if (!inst) return
  delete inst.siteId
  const def = assetDef(inst.kind)
  const enemyHeld = 'capturedT' in site && (site as { capturedT?: number }).capturedT != null
  const odds = enemyHeld ? 0.2 : 0.45
  const roll = (Math.abs(hashStr(`salvage:${inst.id}:${site.id}`)) % 1000) / 1000
  if (roll < odds) {
    inst.state = 'available'
    delete inst.holder; delete inst.structId; delete inst.refitT; delete inst.hullReady
    radio('DIV G3', 'arrive',
      `${def?.name.toUpperCase() ?? inst.kind} RECOVERED FROM THE SITE — BACK IN THE DIVISION POOL AFTER INSPECTION`, undefined, undefined)
    toast(`${def?.name.toUpperCase() ?? inst.kind} RECOVERED`)
  } else {
    radio('DIV G3', 'request',
      `${def?.name.toUpperCase() ?? inst.kind} UNSALVAGEABLE — REPLACEMENT STAYS ON THE CL VII CLOCK`, undefined, undefined)
  }
}

// crew readiness gate: division is only "whole" again when the PEOPLE are —
// an instance needs its crew slot ≥60% FIT (contractor or mil) to stand up
export function crewReady(inst: AssetInstance): boolean {
  const slot = assetCrewSlot(S.org, inst.id)
  if (!slot || !slot.soldiers.length) return true // uncrewed asset kinds
  const fit = slot.soldiers.filter(s => s.status === 'FIT' && !s.replaced).length
  const authorized = slot.soldiers.filter(s => !s.replaced).length
  return fit >= Math.ceil(authorized * 0.6)
}

export function approve(kind: string, structId: number | undefined, fromQueue: boolean): void {
  const def = assetDef(kind)!
  const inst = S.assets.pool.find(a => a.kind === kind && a.state === 'available')
  const d = def.delivers
  const lead = fromQueue ? 'ASSET FREED — YOUR NUMBER CAME UP. ' : ''
  if (d.orbit) {
    // paperwork: orbit authority transfers on the net, effective now
    if (!inst) return
    inst.state = 'allocated'; inst.holder = 'TF'
    radio(assetDesk(kind), 'arrive', `${lead}${def.name.toUpperCase()} APPROVED — ORBIT AUTHORITY EFFECTIVE IMMEDIATELY`, undefined, undefined)
    toast(`${def.name.toUpperCase()} GRANTED`)
    return
  }
  if (d.window) {
    // ATO cycle: the window opens at the next slot, not on demand — lead time
    // and duration are the PACK's numbers, hash-rolled within the lead
    const atoLead = def.atoLead ?? DEFAULT_ATO_LEAD
    const winLen = def.windowLen ?? DEFAULT_WINDOW
    const open = S.t + atoLead / 3 + (Math.abs(hashStr(`ato:${kind}:${S.t.toFixed(1)}`)) % Math.max(1, Math.round(atoLead * 2 / 3)))
    S.assets.windows.push({ kind, opensT: open, closesT: open + winLen })
    const cs = def.callsigns?.[Math.abs(hashStr(`cs:${kind}:${S.t.toFixed(0)}`)) % def.callsigns.length] ?? 'AIR'
    radio(assetDesk(kind), 'arrive',
      `${lead}${def.name.toUpperCase()} ON THE ATO — ${cs} WINDOW OPENS IN ${Math.max(1, Math.round((open - S.t) / 60))} MIN, ${Math.round(winLen / 60)} MIN ON STATION`,
      undefined, undefined)
    toast(`${def.name.toUpperCase()} WINDOW GRANTED`)
    return
  }
  // iron: needs a live pool instance and a real destination, then trucks roll
  if (!inst) return
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
    ?? S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  if (!st) return
  radio(assetDesk(kind), 'arrive', `${lead}${def.name.toUpperCase()} APPROVED — SECTION LOADING AT DIVISION, CONVOY TO FOLLOW`, undefined, undefined)
  toast(`${def.name.toUpperCase()} APPROVED — CONVOY INBOUND`)
  spawnDeliveryConvoy(inst, def, st)
}

// give an allocated asset back to division (frees the pool; the queue head
// auto-approves on the next tick)
export function releaseAsset(kind: string): void {
  const def = assetDef(kind)
  const inst = S.assets.pool.find(a => a.kind === kind && a.holder === 'TF' && a.state === 'allocated')
  if (!def || !inst) return
  const d = def.delivers
  if (d.facility && inst.structId != null) {
    const st = S.structures.find(s => s.id === inst.structId)
    if (st?.facilities) st.facilities = st.facilities.filter(f => f !== d.facility)
  }
  if (d.tether && inst.structId != null) {
    const drone = S.drones.find(dr => dr.tether === inst.structId)
    if (drone) S.drones.splice(S.drones.indexOf(drone), 1)
  }
  if (d.unlock) S.assets.unlocks = S.assets.unlocks.filter(u => u !== d.unlock)
  inst.state = 'available'
  delete inst.holder; delete inst.structId; delete inst.convoyId; delete inst.setupT
  radio('TOC', 'request', `${def.name.toUpperCase()} RELEASED BACK TO DIVISION — ASSET AVAILABLE FOR TASKING`, undefined, undefined)
}
