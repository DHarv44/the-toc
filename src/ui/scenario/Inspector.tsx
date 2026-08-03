// The attribute inspector: every placed entity is editable here — Eden's
// grammar. Patches flow up as partial entity updates; DELETE removes.
import { Box, Button, Checkbox, Group, NumberInput, Select, Text, TextInput } from '@mantine/core'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { PACKS } from '../../packs'
import { formationOptions, battalionOptions } from '../../packs/orgquery'
import type { Entity } from '../../scenario/edit'

const MONO = 'Consolas, monospace'

// What a roster row says about an entity, in one line.
const rowLabel = (e: Entity): string =>
  e.ent === 'place' ? e.name
    : e.ent === 'structure' ? (e.label || e.kind)
    : (UNIT_TYPES[e.type]?.abbr ?? e.type)

const rowSub = (e: Entity, playerFormation: string): string => {
  if (e.ent === 'place') return e.r != null ? `ZONE ${e.r}m` : 'POINT'
  const own = e.formation && e.formation !== playerFormation
    ? ` · ${e.formation}${e.ent === 'unit' && e.attached ? ' ATT' : ''}` : ''
  if (e.ent === 'structure') return `${e.kind}${own}`
  return `${e.side === 'friend' ? 'BLUFOR' : 'OPFOR'}${own}${e.dug ? ' · DUG' : ''}`
}

