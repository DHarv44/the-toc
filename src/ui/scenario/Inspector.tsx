// The attribute inspector: every placed entity is editable here — Eden's
// grammar. Patches flow up as partial entity updates; DELETE removes.
import { Box, Button, Checkbox, NumberInput, Text, TextInput } from '@mantine/core'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import type { Entity } from '../../scenario/edit'

const MONO = 'Consolas, monospace'

export default function Inspector({ e, onPatch, onDelete }: {
  e: Entity | undefined
  onPatch: (patch: Partial<Entity>) => void
  onDelete: () => void
}) {
  return (
    <Box w={230} p="xs" style={{ borderLeft: '1px solid #22303d', overflowY: 'auto', fontFamily: MONO }}>
      <Text fz={9} c="dark.3" mb={6} style={{ letterSpacing: 1.5 }}>INSPECTOR</Text>
      {!e ? (
        <Text fz={10} c="dark.3">SELECT AN ENTITY — OR ARM A PALETTE ROW AND CLICK THE SHEET</Text>
      ) : (
        <>
          <Text fz={11} c="#dceeff" mb={6}>
            {e.ent === 'structure' ? e.kind : (UNIT_TYPES[e.type]?.name ?? e.type)}
            <Text span fz={9} c={e.side === 'friend' ? '#80c8ff' : '#ff8080'} ml={6}>
              {e.side === 'friend' ? 'BLUFOR' : 'OPFOR'}
            </Text>
          </Text>
          {e.ent === 'structure' && (
            <>
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
                <Checkbox size="xs" label="STARTS IN GARRISON" mb={6} checked={!!e.garrison}
                  onChange={ev => onPatch({ garrison: ev.currentTarget.checked || undefined })} />
              ) : (
                <TextInput size="xs" label="BATTLEGROUP TAG" value={e.tag ?? ''} mb={6}
                  placeholder="BG NORTH"
                  onChange={ev => onPatch({ tag: ev.currentTarget.value.toUpperCase() || undefined })} />
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
