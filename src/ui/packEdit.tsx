// Shared furniture for the pack builder's editable tabs — the save control and
// the badge that says HOW a catalog table is authored. Both were about to be
// written a third time, and the badge especially needs to say the same thing
// everywhere: whether you are editing this pack's own content or looking at
// somebody else's.
import { Badge, Button, Group, Text } from '@mantine/core'
import type { Pack } from '../packs/types'
import type { CatalogForm, ManifestEditor } from './usePackManifest'

export function SaveBar({ ed }: { ed: ManifestEditor }) {
  return (
    <Group gap={10} mt="lg" pt={12} style={{ borderTop: '1px solid #22303d' }}>
      <Button size="xs" variant={ed.dirty ? 'filled' : 'default'}
        disabled={!ed.dirty || ed.busy} onClick={() => void ed.save()}>
        {ed.busy ? 'SAVING…' : 'SAVE TO pack.json'}
      </Button>
      {ed.msg && (
        <Text fz={10} c={ed.msg.startsWith('FAILED') ? '#e8524a' : '#7ec87e'}>{ed.msg}</Text>
      )}
    </Group>
  )
}

/** WHERE THIS TABLE COMES FROM, said plainly at the top of the tab. */
export function SourceBadge({ form, lib, p, count }: {
  form: CatalogForm; lib?: string; p: Pack; count?: number
}) {
  if (form === 'own') {
    return (
      <Group gap={8} mb={10}>
        <Badge size="sm" variant="outline" color="green">OWN TABLE</Badge>
        {count != null && (
          <Text fz={11} c="#9ab8d0">{count} ENTR{count === 1 ? 'Y' : 'IES'}</Text>
        )}
      </Group>
    )
  }
  if (form === 'subset') {
    return (
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="blue">SUBSET</Badge>
        <Text fz={11} c="#9ab8d0">of the '{lib}' library</Text>
      </Group>
    )
  }
  return (
    <Group gap={8} mb={6}>
      <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
      <Text fz={11} c="#9ab8d0">
        {lib ? `from the '${lib}' library` : `from ${p.inherits ?? 'the canonical pack'}`}
      </Text>
    </Group>
  )
}

/** The sentence that belongs under a SUBSET badge, everywhere. */
export const SUBSET_NOTE =
  'This pack picks which library entries it fields. The entries themselves belong to the '
  + 'library and are shared by reference with every pack that draws on it, so they cannot be '
  + 'edited here — changing one would rearm somebody else’s army.'
