// S1 — PERSONNEL management console: a TREE-GRID over the task organization.
// Rows are the org tree (TF → parent-battalion slices → platoons → vehicles /
// squads → soldiers); columns are the PERSTAT numbers, AGGREGATED AT EVERY
// LEVEL — collapsed it reads as the S1's PERSTAT rollup, expanded it's the
// battle roster down to the individual soldier (portrait, rank, billet,
// inline rename). Attached elements are explicitly badged at every level.
// Mantine components at comfortable (lg-ish) sizing — this is a management
// console, not a map overlay. The map's "PERSONNEL ROSTER…" jumps here with
// the platoon expanded.
import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Group, Text, TextInput } from '@mantine/core'
import { S } from '../engine/state'
import { useUI } from './store'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { VEHICLES, TROOP_KINDS, type WeaponKey } from '../domains/forces/composition'
import type { Unit, Soldier } from '../engine/GameState'
import { playerPack } from '../packs'
import { Portrait } from './portrait'
import { PatchIcon, RankIcon } from './insignia'

const COL = { fit: '#7ec87e', wia: '#e8c547', kia: '#e8524a', mia: '#9a7ec8', dim: '#54708a' }
const STATUS_COL: Record<string, string> = { FIT: COL.fit, WIA: COL.wia, KIA: COL.kia, MIA: COL.mia }

// --- aggregation -----------------------------------------------------------
interface Agg { asg: number; fit: number; wia: number; kia: number; vOk: number; vTot: number }
const zero = (): Agg => ({ asg: 0, fit: 0, wia: 0, kia: 0, vOk: 0, vTot: 0 })
function aggSoldiers(a: Agg, ss: Soldier[]): void {
  for (const s of ss) {
    a.asg++
    if (s.status === 'FIT') a.fit++
    else if (s.status === 'WIA') a.wia++
    else if (s.status === 'KIA') a.kia++
  }
}
function aggUnit(u: Unit): Agg {
  const a = zero()
  aggSoldiers(a, u.soldiers)
  a.vTot = u.vehicles.length
  a.vOk = u.vehicles.filter(v => v.status === 'OK').length
  return a
}
function aggSum(list: Agg[]): Agg {
  const a = zero()
  for (const b of list) { a.asg += b.asg; a.fit += b.fit; a.wia += b.wia; a.kia += b.kia; a.vOk += b.vOk; a.vTot += b.vTot }
  return a
}

// --- squad derivation ------------------------------------------------------
// No formal squad assignment exists yet (task-org pass comes later): derive
// deterministic squads from the billets — PL/PSG/medic form the PLT HQ node,
// each Squad Leader takes an even slice of the remaining dismounts.
interface SquadNode { label: string; leader: Soldier | null; members: Soldier[] }
function deriveSquads(u: Unit): SquadNode[] {
  const dis = u.soldiers.filter(s => s.vehId == null)
  if (!dis.length) return []
  const hq = dis.filter(s => s.pos === 'Platoon Leader' || s.pos === 'Platoon Sergeant' || s.pos === 'Platoon Medic')
  const sls = dis.filter(s => s.pos === 'Squad Leader')
  const rest = dis.filter(s => !hq.includes(s) && !sls.includes(s))
  const out: SquadNode[] = []
  if (hq.length) out.push({ label: 'PLT HQ', leader: hq.find(s => s.pos === 'Platoon Leader') ?? hq[0]!, members: hq })
  if (sls.length) {
    const per = Math.ceil(rest.length / sls.length)
    sls.forEach((sl, i) => {
      const slice = rest.slice(i * per, (i + 1) * per)
      out.push({ label: `${i + 1}${['ST', 'ND', 'RD'][i] ?? 'TH'} SQD`, leader: sl, members: [sl, ...slice] })
    })
  } else if (rest.length) {
    out.push({ label: 'SECTION', leader: rest[rest.length - 1]!, members: rest })
  }
  return out
}

// --- loadout chips ---------------------------------------------------------
// Placeholder iconography (proper art icons later): weapon chips by short name
// plus kit glyphs — ✚ aid bag, 💨 smoke, 📻 platoon net. Loadout derives from
// the troop kind's weapons and the billet.
const WPN_SHORT: Partial<Record<WeaponKey, string>> = {
  M4: 'M4', M249: 'SAW', M240: '240B', M240C: 'COAX', M2_50: '.50',
  AT4: 'AT4', JAVELIN: 'JVLN', TOW: 'TOW', M242: '25MM', M256: '120MM',
  M252: '81MM', M109_155: '155MM',
}
function loadoutOf(s: Soldier): { chips: string[]; kit: string } {
  const chips = TROOP_KINDS[s.kind].weapons.map(w => WPN_SHORT[w] ?? w)
  let kit = ''
  if (s.kind === 'MEDIC') kit += '✚'
  if (s.pos === 'Platoon Leader' || s.pos === 'Platoon Sergeant' || s.pos === 'Squad Leader') kit += '💨📻'
  else if (s.pos === 'Vehicle Commander') kit += '📻'
  return { chips, kit }
}
const Chip = ({ label }: { label: string }) => (
  <Text span fz={9} c="#8fb0c8" px={4}
    style={{
      flex: '0 0 auto', border: '1px solid #2a3a48', borderRadius: 2,
      letterSpacing: 0.5, lineHeight: '13px',
    }}>{label}</Text>
)

