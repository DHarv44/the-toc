// The PROUD HEADER, shared by every staff console and staff document (S1 set
// the format): insignia leads, the staff-section plate stands tall and white,
// designation + nickname in the middle, the motto in gold and the coat of
// arms anchoring the right. All of it PACK data.
//
// Two identities: the battalion (default — DUI, bn designation, regimental
// motto, coat of arms) and the DIVISION (`division` — SSI patch, formation
// name, division motto) for DIV HQ products like the VTC deck. Two tones:
// 'dark' for consoles/VTC chrome, 'paper' for printed report documents.
// The shop's charter (`about`) hangs off the sub line as a hover card — the
// short and long descriptions live there, not in the sub title.
import { Box, Group, HoverCard, Text } from '@mantine/core'
import { playerPack } from '../packs'
import type { StaffSection } from '../packs/types'
import { walkFormation } from '../packs/types'
import { BnCrest, BnDui, PatchIcon } from './insignia'

const TONES = {
  dark: {
    plate: '#ffffff', desig: '#dceeff', nick: '#d8b84a', sub: '#54708a',
    motto: '#c8a83c', border: '2px solid #2a3a48',
  },
  paper: {
    plate: '#1a1a18', desig: '#2c2c28', nick: '#8a6a1f', sub: '#6a665c',
    motto: '#8a6a1f', border: '2px solid #b8b09e',
  },
} as const

export default function BnHeader({ plate, sub, about, division, tone = 'dark' }: {
  plate: string
  sub?: string
  about?: StaffSection         // the shop's charter — desc/detail on hover
  division?: boolean           // DIV HQ identity instead of the battalion's
  tone?: keyof typeof TONES
}) {
  const pack = playerPack()
  const t = TONES[tone]
  const playerBn = division ? undefined : pack.formation?.chair
  const desig = division ? pack.abbr : playerBn ?? pack.abbr
  const nick = division ? pack.nick : playerBn ? pack.nicks?.[playerBn] : undefined
  const motto = division ? pack.motto : playerBn ? pack.mottos?.[playerBn] : undefined
  return (
    <Group gap="md" align="center" pb={12} style={{ borderBottom: t.border }}>
      {division
        ? <PatchIcon id={pack.patch} h={54} />
        : playerBn && <BnDui bn={playerBn} h={54} title={pack.nicks?.[playerBn]} />}
      {/* hovering the plate itself opens the shop's charter — no extra icon */}
      {about ? (
        <HoverCard width={420} withArrow shadow="md" openDelay={150}>
          <HoverCard.Target>
            <Text fz={54} fw={700} c={t.plate} lh={1} style={{ letterSpacing: 1, cursor: 'help' }}>
              {plate}
            </Text>
          </HoverCard.Target>
          <HoverCard.Dropdown bg="dark.8" style={{ border: '1px solid #2a3a48' }}>
            <Text fz="sm" fw={700} c="#dceeff" style={{ letterSpacing: 1 }}>
              {about.full.toUpperCase()}
            </Text>
            <Text fz={10} c="#d8b84a" pb={6} style={{ letterSpacing: 1.5 }}>
              {about.desc.toUpperCase()}
            </Text>
            <Text fz="xs" c="dark.1" style={{ lineHeight: 1.55 }}>{about.detail}</Text>
          </HoverCard.Dropdown>
        </HoverCard>
      ) : (
        <Text fz={54} fw={700} c={t.plate} lh={1} style={{ letterSpacing: 1 }}>{plate}</Text>
      )}
      <Box>
        <Group gap={12} align="baseline" wrap="nowrap">
          <Text fz={26} fw={700} c={t.desig} lh={1.1} style={{ letterSpacing: 3 }}>
            {desig}
          </Text>
          {nick && (
            <Text fz="md" fw={700} c={t.nick} style={{ letterSpacing: 2 }}>
              {nick.toUpperCase()}
            </Text>
          )}
        </Group>
        {sub && <Text fz="xs" c={t.sub} style={{ letterSpacing: 1.5 }}>{sub}</Text>}
      </Box>
      {motto && (
        <Text ml="auto" fz={54} fw={600} c={t.motto} lh={1} style={{ letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
          “{motto}”
        </Text>
      )}
      {playerBn && (
        <BnCrest bn={playerBn} motto={pack.mottos?.[playerBn]} h={54}
          kind={walkFormation(pack.formation).find(w => w.node.desig === playerBn)?.node.kind} />
      )}
    </Group>
  )
}
