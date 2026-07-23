// Shared readout formatters. Ported verbatim from src/game/sim.js (grid,
// fmtCooldown) and src/ui/styles.js (fmtClock) — one home so sim and UI stop
// carrying private copies.

// MGRS-lite grid reference (100 m precision), matches the cursor readout
export function grid(x: number, y: number): string {
  return String(Math.floor(x / 100)).padStart(3, '0') + ' ' + String(Math.floor(y / 100)).padStart(3, '0')
}

// hh:mm:ssZ mission clock
export function fmtClock(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`
}

// mm:ss for a turnaround readout — cooldowns run to 15 minutes, so bare seconds read badly
export function fmtCooldown(s: number): string {
  const m = Math.floor(s / 60), r = Math.ceil(s % 60)
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`
}
