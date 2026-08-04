// Shared furniture for the pack builder's editable tabs — the save control and
// the badge that says HOW a catalog table is authored. Both were about to be
// written a third time, and the badge especially needs to say the same thing
// everywhere: whether you are editing this pack's own content or looking at
// somebody else's.
import { Badge, Box, Button, Group, Text } from '@mantine/core'
import { canAuthor } from '../packs/io'
import type { Pack } from '../packs/types'
import type { CatalogForm, ManifestEditor } from './usePackManifest'

/** Shown only while a manifest is genuinely absent — dev, mid-read, or a read
 *  that failed. A BUILT game is NOT this case: the army is in the bundle, so
 *  the tabs render it (usePackManifest falls back to the built pack) and the
 *  banner below just explains why nothing can be typed into it. */
export function ManifestNotice({ ed }: { ed: ManifestEditor }) {
  if (ed.manifest) return null
  return <Text fz="sm" c={ed.msg ? '#e8524a' : 'dark.3'} p="md">{ed.msg ?? 'READING pack.json…'}</Text>
}

/** One line above the tab content in a built game. The content is all there —
 *  it just cannot be written, because the write path is a dev-only middleware. */
export function ReadOnlyBanner() {
  if (canAuthor) return null
  return (
    <Group gap={8} mb={10} p={8}
      style={{ border: '1px solid #2a3a48', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }}>
      <Badge size="sm" variant="outline" color="gray">READ ONLY</Badge>
      <Text fz={15} c="dark.3">
        Showing the pack AS RESOLVED — inheritance already applied, which is not the same as
        what its pack.json says. Editing writes files through the dev server; run the project
        locally to change anything.
      </Text>
    </Group>
  )
}

export function SaveBar({ ed }: { ed: ManifestEditor }) {
  if (!canAuthor) return null
  return (
    <Group gap={10} mt="lg" pt={12} style={{ borderTop: '1px solid #22303d' }}>
      <Button size="sm" variant={ed.dirty ? 'filled' : 'default'}
        disabled={!ed.dirty || ed.busy} onClick={() => void ed.save()}>
        {ed.busy ? 'SAVING…' : 'SAVE TO pack.json'}
      </Button>
      {ed.msg && (
        <Text fz={15} c={ed.msg.startsWith('FAILED') ? '#e8524a' : '#7ec87e'}>{ed.msg}</Text>
      )}
    </Group>
  )
}

/** WHERE THIS TABLE COMES FROM, said plainly at the top of the tab. */
export function SourceBadge({ form, lib, p, count }: {
  form: CatalogForm; lib?: string; p: Pack; count?: number
}) {
  // in a built game the tables come from the RESOLVED pack, so "own" would be
  // a lie — a subsetted table looks like its own once inheritance is applied
  if (!canAuthor) {
    return (
      <Group gap={8} mb={10}>
        <Badge size="sm" variant="outline" color="gray">RESOLVED</Badge>
        {count != null && <Text fz={15} c="#9ab8d0">{count} ENTR{count === 1 ? 'Y' : 'IES'}</Text>}
      </Group>
    )
  }
  if (form === 'own') {
    return (
      <Group gap={8} mb={10}>
        <Badge size="sm" variant="outline" color="green">OWN TABLE</Badge>
        {count != null && (
          <Text fz={15} c="#9ab8d0">{count} ENTR{count === 1 ? 'Y' : 'IES'}</Text>
        )}
      </Group>
    )
  }
  if (form === 'subset') {
    return (
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="blue">SUBSET</Badge>
        <Text fz={15} c="#9ab8d0">of the '{lib}' library</Text>
      </Group>
    )
  }
  return (
    <Group gap={8} mb={6}>
      <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
      <Text fz={15} c="#9ab8d0">
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
