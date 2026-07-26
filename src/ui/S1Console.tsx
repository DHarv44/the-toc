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
import { pipelineBacklog } from '../domains/forces/pipeline'
import { openReport, queueReport, unreadReports } from '../engine/campaign'
import { AWARDS, type AwardKey } from '../packs/awards'
import { Portrait } from './portrait'
import { RankIcon, RibbonIcon } from './insignia'
import BnHeader from './BnHeader'
import { ShopSection, StaffTabs, UnreadDot, rankW, type StaffTab } from './staff'

export { UnreadDot }   // S1 set the format; the dot now lives in the staff kit

const COL = { fit: '#7ec87e', wia: '#e8c547', kia: '#e8524a', mia: '#9a7ec8', dim: '#54708a' }
const STATUS_COL: Record<string, string> = { FIT: COL.fit, WIA: COL.wia, KIA: COL.kia, MIA: COL.mia }

// --- aggregation -----------------------------------------------------------
interface Agg { asg: number; fit: number; wia: number; kia: number; vOk: number; vTot: number }
const zero = (): Agg => ({ asg: 0, fit: 0, wia: 0, kia: 0, vOk: 0, vTot: 0 })
function aggSoldiers(a: Agg, ss: Soldier[]): void {
  for (const s of ss) {
    // a backfilled casualty leaves ASSIGNED strength (the replacement holds the
    // billet) but stays on the loss columns — PERSTAT keeps the butcher's bill
    if (!s.replaced) a.asg++
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
          c={s.status === 'KIA' ? 'dark.2' : s.evac ? '#8098ac' : '#dceeff'}
          td={s.status === 'KIA' ? 'line-through' : undefined}
          style={{ flex: 1, minWidth: 0, cursor: 'text', letterSpacing: 0.5 }}>
          {s.name}
        </Text>
      )}
      {/* decorations — Purple Heart lands automatically on every wound */}
      <Group gap={3} wrap="nowrap" style={{ flex: '0 0 auto' }}>
        {s.repl && <Chip label="REPL" />}
        {(s.awards ?? []).map(k => {
          const a = AWARDS[k as AwardKey]
          return a ? <span key={k} title={a.name}><RibbonIcon stripes={a.ribbon} /></span> : null
        })}
      </Group>
      <Text span fz="xs" w={190} c="dark.3" style={{ flex: '0 0 auto' }}>{s.pos}</Text>
      {/* loadout: weapon chips + kit glyphs */}
      <Group gap={3} wrap="nowrap" w={170} style={{ flex: '0 0 auto', overflow: 'hidden' }}>
        {loadoutOf(s).chips.map(c => <Chip key={c} label={c} />)}
        {loadoutOf(s).kit && <Text span fz={10} style={{ flex: '0 0 auto' }}>{loadoutOf(s).kit}</Text>}
      </Group>
      {/* injury report takes the callsign column while wounded */}
      {s.status === 'WIA' && s.wound ? (
        <Text span fz="xs" w={100} c={s.evac ? COL.mia : COL.wia} truncate
          title={`${s.wound.kind} — ${s.wound.sev}${s.evac ? ' · EVACUATED' : ''}`}
          style={{ flex: '0 0 auto' }}>
          {s.wound.kind} · {s.wound.sev[0]}{s.evac ? ' · EVAC' : ''}
        </Text>
      ) : (
        <Text span fz="xs" w={100} c="#c8a25f" style={{ flex: '0 0 auto' }}>{s.cs ?? ''}</Text>
      )}
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
                <Text span fz="sm" c={v.status === 'DESTROYED' ? COL.kia : v.status === 'DAMAGED' ? COL.wia : '#b8cede'}>
                  {(VEHICLES[v.type]?.name ?? v.type).toUpperCase()} #{v.id}
                  {v.status === 'DESTROYED' ? ' — DESTROYED' : v.status === 'DAMAGED' ? ' — DAMAGED (REPAIRABLE)' : ''}
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

// The donor a battalion ROW should show. A slice the brigade task-organized to
// us carries its own battalion in `from` (that mark belongs on the ELEMENT —
// "1st PLT · A CO · ATT 91 BEB"); the parent row is that battalion, and nothing
// is attached from itself. A cross-division attachment names a real donor
// ("5-20 IN · 2ID") and reads correctly.
const donorOf = (sl: OrgSlot, bn: string): string | null =>
  sl.from && sl.from !== bn ? sl.from : null

