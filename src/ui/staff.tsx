// STAFF CONSOLE KIT — the shared chrome every S-shop console is built from.
//
// A staff console is always the same object: the battalion header with the
// shop's plate, a row of view tabs, a body, a REQUEST <report> action, and the
// shop's reports on file. S1 set that format; everything here is that format
// extracted so S2/S3/S4/S6 inherit it instead of re-typing it.
//
// Rule: anything that appears on more than one shop's console lives HERE.
import type { ReactNode } from 'react'
import { Box, Button, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import type { StaffShop } from '../engine/GameState'
import { openReport, queueReport } from '../engine/campaign'
import { playerPack } from '../packs'
import { AWARDS, type AwardKey } from '../packs/awards'
import { Portrait } from './portrait'
import { RankIcon, RibbonIcon } from './insignia'
import BnHeader from './BnHeader'

// rank seniority — the shop's chief reads first
const RANK_W: Record<string, number> = {
  MG: 26, BG: 25, COL: 24, LTC: 23, MAJ: 22, CPT: 21, '1LT': 20, '2LT': 19,
  CW3: 18, CW2: 17, WO1: 16,
  CSM: 15, SGM: 14, MSG: 13, '1SG': 13, SFC: 12, SSG: 11, SGT: 10, CPL: 9,
  SPC: 8, PFC: 7, PVT: 6,
}
export const rankW = (r?: string): number => RANK_W[r ?? ''] ?? 0

const STATUS_COL: Record<string, string> = {
  FIT: '#7ec87e', WIA: '#e8c547', KIA: '#e8524a', MIA: '#9a7ec8',
}

const MONO = 'Consolas, monospace'

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

// small red unread bubble (tab corners, TopBar button)
export const UnreadDot = ({ n }: { n: number }) => n > 0 ? (
  <span style={{
    position: 'absolute', top: -6, right: -8, minWidth: 15, height: 15, borderRadius: 8,
    background: '#d43a3a', color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: '15px',
    textAlign: 'center', padding: '0 3px', pointerEvents: 'none',
  }}>{n}</span>
) : null

// Table cells. Mantine's Table.Th/Td are Box-based, so they take the style
// props directly — no <Text> wrapper inside every cell.
export const Th = ({ children, w, ta }: { children?: ReactNode; w?: number; ta?: 'left' | 'right' }) => (
  <Table.Th w={w} ta={ta} fz={10} c="dark.3" fw={400}>{children}</Table.Th>
)

export const Td = ({ children, c = 'dark.1', ta }: {
  children?: ReactNode; c?: string; ta?: 'left' | 'right'
}) => (
  <Table.Td ta={ta} fz={11} c={c}>{children}</Table.Td>
)

// The staff board table. One place decides how every S-shop table behaves:
// sticky header (a staff board is read while it scrolls), zebra rows and
// hover, tabular figures so columns of numbers line up. `minWidth` hands the
// scroll container something to work with when a rail eats the width.
export function StaffTable({ head, children, minWidth = 560, maw }: {
  head?: ReactNode
  children: ReactNode
  minWidth?: number
  maw?: number    // a narrow board (two columns) should not span the whole console
}) {
  return (
    <Table.ScrollContainer minWidth={minWidth} type="native" maw={maw}>
      <Table stickyHeader striped="odd" highlightOnHover withRowBorders={false}
        verticalSpacing={3} horizontalSpacing="sm"
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {head && <Table.Thead><Table.Tr>{head}</Table.Tr></Table.Thead>}
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

// a titled block with a rule under the title — the unit of layout on every
// staff console
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box mt="md">
      <Text fz="xs" c="dark.3" pb={4} style={{ letterSpacing: 2, borderBottom: '1px solid #22303d' }}>
        {title}
      </Text>
      {children}
    </Box>
  )
}

// the number every staff board leans on: a value with a caption under it
export function Metric({ label, value, c = 'dark.0' }: { label: string; value: ReactNode; c?: string }) {
  return (
    <Box>
      <Text fz={20} fw={700} c={c} lh={1.1} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
      <Text fz={9} c="dark.3" style={{ letterSpacing: 1.5 }}>{label}</Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Reports — the shop's product, through the shared pipeline
// ---------------------------------------------------------------------------

// REQUEST <REPORT>. Disabled (and counting down) while one is being prepared —
// staff work takes time, which is the point of the pipeline.
export function RequestReport({ shop }: { shop: StaffShop }) {
  const report = playerPack().staff?.[shop]?.report ?? shop.toUpperCase()
  const pending = S.campaign?.reports.pending.find(p => p.shop === shop)
  if (!S.campaign) return null
  return (
    <Button size="xs" variant="default" disabled={!!pending}
      onClick={() => queueReport(S, false, shop)}>
      {pending ? `${report} INBOUND ~${Math.max(0, Math.ceil(pending.readyT - S.t))}S` : `REQUEST ${report}`}
    </Button>
  )
}

// This shop's reports on file, newest first, unread flagged. Click opens it
// (first open is the call, afterwards the document).
export function ReportList({ shop, empty }: { shop: StaffShop; empty?: string }) {
  const info = playerPack().staff?.[shop]
  const report = info?.report ?? shop.toUpperCase()
  if (!S.campaign) return <Text fz="sm" c="dark.3" p="md">STAFF REPORTS RUN IN THE CAMPAIGN.</Text>
  const logs = S.campaign.reports.log.filter(e => e.shop === shop)
  if (logs.length === 0) {
    return <Text fz="sm" c="dark.3" p="md">{empty ?? `NO ${report}S ON FILE — REQUEST ONE, OR COMPLETE A MISSION.`}</Text>
  }
  return (
    <>
      {[...logs].reverse().map(e => (
        <UnstyledButton key={e.id} w="100%" onClick={() => openReport(S, e.id)}>
          <Group gap={10} wrap="nowrap" px={12} py={8}
            style={{ borderTop: '1px solid #141e28' }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = '#101a24' }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, flex: '0 0 auto',
              background: e.read ? '#22303d' : '#d43a3a',
            }} />
            <Text span fz="md" fw={e.read ? 500 : 700} c={e.read ? '#9ab8d0' : '#dceeff'}>{e.title}</Text>
            <Text span fz="xs" c="dark.3">
              {shop.toUpperCase()} · {(info?.name ?? '').toUpperCase()}
            </Text>
            <Text span fz="xs" c="dark.3" ml="auto">{e.read ? 'READ' : 'UNREAD'}</Text>
          </Group>
        </UnstyledButton>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// The console itself
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The section that runs the console
// ---------------------------------------------------------------------------

// Who is actually on this desk. Every shop opens with its own people —
// names, faces, and what shape they are in — before any of its data, because
// a staff product is only ever as good as the section that produced it. The
// shop's REQUEST action lives here too: you ask the SECTION for the report.
export function ShopSection({ shop, children }: { shop: StaffShop; children?: ReactNode }) {
  const pack = playerPack()
  const bn = pack.formation?.playerBn
  const info = pack.staff?.[shop]
  const key = shop.toUpperCase()
  const crew = (S.org?.slots ?? [])
    .filter(sl => sl.bn === bn && (sl.name === 'BN STAFF' || sl.name === 'SQDN STAFF' || sl.name === 'FIRES CELL'))
    .flatMap(sl => sl.soldiers.filter(s => s.pos?.startsWith(key)))
    .sort((a, b) => rankW(b.rank) - rankW(a.rank))
  return (
    <>
      <Group gap={10} wrap="nowrap" px={10} py={7} justify="space-between"
        style={{ borderTop: '1px solid #141e28' }}>
        <Group gap={10} wrap="nowrap">
          <Text span fz="md" fw={600} c="#9fd0f5">YOUR {key} SECTION — {bn}</Text>
          <Text span fz="xs" c="dark.3">
            {(info?.name ?? '').toUpperCase()} — THE SHOP RUNNING THIS CONSOLE
          </Text>
        </Group>
        <RequestReport shop={shop} />
      </Group>
      {crew.length === 0 && (
        <Text fz="sm" c="dark.3" px={12} py={10}>NO {key} SECTION ON THE ROSTER.</Text>
      )}
      <Group gap="md" px={12} py={10} align="stretch" wrap="wrap">
        {crew.map(s => (
          <Group key={s.pid ?? s.id} gap={12} wrap="nowrap" p={12}
            style={{ border: '1px solid #22303d', borderRadius: 4, background: '#0d141c', minWidth: 340 }}>
            <Portrait seed={s.pid ?? `s:${s.id}`} kia={s.status === 'KIA'} w={44} h={54} />
            <Box>
              <Group gap={8} wrap="nowrap" align="center">
                <RankIcon rank={s.rank} style={pack.rankStyle} h={18} />
                <Text span fz="md" fw={700} c="#dceeff">{s.rank} {s.name}</Text>
              </Group>
              <Text fz="sm" c="#9ab8d0">{s.pos}</Text>
              <Group gap={8} wrap="nowrap" align="center">
                <Text span fz="xs" fw={700} c={STATUS_COL[s.status] ?? '#9ab8d0'}>{s.status}</Text>
                {(s.xp ?? 0) > 0 && (
                  <Text span fz="xs" c="dark.3">COMBAT TIME {Math.round((s.xp ?? 0) / 60)} MIN</Text>
                )}
                {(s.awards ?? []).map(k => {
                  const a = AWARDS[k as AwardKey]
                  return a ? <span key={k} title={a.name}><RibbonIcon stripes={a.ribbon} /></span> : null
                })}
              </Group>
            </Box>
          </Group>
        ))}
      </Group>
      {children}
    </>
  )
}

export interface StaffTab {
  key: string
  label: string
  dot?: number    // unread count — draws the red bubble on the tab corner
  right?: boolean // pushed to the far end of the strip (the reports tab)
}

export function StaffTabs({ tabs, active, onTab }: {
  tabs: StaffTab[]
  active: string
  onTab: (key: string) => void
}) {
  return (
    <Group gap={6} pt={12}>
      {tabs.map(t => (
        <UnstyledButton key={t.key} onClick={() => onTab(t.key)} px={16} py={6}
          ml={t.right ? 'auto' : undefined}
          style={{
            position: 'relative',
            border: `1px solid ${active === t.key ? '#3d5a75' : '#22303d'}`,
            background: active === t.key ? '#101c28' : 'transparent',
            borderRadius: '3px 3px 0 0',
          }}>
          <Text span fz="sm" fw={700} c={active === t.key ? '#7ec8ff' : '#54708a'}
            style={{ letterSpacing: 1.5 }}>
            {t.label}
          </Text>
          {t.dot != null && <UnreadDot n={t.dot} />}
        </UnstyledButton>
      ))}
    </Group>
  )
}

// The console shell: full-bleed over the map column, the shop's proud header
// from PACK data, and its view tabs. Everything human-facing (plate, name,
// report name, the about blurb) comes from the pack — a different army's staff
// reads as that army's staff with no code change.
export function StaffView({ shop, tabs, active, onTab, section, children }: {
  shop: StaffShop
  tabs?: StaffTab[]
  active?: string
  onTab?: (key: string) => void
  section?: ReactNode   // shop-specific extras under its section (S1's div chain)
  children: ReactNode
}) {
  const pack = playerPack()
  const info = pack.staff?.[shop]
  return (
    <Box pos="absolute" inset={0} p="lg"
      style={{
        zIndex: 40, overflow: 'auto', background: 'rgba(8,11,15,0.985)',
        fontFamily: MONO, userSelect: 'none',
      }}>
      <BnHeader plate={info?.label ?? shop.toUpperCase()}
        sub={`${(info?.name ?? '').toUpperCase()} · ${pack.name.toUpperCase()}`}
        about={info} />
      {/* the section first, then its tabs — who is on the desk, then the desk */}
      <ShopSection shop={shop}>{section}</ShopSection>
      {tabs && active != null && onTab && <StaffTabs tabs={tabs} active={active} onTab={onTab} />}
      {children}
    </Box>
  )
}
