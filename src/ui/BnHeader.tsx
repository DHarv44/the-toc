// The PROUD BATTALION HEADER, shared by every staff console (S1 set the
// format): the battalion's DUI leads, the staff-section plate stands tall and
// white, designation + nickname in the middle, the regimental motto in gold
// and the coat of arms anchoring the right. All of it PACK data.
import { Box, Group, Text } from '@mantine/core'
import { playerPack } from '../packs'
import { BnCrest, BnDui } from './insignia'

export default function BnHeader({ plate, sub }: { plate: string; sub: string }) {
  const pack = playerPack()
  const playerBn = pack.formation?.playerBn
  return (
    <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
      {playerBn && <BnDui bn={playerBn} h={54} title={pack.nicks?.[playerBn]} />}
      <Text fz={54} fw={700} c="#ffffff" lh={1} style={{ letterSpacing: 1 }}>{plate}</Text>
      <Box>
        <Group gap={12} align="baseline" wrap="nowrap">
          <Text fz={26} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>
            {playerBn ?? pack.abbr}
          </Text>
          {playerBn && pack.nicks?.[playerBn] && (
            <Text fz="md" fw={700} c="#d8b84a" style={{ letterSpacing: 2 }}>
              {pack.nicks[playerBn]}
            </Text>
          )}
        </Group>
        <Text fz="xs" c="dark.3" style={{ letterSpacing: 1.5 }}>{sub}</Text>
      </Box>
      {playerBn && pack.mottos?.[playerBn] && (
        <Text ml="auto" fz={54} fw={600} c="#c8a83c" lh={1} style={{ letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
          “{pack.mottos[playerBn]}”
        </Text>
      )}
      {playerBn && (
        <BnCrest bn={playerBn} motto={pack.mottos?.[playerBn]} h={54}
          kind={pack.formation?.bdes.flatMap(b => b.bns).find(b => b.desig === playerBn)?.kind} />
      )}
    </Group>
  )
}
