// THE GAME'S SUN — the almanac (world/sun) read against the running state.
//
// Two nouns drive it, both content: the scenario's H-HOUR (a local datetime —
// a dawn assault is something an author DECLARES) and its SUN SCALE (how much
// sky a minute of play sweeps; default 6×, so an hour-long match visibly
// moves the light — a 1× purist scenario just says so). Engine defaults: local
// noon on a fixed date, deterministic — no wall clock anywhere near the sim.
import { S } from './state'
import type { WorldMap } from '../world/WorldMap'
import { sunAt, localClock as solarClock, type SunPos } from '../world/sun'

export const DEFAULT_SUN_SCALE = 6

/** The map's place on Earth — centre of the gwpack manifest bounds. A map
 *  with no geographic identity gets a mid-latitude sky rather than a crash. */
export function mapLatLon(map: WorldMap | null): { lat: number; lon: number } {
  const b = (map?.ground as { files?: { manifest?: { bounds?: { north: number; south: number; east: number; west: number } } } } | undefined)
    ?.files?.manifest?.bounds
  if (b) return { lat: (b.north + b.south) / 2, lon: (b.east + b.west) / 2 }
  return { lat: 33.3, lon: 44.4 }
}

/** UTC ms for "local noon on the fixed default date" at this longitude —
 *  deterministic, so a replayed match gets the same sky. */
export function defaultSunEpoch(lon: number): number {
  return Date.UTC(2026, 5, 15, 12, 0, 0) - (lon / 15) * 3600e3
}

/** Parse a scenario's H-hour ('2026-06-21T04:30', LOCAL to the map) into the
 *  UTC epoch the clock runs from. Null on garbage — caller keeps the default. */
export function parseStart(start: string, lon: number): number | null {
  const ms = Date.parse(start.length <= 16 ? start + ':00Z' : start + 'Z')
  if (!Number.isFinite(ms)) return null
  return ms - (lon / 15) * 3600e3
}

/** The in-world UTC instant right now: epoch + sim seconds × scale. */
export const simUtc = (): number =>
  S.sunEpoch + S.t * 1000 * (S.sunScale || DEFAULT_SUN_SCALE)

/** Where the sun stands over this map, right now. */
export function sunNow(): SunPos {
  const { lat, lon } = mapLatLon(S.map)
  return sunAt(lat, lon, simUtc())
}

/** Night, as the sensor suite means it: past civil-twilight-ish. */
export const isNight = (): boolean => sunNow().elevation < -0.06

/** The ground's wall clock, for the top bar ("what time it feels like"). */
export function groundClock(): string {
  return solarClock(mapLatLon(S.map).lon, simUtc())
}