// --- shared row chrome -----------------------------------------------------
const NUM_W = 56
const AttBadge = ({ from }: { from: string }) => (
  <Badge size="sm" variant="outline" color="yellow"
    styles={{ root: { flex: '0 0 auto' } }}>ATT · {from}</Badge>
)

function Nums({ a }: { a: Agg }) {
  const frac = a.fit / Math.max(1, a.asg)
  return (
    <>
      <Text span fz="sm" w={NUM_W} ta="right" style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{a.asg}</Text>
      <Text span fz="sm" w={NUM_W} ta="right" c={COL.fit} style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{a.fit}</Text>
      <Text span fz="sm" w={NUM_W} ta="right" c={a.wia ? COL.wia : 'dark.3'} style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{a.wia}</Text>
      <Text span fz="sm" w={NUM_W} ta="right" c={a.kia ? COL.kia : 'dark.3'} style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{a.kia}</Text>
      <Text span fz="sm" w={64} ta="right" c={a.vTot && a.vOk < a.vTot ? COL.wia : 'dark.3'} style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>
        {a.vTot ? `${a.vOk}/${a.vTot}` : '—'}
      </Text>
      <Box w={90} ta="right" style={{ flex: '0 0 auto' }}>
        <Box display="inline-block" w={72} h={7} bg="#0a1218" style={{ verticalAlign: 'middle' }}>
          <Box h={7} w={`${Math.round(frac * 100)}%`}
            bg={frac > 0.6 ? COL.fit : frac > 0.3 ? COL.wia : COL.kia} />
        </Box>
      </Box>
    </>
  )
}

function NodeRow({ depth, open, onToggle, label, sub, att, leader, a, highlight }: {
  depth: number; open?: boolean; onToggle?: () => void
  label: React.ReactNode; sub?: string; att?: string | null; leader?: string; a: Agg; highlight?: boolean
}) {
  return (
    <Group gap={10} wrap="nowrap" onClick={onToggle}
      px={10} py={7} pl={10 + depth * 26}
      style={{
        cursor: onToggle ? 'pointer' : 'default',
        borderTop: '1px solid #141e28', background: highlight ? '#10202e' : 'transparent',
      }}
      onMouseEnter={(e) => { if (onToggle) e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = highlight ? '#10202e' : 'transparent' }}>
      <Text span w={14} c="dark.3" style={{ flex: '0 0 auto' }}>{onToggle ? (open ? '▾' : '▸') : ''}</Text>
      <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Text span fz="md" style={{ whiteSpace: 'nowrap' }}>{label}</Text>
        {att && <AttBadge from={att} />}
        {sub && <Text span fz="xs" c="dark.3" truncate>{sub}</Text>}
      </Group>
      <Text span fz="sm" w={280} c="#9ab8d0" truncate style={{ flex: '0 0 auto' }}>{leader ?? ''}</Text>
      <Nums a={a} />
    </Group>
  )
}

