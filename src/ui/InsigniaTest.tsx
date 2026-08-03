// TEMP dev gallery: the pack patch + every rank insignia + portrait samples,
// reachable at /?insignia — for eyeballing the art without clicking into a
// campaign. Not linked from any UI; safe to delete when the art settles.
import { Box, Group, Stack, Text } from '@mantine/core'
import { PatchIcon, RankIcon } from './insignia'
import { playerPack } from '../packs'
import { Portrait } from './portrait'

// the WHOLE ladder the pack ships, in its own order — a sandbox that hand-lists
// ranks stops showing the ones a pack adds, which is the bug this page exists
// to catch
const RANKS = (playerPack().ranks ?? []).map(r => r.key)

export default function InsigniaTest() {
  return (
    <Box p="xl" style={{ minHeight: '100vh', background: '#0a0e13', fontFamily: 'Consolas, monospace' }}>
      <Text fz="xl" fw={700} c="#dceeff" mb="lg" style={{ letterSpacing: 3 }}>INSIGNIA TEST PAGE (TEMP)</Text>

      <Text fz="sm" c="dark.2" mb="xs" style={{ letterSpacing: 2 }}>PATCH — 1CD (sizes 24 / 38 / 64 / 128)</Text>
      <Group gap="xl" align="flex-end" mb="xl">
        {[24, 38, 64, 128].map(h => <PatchIcon key={h} id="1cd" h={h} />)}
      </Group>

      <Text fz="sm" c="dark.2" mb="xs" style={{ letterSpacing: 2 }}>RANK INSIGNIA — US (h=15 row scale and h=34 large)</Text>
      <Group gap="lg" mb="md" wrap="wrap">
        {RANKS.map(r => (
          <Stack key={r} gap={2} align="center">
            <RankIcon rank={r} h={15} />
            <Text fz={9} c="dark.2">{r}</Text>
          </Stack>
        ))}
      </Group>
      <Group gap="lg" mb="xl" wrap="wrap">
        {RANKS.map(r => (
          <Stack key={r} gap={2} align="center">
            <RankIcon rank={r} h={34} />
            <Text fz={10} c="dark.1">{r}</Text>
          </Stack>
        ))}
      </Group>

      <Text fz="sm" c="dark.2" mb="xs" style={{ letterSpacing: 2 }}>PORTRAIT FACTORY — 24 hash seeds (last one KIA)</Text>
      <Group gap="sm" wrap="wrap">
        {Array.from({ length: 24 }, (_, i) => (
          <Portrait key={i} seed={`test:${i}`} w={42} h={51} kia={i === 23} />
        ))}
      </Group>
    </Box>
  )
}
