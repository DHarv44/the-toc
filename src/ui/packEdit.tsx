// Shared furniture for the pack builder's editable tabs — the save control and
// the badge that says HOW a catalog table is authored. Both were about to be
// written a third time, and the badge especially needs to say the same thing
// everywhere: whether you are editing this pack's own content or looking at
// somebody else's.
import { Badge, Box, Button, Group, Text } from '@mantine/core'
import { canAuthor } from '../packs/io'
import type { Pack } from '../packs/types'
import type { CatalogForm, ManifestEditor } from './usePackManifest'

/** WHY AN EDITING TAB HAS NOTHING TO EDIT. The write path is a dev-only Vite
 *  middleware, so a BUILT game cannot author — and saying that plainly is the
 *  whole job here. Shipped, this used to surface as
 *  "Unexpected token '<'" because the request fell through to the SPA and the
 *  UI tried to parse index.html as a manifest. */
export function ManifestNotice({ ed }: { ed: ManifestEditor }) {
  if (ed.manifest) return null
  if (canAuthor) {
    return <Text fz="sm" c={ed.msg ? '#e8524a' : 'dark.3'} p="md">{ed.msg ?? 'READING pack.json…'}</Text>
  }
  return (
    <Box maw={620} p={14} style={{ border: '1px solid #2a3a48', borderRadius: 3 }}>
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="gray">READ ONLY</Badge>
        <Text fz={11} c="#9ab8d0">this is a built game</Text>
      </Group>
      <Text fz={10} c="dark.3" style={{ lineHeight: 1.7 }}>
        Pack authoring writes files through the dev server, which a shipped build does not
        have — it reads packs, it does not write them. Run the project locally to edit
        content. Every tab that only DISPLAYS a pack works here as normal.
      </Text>
    </Box>
  )
}

export function SaveBar({ ed }: { ed: ManifestEditor }) {
  if (!canAuthor) return null
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