function SoldierRow({ u, s, depth }: { u: Unit; s: Soldier; depth: number }) {
  const [editing, setEditing] = useState(false)
  // commit reads the LIVE input value — renames land even if change events
  // were swallowed; Escape backs out untouched
  const commit = (v: string) => {
    const t = v.trim().toUpperCase()
    if (t) s.name = t
    setEditing(false)
  }
  return (
    <Group gap={10} wrap="nowrap" px={10} py={4} pl={10 + depth * 26 + 24}
      style={{ borderTop: '1px solid #10161d' }}>
      <Portrait seed={`${u.id}:${s.id}`} kia={s.status === 'KIA'} w={26} h={32} />
      <RankIcon rank={s.rank} style={playerPack().rankStyle} />
      <Text span fz="sm" fw={700} w={40} c="#9ab8d0" style={{ flex: '0 0 auto' }}>{s.rank}</Text>
      {editing ? (
        <TextInput autoFocus defaultValue={s.name} size="xs" maxLength={26} spellCheck={false}
          style={{ flex: 1, minWidth: 0 }}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value)
            if (e.key === 'Escape') setEditing(false)
          }} />
      ) : (
        <Text span fz="sm" onClick={() => setEditing(true)} title="Rename" truncate
          c={s.status === 'KIA' ? 'dark.2' : '#dceeff'}
          td={s.status === 'KIA' ? 'line-through' : undefined}
          style={{ flex: 1, minWidth: 0, cursor: 'text', letterSpacing: 0.5 }}>
          {s.name}
        </Text>
      )}
      <Text span fz="xs" w={190} c="dark.3" style={{ flex: '0 0 auto' }}>{s.pos}</Text>
      {/* loadout: weapon chips + kit glyphs */}
      <Group gap={3} wrap="nowrap" w={170} style={{ flex: '0 0 auto', overflow: 'hidden' }}>
        {loadoutOf(s).chips.map(c => <Chip key={c} label={c} />)}
        {loadoutOf(s).kit && <Text span fz={10} style={{ flex: '0 0 auto' }}>{loadoutOf(s).kit}</Text>}
      </Group>
      <Text span fz="xs" w={100} c="#c8a25f" style={{ flex: '0 0 auto' }}>{s.cs ?? ''}</Text>
      <Text span fz="xs" fw={700} w={36} ta="right" c={STATUS_COL[s.status] ?? '#9ab8d0'} style={{ flex: '0 0 auto' }}>
        {s.status}
      </Text>
    </Group>
  )
}

