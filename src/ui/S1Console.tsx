// S1 — PERSONNEL management console: a TREE-GRID over the ENTIRE DIVISION.
// The pack ships 1CD complete — every brigade, battalion, company and platoon
// slot down to named soldiers (air cav included) — so the tree is the whole
// formation, not just what's fielded. Rows aggregate PERSTAT at every level;
// fieldable TF slots show live unit state when fielded, GARRISON — <site> when
// not; everything else is marked where it sits (other brigade AOs, DIV MAIN).
// Attached elements are badged with their donor at every level.
import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Group, Text, TextInput, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import { useUI } from './store'
import { VEHICLES, TROOP_KINDS, type WeaponKey } from '../domains/forces/composition'
import type { OrgSlot, Soldier, UnitVehicle } from '../engine/GameState'
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
function aggSlot(sl: OrgSlot): Agg {
  const a = zero()
  aggSoldiers(a, sl.soldiers)
  a.vTot = sl.vehicles.length
  a.vOk = sl.vehicles.filter(v => v.status === 'OK').length
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
function deriveSquads(soldiers: Soldier[]): SquadNode[] {
  const dis = soldiers.filter(s => s.vehId == null)
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
    out.push({ label: 'SECTION', leader: rest[0]!, members: rest })
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
  M252: '81MM', M109_155: '155MM', M230: '30MM', HELLFIRE: 'AGM114',
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
      px={10} py={7} pl={10 + depth * 24}
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

function SoldierRow({ s, depth }: { s: Soldier; depth: number }) {
  const [editing, setEditing] = useState(false)
  // commit reads the LIVE input value — renames land even if change events
  // were swallowed; Escape backs out untouched
  const commit = (v: string) => {
    const t = v.trim().toUpperCase()
    if (t) s.name = t
    setEditing(false)
  }
  return (
    <Group gap={10} wrap="nowrap" px={10} py={4} pl={10 + depth * 24 + 24}
      style={{ borderTop: '1px solid #10161d' }}>
      <Portrait seed={s.pid ?? `s:${s.id}`} kia={s.status === 'KIA'} w={26} h={32} />
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

// --- slot roster (vehicles + squads) ----------------------------------------
function SlotRoster({ sl, depth, open, toggle }: {
  sl: OrgSlot; depth: number; open: Set<string>; toggle: (k: string) => void
}) {
  return (
    <>
      {sl.vehicles.map((v: UnitVehicle) => {
        const vKey = `v:${sl.id}:${v.id}`
        const crew = sl.soldiers.filter(s => s.vehId === v.id)
        const va = zero(); aggSoldiers(va, crew)
        va.vTot = 1; va.vOk = v.status === 'OK' ? 1 : 0
        const vc = crew[0]
        return (
          <div key={v.id}>
            <NodeRow depth={depth} open={open.has(vKey)} onToggle={() => toggle(vKey)}
              label={<Group gap={5} wrap="nowrap">
                <Text span fz="sm" c={v.status === 'DESTROYED' ? COL.kia : '#b8cede'}>
                  {(VEHICLES[v.type]?.name ?? v.type).toUpperCase()} #{v.id}
                  {v.status === 'DESTROYED' ? ' — DESTROYED' : ''}
                </Text>
                {VEHICLES[v.type]?.weapons.map(w => <Chip key={w} label={WPN_SHORT[w] ?? w} />)}
              </Group>}
              leader={vc ? `${vc.rank} ${vc.name}` : undefined} a={va} />
            {open.has(vKey) && crew.map(s => <SoldierRow key={s.id} s={s} depth={depth + 1} />)}
          </div>
        )
      })}
      {deriveSquads(sl.soldiers).map(sq => {
        const sqKey = `sq:${sl.id}:${sq.label}`
        const sa = zero(); aggSoldiers(sa, sq.members)
        return (
          <div key={sq.label}>
            <NodeRow depth={depth} open={open.has(sqKey)} onToggle={() => toggle(sqKey)}
              label={<Text span fz="sm" c="#b8cede">{sq.label}</Text>}
              leader={sq.leader ? `${sq.leader.rank} ${sq.leader.name}` : undefined} a={sa} />
            {open.has(sqKey) && sq.members.map(s => <SoldierRow key={s.id} s={s} depth={depth + 1} />)}
          </div>
        )
      })}
    </>
  )
}

// --- the console -----------------------------------------------------------
// where a non-fielded slot sits, as the S1 would brief it
function slotLocation(sl: OrgSlot): string {
  if (sl.tf || sl.bn === playerPack().formation?.playerBn || sl.bde === 'ATT') {
    const hq = S.structures.find(st => st.side === 'friend' && st.kind === 'HQ')
    return `GARRISON — ${hq?.label ?? 'CP'}`
  }
  if (sl.bde === 'HHBN' || sl.bde === 'DIVARTY') return 'DIV MAIN'
  if (sl.bde === '1CD SUST') return 'DIV SUPPORT AREA'
  if (sl.bde === '1ACB') return 'THEATER AVN COMPLEX'
  return `${sl.bde} AO`
}

type S1Tab = 'div' | 'tf' | 'bn'

export default function S1Console() {
  useUI((st) => st.tick)
  const ui = useUI()
  const pack = playerPack()
  const playerBn = pack.formation?.playerBn
  const [tab, setTab] = useState<S1Tab>('div')
  const [open, setOpen] = useState<Set<string>>(() => new Set(
    ['div', 'bde:1ABCT', playerBn ? `bn:${playerBn}` : 'bn:'],
  ))
  const focusRef = useRef<HTMLDivElement>(null)

  // a map-side "PERSONNEL ROSTER…" jump: expand down to the fielded slot and
  // scroll it into view, then clear the request
  useEffect(() => {
    if (ui.console !== 's1' || ui.rosterId == null) return
    const sl = S.org?.slots.find(x => x.unitId === ui.rosterId)
    if (sl) {
      setTab('div') // the jump expands the division tree — land where it's visible
      setOpen(prev => {
        const next = new Set(prev)
        next.add('div'); next.add(`bde:${sl.bde}`); next.add(`bn:${sl.bn}`)
        next.add(`co:${sl.bn}:${sl.co}`); next.add(`slot:${sl.id}`)
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
  const org = S.org

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const slots = org?.slots ?? []
  const slotAggs = new Map<string, Agg>(slots.map(sl => [sl.id, aggSlot(sl)]))
  const divAgg = aggSum([...slotAggs.values()])
  const cmdr = S.campaign?.commander
  const dtg = `${String(Math.floor(S.t / 3600)).padStart(2, '0')}${String(Math.floor(S.t / 60) % 60).padStart(2, '0')}Z`

  // brigade display order = formation order, attachments last
  const bdeOrder: { desig: string; nick?: string }[] = [
    ...(pack.formation?.bdes.map(b => ({ desig: b.desig, nick: b.nick })) ?? []),
    ...(slots.some(sl => sl.bde === 'ATT') ? [{ desig: 'ATT', nick: 'ATTACHMENTS' }] : []),
  ]

  const renderSlot = (sl: OrgSlot, depth: number) => {
    const key = `slot:${sl.id}`
    const a = slotAggs.get(sl.id)!
    const u = sl.unitId != null ? S.units.find(x => x.id === sl.unitId) : undefined
    const lost = sl.unitId != null && !u
    const ldr = sl.soldiers.find(s => (s.pos === 'Platoon Leader' || s.pos === 'Battalion Commander'
      || s.pos === 'Flight Lead' || s.pos === 'Commanding General') && s.status === 'FIT')
      ?? sl.soldiers.find(s => s.status === 'FIT') ?? sl.soldiers[0]
    const status = u ? `FIELDED · ${u.label} · ${Math.max(0, Math.round(u.strength))}%`
      : lost ? 'COMBAT LOSS' : slotLocation(sl)
    return (
      <div key={sl.id} ref={sl.unitId === ui.rosterId ? focusRef : undefined}>
        <NodeRow depth={depth} open={open.has(key)} onToggle={() => toggle(key)}
          label={<Text span fz="md" fw={sl.type ? 700 : 500}
            c={lost ? COL.kia : u ? '#7ec8ff' : sl.tf ? '#9fd0f5' : '#7d95aa'}>
            {sl.name}
          </Text>}
          att={sl.from ?? null}
          sub={status}
          leader={ldr ? `${ldr.rank} ${ldr.name}${ldr.cs ? ` · ${ldr.cs}` : ''}` : '— NONE FIT —'}
          a={a} highlight={!!u} />
        {open.has(key) && <SlotRoster sl={sl} depth={depth + 1} open={open} toggle={toggle} />}
      </div>
    )
  }

  // company rows for a battalion (or a battalion's TF slice) — shared by all tabs
  const renderCos = (list: OrgSlot[], bn: string, depth: number) => {
    const cos = [...new Set(list.map(sl => sl.co))]
    return cos.map(co => {
      const coSlots = list.filter(sl => sl.co === co)
      const coKey = `co:${bn}:${co}`
      const coAgg = aggSum(coSlots.map(sl => slotAggs.get(sl.id)!))
      return (
        <div key={co}>
          <NodeRow depth={depth} open={open.has(coKey)} onToggle={() => toggle(coKey)}
            label={<Text span fz="sm" fw={600} c="#b8cede">{co}</Text>} a={coAgg} />
          {open.has(coKey) && coSlots.map(sl => renderSlot(sl, depth + 1))}
        </div>
      )
    })
  }

  // the TF = fieldable allocated slots PLUS the player battalion's own staff/
  // support slots (the TOC deploys with its battalion — `tf` only gates fielding)
  const tfSlots = slots.filter(sl => sl.tf || sl.bn === playerBn)
  const tfBns = (() => {
    const seen: string[] = []
    for (const sl of tfSlots) if (!seen.includes(sl.bn)) seen.push(sl.bn)
    if (playerBn && seen.includes(playerBn)) { seen.splice(seen.indexOf(playerBn), 1); seen.unshift(playerBn) }
    return seen
  })()

  // switching tabs pre-expands that tab's tree to its useful depth (keys are
  // SHARED across tabs — it's the same org, expansion state rides with it)
  const switchTab = (t: S1Tab) => {
    setTab(t)
    setOpen(prev => {
      const next = new Set(prev)
      if (t === 'tf') {
        next.add('tfroot')
        for (const sl of tfSlots) { next.add(`bn:${sl.bn}`); next.add(`co:${sl.bn}:${sl.co}`) }
      } else if (t === 'bn' && playerBn) {
        next.add('bnroot')
        for (const sl of slots) if (sl.bn === playerBn) next.add(`co:${sl.bn}:${sl.co}`)
      }
      return next
    })
  }

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
          {pack.name.toUpperCase()} · {tab === 'div' ? 'DIVISION PERSTAT' : tab === 'tf' ? 'TASK ORGANIZATION' : 'BATTALION PERSTAT'} · AS OF {dtg}
        </Text>
        <Button size="sm" variant="default" ml="auto" onClick={() => ui.setConsole(null)}>← MAP</Button>
      </Group>

      {/* view tabs: the whole division / the task force slice / the player's battalion */}
      <Group gap={6} pt={12}>
        {([['div', 'DIVISION'], ['tf', 'TASK FORCE'], ['bn', playerBn ?? 'BATTALION']] as [S1Tab, string][]).map(([t, label]) => (
          <UnstyledButton key={t} onClick={() => switchTab(t)} px={16} py={6}
            style={{
              border: `1px solid ${tab === t ? '#3d5a75' : '#22303d'}`,
              background: tab === t ? '#101c28' : 'transparent',
              borderRadius: '3px 3px 0 0',
            }}>
            <Text span fz="sm" fw={700} c={tab === t ? '#7ec8ff' : '#54708a'} style={{ letterSpacing: 1.5 }}>
              {label}
            </Text>
          </UnstyledButton>
        ))}
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

      {!org && (
        <Text fz="sm" c="dark.3" p="md">NO DIVISION ORGANIZATION — PACK HAS NO FORMATION DATA.</Text>
      )}

      {tab === 'div' && org && (
        <NodeRow depth={0} open={open.has('div')} onToggle={() => toggle('div')}
          label={<Text span fz="md" fw={700} c="#dceeff" style={{ letterSpacing: 1 }}>{pack.name.toUpperCase()}</Text>}
          sub={cmdr && playerBn ? `YOU COMMAND ${playerBn} · LTC ${cmdr}` : undefined}
          a={divAgg} />
      )}

      {tab === 'div' && org && open.has('div') && bdeOrder.map(({ desig, nick }) => {
        const bdeSlots = slots.filter(sl => sl.bde === desig)
        if (!bdeSlots.length) return null
        const bdeKey = `bde:${desig}`
        const bdeAgg = aggSum(bdeSlots.map(sl => slotAggs.get(sl.id)!))
        const bns = [...new Set(bdeSlots.map(sl => sl.bn))]
        return (
          <div key={desig}>
            <NodeRow depth={1} open={open.has(bdeKey)} onToggle={() => toggle(bdeKey)}
              label={<Text span fz="md" fw={600} c={desig === 'ATT' ? '#c8a25f' : '#9fd0f5'}>
                {desig === 'ATT' ? 'ATTACHMENTS' : desig}
              </Text>}
              sub={desig === 'ATT' ? undefined : nick} a={bdeAgg} />
            {open.has(bdeKey) && bns.map(bn => {
              const bnSlots = bdeSlots.filter(sl => sl.bn === bn)
              const bnKey = `bn:${bn}`
              const bnAgg = aggSum(bnSlots.map(sl => slotAggs.get(sl.id)!))
              const att = bnSlots[0]!.from ?? null
              const mine = bn === playerBn
              return (
                <div key={bn}>
                  <NodeRow depth={2} open={open.has(bnKey)} onToggle={() => toggle(bnKey)}
                    label={<Text span fz="md" fw={600} c={att ? '#c8a25f' : mine ? '#7ec8ff' : '#9fd0f5'}>{bn}</Text>}
                    att={att} sub={mine ? 'YOUR BATTALION' : att ? undefined : 'ORGANIC'} a={bnAgg} />
                  {open.has(bnKey) && renderCos(bnSlots, bn, 3)}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* TASK FORCE: how the TF is laid out — the allocated slices, player bn first */}
      {tab === 'tf' && org && (
        <>
          <NodeRow depth={0} open={open.has('tfroot')} onToggle={() => toggle('tfroot')}
            label={<Text span fz="md" fw={700} c="#dceeff" style={{ letterSpacing: 1 }}>TF COBALT</Text>}
            sub={playerBn ? `TASK-ORGANIZED ON ${playerBn} · 1CD + ATTACHMENTS` : undefined}
            leader={cmdr ? `LTC ${cmdr} · COBALT 6` : undefined}
            a={aggSum(tfSlots.map(sl => slotAggs.get(sl.id)!))} />
          {open.has('tfroot') && tfBns.map(bn => {
            const bnSlots = tfSlots.filter(sl => sl.bn === bn)
            const bnKey = `bn:${bn}`
            const att = bnSlots[0]!.from ?? null
            const mine = bn === playerBn
            return (
              <div key={bn}>
                <NodeRow depth={1} open={open.has(bnKey)} onToggle={() => toggle(bnKey)}
                  label={<Text span fz="md" fw={600} c={att ? '#c8a25f' : mine ? '#7ec8ff' : '#9fd0f5'}>{bn}</Text>}
                  att={att}
                  sub={mine ? 'YOUR BATTALION — FULL ALLOCATION'
                    : `${bnSlots.length} ELEMENT${bnSlots.length === 1 ? '' : 'S'} ATTACHED TO TF`}
                  a={aggSum(bnSlots.map(sl => slotAggs.get(sl.id)!))} />
                {open.has(bnKey) && renderCos(bnSlots, bn, 2)}
              </div>
            )
          })}
        </>
      )}

      {/* the player's battalion, complete — the whole 2-8 roster */}
      {tab === 'bn' && org && playerBn && (() => {
        const bnSlots = slots.filter(sl => sl.bn === playerBn)
        const cdrS = bnSlots.find(sl => sl.name === 'CMD GRP')
          ?.soldiers.find(s => s.pos === 'Battalion Commander')
        return (
          <>
            <NodeRow depth={0} open={open.has('bnroot')} onToggle={() => toggle('bnroot')}
              label={<Text span fz="md" fw={700} c="#dceeff" style={{ letterSpacing: 1 }}>{playerBn}</Text>}
              sub="YOUR BATTALION"
              leader={cdrS ? `${cdrS.rank} ${cdrS.name}` : undefined}
              a={aggSum(bnSlots.map(sl => slotAggs.get(sl.id)!))} />
            {open.has('bnroot') && renderCos(bnSlots, playerBn, 1)}
          </>
        )
      })()}

      <Text fz="xs" c="dark.3" mt="md" pt={8} style={{ borderTop: '1px solid #17222c', letterSpacing: 1 }}>
        REPLACEMENT PIPELINE — NO FLOW ESTABLISHED (REAR DETACHMENT NOT YET IN THEATER)
      </Text>
    </Box>
  )
}
