// THE OUTLINE — the whole document as one tree.
//
// This replaces a SegmentedControl that made INSPECTOR and SCRIPT mutually
// exclusive. Every editor this tool takes after — Unreal's outliner + details,
// Unity's hierarchy + inspector, Eden's layers + attributes — pairs a
// NAVIGATOR with an EDITOR and shows both at once, because you find a thing in
// one and change it in the other. Toggling between them meant selecting a tank
// destroyed the list of tanks, and editing a trigger hid every place name that
// trigger refers to.
//
// It is ONE tree because the situation and the missions are ONE document, and
// an author moves between them constantly — the objective you just wrote points
// at the zone you just dragged. A mission is a NODE here, not an entry in a
// dropdown: a campaign IS its ordered missions, and a spine should not be
// hidden behind a select.
import { useEffect, useRef } from 'react'
import { Box, Text } from '@mantine/core'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { refPlaceName } from './scriptFields'
import type { Entity, Sel } from '../../scenario/edit'
import type { MissionScript } from '../../scenario/types'
import { DATA_FONT, INK, Section, UI_FONT } from './panel'

const same = (a: Sel | null, b: Sel): boolean => JSON.stringify(a) === JSON.stringify(b)

const entLabel = (e: Entity): string =>
  e.ent === 'place' ? e.name
    : e.ent === 'structure' ? (e.label || e.kind)
    : (UNIT_TYPES[e.type]?.abbr ?? e.type)

const entSub = (e: Entity, chair: string): string => {
  if (e.ent === 'place') return e.r != null ? `zone ${e.r} m` : 'point'
  const own = e.formation && e.formation !== chair
    ? ` · ${e.formation}${e.ent === 'unit' && e.attached ? ' att' : ''}` : ''
  if (e.ent === 'structure') return `${e.kind}${own}`
  return `${e.side === 'friend' ? 'BLUFOR' : 'OPFOR'}${own}${e.dug ? ' · dug in' : ''}`
}

function Row({ depth, label, sub, note, active, warn, onClick, onLocate }: {
  depth: number
  label: string
  sub?: string
  note?: string
  active?: boolean
  /** something about this node is wrong — an empty zone, a dangling place */
  warn?: boolean
  onClick: () => void
  /** put it on the sheet; absent for nodes with no position */
  onLocate?: () => void
}) {
  // FOLLOW THE SELECTION. Selecting a mission opens its editor below, which
  // takes rail height, which can push the mission's own row out of sight — the
  // tree would be showing you everything except the thing you just picked.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <Box ref={ref}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '3px 8px 3px 0', cursor: 'pointer',
        borderLeft: `2px solid ${active ? INK.accent : 'transparent'}`,
        background: active ? 'rgba(42,90,138,0.35)' : undefined,
      }}>
      <Box style={{ flex: 1, minWidth: 0, paddingLeft: 8 + depth * 13 }}>
        <Text truncate style={{
          fontFamily: DATA_FONT, fontSize: 13,
          color: warn ? INK.bad : active ? '#eaf3fb' : INK.value,
        }}>
          {warn && '⚠ '}{label}
        </Text>
        {sub && (
          <Text truncate style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim }}>
            {sub}
          </Text>
        )}
      </Box>
      {note && (
        <Text style={{ fontFamily: DATA_FONT, fontSize: 11.5, color: INK.dim, flex: '0 0 auto' }}>
          {note}
        </Text>
      )}
      {onLocate && (
        <Box component="span" title="Show on the sheet"
          style={{ flex: '0 0 auto', color: INK.dim, fontSize: 13, cursor: 'pointer' }}
          onClick={ev => { ev.stopPropagation(); onLocate() }}>◎</Box>
      )}
    </Box>
  )
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontFamily: UI_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
      textTransform: 'uppercase', color: '#5d6f80', padding: '8px 8px 2px 22px',
    }}>
      {children}
    </Text>
  )
}

