// THE PALETTE — the content browser you drag things out of.
//
// It used to be a mode switch: click a row to ARM it, then click the sheet to
// stamp. That is a paint-program idiom, and it had the paint program's problem
// without the paint program's excuse — the mode was invisible, it never turned
// itself off, and every stray click on the map put down another entity. The
// dogfood log filed exactly that ("duplicated an enemy HQ against the panel
// edge") and it stayed.
//
// Unreal and Unity both do the same thing instead: you DRAG an asset out of
// the browser and drop it in the viewport. Press on a row here and the cursor
// picks it up; release over the sheet and it lands; release anywhere else and
// nothing happens. One gesture, one entity, and the cursor shows what it is
// holding the whole way.
import { useState } from 'react'
import { Box, SegmentedControl, Text } from '@mantine/core'
import { STRUCTURES, type StructureTypeKey } from '../../domains/installations/catalog'
import type { UnitType } from '../../domains/forces/catalog'
import { PACKS } from '../../packs'
import { slotStrength } from '../../packs/org'
import { capabilityGroups, formationSlots } from '../../packs/orgquery'
import OrgPicker from '../OrgPicker'
import { DrillRow } from '../tree'
import type { ScenarioSide } from '../../scenario/types'
import { DATA_FONT, INK, Section, UI_FONT } from './panel'

export type Armed =
  | { ent: 'structure'; kind: StructureTypeKey }
  | { ent: 'unit'; type: string }
  | { ent: 'place'; zone: boolean }
  | null

/** A draggable row. Pressing it picks the item up; the drop is the sheet's. */
function Item({ label, sub, note, disabled, held, onPick }: {
  label: string
  sub?: string
  note?: string
  disabled?: boolean
  held?: boolean
  onPick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <Box
      onPointerDown={ev => { if (!disabled) { ev.preventDefault(); onPick() } }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 10px',
        cursor: disabled ? 'default' : 'grab',
        opacity: disabled ? 0.35 : 1,
        background: held ? 'rgba(42,90,138,0.4)' : hover && !disabled ? '#161f28' : 'transparent',
        borderLeft: `2px solid ${held ? INK.accent : 'transparent'}`,
      }}>
      <Text style={{
        fontFamily: DATA_FONT, fontSize: 13, color: INK.value, flex: '0 0 auto',
      }}>
        {label}
      </Text>
      {sub && (
        <Text truncate style={{
          fontFamily: UI_FONT, fontSize: 12, color: INK.dim, flex: 1, minWidth: 0,
        }}>
          {sub}
        </Text>
      )}
      {note && (
        <Text style={{ fontFamily: DATA_FONT, fontSize: 12, color: INK.dim, flex: '0 0 auto' }}>
          {note}
        </Text>
      )}
    </Box>
  )
}

