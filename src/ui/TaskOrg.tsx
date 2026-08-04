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
import { useState } from 'react'
import { Box, Group, Table, Text, TextInput } from '@mantine/core'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { underPlayerCommand } from '../domains/forces/command'
import type { Team, Unit } from '../engine/GameState'
import {
  designateCdr, disbandTeam, formTeam, isCrossAttached, joinTeam, leaveTeam,
  owner, renameTeam, teamCdr, teamOf, teamUnits,
} from '../domains/forces/teams'
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

function Btn({ children, onClick, tone = 'plain', title }: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'plain' | 'go' | 'bad'
  title?: string
}) {
  const c = tone === 'go'
    ? { border: '#3d7cb8', bg: '#1d3d5c', fg: '#dceeff' }
    : tone === 'bad'
      ? { border: '#6b3230', bg: '#2a1614', fg: '#e0a09b' }
      : { border: '#2a3a48', bg: '#141c24', fg: '#8b9cad' }
  return (
    <Box component="button" onClick={onClick} title={title} style={{
      fontFamily: UI, fontSize: 11, padding: '3px 10px', borderRadius: 2, cursor: 'pointer',
      border: `1px solid ${c.border}`, background: c.bg, color: c.fg,
    }}>
      {children}
    </Box>
  )
}

function TeamBoard({ t }: { t: Team }) {
  const ui = useUI()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(t.name)
  const [adding, setAdding] = useState(false)

  const list = teamUnits(t)
  const cdr = teamCdr(t)
  const str = list.length
    ? Math.round(list.reduce((n, u) => n + u.strength, 0) / list.length)
    : 0
  // everything of the player's that is not already spoken for
  const free = S.units.filter(u =>
    underPlayerCommand(u) && u.strength > 0 && !teamOf(u))

  const commit = () => { renameTeam(t.id, draft); setRenaming(false) }

  return (
    <Box mt={12}>
      <Group gap={10} align="baseline" wrap="nowrap">
        {renaming ? (
          <TextInput size="xs" value={draft} autoFocus
            onChange={e => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(t.name); setRenaming(false) }
            }}
            styles={{ input: {
              fontFamily: UI, fontSize: 13, letterSpacing: 1, width: 190,
              background: '#0e141a', border: '1px solid #3d7cb8', color: '#dceeff',
            } }} />
        ) : (
          <Text onClick={() => { setDraft(t.name); setRenaming(true) }}
            title="Rename"
            style={{
              fontFamily: UI, fontSize: 13, letterSpacing: 1.4, color: '#dbe6f0',
              cursor: 'pointer',
            }}>
            {t.name}
          </Text>
        )}
        <Text style={{ fontFamily: UI, fontSize: 11, color: '#6d7f90' }}>
          {list.length} ELEMENT{list.length === 1 ? '' : 'S'} · {str}%
        </Text>
        <Box style={{ flex: 1 }} />
        <Btn onClick={() => setAdding(a => !a)}
          title="Cross-attach an element to this team">＋ ATTACH</Btn>
        <Btn tone="bad" onClick={() => disbandTeam(t.id)}
          title="Break the team up — every element goes back to independent">DISBAND</Btn>
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
          <Th w={54} ta="right">STR</Th><Th w={132}>ROLE</Th><Th w={54} ta="right" /></>
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
              <Td ta="right">
                <Group gap={8} justify="flex-end" wrap="nowrap">
                  {!isCdr && (
                    <Box component="span" title="Give this element the team"
                      onClick={e => { e.stopPropagation(); designateCdr(t.id, u.id) }}
                      style={{ cursor: 'pointer', color: '#8b9cad', fontSize: 11 }}>★</Box>
                  )}
                  <Box component="span" title="Detach from the team"
                    onClick={e => { e.stopPropagation(); leaveTeam(u.id) }}
                    style={{ cursor: 'pointer', color: '#8b9cad', fontSize: 11 }}>✕</Box>
                </Group>
              </Td>
            </Table.Tr>
          )
        })}
      </StaffTable>

      {adding && (
        <Box mt={4} ml={12} style={{ borderLeft: '1px solid #22303d', paddingLeft: 10 }}>
          <Text style={{ fontFamily: UI, fontSize: 10, letterSpacing: 0.6, color: '#5d6f80' }}>
            ATTACH TO {t.name}
          </Text>
          {free.length === 0 && (
            <Note>Nothing independent to attach — every element you command is already
              in a task organization.</Note>
          )}
          <Group gap={6} wrap="wrap" mt={3}>
            {free.map(u => (
              <Btn key={u.id}
                onClick={() => { joinTeam(t.id, u.id); setAdding(false) }}>
                {u.label} · {UNIT_TYPES[u.type]?.abbr ?? u.type}
              </Btn>
            ))}
          </Group>
        </Box>
      )}

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

      <Group gap={8} mt={12} align="center">
        <Btn tone={selFree.length >= 2 ? 'go' : 'plain'}
          title={selFree.length >= 2
            ? 'Form the selected elements into a team, named for the first'
            : 'Select two or more independent elements on the map or in the FORCES rail'}
          onClick={() => { if (selFree.length >= 2) formTeam(selFree.map(u => u.id)) }}>
          ＋ FORM A TEAM
        </Btn>
        <Text style={{ fontFamily: UI, fontSize: 11, color: '#6d7f90' }}>
          {selFree.length >= 2
            ? `${selFree.map(u => u.label).join(', ')} — named for ${selFree[0]!.label}`
            : sel.length > 0 && selFree.length < sel.length
              ? 'Some of the selection is already task organized — detach it first.'
              : 'Select two or more independent elements.'}
        </Text>
      </Group>

      {free.length > 0 && S.teams.length > 0 && (
        <Note>
          INDEPENDENT: {free.map(u => u.label).join(', ')} — answering straight to this TOC.
        </Note>
      )}
    </Section>
  )
}