// --- the console -----------------------------------------------------------
export default function S1Console() {
  useUI((st) => st.tick)
  const ui = useUI()
  const [open, setOpen] = useState<Set<string>>(() => new Set(['tf']))
  const focusRef = useRef<HTMLDivElement>(null)

  const pack = playerPack()
  const bnOf = (u: Unit): string => {
    const slot = pack.organic[u.type] ?? pack.attached[u.type]
    return slot?.bn ?? pack.abbr
  }

  // a map-side "PERSONNEL ROSTER…" jump: expand down to the unit and scroll it
  // into view, then clear the request
  useEffect(() => {
    if (ui.console !== 's1' || ui.rosterId == null) return
    const u = S.units.find(x => x.id === ui.rosterId)
    if (u) {
      const bn = bnOf(u)
      setOpen(prev => {
        const next = new Set(prev)
        next.add('tf'); next.add(`bn:${bn}`); next.add(`u:${u.id}`)
        return next
      })
      setTimeout(() => {
        focusRef.current?.scrollIntoView({ block: 'center' })
        ui.closeRoster()
      }, 80)
    } else ui.closeRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.console, ui.rosterId])

  if (ui.console !== 's1') return null

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const units = S.units.filter(u => u.side === 'friend' && u.soldiers.length > 0)
  const bns = new Map<string, Unit[]>()
  for (const u of units) {
    const key = bnOf(u)
    if (!bns.has(key)) bns.set(key, [])
    bns.get(key)!.push(u)
  }
  const unitAggs = new Map<number, Agg>(units.map(u => [u.id, aggUnit(u)]))
  const tfAgg = aggSum([...unitAggs.values()])
  const cmdr = S.campaign?.commander
  const dtg = `${String(Math.floor(S.t / 3600)).padStart(2, '0')}${String(Math.floor(S.t / 60) % 60).padStart(2, '0')}Z`

  return (
    <Box pos="absolute" inset={0} p="lg"
      style={{
        zIndex: 40, overflow: 'auto', background: 'rgba(8,11,15,0.985)',
        fontFamily: 'Consolas, monospace', userSelect: 'none',
      }}>
      <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
        <PatchIcon id={pack.patch} h={38} />
        <Text fz="xl" fw={700} c="#dceeff" style={{ letterSpacing: 3 }}>S1 — PERSONNEL</Text>
        <Text fz="sm" c="dark.3" style={{ letterSpacing: 1.5 }}>
          {pack.name.toUpperCase()} · TASK ORGANIZATION & PERSTAT · AS OF {dtg}
        </Text>
        <Button size="sm" variant="default" ml="auto" onClick={() => ui.setConsole(null)}>← MAP</Button>
      </Group>

      {/* column headers */}
      <Group gap={10} wrap="nowrap" px={10} pt={10} pb={4}>
        <Text span w={14} style={{ flex: '0 0 auto' }} />
        <Text span fz="xs" c="dark.3" style={{ flex: 1, letterSpacing: 1.5 }}>ELEMENT</Text>
        <Text span fz="xs" c="dark.3" w={280} style={{ flex: '0 0 auto', letterSpacing: 1.5 }}>LEADER</Text>
        {['ASG', 'FIT', 'WIA', 'KIA'].map(h => (
          <Text key={h} span fz="xs" c="dark.3" w={NUM_W} ta="right" style={{ flex: '0 0 auto', letterSpacing: 1.5 }}>{h}</Text>
        ))}
        <Text span fz="xs" c="dark.3" w={64} ta="right" style={{ flex: '0 0 auto', letterSpacing: 1.5 }}>VICS</Text>
        <Text span fz="xs" c="dark.3" w={90} ta="right" style={{ flex: '0 0 auto', letterSpacing: 1.5 }}>STR</Text>
      </Group>

      {/* TF root */}
      <NodeRow depth={0} open={open.has('tf')} onToggle={() => toggle('tf')}
        label={<Text span fz="md" fw={700} c="#dceeff" style={{ letterSpacing: 1 }}>TF COBALT</Text>}
        sub={cmdr ? `LTC ${cmdr} · COBALT 6` : undefined}
        leader={cmdr ? `LTC ${cmdr}` : undefined} a={tfAgg} />

      {open.has('tf') && [...bns.entries()].map(([bn, list]) => {
        const att = list[0]!.attFrom ?? null
        const bnKey = `bn:${bn}`
        const bnAgg = aggSum(list.map(u => unitAggs.get(u.id)!))
        return (
          <div key={bn}>
            <NodeRow depth={1} open={open.has(bnKey)} onToggle={() => toggle(bnKey)}
              label={<Text span fz="md" fw={600} c={att ? '#c8a25f' : '#9fd0f5'}>{bn}</Text>}
              att={att} sub={att ? undefined : 'ORGANIC'} a={bnAgg} />
            {open.has(bnKey) && list.map(u => {
              const type = UNIT_TYPES[u.type]
              const uKey = `u:${u.id}`
              const a = unitAggs.get(u.id)!
              const ldr = u.soldiers.find(s => s.pos === 'Platoon Leader' && s.status === 'FIT')
                ?? u.soldiers.find(s => s.pos === 'Platoon Sergeant' && s.status === 'FIT')
              const squads = deriveSquads(u)
              return (
                <div key={u.id} ref={u.id === ui.rosterId ? focusRef : undefined}>
                  <NodeRow depth={2} open={open.has(uKey)} onToggle={() => toggle(uKey)}
                    label={<Text span fz="md" fw={700} c="#7ec8ff">{u.label}</Text>}
                    att={u.attFrom}
                    sub={`${type.name.toUpperCase()} · ${u.lineage ?? ''}`}
                    leader={ldr ? `${ldr.rank} ${ldr.name}${ldr.cs ? ` · ${ldr.cs}` : ''}` : '— NO LEADER FIT —'}
                    a={a} />
                  {open.has(uKey) && (
                    <>
                      {u.vehicles.map(v => {
                        const vKey = `v:${u.id}:${v.id}`
                        const crew = u.soldiers.filter(s => s.vehId === v.id)
                        const va = zero(); aggSoldiers(va, crew)
                        va.vTot = 1; va.vOk = v.status === 'OK' ? 1 : 0
                        const vc = crew[0]
                        return (
                          <div key={v.id}>
                            <NodeRow depth={3} open={open.has(vKey)} onToggle={() => toggle(vKey)}
                              label={<Group gap={5} wrap="nowrap">
                                <Text span fz="sm" c={v.status === 'DESTROYED' ? COL.kia : '#b8cede'}>
                                  {(VEHICLES[v.type as keyof typeof VEHICLES]?.name ?? v.type).toUpperCase()} #{v.id}
                                  {v.status === 'DESTROYED' ? ' — DESTROYED' : ''}
                                </Text>
                                {VEHICLES[v.type as keyof typeof VEHICLES]?.weapons.map(w =>
                                  <Chip key={w} label={WPN_SHORT[w] ?? w} />)}
                              </Group>}
                              leader={vc ? `${vc.rank} ${vc.name}` : undefined} a={va} />
                            {open.has(vKey) && crew.map(s => <SoldierRow key={s.id} u={u} s={s} depth={4} />)}
                          </div>
                        )
                      })}
                      {squads.map(sq => {
                        const sqKey = `sq:${u.id}:${sq.label}`
                        const sa = zero(); aggSoldiers(sa, sq.members)
                        return (
                          <div key={sq.label}>
                            <NodeRow depth={3} open={open.has(sqKey)} onToggle={() => toggle(sqKey)}
                              label={<Text span fz="sm" c="#b8cede">{sq.label}</Text>}
                              leader={sq.leader ? `${sq.leader.rank} ${sq.leader.name}` : undefined} a={sa} />
                            {open.has(sqKey) && sq.members.map(s => <SoldierRow key={s.id} u={u} s={s} depth={4} />)}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      <Text fz="xs" c="dark.3" mt="md" pt={8} style={{ borderTop: '1px solid #17222c', letterSpacing: 1 }}>
        REPLACEMENT PIPELINE — NO FLOW ESTABLISHED (REAR DETACHMENT NOT YET IN THEATER)
      </Text>
    </Box>
  )
}
