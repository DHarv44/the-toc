// TASK ORGANIZATION — the first annex of every order ever written.
//
// This is the S3's other product, and it answers a different question from the
// movement order beside it. That one says how a column drives; this one says
// WHO ANSWERS TO WHOM, which everything else depends on: an element cross-
// attached to a team fights for that team's commander, not for the company
// whose patch it wears.
//
// The three facts a task organization has to carry, and this board carries no
// others:
//
//   THE GROUPING     which elements, named, so the net has something to call
//   THE COMMANDER    one person, by name — and who is standing in when they
//                    are down, because that is when it matters
//   THE ATTACHMENT   which elements are fighting for someone else's company
//
// Command is DERIVED (domains/forces/teams), so succession costs nothing and
// cannot go stale. What this screen does is show it, including the case the
// commander most needs to see: a team being run by an acting commander from an
// element that was never meant to have it.
import { Box, Group, Table, Text } from '@mantine/core'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { underPlayerCommand } from '../domains/forces/command'
import type { Team } from '../engine/GameState'
import { isCrossAttached, owner, teamCdr, teamOf, teamUnits } from '../domains/forces/teams'
import { Section, StaffTable, Td, Th } from './staff'
import { useUI } from './store'
import { centerView } from '../map/view'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
const WARN = '#e0b34e'
const ATT = '#c48fd6'   // cross-attached: not this team's own, and never mistaken for a warning

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <Text mt={3} style={{
      fontFamily: UI, fontSize: 11, lineHeight: 1.45, color: warn ? WARN : '#6d7f90',
    }}>
      {children}
    </Text>
  )
}

function TeamBoard({ t }: { t: Team }) {
  const ui = useUI()
  const list = teamUnits(t)
  const cdr = teamCdr(t)
  const str = list.length
    ? Math.round(list.reduce((n, u) => n + u.strength, 0) / list.length)
    : 0

  return (
    <Box mt={12}>
      <Group gap={10} align="baseline" wrap="nowrap">
        {/* THE NAME OPENS THE TEAM'S STATION. This board READS the task
            organization; the station is where one is worked. */}
        <Text onClick={() => useUI.setState(s => ({
          stations: s.stations.includes(t.id) ? s.stations : [...s.stations, t.id],
        }))}
          title={`Open ${t.name}'s station — attach, hand over command, rename, disband`}
          style={{
            fontFamily: UI, fontSize: 13, letterSpacing: 1.4, color: '#7ec8ff',
            cursor: 'pointer',
          }}>
          {t.name} ▸
        </Text>
        <Text style={{ fontFamily: UI, fontSize: 11, color: '#6d7f90' }}>
          {list.length} ELEMENT{list.length === 1 ? '' : 'S'} · {str}%
        </Text>
      </Group>

      {/* WHO ANSWERS FOR IT, by name. The acting case is the one that earns
          the line: a team whose designated commander is down is being run by
          someone who did not plan to be running it. */}
      <Text mt={2} style={{
        fontFamily: UI, fontSize: 11.5,
        color: cdr?.acting ? WARN : '#9fb3c6',
      }}>
        {cdr
          ? `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? '—'} · ${cdr.unit.label}${
            cdr.acting ? ' · ACTING' : ''}`
          : 'NO COMMANDER — no fit leadership anywhere in the team'}
      </Text>

      <StaffTable minWidth={560} head={
        <><Th>ELEMENT</Th><Th w={44}>TYPE</Th><Th>OWNED BY</Th>
          <Th w={54} ta="right">STR</Th><Th w={132}>ROLE</Th></>
      }>
        {list.map(u => {
          const att = isCrossAttached(t, u)
          const isCdr = cdr?.unit.id === u.id
          const isBase = u.id === t.baseId
          return (
            <Table.Tr key={u.id} onClick={() => { ui.select(u.id); centerView(u) }}
              style={{ cursor: 'pointer' }}>
              <Td c="#7ec8ff">{u.label}</Td>
              <Td>{UNIT_TYPES[u.type]?.abbr ?? u.type}</Td>
              <Td c={att ? ATT : 'dark.2'}>{u.lineage ? owner(u.lineage) : '—'}</Td>
              <Td ta="right" c={u.strength < 60 ? WARN : 'dark.1'}>
                {Math.max(0, Math.round(u.strength))}%
              </Td>
              <Td c={isCdr ? '#ffd67e' : att ? ATT : 'dark.3'}>
                {[isBase ? 'BASE' : att ? 'ATT' : 'ORGANIC', isCdr ? 'COMMANDS' : null]
                  .filter(Boolean).join(' · ')}
              </Td>
            </Table.Tr>
          )
        })}
      </StaffTable>

      {cdr?.acting && t.cdrId != null && (
        <Note warn>
          {t.name} is being run by an acting commander — the element you gave it to has
          no fit leadership left. Re-designate, or leave it: the man holding it is
          holding it either way.
        </Note>
      )}
      {(() => {
        const x = list.filter(u => isCrossAttached(t, u))
        if (!x.length) return null
        return (
          <Note>
            {x.map(u => u.label).join(', ')} {x.length === 1 ? 'is' : 'are'} cross-attached —
            fighting for this team's commander, not {x.length === 1 ? 'its' : 'their'} own
            company's.
          </Note>
        )
      })()}
    </Box>
  )
}

export default function TaskOrg() {
  const ui = useUI()
  useUI() // the store pumps a tick every 100 ms, so the board stays live
  const mine = S.units.filter(u => underPlayerCommand(u) && u.strength > 0)
  const free = mine.filter(u => !teamOf(u))
  const sel = mine.filter(u => ui.selectedIds.includes(u.id))
  const selFree = sel.filter(u => !teamOf(u))

  return (
    <Section title={`TASK ORGANIZATION — ${S.teams.length} TEAM${
      S.teams.length === 1 ? '' : 'S'} · ${free.length} INDEPENDENT`}>

      {S.teams.length === 0 && (
        <Note>
          Nothing task organized. Every element is answering directly to this TOC,
          which is workable for four platoons and stops being workable at eight —
          select the elements that will fight together and form them into a team.
        </Note>
      )}

      {S.teams.map(t => <TeamBoard key={t.id} t={t} />)}

      {free.length > 0 && S.teams.length > 0 && (
        <Note>
          INDEPENDENT: {free.map(u => u.label).join(', ')} — answering straight to this TOC.
        </Note>
      )}

      {/* THIS BOARD READS; IT DOES NOT ORGANIZE. It used to carry ATTACH,
          DISBAND, rename, designate and FORM A TEAM — every one of which the
          station or the map now owns, and every one of which was a second way
          to do a thing that already had a first way. A staff board is the
          document: all of it at once, compared. Working one team is done at
          that team's station, and forming one is done with the elements under
          the cursor, which is where the decision is actually made. */}
      <Note>
        {selFree.length >= 2
          ? `${selFree.map(u => u.label).join(', ')} selected — press G to task organize them.`
          : 'Marquee two or more elements on the map and press G to task organize. '
            + 'Open a team above to attach, hand over command, rename or disband it.'}
      </Note>
    </Section>
  )
}
