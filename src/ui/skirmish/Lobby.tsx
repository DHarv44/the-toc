// THE SKIRMISH LOBBY — a C&C-style setup board, fitted to this game and driven
// entirely by PACKS (ROADMAP → Skirmish Lobby; design settled 2026-08-06).
//
// Three columns. LEFT is the friendly side: whose army, which battalion you
// command, and the TASK ORGANIZATION you take — real groups off the pack's own
// ORBAT, priced, under a budget. MIDDLE is the battle: map, scenario, the
// difficulty preset (which IS both budget caps), LAUNCH. RIGHT is the OPFOR:
// whose army and its budget; editing its force lands in phase 2 — today its
// commander builds its own force from its pack, as it always has.
//
// The lobby picks WHAT, the scenario decides WHERE: nothing here places a
// unit. Your picks become the org's task-force marking and you field them
// from the HQ at H-hour through CALL UP.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'
import { DrillRow, TreeLeaf } from '../tree'
import {
  LOBBY_BUDGETS, defaultForce, lobbyGroups,
  type LobbyGroup, type SkirmishScenarioSel, type SkirmishSetup,
} from '../../engine/skirmish'
import { allPacks, PACKS, playerPack } from '../../packs'
import { playableFormations, defaultPlayerFormation } from '../../packs/orgquery'
import { packMaps } from '../../packs/map-files'
import { packScenarios } from '../../packs/scenario-files'
import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, type DifficultyKey,
} from '../../domains/economy/difficulty'

const INK = '#c8d8e8', MUTED = '#7f97ab', DIM = '#54708a', LINE = '#2a3a48'
const CARD = 'rgba(16,26,36,0.85)'