// The S1 SECTION itself is no longer a tab — it is the section header every
// shop console opens with (staff.tsx ShopSection), always visible above the
// tabs. The tabs are the ORG VIEWS: your battalion outward.
type S1Tab = 'bn' | 'tf' | 'div' | 'perstats'


// The personnel chain BEYOND this battalion: the division G1 and the other
// battalions' S1 sections. Collapsed by default — it is reference, not the
// commander's own shop.
function S1PersonnelChain({ slots, playerBn, open, toggle }: {
  slots: OrgSlot[]
  playerBn?: string
  open: Set<string>
  toggle: (k: string) => void
}) {
  const rankTree = (soldiers: Soldier[], base: number) => {
    const sorted = [...soldiers].sort((a, b) => rankW(b.rank) - rankW(a.rank))
    const weights = [...new Set(sorted.map(s => rankW(s.rank)))]
    return sorted.map(s => (
      <SoldierRow key={`${s.pid ?? s.id}`} s={s} depth={base + weights.indexOf(rankW(s.rank))} />
    ))
  }
  const secHeader = (label: string, sub: string, depth: number) => (
    <Group gap={10} wrap="nowrap" px={10} py={7} pl={10 + depth * 24}
      style={{ borderTop: '1px solid #141e28' }}>
      <Text span fz="md" fw={600} c="#9fd0f5">{label}</Text>
      <Text span fz="xs" c="dark.3">{sub}</Text>
    </Group>
  )
  const g1 = slots.find(sl => sl.name === 'G1 SECTION')
  const bnS1 = (bn: string) => slots
    .filter(sl => sl.bn === bn && (sl.name === 'BN STAFF' || sl.name === 'SQDN STAFF' || sl.name === 'FIRES CELL'))
    .flatMap(sl => sl.soldiers.filter(s => s.pos?.startsWith('S1')))
  const bns = [...new Set(slots.filter(sl => sl.bde !== 'ATT').map(sl => sl.bn))]
    .filter(bn => bn !== playerBn && bnS1(bn).length > 0)
  return (
    <>
      <UnstyledButton onClick={() => toggle('shopdiv')} w="100%">
        <Group gap={10} align="center" mt="md" mb={4} mx={12}>
          <Box style={{ flex: 1, height: 1, background: '#22303d' }} />
          <Text span fz={10} c="dark.3" style={{ letterSpacing: 2 }}>
            {open.has('shopdiv') ? '▾' : '▸'} PERSONNEL SERVICES — REST OF THE DIVISION
          </Text>
          <Box style={{ flex: 1, height: 1, background: '#22303d' }} />
        </Group>
      </UnstyledButton>
      {open.has('shopdiv') && (
        <>
          {g1 && (
            <>
              {secHeader('DIVISION G1', 'HHBN 1CD · PERSONNEL', 0)}
              {rankTree(g1.soldiers, 1)}
            </>
          )}
          {bns.map(bn => (
            <div key={bn}>
              {secHeader(`${bn} S1`, 'BATTALION PERSONNEL SECTION', 0)}
              {rankTree(bnS1(bn), 1)}
            </div>
          ))}
        </>
      )}
    </>
  )
}

