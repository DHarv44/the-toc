// MOVEMENT ORDERS — the S3's board.
//
// This belongs to Operations, not to the FORCES rail. The rail answers "what
// do I have"; this answers "how is it organised and what is it doing", which
// is the S3's question and the S3's product. The rail keeps a button.
//
// It is a BOARD, not a form. The two things it puts side by side are the order
// the commander GAVE and the state the elements are actually IN, and those
// diverge the moment anything happens — a platoon that gets badly hit reverts
// to `break` on its own judgement, a vic that finds a mine halts, a member in
// contact stops station-keeping altogether. Everything amber on this screen is
// an element that has stopped doing what it was told, which is exactly the
// traffic a TOC exists to notice.
//
// It sets the three things a movement order sets:
//   ORDER OF MARCH  position one takes the first contact
//   INTERVAL        dispersion against a fire mission, against control
//   ON CONTACT      push through, halt and fight, or break contact
import { Box, Group, Table, Text } from '@mantine/core'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { underPlayerCommand } from '../domains/forces/command'
import type { MarchColumnType, Roe, Unit, WeaponsControl } from '../engine/GameState'
import {
  MARCH_INTERVAL, marchPlan, marchState, setMarchOrder, clearMarchOrder,
} from '../domains/movement/march'
import { Section, StaffTable, Td, Th } from './staff'
import { useUI } from './store'
import { centerView } from '../map/view'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
const WARN = '#e0b34e'

const COLUMNS: { id: MarchColumnType; label: string; why: string }[] = [
  { id: 'close', label: 'CLOSE', why: 'Control and road space — night, limited visibility, built-up ground. One fire mission reaches more than one vic.' },
  { id: 'open', label: 'OPEN', why: 'Dispersion against artillery and air. The column stretches and control gets harder.' },
  { id: 'infiltration', label: 'INFILTRATION', why: 'Dispersed past reading as a column at all. Slow, almost no mutual support.' },
]
const ROES: { id: Roe; label: string; why: string }[] = [
  { id: 'push', label: 'PUSH THROUGH', why: 'Return fire and keep driving. The mission is at the far end.' },
  { id: 'halt', label: 'HALT AND FIGHT', why: 'Stop, herringbone, win the fire fight.' },
  { id: 'break', label: 'BREAK CONTACT', why: 'Run. For anything that must not be caught.' },
]
const WPN: { id: WeaponsControl; label: string }[] = [
  { id: 'free', label: 'FREE' },
  { id: 'tight', label: 'TIGHT' },
  { id: 'hold', label: 'HOLD' },
]

function Chip<T extends string>({ value, options, onPick }: {
  value: T | undefined
  options: { id: T; label: string }[]
  onPick: (v: T) => void
}) {
  return (
    <Group gap={4} wrap="wrap">
      {options.map(o => (
        <Box key={o.id} component="button" onClick={() => onPick(o.id)} style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 0.4, padding: '3px 9px',
          borderRadius: 2, cursor: 'pointer',
          border: `1px solid ${value === o.id ? '#3d7cb8' : '#2a3a48'}`,
          background: value === o.id ? '#1d3d5c' : '#141c24',
          color: value === o.id ? '#dceeff' : '#8b9cad',
        }}>
          {o.label}
        </Box>
      ))}
    </Group>
  )
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <Text mt={3} style={{
      fontFamily: UI, fontSize: 11, lineHeight: 1.45, color: warn ? WARN : '#6d7f90',
    }}>
      {children}
    </Text>
  )
}

