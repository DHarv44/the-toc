// THE ENTITY INSPECTOR — the selected thing's attributes, as a property grid.
//
// Two changes from what was here. It no longer carries a ROSTER in its empty
// state (selecting anything destroyed the list you selected it from — the
// outline holds that now, permanently, beside this). And it edits the WHOLE
// selection: marquee six platoons, tick DUG IN once. A patch that does not
// apply to a kind is simply not written to it, so a mixed selection digs the
// units in and leaves the FOB alone rather than refusing the edit.
import { Box, Checkbox, Group, NumberInput, Select, Text, TextInput } from '@mantine/core'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { PACKS } from '../../packs'
import { formationOptions, battalionOptions } from '../../packs/orgquery'
import type { Entity } from '../../scenario/edit'
import { DATA_FONT, field, IconBtn, INK, PanelHead, Row, Section, TextBtn, UI_FONT } from './panel'

const kindOf = (e: Entity): string =>
  e.ent === 'structure' ? e.kind
    : e.ent === 'unit' ? (UNIT_TYPES[e.type]?.name ?? e.type)
    : (e.r != null ? 'Zone' : 'Point')

export default function Inspector({
  e, count, friendPack, playerFormation, onCenter, onPatch, onDelete, onDuplicate,
}: {
  /** the single selected entity, or undefined when several are selected */
  e: Entity | undefined
  /** how many are selected — the header says so when it is more than one */
  count: number
  /** the pack playing BLUFOR — its org drives the formation pickers */
  friendPack: string
  /** the scenario's player chair: anything else friendly is allied AI */
  playerFormation: string
  onCenter: () => void
  onPatch: (patch: Partial<Entity>) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const pack = PACKS[friendPack]
  const fmOpts = pack ? formationOptions(pack) : []
  const bnOpts = pack ? battalionOptions(pack) : []
  const assetKinds = Object.keys(pack?.assets ?? {})

  const head = (
    <PanelHead
      kind={e ? (e.ent === 'place' ? 'Control measure' : e.ent) : 'Selection'}
      name={e ? kindOf(e) : `${count} selected`}
      right={
        <Group gap={4} wrap="nowrap">
          <IconBtn title="Show on the sheet (F)" onClick={onCenter}>◎</IconBtn>
          <IconBtn title="Duplicate (Ctrl+D)" onClick={onDuplicate}>⧉</IconBtn>
          <IconBtn title="Delete (Del)" danger onClick={onDelete}>✕</IconBtn>
        </Group>
      } />
  )

  // MULTI-SELECT: only the attributes that make sense across a mixed bag. The
  // per-kind fields below need one subject to show a value for.
  if (!e) {
    return (
      <Box style={{ background: INK.bg }}>
        {head}
        <Section title="Common">
          <Row label="Dug in" hint="Applies to the units in the selection.">
            <Checkbox size="xs" indeterminate
              onChange={ev => onPatch({ dug: ev.currentTarget.checked || undefined } as Partial<Entity>)} />
          </Row>
          {bnOpts.length > 0 && (
            <Row label="Owning formation">
              <Select size="xs" styles={field} placeholder="mixed"
                data={bnOpts.map(f => ({ value: f.desig, label: f.label }))}
                onChange={v => onPatch({
                  formation: v && v !== playerFormation ? v : undefined,
                } as Partial<Entity>)} />
            </Row>
          )}
        </Section>
        <Text px={10} py={8} style={{
          fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.45,
        }}>
          Select one thing to edit everything about it.
        </Text>
      </Box>
    )
  }

  return (
    <Box style={{ background: INK.bg }}>
      {head}

      {e.ent === 'place' && (
        <Section title="Control measure">
          <Row label="Name">
            <TextInput size="xs" styles={field} value={e.name} placeholder="OBJ KEATON"
              onChange={ev => onPatch({ name: ev.currentTarget.value.toUpperCase() })} />
          </Row>
          <Row label="Zone radius"
            hint="Empty makes it a point. Drag the handle on the sheet to size it by eye.">
            <NumberInput size="xs" styles={field} value={e.r ?? ''} min={0} step={20}
              suffix=" m" placeholder="point"
              onChange={v => onPatch({ r: typeof v === 'number' && v > 0 ? v : undefined })} />
          </Row>
          <Text px={10} pb={6} style={{
            fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.45,
          }}>
            The script references places by name — objective zones, spawn anchors
            and OPFOR objectives all point here. Renaming carries them along.
          </Text>
        </Section>
      )}

      {e.ent === 'structure' && (
        <>
          <Section title="Installation">
            <Row label="Label">
              <TextInput size="xs" styles={field} value={e.label ?? ''} placeholder="CP GARRYOWEN"
                onChange={ev => onPatch({ label: ev.currentTarget.value.toUpperCase() || undefined })} />
            </Row>
            {e.side === 'friend' && fmOpts.length > 0 && (
              <Row label="Owning formation">
                <Select size="xs" styles={field} value={e.formation ?? playerFormation}
                  data={fmOpts.map(f => ({ value: f.desig, label: f.label }))}
                  onChange={v => onPatch({ formation: v && v !== playerFormation ? v : undefined })} />
              </Row>
            )}
            <Row label="Under construction" hint="At H-hour. Empty means complete.">
              <Checkbox size="xs" checked={!!e.building}
                onChange={ev => onPatch({ building: ev.currentTarget.checked || undefined })} />
            </Row>
            {e.kind === 'FOB' && (
              <Row label="Starting stock">
                <NumberInput size="xs" styles={field} value={e.stock ?? ''} min={0}
                  onChange={v => onPatch({ stock: typeof v === 'number' ? v : undefined })} />
              </Row>
            )}
            {e.side === 'hostile' && (
              <Row label="Known at H-hour" hint="Ghosted onto the COP from the start.">
                <Checkbox size="xs" checked={e.intel === 'known'}
                  onChange={ev => onPatch({ intel: ev.currentTarget.checked ? 'known' : undefined })} />
              </Row>
            )}
          </Section>

          {/* ASSETS SITED HERE — division enablers already emplaced at H-hour:
              a C-RAM section on the FOB, a SHADOW orbit at the CP. Authored
              quantities are authored; difficulty never scales them. */}
          {e.side === 'friend' && assetKinds.length > 0 && (
            <Section title="Assets at H-hour" defaultOpen={!!e.assets?.length}>
              {(e.assets ?? []).map((a, i) => (
                <Row key={i}>
                  <Group gap={4} wrap="nowrap">
                    <Select size="xs" styles={field} style={{ flex: 1 }} value={a.asset}
                      data={assetKinds.map(k => ({ value: k, label: pack?.assets?.[k]?.name ?? k }))}
                      onChange={v => v && onPatch({
                        assets: (e.assets ?? []).map((x, k) => (k === i ? { ...x, asset: v } : x)),
                      })} />
                    <NumberInput size="xs" styles={field} w={54} min={1} value={a.qty}
                      onChange={v => onPatch({
                        assets: (e.assets ?? []).map((x, k) =>
                          (k === i ? { ...x, qty: typeof v === 'number' ? v : 1 } : x)),
                      })} />
                    <IconBtn title="Remove" danger onClick={() => onPatch({
                      assets: (e.assets ?? []).filter((_, k) => k !== i),
                    })}>✕</IconBtn>
                  </Group>
                </Row>
              ))}
              <Box px={8} py={4}>
                <TextBtn onClick={() => onPatch({
                  assets: [...(e.assets ?? []), { asset: assetKinds[0]!, qty: 1 }],
                })}>＋ Asset</TextBtn>
              </Box>
            </Section>
          )}
        </>
      )}

      {e.ent === 'unit' && (
        <>
          <Section title="Unit">
            <Row label="Heading" hint="Or drag the ring handle on the sheet.">
              <NumberInput size="xs" styles={field} min={0} max={359} suffix="°"
                value={e.heading != null ? Math.round((e.heading * 180) / Math.PI) : ''}
                onChange={v => onPatch({
                  heading: typeof v === 'number' ? (v * Math.PI) / 180 : undefined,
                })} />
            </Row>
            <Row label="Dug in">
              <Checkbox size="xs" checked={!!e.dug}
                onChange={ev => onPatch({ dug: ev.currentTarget.checked || undefined })} />
            </Row>
          </Section>

          {e.side === 'friend' ? (
            <Section title="Task organisation">
              {bnOpts.length > 0 && (
                <Row label="Owning formation">
                  <Select size="xs" styles={field} value={e.formation ?? playerFormation}
                    data={bnOpts.map(f => ({ value: f.desig, label: f.label }))}
                    onChange={v => onPatch({
                      formation: v && v !== playerFormation ? v : undefined,
                      ...(v === playerFormation ? { attached: undefined } : {}),
                    })} />
                </Row>
              )}
              {/* COMMAND DERIVES FROM TASK ORG — a sister formation's platoon
                  is yours to order only if it is task-organized to you for
                  this operation. */}
              {e.formation && e.formation !== playerFormation && (
                <Row label={`Attached to ${playerFormation}`}
                  hint={e.attached
                    ? 'Under your command — fields and takes orders like your own.'
                    : 'Allied (AI) — on your map, not yours to order.'}>
                  <Checkbox size="xs" checked={!!e.attached}
                    onChange={ev => onPatch({ attached: ev.currentTarget.checked || undefined })} />
                </Row>
              )}
              <Row label="Starts in garrison">
                <Checkbox size="xs" checked={!!e.garrison}
                  onChange={ev => onPatch({ garrison: ev.currentTarget.checked || undefined })} />
              </Row>
            </Section>
          ) : (
            <Section title="Intel picture">
              <Row label="Battlegroup tag" hint="What defeat-group objectives reference.">
                <TextInput size="xs" styles={field} value={e.tag ?? ''} placeholder="BG NORTH"
                  onChange={ev => onPatch({ tag: ev.currentTarget.value.toUpperCase() || undefined })} />
              </Row>
              {/* what the BLUFOR picture holds at H-hour — SUSPECTED is
                  last-known intel: the marker scatters off the truth */}
              <Row label="Held at H-hour">
                <Select size="xs" styles={field} value={e.intel ?? 'none'}
                  data={[
                    { value: 'none', label: 'Unknown — found like anything else' },
                    { value: 'known', label: 'Known — contact at the truth' },
                    { value: 'suspected', label: 'Suspected — scattered last-known' },
                  ]}
                  onChange={v => onPatch({
                    intel: v === 'known' || v === 'suspected' ? v : undefined,
                    ...(v !== 'suspected' ? { scatter: undefined } : {}),
                  })} />
              </Row>
              {e.intel === 'suspected' && (
                <Row label="Scatter" hint="How far the marker may sit off the truth.">
                  <NumberInput size="xs" styles={field} value={e.scatter ?? 400} min={0} step={50}
                    suffix=" m"
                    onChange={v => onPatch({ scatter: typeof v === 'number' ? v : undefined })} />
                </Row>
              )}
            </Section>
          )}
        </>
      )}

      <Text px={10} py={8} style={{
        fontFamily: DATA_FONT, fontSize: 11.5, color: INK.dim,
      }}>
        drag to move · F frame · Ctrl+D duplicate · Del remove
      </Text>
    </Box>
  )
}