export default function Palette({
  side, sidePacks, carry, formation, placedByType, playerFormation,
  onSide, onCarry, onFormation,
}: {
  side: ScenarioSide
  /** which installed pack plays each side (scenario meta) */
  sidePacks: { friend: string; hostile: string }
  /** what the cursor is holding right now */
  carry: Armed
  /** PLACING AS — the formation new entities are stamped with */
  formation: string
  /** how many of each type this formation already has on the sheet */
  placedByType: Record<string, number>
  /** the scenario's player chair — what "yours" means on this sheet */
  playerFormation: string
  onSide: (s: ScenarioSide) => void
  onCarry: (a: Armed) => void
  onFormation: (f: string) => void
}) {
  const packId = sidePacks[side]
  const pack = PACKS[packId]
  const units = (PACKS[packId]?.catalogs.units ?? {}) as Record<string, UnitType>
  const structKinds = Object.keys(STRUCTURES) as StructureTypeKey[]
  // the pack's real division drives the picker; OPFOR has no shipped org yet
  // (P4), so its palette stays formation-free and lists bare types
  const orgOk = side === 'friend' && !!pack?.formation
  const mine = formation === playerFormation
  const caps = orgOk && pack ? capabilityGroups(pack, formation) : []
  const [openCat, setOpenCat] = useState<string | null>(null)
  const held = (a: NonNullable<Armed>) => JSON.stringify(carry) === JSON.stringify(a)

  return (
    <Box w={252} style={{
      borderRight: `1px solid ${INK.line}`, overflowY: 'auto', background: INK.bg,
    }}>
      <Section title="Control measures" defaultOpen>
        <Item label="PT" sub="named point" held={held({ ent: 'place', zone: false })}
          onPick={() => onCarry({ ent: 'place', zone: false })} />
        <Item label="ZONE" sub="named area" held={held({ ent: 'place', zone: true })}
          onPick={() => onCarry({ ent: 'place', zone: true })} />
      </Section>

      <Box px={8} py={8}>
        <SegmentedControl fullWidth size="xs" value={side}
          onChange={v => onSide(v as ScenarioSide)}
          data={[
            { value: 'friend', label: 'BLUFOR' },
            { value: 'hostile', label: 'OPFOR' },
          ]} />
      </Box>

      {/* PLACING AS — whose troops these are, chosen from the REAL division
          tree (the same hierarchy the S1's DIVISION view walks). Command
          derives from it: your own battalion is yours to order, a sister
          formation fights beside you under its own commander. */}
      {pack && orgOk && (
        <Section title="Placing as" note={mine ? 'your command' : 'allied · AI'}>
          <Box mx={8} mb={4} style={{ border: `1px solid ${INK.line}`, borderRadius: 2 }}>
            <OrgPicker pack={pack} value={formation} onChange={onFormation}
              right={n => {
                const n2 = formationSlots(pack, n.desig).length
                return n2
                  ? <Text span style={{
                      fontFamily: DATA_FONT, fontSize: 11.5, color: INK.dim, flex: '0 0 auto',
                    }}>{n2}</Text>
                  : null
              }} />
          </Box>
        </Section>
      )}

      <Section title="Installations">
        {structKinds.map(k => (
          <Item key={k} label={k} sub={STRUCTURES[k].name ?? ''}
            held={held({ ent: 'structure', kind: k })}
            onPick={() => onCarry({ ent: 'structure', kind: k })} />
        ))}
      </Section>

      {/* THE GARRISON, BY CAPABILITY — the same drill the CALL UP flyout runs
          ("what kills that tank?"), with the formation's real elements and
          strength. Placing from it is authoring against troops that exist. */}
      <Section title={orgOk ? `Garrison · ${formation}` : `Units · ${pack?.abbr ?? packId}`}>
        {orgOk && pack ? (
          <>
            {caps.length === 0 && (
              <Text px={10} py={4} style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.dim }}>
                {formation} fields no ground elements
              </Text>
            )}
            {caps.map(g => {
              const isOpen = openCat === g.cat
              return (
                <Box key={g.cat}>
                  <DrillRow depth={1} label={g.cat} n={g.slots.length}
                    str={slotStrength(g.slots)} open={isOpen}
                    onClick={() => setOpenCat(isOpen ? null : g.cat)} />
                  {isOpen && g.types.map(t => {
                    const budget = g.slots.filter(sl => sl.type === t).length
                    const left = Math.max(0, budget - (placedByType[t] ?? 0))
                    return (
                      <Item key={t}
                        label={units[t]?.abbr ?? t}
                        sub={units[t]?.name ?? t}
                        note={`${left}/${budget}`}
                        disabled={left === 0}
                        held={held({ ent: 'unit', type: t })}
                        onPick={() => onCarry({ ent: 'unit', type: t })} />
                    )
                  })}
                </Box>
              )
            })}
          </>
        ) : (
          Object.values(units).map(u => (
            <Item key={u.key} label={u.abbr} sub={u.name}
              held={held({ ent: 'unit', type: u.key })}
              onPick={() => onCarry({ ent: 'unit', type: u.key })} />
          ))
        )}
      </Section>

      <Text px={10} py={8} style={{
        fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.45,
      }}>
        Drag a row onto the sheet to place it. Esc drops what you are carrying.
      </Text>
    </Box>
  )
}
