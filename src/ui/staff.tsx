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
import BnHeader from './BnHeader'

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

export const Th = ({ children, w, ta }: { children?: ReactNode; w?: number; ta?: 'left' | 'right' }) => (
  <Table.Th w={w} ta={ta}>
    <Text fz={10} c="dark.3" style={{ letterSpacing: 1 }}>{children}</Text>
  </Table.Th>
)

export const Td = ({ children, c = 'dark.1', ta }: {
  children?: ReactNode; c?: string; ta?: 'left' | 'right'
}) => (
  <Table.Td ta={ta}>
    <Text fz={11} c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</Text>
  </Table.Td>
)

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

export interface StaffTab {
  key: string
  label: string
  dot?: number   // unread count — draws the red bubble on the tab corner
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
export function StaffView({ shop, tabs, active, onTab, children }: {
  shop: StaffShop
  tabs?: StaffTab[]
  active?: string
  onTab?: (key: string) => void
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
      {tabs && active != null && onTab && <StaffTabs tabs={tabs} active={active} onTab={onTab} />}
      {children}
    </Box>
  )
}
