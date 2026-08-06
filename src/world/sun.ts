// WHERE THE SUN IS — the standard low-precision solar almanac (NOAA/Meeus
// form, good to ~0.2°), pure math over (place, instant). The ground is real
// Earth with a real lat/lon (the gwpack manifest carries the bounds), so the
// light over a map can be astronomically honest instead of a mood switch:
// dawn comes up where dawn actually comes up on that ground.
//
// Angles in RADIANS. Azimuth is from TRUE NORTH, clockwise — the compass
// convention, because everything else in this game speaks compass.

export interface SunPos {
  azimuth: number     // rad, from north, clockwise
  elevation: number   // rad above the horizon (negative = below)
}

const RAD = Math.PI / 180

export function sunAt(lat: number, lon: number, utcMs: number): SunPos {
  // days since J2000.0 (2000-01-01T12:00Z)
  const d = utcMs / 86400000 - 10957.5
  const g = RAD * (((357.529 + 0.98560028 * d) % 360 + 360) % 360)  // mean anomaly
  const q = ((280.459 + 0.98564736 * d) % 360 + 360) % 360          // mean longitude
  const L = RAD * (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) // ecliptic longitude
  const e = RAD * (23.439 - 0.00000036 * d)                         // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))     // right ascension
  const dec = Math.asin(Math.sin(e) * Math.sin(L))                  // declination
  // Greenwich sidereal time → local hour angle of the sun
  const gmstH = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24
  const lha = RAD * ((gmstH * 15 + lon) % 360) - ra
  const la = RAD * lat
  const elevation = Math.asin(
    Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(lha))
  // atan2 form gives azimuth from SOUTH; rotate to the compass convention
  const azS = Math.atan2(Math.sin(lha),
    Math.cos(lha) * Math.sin(la) - Math.tan(dec) * Math.cos(la))
  const azimuth = (azS + Math.PI) % (Math.PI * 2)
  return { azimuth, elevation }
}

/** Local SOLAR time at a longitude, for a wall-clock readout ("what time does
 *  it feel like on the ground"). hh:mm, 24-hour. */
export function localClock(lon: number, utcMs: number): string {
  const local = utcMs + (lon / 15) * 3600e3
  const mins = Math.floor(local / 60000) % 1440
  const h = Math.floor(((mins + 1440) % 1440) / 60), m = ((mins + 1440) % 1440) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