export default function Inspector({
  e, entities, friendPack, playerFormation, onSelect, onCenter, onPatch, onDelete,
}: {
  e: Entity | undefined
  /** everything on the sheet — the roster when nothing is selected */
  entities: Entity[]
  /** the pack playing BLUFOR — its org drives the formation pickers */
  friendPack: string
  /** the scenario's player chair: anything else friendly is allied AI */
  playerFormation: string
  onSelect: (id: number) => void
  onCenter: (id: number) => void
  onPatch: (patch: Partial<Entity>) => void
  onDelete: () => void
}) {
  const pack = PACKS[friendPack]
  const fmOpts = pack ? formationOptions(pack) : []
  const bnOpts = pack ? battalionOptions(pack) : []
  const assetKinds = Object.keys(pack?.assets ?? {})
  // THE ROSTER — every placed entity, grouped the way an author thinks about
  // them. Nothing on this sheet can hide: a symbol under another symbol, or a
  // zone whose centre is off-screen, is still one click away from here.
  const groups: { head: string; list: Entity[] }[] = [
    { head: 'CONTROL MEASURES', list: entities.filter(x => x.ent === 'place') },
    { head: 'INSTALLATIONS', list: entities.filter(x => x.ent === 'structure') },
    { head: 'UNITS', list: entities.filter(x => x.ent === 'unit') },
  ].filter(g => g.list.length > 0)

  return (
    <Box w={230} p="xs" style={{ borderLeft: '1px solid #22303d', overflowY: 'auto', fontFamily: MONO }}>
      {!e ? (
        <>
          <Text fz={9} c="dark.3" mb={2} style={{ letterSpacing: 1.5 }}>
            ON THE SHEET · {entities.length}
          </Text>
          <Text fz={8.5} c="dark.3" mb={8}>CLICK TO SELECT · ◎ TO LOCATE</Text>
          {entities.length === 0 && (
            <Text fz={10} c="dark.3">
              NOTHING PLACED YET — ARM A PALETTE ROW AND CLICK THE SHEET
            </Text>
          )}
          {groups.map(g => (
            <Box key={g.head} mb={8}>
              <Text fz={8.5} c="dark.4" mb={3} style={{ letterSpacing: 1.5 }}>{g.head}</Text>
              {g.list.map(x => (
                <Group key={x.id} gap={4} wrap="nowrap" mb={2}>
                  <Box style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => onSelect(x.id)}>
                    <Text fz={10} c="#c8d8e8" truncate>{rowLabel(x)}</Text>
                    <Text fz={8} c="dark.3" truncate>{rowSub(x, playerFormation)}</Text>
                  </Box>
                  <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
                    title="Show on the sheet" onClick={() => onCenter(x.id)}>◎</Button>
                </Group>
              ))}
            </Box>
          ))}
        </>
      ) : (
        <>
          <Group gap={4} mb={6} wrap="nowrap">
            <Button size="compact-xs" variant="subtle" c="dark.2" px={4} style={{ flex: 1 }}
              justify="flex-start" onClick={() => onSelect(-1)}>
              ◀ ALL PLACED ({entities.length})
            </Button>
            <Button size="compact-xs" variant="default" px={5}
              title="Show on the sheet" onClick={() => onCenter(e.id)}>◎</Button>
          </Group>
          <Text fz={11} c="#dceeff" mb={6}>
            {e.ent === 'structure' ? e.kind
              : e.ent === 'unit' ? (UNIT_TYPES[e.type]?.name ?? e.type)
              : (e.r != null ? 'ZONE' : 'POINT')}
            {e.ent !== 'place' && (
              <Text span fz={9} c={e.side === 'friend' ? '#80c8ff' : '#ff8080'} ml={6}>
                {e.side === 'friend' ? 'BLUFOR' : 'OPFOR'}
              </Text>
            )}
          </Text>
          {e.ent === 'place' && (
            <>
              <TextInput size="xs" label="NAME" value={e.name} mb={6}
                placeholder="OBJ KEATON"
                onChange={ev => onPatch({ name: ev.currentTarget.value.toUpperCase() })} />
              <NumberInput size="xs" label="ZONE RADIUS M (EMPTY = POINT)" mb={6}
                value={e.r ?? ''} min={0} step={20}
                onChange={v => onPatch({ r: typeof v === 'number' && v > 0 ? v : undefined })} />
              <Text fz={8.5} c="dark.3" mb={4}>
                THE SCRIPT REFERENCES PLACES BY NAME — OBJECTIVE ZONES, SPAWN
                ANCHORS, OPFOR OBJECTIVES ALL POINT HERE
              </Text>
            </>
          )}
          {e.ent === 'structure' && (
            <>
              {e.side === 'friend' && fmOpts.length > 0 && (
                <Select size="xs" label="OWNING FORMATION" mb={6}
                  value={e.formation ?? playerFormation}
                  data={fmOpts.map(f => ({ value: f.desig, label: f.label }))}
                  styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                  onChange={v => onPatch({
                    formation: v && v !== playerFormation ? v : undefined,
                  })} />
              )}
              <TextInput size="xs" label="LABEL" value={e.label ?? ''} mb={6}
                placeholder="CP GARRYOWEN"
                onChange={ev => onPatch({ label: ev.currentTarget.value.toUpperCase() || undefined })} />
              <Checkbox size="xs" label="UNDER CONSTRUCTION AT H-HOUR" mb={6}
                checked={!!e.building}
                onChange={ev => onPatch({ building: ev.currentTarget.checked || undefined })} />
              {e.kind === 'FOB' && (
                <NumberInput size="xs" label="STARTING STOCK" value={e.stock ?? ''} mb={6}
                  min={0} onChange={v => onPatch({ stock: typeof v === 'number' ? v : undefined })} />
              )}
              {e.side === 'hostile' && (
                <Checkbox size="xs" label="KNOWN AT H-HOUR (GHOSTED ON THE COP)" mb={6}
                  checked={e.intel === 'known'}
                  onChange={ev => onPatch({ intel: ev.currentTarget.checked ? 'known' : undefined })} />
              )}
              {/* ASSETS SITED HERE — division enablers already emplaced at
                  H-hour: a C-RAM section on the FOB, a SHADOW orbit at the CP.
                  Authored quantities are authored; difficulty never scales
                  them. */}
              {e.side === 'friend' && assetKinds.length > 0 && (
                <>
                  <Text fz={9} c="dark.3" mt={8} mb={4} style={{ letterSpacing: 1.5 }}>
                    ASSETS AT H-HOUR
                  </Text>
                  {(e.assets ?? []).map((a, i) => (
                    <Group key={i} gap={4} mb={4} wrap="nowrap">
                      <Select size="xs" style={{ flex: 1 }} value={a.asset}
                        data={assetKinds.map(k => ({
                          value: k, label: pack?.assets?.[k]?.name ?? k,
                        }))}
                        styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                        onChange={v => v && onPatch({
                          assets: (e.assets ?? []).map((x, k) => (k === i ? { ...x, asset: v } : x)),
                        })} />
                      <NumberInput size="xs" w={54} min={1} value={a.qty}
                        styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                        onChange={v => onPatch({
                          assets: (e.assets ?? []).map((x, k) =>
                            (k === i ? { ...x, qty: typeof v === 'number' ? v : 1 } : x)),
                        })} />
                      <Button size="compact-xs" variant="subtle" c="#e8524a" px={4}
                        onClick={() => onPatch({
                          assets: (e.assets ?? []).filter((_, k) => k !== i),
                        })}>✕</Button>
                    </Group>
                  ))}
                  <Button size="compact-xs" variant="default" mb={6}
                    disabled={!assetKinds[0]}
                    onClick={() => onPatch({
                      assets: [...(e.assets ?? []), { asset: assetKinds[0]!, qty: 1 }],
                    })}>＋ ASSET</Button>
                </>
              )}
            </>
          )}
          {e.ent === 'unit' && (
            <>
              <NumberInput size="xs" label="HEADING °" mb={6} min={0} max={359}
                value={e.heading != null ? Math.round((e.heading * 180) / Math.PI) : ''}
                onChange={v => onPatch({
                  heading: typeof v === 'number' ? (v * Math.PI) / 180 : undefined,
                })} />
              <Checkbox size="xs" label="DUG IN" mb={6} checked={!!e.dug}
                onChange={ev => onPatch({ dug: ev.currentTarget.checked || undefined })} />
              {e.side === 'friend' ? (
                <>
                  {bnOpts.length > 0 && (
                    <Select size="xs" label="OWNING FORMATION" mb={6}
                      value={e.formation ?? playerFormation}
                      data={bnOpts.map(f => ({ value: f.desig, label: f.label }))}
                      styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                      onChange={v => onPatch({
                        formation: v && v !== playerFormation ? v : undefined,
                        ...(v === playerFormation ? { attached: undefined } : {}),
                      })} />
                  )}
                  {/* COMMAND DERIVES FROM TASK ORG — a sister formation's
                      platoon is yours to order only if it is task-organized
                      to you for this operation. */}
                  {e.formation && e.formation !== playerFormation ? (
                    <>
                      <Checkbox size="xs" mb={4} checked={!!e.attached}
                        label={`ATTACHED TO ${playerFormation}`}
                        onChange={ev => onPatch({ attached: ev.currentTarget.checked || undefined })} />
                      <Text fz={8.5} c={e.attached ? '#7ec8ff' : '#e0b34e'} mb={6}>
                        {e.attached
                          ? 'UNDER YOUR COMMAND — FIELDS AND TAKES ORDERS LIKE YOUR OWN'
                          : 'ALLIED (AI) — ON YOUR MAP, NOT YOURS TO ORDER'}
                      </Text>
                    </>
                  ) : null}
                  <Checkbox size="xs" label="STARTS IN GARRISON" mb={6} checked={!!e.garrison}
                    onChange={ev => onPatch({ garrison: ev.currentTarget.checked || undefined })} />
                </>
              ) : (
                <>
                  <TextInput size="xs" label="BATTLEGROUP TAG" value={e.tag ?? ''} mb={6}
                    placeholder="BG NORTH"
                    onChange={ev => onPatch({ tag: ev.currentTarget.value.toUpperCase() || undefined })} />
                  {/* what the BLUFOR picture holds at H-hour — SUSPECTED is
                      last-known intel: the marker scatters off the truth */}
                  <Select size="xs" label="H-HOUR INTEL" mb={6}
                    value={e.intel ?? 'none'}
                    data={[
                      { value: 'none', label: 'UNKNOWN — FOUND LIKE ANYTHING ELSE' },
                      { value: 'known', label: 'KNOWN — STALE CONTACT AT TRUTH' },
                      { value: 'suspected', label: 'SUSPECTED — SCATTERED LAST-KNOWN' },
                    ]}
                    onChange={v => onPatch({
                      intel: v === 'known' || v === 'suspected' ? v : undefined,
                      ...(v !== 'suspected' ? { scatter: undefined } : {}),
                    })} />
                  {e.intel === 'suspected' && (
                    <NumberInput size="xs" label="SCATTER M (MARKER OFF TRUTH, UP TO)" mb={6}
                      value={e.scatter ?? 400} min={0} step={50}
                      onChange={v => onPatch({ scatter: typeof v === 'number' ? v : undefined })} />
                  )}
                </>
              )}
            </>
          )}
          <Button size="compact-xs" color="red" variant="light" mt="xs" onClick={onDelete}>
            DELETE
          </Button>
          <Text fz={8.5} c="dark.3" mt="md">
            DRAG TO MOVE · CTRL+Z UNDO · DEL REMOVES
          </Text>
        </>
      )}
    </Box>
  )
}
