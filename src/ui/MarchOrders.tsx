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
//
// And it carries the LOAD PLAN, because a movement order that does not say who
// is riding in what is not a movement order. See domains/forces/loadplan.ts —
// the short version is that seats are finite, a platoon can cram past them at a
// price, and past THAT the surplus walks and the whole column walks with them.
import { useState } from 'react'
import { Box, Group, Table, Text } from '@mantine/core'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { VEHICLES } from '../domains/forces/composition'
import { underPlayerCommand } from '../domains/forces/command'
import type {
  DisabledPolicy, MarchColumnType, Roe, Soldier, Unit, WeaponsControl,
} from '../engine/GameState'
import { pushDisabled, strandedIn, wreckerIn } from '../domains/movement/recovery'
import {
  MARCH_INTERVAL, marchMoving, marchPlan, marchSecurity, marchState,
  setMarchOrder, clearMarchOrder,
} from '../domains/movement/march'
import { assignSeat, liftState, loadOf } from '../domains/forces/loadplan'
import { teamById, teamUnits } from '../domains/forces/teams'
import { Section, StaffTable, Td, Th } from './staff'
import { useUI } from './store'
import { centerView } from '../map/view'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
const WARN = '#e0b34e'
const ATT = '#c48fd6'   // another element's people — never mistaken for a warning

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
const DISABLED: { id: DisabledPolicy; label: string; why: string }[] = [
  { id: 'recover', label: 'RECOVER IT', why: 'The column holds while the wrecker hooks it up. The vehicle lives and the motorpool gets it back — and there has to be a recovery vehicle in the column, which was a task organization decision made an hour ago.' },
  { id: 'push', label: 'PUSH IT OFF', why: 'Shoved off the route and written off. The column does not break stride, and the crew goes looking for a seat in somebody else\'s vic — which may cost you the time anyway.' },
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

// --- the load plan ----------------------------------------------------------

/** The lift line for one element: seats against bodies, in the fewest characters
 *  that can still be wrong in only one way. */
function liftLine(u: Unit): { text: string; tone: 'ok' | 'cram' | 'foot' } {
  const l = liftState(u)
  if (!l.seats && !l.walking.length) return { text: '—', tone: 'ok' }
  if (l.walking.length) return { text: `${l.walking.length} ON FOOT`, tone: 'foot' }
  if (l.crammed) return { text: `${l.lifted}/${l.seats} CRAMMED`, tone: 'cram' }
  return { text: `${l.lifted}/${l.seats}`, tone: 'ok' }
}

/** A squad on the manifest, and the platoon it belongs to — which is not always
 *  the platoon whose vehicle it is sitting in. */
interface Riders { key: string; label: string; men: Soldier[]; unit: Unit }

/** Riders grouped by their sub-element AND their parent — the squad is the
 *  thing that moves between vics, because the squad is the thing that dies in
 *  one, and two platoons can both have a 1ST SQD. */
function bySquad(riders: { s: Soldier; unit: Unit }[]): Riders[] {
  const out: Riders[] = []
  const seen = new Map<string, Riders>()
  for (const { s, unit } of riders) {
    const key = `${unit.id}:${s.sec ?? `#${s.id}`}`
    let g = seen.get(key)
    if (!g) {
      g = { key, label: s.sec ?? (s.pos ?? s.kind), men: [], unit }
      seen.set(key, g); out.push(g)
    }
    g.men.push(s)
  }
  return out
}

/** The manifest for one element: every vic, what is in it, and what is not in
 *  anything. Clicking a squad cross-loads it to the next vic with room —
 *  ANYWHERE IN THE TEAM, because that is what being task organized together is
 *  for. A platoon that has lost its lift rides on a team-mate's vics; the men
 *  die when that vic dies and they are no longer where their own commander
 *  thinks they are, which is why it is a decision and never a solver's tidy-up.
 *
 *  Capacity refuses the rest. */
function Manifest({ u, team }: { u: Unit; team: Unit[] }) {
  const lift = liftState(u)
  // this element's own vics first, then the rest of the battle group's — the
  // search order is the doctrinal one: look after your own before you ask
  const hosts = [u, ...team.filter(o => o.id !== u.id)]
  const decks = hosts.flatMap(h => loadOf(h).map(l => ({ ...l, host: h })))
  const load = decks.filter(d => d.host.id === u.id)

  /** The next deck, wrapping, with room for the WHOLE group — or null, which is
   *  the answer far more often than not once a battle group is over its lift. A
   *  chip with nowhere to go must look like it, or the board is a button that
   *  does nothing. */
  const target = (men: Soldier[], fromId: number | null, fromHost: number | null) => {
    const start = decks.findIndex(d => d.veh.id === fromId && d.host.id === fromHost)
    for (let n = 1; n <= decks.length; n++) {
      const d = decks[(start + n + decks.length) % decks.length]!
      if ((d.veh.id === fromId && d.host.id === fromHost) || d.free < men.length) continue
      return d
    }
    return null
  }
  const shift = (g: Riders, fromId: number | null, fromHost: number | null) => {
    const d = target(g.men, fromId, fromHost)
    if (!d) return
    for (const s of g.men) assignSeat(g.unit, s.id, d.veh.id, d.host)
  }

  return (
    <Box mt={4} mb={8} ml={12} style={{ borderLeft: '1px solid #22303d', paddingLeft: 10 }}>
      <Text style={{ fontFamily: UI, fontSize: 10, letterSpacing: 0.6, color: '#5d6f80' }}>
        {u.label} LOAD PLAN — {lift.lifted} LIFTED OF {lift.lifted + lift.walking.length}
        {lift.crammed > 0 && ` · ${lift.crammed} OVER SEATS`}
        {lift.guests > 0 && ` · ${lift.guests} RIDING WITH THE TEAM`}
      </Text>
      {load.map(l => (
        <Group key={l.veh.id} gap={8} wrap="nowrap" align="baseline" mt={3}>
          <Text style={{
            fontFamily: UI, fontSize: 11, width: 118, flex: '0 0 auto',
            color: l.veh.status === 'DAMAGED' ? WARN : '#8b9cad',
          }}>
            {VEHICLES[l.veh.type]?.name ?? l.veh.type}
          </Text>
          <Text style={{
            fontFamily: UI, fontSize: 11, width: 46, flex: '0 0 auto',
            color: l.over > 0 ? WARN : '#6d7f90',
          }}>
            {l.riders.length}/{l.seats}
          </Text>
          <Group gap={4} wrap="wrap">
            {bySquad(l.riders).map(g => {
              const to = target(g.men, l.veh.id, u.id)
              // a squad from another platoon is somebody else's people in your
              // vehicle, and the board should never let that read as your own
              const away = g.unit.id !== u.id
              return (
                <Box key={g.key} component="button" onClick={() => shift(g, l.veh.id, u.id)}
                  title={to
                    ? `Cross-load to ${to.host.label}'s ${VEHICLES[to.veh.type]?.name ?? to.veh.type}`
                    : 'Nothing in the team has room for them'}
                  style={{
                    fontFamily: UI, fontSize: 10.5, padding: '1px 7px', borderRadius: 2,
                    cursor: to ? 'pointer' : 'default',
                    border: `1px solid ${away ? ATT + '55' : '#2a3a48'}`,
                    background: away ? '#1d1526' : '#141c24',
                    color: to ? (away ? ATT : '#9fb3c6') : '#5d6f80',
                  }}>
                  {away ? `${g.unit.label} ` : ''}{g.label} ×{g.men.length}
                </Box>
              )
            })}
            {!l.riders.length && (
              <Text style={{ fontFamily: UI, fontSize: 10.5, color: '#4d5f70' }}>empty</Text>
            )}
          </Group>
        </Group>
      ))}
      {lift.walking.length > 0 && (
        <Group gap={8} wrap="nowrap" align="baseline" mt={4}>
          <Text style={{ fontFamily: UI, fontSize: 11, width: 118, flex: '0 0 auto', color: WARN }}>
            ON FOOT
          </Text>
          <Text style={{ fontFamily: UI, fontSize: 11, width: 46, flex: '0 0 auto', color: WARN }}>
            {lift.walking.length}
          </Text>
          <Group gap={4} wrap="wrap">
            {bySquad(lift.walking.map(s => ({ s, unit: u }))).map(g => {
              const to = target(g.men, null, null)
              return (
                <Box key={g.key} component="button" onClick={() => shift(g, null, null)}
                  title={to
                    ? `Put them on ${to.host.label}'s ${VEHICLES[to.veh.type]?.name ?? to.veh.type}`
                    : 'Every vic in the team is full — there is no seat for them'}
                  style={{
                    fontFamily: UI, fontSize: 10.5, padding: '1px 7px', borderRadius: 2,
                    cursor: to ? 'pointer' : 'default',
                    border: `1px solid ${to ? WARN + '55' : '#3d4a56'}`,
                    background: to ? '#231d10' : '#171d24', color: to ? WARN : '#6d7f90',
                  }}>
                  {g.label} ×{g.men.length}
                </Box>
              )
            })}
          </Group>
        </Group>
      )}
      <Note warn={lift.walking.length > 0}>
        {lift.walking.length > 0
          ? decks.some(d => d.free > 0)
            ? decks.some(d => d.free > 0 && d.host.id !== u.id)
              ? 'The column moves at the pace of the men on foot — but the team has seats. Cross-load them onto a team-mate: they ride at vehicle pace, and they burn with that vic if it burns.'
              : 'The column moves at the pace of the men on foot. Cross-load them, or accept the march table.'
            : 'Every vic in the team is full. The column moves at walking pace until it gets lift from somewhere — a recovered vic, or a lighter load.'
          : lift.crammed > 0
            ? 'Riding over seats. They are moving at vehicle pace and they are much worse off if the vic is hit.'
            : lift.guests > 0
              ? 'Under its own lift and riding with the team. Those men are in another element\'s vics, and they are that element\'s casualties if those vics are hit.'
              : 'Everyone has a seat.'}
      </Note>
    </Box>
  )
}

function ColumnBoard({ gid, members }: { gid: number; members: Unit[] }) {
  const ui = useUI()
  const [open, setOpen] = useState<number | null>(null)
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
    extra: Partial<{
      roe: Roe; weapons: WeaponsControl; disabled: DisabledPolicy; authored: boolean
    }> = {},
  ) => {
    const cur = marchPlan(gid)
    setMarchOrder(gid, next, col ?? cur?.column ?? 'open', {
      ...(cur?.roe ? { roe: cur.roe } : {}),
      ...(cur?.weapons ? { weapons: cur.weapons } : {}),
      ...(cur?.disabled ? { disabled: cur.disabled } : {}),
      ...(cur?.authored ? { authored: true } : {}),
      ...extra,
    })
  }
  // Moving a serial by hand AUTHORS the order of march. Until somebody does,
  // the sequence re-forms from where the elements are staged each time the
  // column is given a route — which is how an order of march is really written.
  // Once it is authored the column obeys it and pays for the reshuffle.
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= full.length) return
    const v = [...full]; const t = v[i]!; v[i] = v[j]!; v[j] = t
    write(v, undefined, { authored: true })
  }

  const off = state.filter(s => s.driftedRoe || s.driftedWeapons || s.detached)
  const lead = members.find(m => m.id === full[0])
  const shortOfLift = members.filter(m => liftState(m).walking.length)
  const wrecker = wreckerIn(gid)
  const gaps = marchSecurity(gid)
  // Elements physically ahead of the one their serial puts them behind. Only
  // meaningful once the column is on a route and has an odometer to read.
  const passing = full
    .map((id, i) => ({ u: members.find(m => m.id === id), prev: full[i - 1] }))
    .filter(({ u, prev }) => {
      if (!u || prev == null || u.colS == null) return false
      const ahead = members.find(m => m.id === prev)
      return !!ahead && ahead.colS != null && u.colS > ahead.colS + 5
    })
    .map(({ u }) => u!)
  const stranded = members
    .map(u => ({ u, vics: strandedIn(u) }))
    .filter(x => x.vics.length)

  return (
    <Section title={`${teamById(gid)?.name ?? `BG ${gid}`} — ${members.length} ELEMENTS · ${
      plan
        ? `${interval} M INTERVAL · ${Math.round(depth)} M DEEP · ${
            marchMoving(gid) ? 'UNDER WAY' : 'AT THE SP'}`
        : 'NO ORDER GIVEN'}`}>

      <StaffTable minWidth={640} head={
        <><Th w={44}>SERIAL</Th><Th>ELEMENT</Th><Th>TYPE</Th>
          <Th>ORDERED</Th><Th>ACTUAL</Th><Th w={92}>LIFT</Th>
          <Th w={54} ta="right">MOVE</Th></>
      }>
        {full.map((id, i) => {
          const u = members.find(m => m.id === id)
          if (!u) return null
          const st = state.find(s => s.unitId === id)
          const drift = !!st && (st.driftedRoe || st.driftedWeapons || st.detached)
          const lift = liftLine(u)
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
              <Td c={lift.tone === 'foot' ? WARN : lift.tone === 'cram' ? '#c9a24a' : 'dark.2'}>
                <Box component="span" title="Open the load plan"
                  onClick={e => { e.stopPropagation(); setOpen(open === id ? null : id) }}
                  style={{ cursor: 'pointer' }}>
                  {open === id ? '▾ ' : '▸ '}{lift.text}
                </Box>
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

      {open != null && members.some(m => m.id === open) && (
        <Manifest u={members.find(m => m.id === open)!} team={members} />
      )}

      <Note>
        {lead ? `${lead.label} leads and takes the first contact.` : ''}
        {!plan && ' Until an order is given the column sorts itself by whoever is furthest along.'}
      </Note>

      {/* MARCH SECURITY. Not a second control — a reading of the one above it.
          A column is ambushed at one point along its length, and the third
          with nothing hardened in it is the third they pick. */}
      {gaps.length > 0 && (
        <Note warn>
          {gaps.map(g => `${g.band} of the column (${g.elements.join(', ')})`).join(' and ')}
          {gaps.length === 1 ? ' has' : ' have'} nothing hardened in
          {gaps.length === 1 ? ' it' : ' them'}. Escorts go at the head, in the middle
          and at the trail — move something with armour {gaps.length === 1 ? 'there' : 'into each'}.
        </Note>
      )}

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

      {/* A DISABLED VEHICLE. The decision has to be made here, in the order,
          because the moment it is needed is the worst moment to be asking. */}
      <Box mt={10}>
        <Text style={{
          fontFamily: UI, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: '#5d6f80',
        }}>DISABLED VEHICLES</Text>
        <Box mt={3}>
          <Chip value={plan?.disabled ?? 'recover'} options={DISABLED}
            onPick={v => write(full, undefined, { disabled: v })} />
        </Box>
        <Note>{DISABLED.find(d => d.id === (plan?.disabled ?? 'recover'))?.why}</Note>
        {(plan?.disabled ?? 'recover') === 'recover' && !wrecker && (
          <Note warn>
            Nothing in this column can recover anything. The order stands and cannot be
            carried out — attach the support element, or say PUSH IT OFF and mean it.
          </Note>
        )}
        {wrecker && (plan?.disabled ?? 'recover') === 'recover' && (
          <Note>{wrecker.label} carries the recovery.</Note>
        )}
      </Box>

      {/* THE QUESTION WAITING FOR AN ANSWER — a vic stopped on the route with
          no way to tow it. The net already asked; this is where it gets said. */}
      {stranded.map(({ u, vics }) => (
        <Group key={u.id} gap={8} mt={8} align="center" wrap="nowrap">
          <Text style={{ fontFamily: UI, fontSize: 11, color: WARN, flex: 1 }}>
            {u.label} — {vics.length} VIC{vics.length === 1 ? '' : 'S'} DISABLED AND STRANDED.
            Nothing can tow {vics.length === 1 ? 'it' : 'them'}.
          </Text>
          <Box component="button" onClick={() => pushDisabled(u.id)} style={{
            fontFamily: UI, fontSize: 11, padding: '3px 10px', borderRadius: 2, cursor: 'pointer',
            border: '1px solid #6b3230', background: '#2a1614', color: '#e0a09b',
          }}>PUSH {vics.length === 1 ? 'IT' : 'THEM'} OFF</Box>
        </Group>
      ))}

      {/* WHAT RE-ORDERING A FORMED COLUMN COSTS. An authored order is obeyed,
          and obeying it means an element that is physically ahead of its new
          place has to stop and let the column go past. Without saying so, that
          reads as a platoon inexplicably parked — which is the same complaint
          the order of march was supposed to answer. */}
      {plan?.authored && passing.length > 0 && (
        <Note warn>
          {passing.map(u => u.label).join(', ')} {passing.length === 1 ? 'is' : 'are'} ahead of
          {passing.length === 1 ? ' its' : ' their'} place in the order and holding for the
          column to pass. That is what re-ordering a formed column costs — leave the order
          alone and it forms up from where the elements are standing instead.
        </Note>
      )}

      {shortOfLift.length > 0 && (
        <Note warn>
          {shortOfLift.map(u => u.label).join(', ')} {shortOfLift.length === 1 ? 'is' : 'are'} short
          of lift. A column moves at the pace of its slowest element and that is now
          walking pace — open the load plan and cross-load, or write the march table
          around it.
        </Note>
      )}

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

/** Every column under the player's command. Dropped into the S3 console.
 *
 *  TEAMS FIRST, and they appear whether or not they are moving — a march order
 *  is written BEFORE the SP, not discovered once the column is already rolling.
 *  Then the scratch groupings: units box-selected and sent somewhere with no
 *  task organization behind them, which are still columns and still want an
 *  order of march, they just have no name and no life beyond the move. */
export default function MarchOrders() {
  useUI() // the store pumps a tick every 100 ms, so this board stays live
  const columns: { gid: number; list: Unit[] }[] = []
  const claimed = new Set<number>()

  for (const t of S.teams) {
    const list = teamUnits(t).filter(underPlayerCommand)
    for (const u of list) claimed.add(u.id)
    if (list.length > 1) columns.push({ gid: t.id, list })
  }

  const scratch = new Map<number, Unit[]>()
  for (const u of S.units) {
    if (u.groupId == null || u.strength <= 0 || claimed.has(u.id)) continue
    if (!underPlayerCommand(u)) continue
    let g = scratch.get(u.groupId)
    if (!g) { g = []; scratch.set(u.groupId, g) }
    g.push(u)
  }
  for (const [gid, list] of scratch) if (list.length > 1) columns.push({ gid, list })

  if (!columns.length) {
    return (
      <Section title="MOVEMENT ORDERS">
        <Note>
          No columns. A team of two or more elements is a column and appears here as
          soon as it is task organized — you do not have to move it first to write
          its order of march.
        </Note>
      </Section>
    )
  }
  return <>{columns.map(c => <ColumnBoard key={c.gid} gid={c.gid} members={c.list} />)}</>
}