export default function Outline({
  entities, missions, chair, sel, dangling, onSelect, onLocate, onAddMission,
}: {
  entities: Entity[]
  missions: MissionScript[]
  /** the scenario's chair — what "yours" means in the subtitles */
  chair: string
  sel: Sel | null
  /** place names the script references that nobody authored */
  dangling: Set<string>
  onSelect: (s: Sel) => void
  onLocate: (e: Entity) => void
  onAddMission: () => void
}) {
  const groups: { head: string; list: Entity[] }[] = [
    { head: 'Control measures', list: entities.filter(e => e.ent === 'place') },
    { head: 'Installations', list: entities.filter(e => e.ent === 'structure') },
    { head: 'Units', list: entities.filter(e => e.ent === 'unit') },
  ]

  return (
    <Box style={{ overflowY: 'auto', flex: 1, minHeight: 0, background: INK.bg }}>
      <Section title="Situation" note={`${entities.length}`}>
        {entities.length === 0 && (
          <Text px={10} py={4} style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.dim }}>
            Nothing placed — drag a row from the palette onto the sheet.
          </Text>
        )}
        {groups.filter(g => g.list.length).map(g => (
          <Box key={g.head}>
            <SubHead>{g.head} · {g.list.length}</SubHead>
            {g.list.map(e => (
              <Row key={e.id} depth={1} label={entLabel(e)} sub={entSub(e, chair)}
                active={sel?.k === 'entity' && sel.ids.includes(e.id)}
                onClick={() => onSelect({ k: 'entity', ids: [e.id] })}
                onLocate={() => onLocate(e)} />
            ))}
          </Box>
        ))}
      </Section>

      <Section title="Missions" note={`${missions.length}`}
        action={
          <Box component="span" title="Add a mission"
            style={{ color: INK.accent, fontSize: 15, cursor: 'pointer' }}
            onClick={onAddMission}>＋</Box>
        }>
        {missions.length === 0 && (
          <Text px={10} py={4} style={{
            fontFamily: UI_FONT, fontSize: 12, color: INK.dim, lineHeight: 1.45,
          }}>
            A campaign's rules are its missions. Skirmish types need none — the
            ruleset judges the fight.
          </Text>
        )}
        {missions.map((m, mi) => {
          const objs = m.objectives ?? []
          const trigs = m.triggers ?? []
          const open = sel != null && sel.k !== 'entity' && sel.m === mi
          return (
            <Box key={m.id || mi}>
              <Row depth={0}
                label={`${String(mi + 1).padStart(2, '0')} · ${m.name || m.id}`}
                sub={`${objs.length} objective${objs.length === 1 ? '' : 's'} · ${trigs.length} trigger${trigs.length === 1 ? '' : 's'}`}
                active={same(sel, { k: 'mission', m: mi })}
                onClick={() => onSelect({ k: 'mission', m: mi })} />
              {open && (
                <>
                  {objs.length > 0 && <SubHead>Objectives · in order</SubHead>}
                  {objs.map((o, i) => (
                    <Row key={o.id || i} depth={2}
                      label={o.label || o.id}
                      sub={o.kind}
                      note={String(i + 1).padStart(2, '0')}
                      // an objective whose zone names nothing, or names a place
                      // nobody authored, is the failure this tree should show
                      // WITHOUT the author opening it
                      warn={'zone' in o && (() => {
                        const n = refPlaceName(o.zone?.place)
                        return !n || dangling.has(n)
                      })()}
                      active={same(sel, { k: 'objective', m: mi, i })}
                      onClick={() => onSelect({ k: 'objective', m: mi, i })} />
                  ))}
                  {trigs.length > 0 && <SubHead>Triggers · when → do</SubHead>}
                  {trigs.map((t, i) => (
                    <Box key={t.id || i}>
                      <Row depth={2} label={t.id} sub={`when ${t.when.kind}`}
                        note={`${t.do.length}`}
                        warn={t.do.length === 0}
                        active={same(sel, { k: 'trigger', m: mi, i })}
                        onClick={() => onSelect({ k: 'trigger', m: mi, i })} />
                      {/* a trigger's effects unfold under it once it is the one
                          you are working on — the full DO list of every trigger
                          at once was the wall of cards this tree replaces */}
                      {'i' in sel && sel.i === i && t.do.map((e, j) => (
                        <Row key={j} depth={3} label={e.kind}
                          active={same(sel, { k: 'effect', m: mi, i, j })}
                          onClick={() => onSelect({ k: 'effect', m: mi, i, j })} />
                      ))}
                    </Box>
                  ))}
                </>
              )}
            </Box>
          )
        })}
      </Section>
      <Box h={16} />
    </Box>
  )
}