export default function SkirmishLobby({ onLaunch, onBack }: {
  onLaunch: (setup: SkirmishSetup) => void
  onBack: () => void
}) {
  const packs = allPacks()
  const maps = packMaps()
  // authored (non-campaign) battles ride the same dropdown as the rulesets
  const authored = useMemo(() => packScenarios().filter(s => s.spec.type !== 'campaign'), [])

  const [friendPack, setFriendPack] = useState(() => playerPack().id)
  const [hostilePack, setHostilePack] = useState(() =>
    (packs.find(p => p.id === 'opfor') ?? packs.find(p => p.id !== playerPack().id) ?? playerPack()).id)
  const [chair, setChair] = useState(() => defaultPlayerFormation(playerPack()))
  const [mapSel, setMapSel] = useState(() => maps[0] ? `${maps[0].packId}/${maps[0].mapId}` : '')
  const [scn, setScn] = useState<SkirmishScenarioSel>({ kind: 'mode', mode: MODE_ORDER[0]! })
  const [diff, setDiff] = useState<DifficultyKey>(DEFAULT_DIFFICULTY)
  const [picks, setPicks] = useState<Set<string>>(new Set())

  const fPack = PACKS[friendPack] ?? playerPack()
  const chairs = playableFormations(fPack)
  const authoredSel = scn.kind === 'authored'
    ? authored.find(e => `${e.packId}/${e.scenarioId}` === scn.ref) ?? null
    : null

  // the force column: every task-organizable group this pack + chair offers
  const groups = useMemo(() => lobbyGroups(fPack, chair), [fPack, chair])

  // a new army gets its default chair; a new chair gets its default task org
  useEffect(() => { setChair(defaultPlayerFormation(PACKS[friendPack] ?? playerPack())) }, [friendPack])
  useEffect(() => { setPicks(new Set(defaultForce(groups))) }, [groups])

  // an authored battle brings its own ground and its own sides — lock them in
  useEffect(() => {
    if (!authoredSel) return
    if (authoredSel.spec.map) setMapSel(authoredSel.spec.map)
    if (authoredSel.spec.sides?.friend) setFriendPack(authoredSel.spec.sides.friend)
    if (authoredSel.spec.sides?.hostile) setHostilePack(authoredSel.spec.sides.hostile)
  }, [authoredSel])

  const budgets = LOBBY_BUDGETS[diff]
  const spent = groups.reduce((n, g) => n + (picks.has(g.key) ? g.cost : 0), 0)
  const over = spent > budgets.player
  const mapEntry = maps.find(m => `${m.packId}/${m.mapId}` === mapSel)
  const canLaunch = authoredSel ? true : (!!mapEntry && !over && picks.size > 0)

  const toggle = (key: string) => setPicks(p => {
    const n = new Set(p)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  // THE ORG ECHELON, on the game's own tree grammar (ui/tree): brigade and
  // battalion are DrillRows, a pickable group is a TreeLeaf with a checkbox in
  // the icon cell. Levels come from the groups' slot paths, so however deep a
  // pack's formation nests, the drill matches it.
  const tree = useMemo(() => {
    const mid = (g: LobbyGroup) => g.key.split('/').slice(1, -1).join(' · ')
    const l1s: Array<{ key: string; label: string; l2s: Array<{ key: string; label: string; groups: LobbyGroup[] }> }> = []
    for (const g of groups) {
      let l1 = l1s.find(x => x.key === g.branch)
      if (!l1) { l1 = { key: g.branch, label: g.branch === 'ATT' ? 'ATTACHMENTS' : g.branch, l2s: [] }; l1s.push(l1) }
      const m = mid(g)
      const l2Key = `${g.branch}//${m}`
      let l2 = l1.l2s.find(x => x.key === l2Key)
      if (!l2) { l2 = { key: l2Key, label: m, groups: [] }; l1.l2s.push(l2) }
      l2.groups.push(g)
    }
    return l1s
  }, [groups])

  // everything starts SHUT (the tree's grammar) — except the rungs holding the
  // default task org, so the board never opens onto a blank column
  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => {
    const o = new Set<string>()
    for (const g of groups) {
      if (!g.defaultOn || !g.organic) continue
      o.add(g.branch)
      o.add(`${g.branch}//${g.key.split('/').slice(1, -1).join(' · ')}`)
    }
    setOpen(o)
  }, [groups])
  const flip = (k: string) => setOpen(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const costIn = (gs: LobbyGroup[]) => gs.reduce((n, g) => n + (picks.has(g.key) ? g.cost : 0), 0)

  const launch = () => onLaunch({
    map: mapSel, scenario: scn, difficulty: diff,
    sides: {
      friend: [{ controller: 'player', pack: friendPack, chair, force: [...picks] }],
      hostile: [{ controller: 'cpu', pack: hostilePack, force: [] }],
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(circle at 50% 30%, #0e1a24 0%, #05080b 70%)',
      color: INK, fontFamily: 'Consolas, monospace', userSelect: 'none',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '16px 22px 10px' }}>
        <span style={{ fontSize: 26, fontWeight: 'bold', letterSpacing: 6, color: '#7ec8ff' }}>SKIRMISH</span>
        <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>SINGLE MATCH · BUILD THE FIGHT, FIGHT IT</span>
        <button onClick={onBack}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#9ab8d0' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = DIM }}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: DIM, fontFamily: 'inherit', fontSize: 11, letterSpacing: 2,
          }}>← MAIN MENU</button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 14, padding: '0 22px 18px', minHeight: 0 }}>
        {/* ── LEFT: the friendly side ─────────────────────────────────── */}
        <Column title="FRIENDLY" accent="#2a5a8a">
          <Field label="ARMY">
            <Select value={friendPack} disabled={!!authoredSel}
              onChange={setFriendPack}
              options={packs.map(p => ({ value: p.id, label: `${p.abbr ?? p.id.toUpperCase()} — ${p.name}` }))} />
          </Field>
          <Field label="YOUR COMMAND">
            <Select value={chair} onChange={setChair}
              options={chairs.length
                ? chairs.map(f => ({ value: f.desig, label: `${f.desig} · ${f.label}` }))
                : [{ value: chair, label: chair || '—' }]} />
          </Field>

          <div style={{ fontSize: 9, letterSpacing: 2, color: DIM, margin: '10px 2px 6px' }}>
            TASK ORGANIZATION {authoredSel ? '· SET BY THE SCENARIO' : '· PICK UNDER BUDGET'}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, opacity: authoredSel ? 0.35 : 1, pointerEvents: authoredSel ? 'none' : 'auto' }}>
            {tree.map(l1 => (
              <div key={l1.key}>
                <DrillRow label={l1.label} depth={0} open={open.has(l1.key)}
                  onClick={() => flip(l1.key)}
                  n={l1.l2s.reduce((n, x) => n + x.groups.length, 0)}
                  note={costIn(l1.l2s.flatMap(x => x.groups)) > 0
                    ? `${costIn(l1.l2s.flatMap(x => x.groups))} PTS` : undefined} />
                {open.has(l1.key) && l1.l2s.map(l2 => (
                  <div key={l2.key}>
                    {l2.label !== '' && (
                      <DrillRow label={l2.label} depth={1} open={open.has(l2.key)}
                        onClick={() => flip(l2.key)} n={l2.groups.length}
                        note={costIn(l2.groups) > 0 ? `${costIn(l2.groups)} PTS` : undefined} />
                    )}
                    {(l2.label === '' || open.has(l2.key)) && l2.groups.map(g => {
                      const on = picks.has(g.key)
                      return (
                        <TreeLeaf key={g.key} depth={l2.label !== '' ? 2 : 1}
                          icon={<CheckBox on={on} />}
                          label={g.name}
                          note={<span style={{ color: on ? '#9fd0f5' : undefined, fontVariantNumeric: 'tabular-nums' }}>{g.cost}</span>}
                          tag={[g.from && g.from !== g.parent ? `ATT ${g.from}` : null, g.units].filter(Boolean).join(' · ')}
                          active={on}
                          onClick={() => toggle(g.key)} />
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
            {!groups.length && (
              <div style={{ fontSize: 10, color: DIM, padding: 8 }}>THIS PACK SHIPS NO FORMATION — NOTHING TO TASK-ORGANIZE</div>
            )}
          </div>

          {/* budget meter */}
          {!authoredSel && (
            <Meter label="ALLOCATION" spent={spent} cap={budgets.player} />
          )}
        </Column>

        {/* ── MIDDLE: the battle ──────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="MAP" grow>
              <Select value={mapSel} disabled={!!authoredSel} onChange={setMapSel}
                options={maps.map(m => ({ value: `${m.packId}/${m.mapId}`, label: `${m.name} · ${m.packId.toUpperCase()}` }))} />
            </Field>
            <Field label="SCENARIO" grow>
              <Select
                value={scn.kind === 'mode' ? `mode:${scn.mode}` : `scn:${scn.ref}`}
                onChange={(v) => {
                  if (v.startsWith('mode:')) setScn({ kind: 'mode', mode: v.slice(5) as ModeId })
                  else setScn({ kind: 'authored', ref: v.slice(4) })
                }}
                options={[
                  ...MODE_ORDER.map(id => ({ value: `mode:${id}`, label: MODES[id].label })),
                  ...authored.map(e => ({
                    value: `scn:${e.packId}/${e.scenarioId}`,
                    label: `${e.name} · AUTHORED`,
                  })),
                ]} />
            </Field>
          </div>

          {/* the board: what this battle is */}
          <div style={{
            flex: 1, borderRadius: 3, border: `1px solid ${LINE}`, background: CARD,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 22, letterSpacing: 5, fontWeight: 'bold', color: '#dceeff' }}>
              {authoredSel ? authoredSel.name : mapEntry?.name ?? 'NO MAP'}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: MUTED }}>
              {authoredSel
                ? `AUTHORED BATTLE · ${MODES[authoredSel.spec.type as ModeId]?.label ?? authoredSel.spec.type}`
                : scn.kind === 'mode' ? MODES[scn.mode].sub : ''}
            </div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: DIM }}>
              REAL GROUND · AUTHORED IN GROUNDWORK · THE MAP SETS ITS OWN SIZE
            </div>
          </div>

          {/* difficulty = the preset limiting the budgets */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: DIM, margin: '0 2px 5px' }}>
              DIFFICULTY · THE PRESET SETS BOTH BUDGETS
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {DIFFICULTY_ORDER.map(k => {
                const b = LOBBY_BUDGETS[k]
                const on = diff === k
                return (
                  <button key={k} onClick={() => setDiff(k)}
                    style={{
                      flex: 1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      padding: '7px 10px', borderRadius: 3, color: INK,
                      background: on ? '#1c3a4c' : CARD,
                      border: `1px solid ${on ? '#7ec8ff' : LINE}`,
                    }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 'bold', color: on ? '#9fd0f5' : '#dceeff' }}>
                      {DIFFICULTIES[k].label}
                    </div>
                    <div style={{ fontSize: 8.5, letterSpacing: 1, color: MUTED, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      YOU {b.player} · OPFOR {b.opfor}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={launch} disabled={!canLaunch}
            style={{
              padding: '12px 0', borderRadius: 3, cursor: canLaunch ? 'pointer' : 'default',
              fontFamily: 'inherit', fontSize: 16, letterSpacing: 6, fontWeight: 'bold',
              color: canLaunch ? '#0a0e12' : DIM,
              background: canLaunch ? '#7ec8ff' : 'rgba(16,26,36,0.85)',
              border: `1px solid ${canLaunch ? '#7ec8ff' : LINE}`,
            }}>
            {over ? 'OVER BUDGET' : 'LAUNCH'}
          </button>
        </div>

        {/* ── RIGHT: the OPFOR ────────────────────────────────────────── */}
        <Column title="OPFOR" accent="#8a3a2a">
          <Field label="ARMY">
            <Select value={hostilePack} disabled={!!authoredSel}
              onChange={setHostilePack}
              options={packs.map(p => ({ value: p.id, label: `${p.abbr ?? p.id.toUpperCase()} — ${p.name}` }))} />
          </Field>
          <div style={{ flex: 1, minHeight: 0 }} />
          <div style={{
            padding: '10px 12px', borderRadius: 3, background: CARD,
            border: `1px solid ${LINE}`, borderLeft: '3px solid #8a3a2a', marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#e0a898' }}>THE OPFOR COMMANDER BUILDS ITS OWN FORCE</div>
            <div style={{ fontSize: 9, letterSpacing: 0.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
              Garrisons and battlegroups come from its army's own doctrine, paced by
              the preset. Hand-editing its force lands in phase 2.
            </div>
          </div>
          {!authoredSel && <Meter label="OPFOR BUDGET" spent={budgets.opfor} cap={budgets.opfor} hostile />}
        </Column>
      </div>
    </div>
  )
}

// --- pieces ------------------------------------------------------------------

/** The pick mark, riding TreeLeaf's icon cell — the row is the button, this
 *  only says whether the group is in the task organization. */
function CheckBox({ on }: { on: boolean }) {
  return (
    <span style={{
      flex: '0 0 auto', width: 13, height: 13, borderRadius: 2, fontSize: 10, lineHeight: '12px',
      textAlign: 'center', color: on ? '#0a0e12' : 'transparent',
      background: on ? '#7ec8ff' : 'transparent', border: `1px solid ${on ? '#7ec8ff' : '#4a6478'}`,
    }}>✓</span>
  )
}

function Column({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div style={{
      flex: '0 0 330px', display: 'flex', flexDirection: 'column', minHeight: 0,
      padding: 12, borderRadius: 3, background: 'rgba(10,16,22,0.6)',
      border: `1px solid ${LINE}`, borderTop: `2px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 'bold', color: '#dceeff', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, grow, children }: { label: string; grow?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 8, ...(grow ? { flex: 1, minWidth: 0 } : {}) }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: DIM, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}

function Select({ value, options, onChange, disabled }: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)}
      style={{
        width: '100%', padding: '6px 8px', borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
        background: '#101a24', color: disabled ? DIM : '#dceeff', border: `1px solid ${LINE}`,
        fontFamily: 'inherit', fontSize: 11, letterSpacing: 1, opacity: disabled ? 0.6 : 1,
      }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Meter({ label, spent, cap, hostile }: { label: string; spent: number; cap: number; hostile?: boolean }) {
  const over = spent > cap
  const frac = Math.min(1, cap ? spent / cap : 0)
  const tone = over ? '#e05a5a' : hostile ? '#c07a6a' : '#7ec8ff'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 1.5, marginBottom: 3 }}>
        <span style={{ color: DIM }}>{label}</span>
        <span style={{ color: over ? '#e05a5a' : MUTED, fontVariantNumeric: 'tabular-nums' }}>{spent} / {cap}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#101a24', border: `1px solid ${LINE}` }}>
        <div style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 3, background: tone }} />
      </div>
    </div>
  )
}