export default function S1Console() {
  useUI((st) => st.tick)
  const ui = useUI()
  const pack = playerPack()
  const playerBn = pack.formation?.playerBn
  const [tab, setTab] = useState<S1Tab>('bn')
  const [open, setOpen] = useState<Set<string>>(() => new Set(
    ['div', 'bde:1ABCT', playerBn ? `bn:${playerBn}` : 'bn:'],
  ))
  const focusRef = useRef<HTMLDivElement>(null)

  // external tab routing (TopBar badge click → PERSTATS, etc.)
  useEffect(() => {
    if (ui.console === 's1' && ui.s1Nav) {
      setTab(ui.s1Nav as S1Tab)
      ui.clearS1Nav()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.console, ui.s1Nav])

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

  // brigade display order = formation order, attachments last
  const bdeOrder: { desig: string; nick?: string }[] = [
    ...(pack.formation?.bdes.map(b => ({ desig: b.desig, nick: b.nick })) ?? []),
    ...(slots.some(sl => sl.bde === 'ATT') ? [{ desig: 'ATT', nick: 'ATTACHMENTS' }] : []),
  ]

  const renderSlot = (sl: OrgSlot, depth: number) => {
    const key = `slot:${sl.id}`
    const a = slotAggs.get(sl.id)!
    const u = sl.unitId != null ? S.units.find(x => x.id === sl.unitId) : undefined
    const down = sl.unitId != null && !u ? S.downed.find(d => d.unitId === sl.unitId && !d.resolved) : undefined
    const lost = sl.unitId != null && !u
    const ldr = sl.soldiers.find(s => (s.pos === 'Platoon Leader' || s.pos === 'Battalion Commander'
      || s.pos === 'Flight Lead' || s.pos === 'Commanding General') && s.status === 'FIT')
      ?? sl.soldiers.find(s => s.status === 'FIT') ?? sl.soldiers[0]
    const status = u ? `FIELDED · ${u.label} · ${Math.max(0, Math.round(u.strength))}%`
      : down ? 'DUSTWUN — STATUS UNKNOWN, SECURE THE LKP'
        : lost ? 'COMBAT LOSS' : slotLocation(sl)
    return (
      <div key={sl.id} ref={sl.unitId === ui.rosterId ? focusRef : undefined}>
        <NodeRow depth={depth} open={open.has(key)} onToggle={() => toggle(key)}
          label={<Text span fz="md" fw={sl.type ? 700 : 500}
            c={down ? COL.mia : lost ? COL.kia : u ? '#7ec8ff' : sl.tf ? '#9fd0f5' : '#7d95aa'}
            style={down ? { animation: 's1pulse 1.2s ease-in-out infinite' } : undefined}>
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

  // a slot whose platoon is DUSTWUN — awaiting a recovery sweep
  const slotDown = (sl: OrgSlot): boolean =>
    sl.unitId != null && S.downed.some(d => d.unitId === sl.unitId && !d.resolved)

  // company rows for a battalion (or a battalion's TF slice) — shared by all
  // tabs. The company LABEL carries its platoons' state: amber when any platoon
  // has casualties, pulsing when one needs a recovery sweep.
  const renderCos = (list: OrgSlot[], bn: string, depth: number) => {
    const cos = [...new Set(list.map(sl => sl.co))]
    return cos.map(co => {
      const coSlots = list.filter(sl => sl.co === co)
      const coKey = `co:${bn}:${co}`
      const coAgg = aggSum(coSlots.map(sl => slotAggs.get(sl.id)!))
      const coCas = coAgg.wia + coAgg.kia > 0
      const coDown = coSlots.some(slotDown)
      return (
        <div key={co}>
          <NodeRow depth={depth} open={open.has(coKey)} onToggle={() => toggle(coKey)}
            label={<Text span fz="sm" fw={600}
              c={coDown ? COL.mia : coCas ? COL.wia : '#b8cede'}
              style={coDown ? { animation: 's1pulse 1.2s ease-in-out infinite' } : undefined}>
              {co}{coDown ? ' — RECOVERY REQ' : coCas ? ' — CASUALTIES' : ''}
            </Text>} a={coAgg} />
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
      {/* DUSTWUN attention pulse (company + platoon labels) */}
      <style>{'@keyframes s1pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }'}</style>
      {/* the proud battalion header — shared component (S1 set the format) */}
      <BnHeader plate={pack.staff?.s1?.label ?? 'S1'}
        sub={`${(pack.staff?.s1?.name ?? 'PERSONNEL').toUpperCase()} · ${pack.name.toUpperCase()}`}
        about={pack.staff?.s1} />

      {/* the section that runs this console, always visible above the tabs */}
      <ShopSection shop="s1">
        {org && <S1PersonnelChain slots={slots} playerBn={playerBn} open={open} toggle={toggle} />}
      </ShopSection>

      {/* view tabs: your battalion outward — TF slice, then the whole division */}
      <StaffTabs active={tab} onTab={(k) => switchTab(k as S1Tab)}
        tabs={[
          { key: 'bn', label: playerBn ?? 'BATTALION' },
          { key: 'tf', label: 'TASK FORCE' },
          { key: 'div', label: 'DIVISION' },
          { key: 'perstats', label: 'PERSTATS', dot: unreadReports(S, 's1'), right: true },
        ] satisfies StaffTab[]} />

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
              const att = donorOf(bnSlots[0]!, bn)
              const mine = bn === playerBn
              return (
                <div key={bn}>
                  <NodeRow depth={2} open={open.has(bnKey)} onToggle={() => toggle(bnKey)}
                    label={<Text span fz="md" fw={600} c={att ? '#c8a25f' : mine ? '#7ec8ff' : '#9fd0f5'}>{bn}</Text>}
                    att={att}
                    sub={[mine ? 'YOUR BATTALION' : !att ? 'ORGANIC' : '', pack.mottos?.[bn] ? `“${pack.mottos[bn]}”` : '']
                      .filter(Boolean).join(' · ')}
                    a={bnAgg} />
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
            const att = donorOf(bnSlots[0]!, bn)
            const mine = bn === playerBn
            return (
              <div key={bn}>
                <NodeRow depth={1} open={open.has(bnKey)} onToggle={() => toggle(bnKey)}
                  label={<Text span fz="md" fw={600} c={att ? '#c8a25f' : mine ? '#7ec8ff' : '#9fd0f5'}>{bn}</Text>}
                  att={att}
                  sub={[
                    mine ? 'YOUR BATTALION — FULL ALLOCATION'
                      : `${bnSlots.length} ELEMENT${bnSlots.length === 1 ? '' : 'S'} ATTACHED TO TF`,
                    pack.mottos?.[bn] ? `“${pack.mottos[bn]}”` : '',
                  ].filter(Boolean).join(' · ')}
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
              sub={['YOUR BATTALION', pack.mottos?.[playerBn] ? `“${pack.mottos[playerBn]}”` : '']
                .filter(Boolean).join(' · ')}
              leader={cdrS ? `${cdrS.rank} ${cdrS.name}` : undefined}
              a={aggSum(bnSlots.map(sl => slotAggs.get(sl.id)!))} />
            {open.has('bnroot') && renderCos(bnSlots, playerBn, 1)}
          </>
        )
      })()}

      {/* PERSTATS: the S1's report history — newest first, unread flagged.
          Click to open (first open is the VTC, afterwards the document). */}
      {tab === 'perstats' && (
        <>
          {!S.campaign && (
            <Text fz="sm" c="dark.3" p="md">STAFF REPORTS RUN IN THE CAMPAIGN.</Text>
          )}
          {S.campaign && S.campaign.reports.log.filter(e => e.shop === 's1').length === 0 && (
            <Text fz="sm" c="dark.3" p="md">
              NO PERSTATS ON FILE — REQUEST ONE FROM THE S1 TAB, OR COMPLETE A MISSION.
            </Text>
          )}
          {S.campaign && [...S.campaign.reports.log].filter(e => e.shop === 's1').reverse().map(e => (
            <UnstyledButton key={e.id} w="100%" onClick={() => openReport(S, e.id)}>
              <Group gap={10} wrap="nowrap" px={12} py={8}
                style={{ borderTop: '1px solid #141e28' }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = '#101a24' }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 4, flex: '0 0 auto',
                  background: e.read ? '#22303d' : '#d43a3a',
                }} />
                <Text span fz="md" fw={e.read ? 500 : 700} c={e.read ? '#9ab8d0' : '#dceeff'}>
                  {e.title}
                </Text>
                <Text span fz="xs" c="dark.3">S1 · PERSONNEL STATUS REPORT</Text>
                <Text span fz="xs" c="dark.3" ml="auto">{e.read ? 'READ' : 'UNREAD'}</Text>
              </Group>
            </UnstyledButton>
          ))}
        </>
      )}

      <Text fz="xs" c="dark.3" mt="md" pt={8} style={{ borderTop: '1px solid #17222c', letterSpacing: 1 }}>
        REPLACEMENT PIPELINE — {pipelineBacklog() > 0
          ? `${pipelineBacklog()} BILLET${pipelineBacklog() === 1 ? '' : 'S'} REQUESTED · NEXT PACKET ${Math.max(0, Math.ceil((S.replT - S.t) / 60))} MIN · UNITS ABSORB AT A FRIENDLY BASE`
          : 'NO BACKLOG — REAR DETACHMENT STANDING BY'}
      </Text>
    </Box>
  )
}
