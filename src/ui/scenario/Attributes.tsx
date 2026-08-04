// SCENARIO ATTRIBUTES — the document's own properties, in one place.
//
// These used to be scattered: TYPE and CHAIR sat in the toolbar between a
// back button and a save button (a toolbar holds VERBS, not properties),
// FOG and the campaign dressing were not editable anywhere at all — carried
// opaque from load to save — and SIDES, the model's headline rule, was a
// `const` with no setter that silently took whatever lineup happened to be
// installed. Eden keeps the same split: entity attributes on the entity,
// SCENARIO attributes in their own sheet.
import { Box, Checkbox, Group, Popover, Select, Text, TextInput } from '@mantine/core'
import { allPacks, PACKS } from '../../packs'
import { defaultPlayerFormation, playableFormations } from '../../packs/orgquery'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'
import type { Doc } from '../../scenario/edit'
import { field, INK, Row, Section, UI_FONT } from './panel'

const TYPE_OPTIONS = [
  ...MODE_ORDER.map(id => ({ value: id, label: MODES[id].label })),
  { value: 'campaign', label: 'CAMPAIGN' },
]

/** Pack options for a side. An id the scenario names but this checkout does
 *  not have STAYS in the list — dropping it from the options would make the
 *  select fall back to something else and write that back on save, which is
 *  the exact data loss this panel exists to stop. */
const packOptions = (current: string) => {
  const opts = allPacks().map(p => ({ value: p.id, label: `${p.abbr ?? p.id} · ${p.name ?? p.id}` }))
  if (current && !PACKS[current]) {
    opts.unshift({ value: current, label: `${current.toUpperCase()} · not installed` })
  }
  return opts
}

export default function Attributes({ doc, onChange }: {
  doc: Doc
  onChange: (patch: Partial<Doc>) => void
}) {
  const friendPack = PACKS[doc.sides.friend]
  const chairs = friendPack ? playableFormations(friendPack) : []
  const extra = (k: keyof Doc['extras'], v: string) =>
    onChange({ extras: { ...doc.extras, [k]: v || undefined } })

  // changing the army that plays BLUFOR invalidates the chair — a 1CD
  // battalion is not a seat in the Mobile Infantry. Re-seat on the new army's
  // default rather than leaving a designation nothing can resolve.
  const setFriend = (id: string) => {
    const p = PACKS[id]
    onChange({
      sides: { ...doc.sides, friend: id },
      ...(p && !playableFormations(p).some(f => f.desig === doc.player)
        ? { player: defaultPlayerFormation(p) } : {}),
    })
  }

  return (
    <Popover position="bottom-end" withArrow shadow="md" width={400}>
      <Popover.Target>
        <Box component="button" px={10} py={5} style={{
          border: `1px solid ${INK.line}`, background: '#141c24', color: INK.label,
          fontFamily: UI_FONT, fontSize: 12.5, cursor: 'pointer', borderRadius: 2,
        }}>
          ⚙ Attributes
        </Box>
      </Popover.Target>
      <Popover.Dropdown p={0} bg={INK.bg}
        style={{ border: `1px solid ${INK.line}`, overflow: 'hidden' }}>
        <Section title="Scenario">
          <Row label="Type" hint="The menu door, the ruleset, and the badge on every list.">
            <Select size="xs" styles={field} value={doc.type} data={TYPE_OPTIONS}
              onChange={v => v && onChange({ type: v as ModeId })} />
          </Row>
          <Row label="Fog of war">
            <Checkbox size="xs" checked={doc.fog !== false}
              onChange={ev => onChange({ fog: ev.currentTarget.checked ? undefined : false })} />
          </Row>
        </Section>

        <Section title="Sides">
          <Row label="BLUFOR">
            <Select size="xs" styles={field} value={doc.sides.friend}
              data={packOptions(doc.sides.friend)}
              onChange={v => v && setFriend(v)} />
          </Row>
          <Row label="OPFOR">
            <Select size="xs" styles={field} value={doc.sides.hostile}
              data={packOptions(doc.sides.hostile)}
              onChange={v => v && onChange({ sides: { ...doc.sides, hostile: v } })} />
          </Row>
          <Text px={10} py={4} style={{
            fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.45,
          }}>
            A pack has no side of its own — BLUFOR and OPFOR are roles this
            scenario hands out.
          </Text>
        </Section>

        <Section title="Command">
          <Row label="The chair"
            hint={friendPack
              ? 'Everything friendly outside it — and unattached — is a neighbour fighting its own fight.'
              : `${doc.sides.friend.toUpperCase() || 'That army'} is not installed. Its chair is preserved, not editable.`}>
            <Select size="xs" styles={field} value={doc.player || null}
              placeholder={friendPack ? 'pick a battalion' : '—'}
              disabled={!friendPack}
              data={chairs.map(f => ({ value: f.desig, label: f.label }))}
              onChange={v => v && onChange({ player: v })} />
          </Row>
        </Section>

        <Section title="Dressing" defaultOpen={false}>
          <Row label="Operation name">
            <TextInput size="xs" styles={field} placeholder={doc.name}
              value={doc.extras.operation ?? ''}
              onChange={ev => extra('operation', ev.currentTarget.value.toUpperCase())} />
          </Row>
          <Row label="CP name">
            <TextInput size="xs" styles={field} placeholder="CP LONGKNIFE"
              value={doc.extras.hqLabel ?? ''}
              onChange={ev => extra('hqLabel', ev.currentTarget.value.toUpperCase())} />
          </Row>
          <Row label="Airstrip name">
            <TextInput size="xs" styles={field} placeholder="COBALT STRIP"
              value={doc.extras.airfieldLabel ?? ''}
              onChange={ev => extra('airfieldLabel', ev.currentTarget.value.toUpperCase())} />
          </Row>
        </Section>
        <Box h={4} />
      </Popover.Dropdown>
    </Popover>
  )
}
