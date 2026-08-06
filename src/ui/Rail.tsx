// Shared chrome for the side rails, JBC-P style: a vertical tab strip that is
// ALWAYS visible and is the panel's only toggle. Collapsed = just the strip;
// expanded = strip + the panel beside it (strip on the screen-edge side, so the
// tabs hold their positions). No title bar inside the panel — the strip IS the
// title. Hand-rolled rather than Mantine's AppShell so the map column stays a
// plain flex child we control.
import type { ReactNode } from 'react'
import { Box, Group, Stack, Text, ScrollArea, UnstyledButton, Tooltip } from '@mantine/core'
import { RAIL_W } from './styles'
import { useUI } from './store'
import { S } from '../engine/state'
import { underPlayerCommand } from '../domains/forces/command'
import { teamUnits } from '../domains/forces/teams'
import { marchPlan } from '../domains/movement/march'
import { playerPack } from '../packs'
import { unreadReports } from '../engine/campaign'
import { groupState, groupStrength } from './forces/state'
import Column from './shell/Column'

// The tab itself — exported so FeedsPanel (custom width/resize) can share it.
export function RailStrip({ side, title, open, onToggle, tut, tone, mark, hint }: {
  side: 'left' | 'right'
  title: string
  open: boolean
  onToggle: () => void
  tut?: string    // the strip is ALWAYS on screen, so it is the tutorial's
                  // only reliable handle on a rail that is tucked away
  /** A STATUS DOT ON THE TAB. Teams used to sit in the bottom bar wearing
   *  their state, strength and drill; they are tabs now, and a tab that says
   *  only a name would have quietly cost the commander the one board that
   *  answered "where is everybody" without opening anything. The dot carries
   *  the state, and `mark` carries the exception — an element off its team's
   *  ordered drill, which is the thing a TOC most needs to notice. */
  tone?: string
  mark?: boolean
  hint?: string   // replaces the show/hide tooltip when a tab has more to say
}) {
  const icon = side === 'left' ? (open ? '◀' : '▶') : (open ? '▶' : '◀')
  return (
    <Tooltip label={hint ?? `${open ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
      position={side === 'left' ? 'right' : 'left'} withArrow multiline={!!hint}>
      <UnstyledButton data-tut={tut} onClick={onToggle} w={RAIL_W.strip}
        style={{
          flex: '0 0 auto', paddingBottom: 10, borderRadius: 2,
          // A TAB HAS TO LOOK LIKE ITS OWN TARGET. Two of these sit against
          // each other on the same edge, and drawn as flush panes of the same
          // colour they read as one strip with two words on it — which is
          // exactly how you end up opening COMMAND when you meant FORCES.
          background: open ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-dark-7)',
          // ALL LONGHAND. `border` plus a borderXWidth override is a shorthand
          // fighting a longhand for the same value, which React warns about and
          // which resolves differently depending on which one it applies last.
          borderStyle: 'solid',
          borderColor: open ? 'var(--mantine-color-toc-7)' : 'var(--mantine-color-dark-5)',
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderLeftWidth: side === 'left' ? 0 : 1,
          borderRightWidth: side === 'left' ? 1 : 0,
        }}>
        <Stack gap="xs" align="center" pt="xs">
          <Text span fz={11} c={open ? 'toc.3' : 'dark.2'}>{icon}</Text>
          {tone && (
            <Box style={{
              width: 7, height: 7, borderRadius: 4, background: tone, marginTop: -2,
              // the exception gets a ring rather than a second dot: two marks in
              // a 34 px strip stop being distinguishable at a glance
              boxShadow: mark ? '0 0 0 2px #e0b34e' : undefined,
            }} />
          )}
          <Text span fz="lg" fw={700} c={open ? 'toc.3' : 'dark.3'}
            style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>
            {title}
          </Text>
        </Stack>
      </UnstyledButton>
    </Tooltip>
  )
}

/** THE TAB COLUMN — pinned to the screen edge, and it never moves.
 *
 *  The tabs used to ride each panel's INBOARD edge, on the theory that the
 *  handle you pulled should stay on the hand that pulled it. It does not: two
 *  rails share this edge, so opening COMMAND inserted its panel ahead of both
 *  tabs and slid FORCES two hundred and seventy pixels to the right. The tab
 *  you were aiming at moved because you opened the one next to it.
 *
 *  A drawer handle that relocates when you pull it is broken. So every tab for
 *  a side lives in one fixed column against the screen edge, and the panels
 *  open inboard of it. Nothing a player can do moves a tab now, which is the
 *  whole point of a tab.
 *
 *  It reads the store itself rather than taking props: the app shell would
 *  otherwise re-render at the UI pump's 10 Hz just to keep two chevrons right. */
interface TabDef {
  title: string
  open: boolean
  onToggle: () => void
  tone?: string
  mark?: boolean
  hint?: string
}

export function RailTabs({ side }: { side: 'left' | 'right' }) {
  const ui = useUI()
  // THE TEAMS ARE TABS. The right wall is the SITUATION side, and a team is the
  // situation the commander spends the most time inside — so every formed team
  // gets a handle here, permanently, in the order it was formed. Formation
  // order rather than alphabetical for the same reason the task org bar uses
  // it: the control-group number is muscle memory and must not move because
  // another team was renamed. The digit is on the tab so the two agree.
  //
  // FEEDS and NET stay ABOVE them. They always exist, so pinning them at the
  // top means the two tabs the player has had since the first minute never
  // shift when a team is formed underneath.
  const teams: TabDef[] = side === 'right'
    ? S.teams
      .map(t => ({ t, list: teamUnits(t).filter(underPlayerCommand) }))
      .filter(x => x.list.length > 0)
      .map(({ t, list }, i) => {
        const st = groupState(list, t.id)
        const str = groupStrength(list)
        const plan = marchPlan(t.id)
        return {
          // 'TEAM BRAVO' down a 34 px strip, nine times, is the word TEAM nine
          // times. The stem is what distinguishes them and the digit is how
          // they are actually reached.
          title: `${i < 9 ? `${i + 1} ` : ''}${t.name.replace(/^TEAM\s+/, '')}`,
          open: ui.stations.includes(t.id),
          onToggle: () => ui.toggleStation(t.id),
          tone: st.tone,
          mark: !!plan?.roe && list.some(u => u.roe !== plan.roe),
          hint: `${t.name} — ${list.length} elements · ${str}% · ${st.text}`,
        }
      })
    : []
  // THE STAFF ARE TABS TOO. The S-shops were four buttons in the top bar —
  // beside the mute control and the clock — which put "read the personnel
  // status report" in the same row as "turn the sound off". They are panels,
  // they open on the left, and this is where the left's panels are opened
  // from. The tab lights while its board is up, so the column also says which
  // one is covering the map.
  //
  // Built from the PACK's staff data: a different army's staff, different tabs.
  const shops: TabDef[] = side === 'left'
    ? (['s1', 's2', 's3', 's4'] as const).map(k => {
        const info = playerPack().staff?.[k]
        const n = unreadReports(S, k)
        return {
          title: `${info?.label ?? k.toUpperCase()}${n ? ` (${n})` : ''}`,
          open: ui.console === k,
          onToggle: () => {
            // unread S1 traffic routes straight to what the alert is for
            if (k === 's1' && unreadReports(S, 's1') > 0) ui.openS1('perstats')
            else ui.setConsole(ui.console === k ? null : k)
          },
          hint: `${info?.full ?? k.toUpperCase()}${info?.desc ? ` — ${info.desc}` : ''}`,
          ...(n ? { tone: '#e0b34e' } : {}),
        }
      })
    : []
  const tabs: TabDef[] = side === 'left'
    ? [
        { title: 'COMMAND', open: ui.leftOpen, onToggle: ui.toggleLeft },
        { title: 'GARRISON', open: ui.bgOpen, onToggle: ui.toggleBg },
        ...shops,
      ]
    : [
        { title: `FEEDS${ui.feeds.length ? ` (${ui.feeds.length})` : ''}`, open: ui.feedsOpen, onToggle: ui.toggleFeeds },
        { title: 'JBC-P NET', open: ui.netOpen, onToggle: ui.toggleNet },
        ...teams,
      ]
  return (
    <Box style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 6,
      // a battalion can hold more teams than a screen has room for tabs; the
      // column scrolls rather than crushing them
      minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
      background: 'var(--mantine-color-dark-9)',
    }}>
      {tabs.map(t => (
        <RailStrip key={t.title} side={side} title={t.title}
          open={t.open} onToggle={t.onToggle}
          tone={t.tone} mark={t.mark} hint={t.hint} />
      ))}
    </Box>
  )
}

export default function Rail({ side, title, width, open, onToggle, footer, tut, children }: {
  side: 'left' | 'right'
  title: string
  width: number
  open: boolean
  onToggle: () => void
  footer?: ReactNode
  tut?: string
  children?: ReactNode
}) {
  // The tab lives in the edge column (RailTabs) — a rail that is shut renders
  // nothing at all now, because its handle is not its own to draw.
  void title; void onToggle; void tut
  if (!open) return null

  // geometry is ui/shell/Column's — this adds what a RAIL is: a scrolling body
  // and an optional pinned footer. Fixed width for now; it joins the resizable
  // ones when the consoles do.
  return (
    <Column side={side} width={width} style={{ background: 'var(--mantine-color-dark-7)' }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={6} type="hover">
        {children}
      </ScrollArea>
      {footer && (
        <Box px="xs" py={6} style={{
          flex: '0 0 auto', borderTop: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-8)',
        }}>{footer}</Box>
      )}
    </Column>
  )
}

// Section label used inside a rail: caption plus a fading rule.
export function RailSection({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <Box>
      <Group gap={6} wrap="nowrap" align="center" mt={9} mb={3} mx="xs">
        <Text span fz={9.5} c="dark.3" tt="uppercase" style={{ letterSpacing: 1.8 }}>{label}</Text>
        <Box style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,var(--mantine-color-dark-4),transparent)' }} />
      </Group>
      {children}
    </Box>
  )
}