function ColumnBoard({ gid, members }: { gid: number; members: Unit[] }) {
  const ui = useUI()
  const plan = marchPlan(gid)
  const ordered = plan ? plan.order.filter(id => members.some(m => m.id === id)) : []
  // anything not named in the order falls in at the TAIL — a unit that joins a
  // moving column takes station at the back rather than being refused or
  // silently inserted somewhere the commander did not put it
  const full = [...ordered, ...members.filter(m => !ordered.includes(m.id)).map(m => m.id)]
  const state = marchState(gid)
  const interval = MARCH_INTERVAL[plan?.column ?? 'open']
  const depth = interval * Math.max(0, full.length - 1)

  // Read the plan FRESH: closing over the one captured at render meant two
  // edits in quick succession each merged against the state before the other,
  // and the second silently dropped the first.
  const write = (
    next: number[], col?: MarchColumnType,
    extra: Partial<{ roe: Roe; weapons: WeaponsControl }> = {},
  ) => {
    const cur = marchPlan(gid)
    setMarchOrder(gid, next, col ?? cur?.column ?? 'open', {
      ...(cur?.roe ? { roe: cur.roe } : {}),
      ...(cur?.weapons ? { weapons: cur.weapons } : {}),
      ...extra,
    })
  }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= full.length) return
    const v = [...full]; const t = v[i]!; v[i] = v[j]!; v[j] = t
    write(v)
  }

  const off = state.filter(s => s.driftedRoe || s.driftedWeapons || s.detached)
  const lead = members.find(m => m.id === full[0])

  return (
    <Section title={`BG ${gid} — ${members.length} ELEMENTS · ${
      plan ? `${interval} M INTERVAL · ${Math.round(depth)} M DEEP` : 'NO ORDER GIVEN'}`}>

      <StaffTable head={
        <><Th w={44}>SERIAL</Th><Th>ELEMENT</Th><Th>TYPE</Th>
          <Th>ORDERED</Th><Th>ACTUAL</Th><Th w={54} ta="right">MOVE</Th></>
      }>
        {full.map((id, i) => {
          const u = members.find(m => m.id === id)
          if (!u) return null
          const st = state.find(s => s.unitId === id)
          const drift = !!st && (st.driftedRoe || st.driftedWeapons || st.detached)
          return (
            <Table.Tr key={id} onClick={() => { ui.select(id); centerView(u) }}
              style={{ cursor: 'pointer' }}>
              <Td c={i === 0 ? '#ffd67e' : 'dark.3'}>
                {i === 0 ? 'LEAD' : String(i + 1).padStart(2, '0')}
              </Td>
              <Td c="#7ec8ff">{u.label}</Td>
              <Td>{UNIT_TYPES[u.type]?.abbr ?? u.type}</Td>
              <Td c={plan?.roe ? 'dark.1' : 'dark.3'}>
                {plan?.roe ? plan.roe.toUpperCase() : '—'}
                {plan?.weapons ? ` · ${plan.weapons.toUpperCase()}` : ''}
              </Td>
              {/* THE DIVERGENCE. "ON ORDER" is only meaningful once an order
                  exists — with none given this column reports what the element
                  is simply doing, because saying it is on an order that was
                  never issued is the one thing a board must not do. */}
              <Td c={drift ? WARN : 'dark.1'}>
                {st?.detached ? 'NOT IN COLUMN'
                  : drift ? `${st!.roe.toUpperCase()} · ${st!.weapons.toUpperCase()}`
                  : plan ? 'ON ORDER'
                  : `${u.roe.toUpperCase()} · ${u.weapons.toUpperCase()}`}
              </Td>
              <Td ta="right">
                <Group gap={6} justify="flex-end" wrap="nowrap">
                  <Box component="span" title="Forward"
                    onClick={e => { e.stopPropagation(); move(i, -1) }}
                    style={{ cursor: 'pointer', color: i === 0 ? '#3d4a56' : '#8b9cad' }}>↑</Box>
                  <Box component="span" title="Back"
                    onClick={e => { e.stopPropagation(); move(i, 1) }}
                    style={{ cursor: 'pointer', color: i === full.length - 1 ? '#3d4a56' : '#8b9cad' }}>↓</Box>
                </Group>
              </Td>
            </Table.Tr>
          )
        })}
      </StaffTable>

      <Note>
        {lead ? `${lead.label} leads and takes the first contact.` : ''}
        {!plan && ' Until an order is given the column sorts itself by whoever is furthest along.'}
      </Note>

      <Box mt={10}>
        <Text style={{
          fontFamily: UI, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: '#5d6f80',
        }}>INTERVAL</Text>
        <Box mt={3}>
          <Chip value={plan?.column ?? 'open'} options={COLUMNS} onPick={c => write(full, c)} />
        </Box>
        <Note>{COLUMNS.find(c => c.id === (plan?.column ?? 'open'))?.why}</Note>
      </Box>

      <Box mt={10}>
        <Text style={{
          fontFamily: UI, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: '#5d6f80',
        }}>ACTIONS ON CONTACT</Text>
        <Box mt={3}>
          <Chip value={plan?.roe} options={ROES} onPick={v => write(full, undefined, { roe: v })} />
        </Box>
        <Note>
          {ROES.find(r => r.id === plan?.roe)?.why
            ?? 'Not specified — each element keeps whatever drill it already had.'}
        </Note>
      </Box>

      <Box mt={10}>
        <Text style={{
          fontFamily: UI, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: '#5d6f80',
        }}>WEAPONS CONTROL</Text>
        <Box mt={3}>
          <Chip value={plan?.weapons} options={WPN}
            onPick={v => write(full, undefined, { weapons: v })} />
        </Box>
      </Box>

      {off.length > 0 && (
        <Note warn>
          {off.length === 1
            ? '1 element has gone off the order on its own judgement.'
            : `${off.length} elements have gone off the order on their own judgement.`}
          {' '}Re-issue to put {off.length === 1 ? 'it' : 'them'} back on it, or
          leave {off.length === 1 ? 'it' : 'them'} — the element in contact can
          see what you cannot.
        </Note>
      )}

      <Group gap={8} mt={10}>
        <Box component="button" onClick={() => write(full)} style={{
          fontFamily: UI, fontSize: 11.5, padding: '4px 12px', borderRadius: 2, cursor: 'pointer',
          border: `1px solid ${plan ? '#2f6b4a' : '#3d7cb8'}`,
          background: plan ? '#16341f' : '#1d3d5c',
          color: plan ? '#a8e0bd' : '#dceeff',
        }}>
          {plan ? 'RE-ISSUE' : 'ISSUE THE ORDER'}
        </Box>
        {plan && (
          <Box component="button" onClick={() => clearMarchOrder(gid)}
            title="Cancel — the column goes back to sorting itself by progress"
            style={{
              fontFamily: UI, fontSize: 11.5, padding: '4px 12px', borderRadius: 2,
              border: '1px solid #2a3a48', background: '#141c24', color: '#8b9cad',
              cursor: 'pointer',
            }}>CANCEL</Box>
        )}
      </Group>
    </Section>
  )
}

/** Every column under the player's command. Dropped into the S3 console. */
export default function MarchOrders() {
  useUI() // the store pumps a tick every 100 ms, so this board stays live
  const groups = new Map<number, Unit[]>()
  for (const u of S.units) {
    if (u.groupId == null || u.strength <= 0) continue
    if (!underPlayerCommand(u)) continue
    let g = groups.get(u.groupId)
    if (!g) { g = []; groups.set(u.groupId, g) }
    g.push(u)
  }
  const columns = [...groups.entries()].filter(([, l]) => l.length > 1)

  if (!columns.length) {
    return (
      <Section title="MOVEMENT ORDERS">
        <Note>
          No columns formed. Two or more elements moving together are a column —
          group them on the map or in the FORCES rail and they appear here.
        </Note>
      </Section>
    )
  }
  return <>{columns.map(([gid, list]) => <ColumnBoard key={gid} gid={gid} members={list} />)}</>
}
