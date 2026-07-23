// Golden-run harness: drives a scripted, deterministic scenario against a sim API and
// digests the end state. The SAME function runs against the old sim (window.__game) and
// the new one (window.__newGame) — digest equality is the migration's behavior gate.
//
// Determinism: the sim is fully seeded through S.rng (post-migration cleanup done).
// The harness still seeds Math.random globally for the run as a belt-and-braces
// guard: it pins the pre-init fallback paths and would surface any stray raw
// Math.random that ever creeps back into sim code (the digest would go flaky).
import { makeRng } from '../engine/rng'

// The slice of the sim surface the harness drives. Structural on purpose: the old
// window.__game satisfies it without being typed itself.
export interface GoldenApi {
  S: {
    t: number
    resources: number
    enemyResources: number
    won: boolean
    lost: boolean
    units: Array<{ id: number; side: string; type: string; x: number; y: number; strength: number }>
    structures: Array<{ id: number; side: string; kind: string; x: number; y: number; hp: number }>
    drones: Array<{ id: number; type: string; state: string; x: number; y: number }>
    contacts: Map<number, unknown>
    radio: unknown[]
    map: { enemyBase: { x: number; y: number } } | null
  }
  initGame: (seed: number, gridSize: number, difficulty: string) => void
  advance: (seconds: number) => void
  fieldUnit: (typeKey: string, structId: number) => unknown
  deployDrone: (typeKey: string, x: number, y: number) => unknown
  orderMove: (unitId: number, x: number, y: number) => void
  fireMission: (unitId: number, x: number, y: number, opts?: object) => void
}

export interface GoldenResult {
  digest: string
  hash: number
  summary: {
    t: number; units: number; hostiles: number; drones: number
    resources: number; enemyResources: number; contacts: number; radio: number
    won: boolean; lost: boolean
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10

function digestState(S: GoldenApi['S']): string {
  const units = [...S.units]
    .sort((a, b) => a.id - b.id)
    .map((u) => [u.id, u.side, u.type, r1(u.x), r1(u.y), r1(u.strength)])
  const structures = [...S.structures]
    .sort((a, b) => a.id - b.id)
    .map((s) => [s.id, s.side, s.kind, r1(s.hp)])
  const drones = [...S.drones]
    .sort((a, b) => a.id - b.id)
    .map((d) => [d.id, d.type, d.state, r1(d.x), r1(d.y)])
  return JSON.stringify({
    t: r1(S.t),
    resources: Math.round(S.resources),
    enemyResources: Math.round(S.enemyResources),
    won: S.won, lost: S.lost,
    contacts: S.contacts.size,
    radio: S.radio.length,
    units, structures, drones,
  })
}

function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

export function runGolden(game: GoldenApi): GoldenResult {
  const realRandom = Math.random
  Math.random = makeRng(0xc0ffee)
  try {
    game.initGame(4242, 96, 'regular')
    const S = game.S
    const hq = S.structures.find((s) => s.side === 'friend' && s.kind === 'HQ')
    const afld = S.structures.find((s) => s.side === 'friend' && s.kind === 'AFLD')
    if (!hq || !afld || !S.map) throw new Error('golden: scenario init failed')

    // exercise the systems on a fixed script
    game.fieldUnit('INF', hq.id)
    game.fieldUnit('ARTY', hq.id)
    game.deployDrone('SHADOW', afld.x + 1200, afld.y - 900)
    game.advance(120)

    // push the two senior starting units toward the enemy base
    const movers = S.units.filter((u) => u.side === 'friend').slice(0, 2)
    for (const u of movers) {
      game.orderMove(u.id, (u.x + S.map.enemyBase.x) / 2, (u.y + S.map.enemyBase.y) / 2)
    }
    game.advance(60)

    // fire mission from the fielded battery at a point 2 km down its axis of advance
    const arty = S.units.find((u) => u.side === 'friend' && u.type === 'ARTY')
    if (arty) {
      const ax = S.map.enemyBase.x - arty.x, ay = S.map.enemyBase.y - arty.y
      const L = Math.hypot(ax, ay) || 1
      game.fireMission(arty.id, arty.x + (ax / L) * 2000, arty.y + (ay / L) * 2000, { shell: 'HE', rounds: 4 })
    }
    game.advance(420) // total 10 sim-minutes

    const digest = digestState(S)
    return {
      digest,
      hash: hashStr(digest),
      summary: {
        t: Math.round(S.t),
        units: S.units.filter((u) => u.side === 'friend').length,
        hostiles: S.units.filter((u) => u.side === 'hostile').length,
        drones: S.drones.length,
        resources: Math.round(S.resources),
        enemyResources: Math.round(S.enemyResources),
        contacts: S.contacts.size,
        radio: S.radio.length,
        won: S.won, lost: S.lost,
      },
    }
  } finally {
    Math.random = realRandom
  }
}
