// THE SHELL EVERY STAFF CONSOLE SITS IN — and the reason the map stops
// vanishing when you read one.
//
// S1, the S2/S3/S4 board, the command dashboard and the pack viewer each drew
// their own `position:absolute; inset:0` over the map area. Four copies of one
// idea, and the idea was wrong: reading a LOGSTAT cost you the common
// operational picture entirely. A real operations centre has the S4's board on
// one screen and the COP on another; trading one for the other is the single
// most un-TOC thing this interface did.
//
// So a console has two states, and DOCKED is the default:
//
//   WALL  a real column on the left, at a width you drag. The map narrows.
//         This is how a console is normally read — beside the fight, not
//         instead of it.
//
//   FULL  the whole viewport under the top bar, rails included. For when the
//         document IS the work: writing a movement order, reading a PERSTAT
//         end to end. One button back to the wall.
//
// It is one shell so the two states cannot drift apart, and so a fifth console
// gets them for free.
import type { ReactNode } from 'react'
import { Box, Group, ActionIcon, Text } from '@mantine/core'
import { FZ, TOPBAR_H } from '../styles'
import { TUT } from '../tutTargets'
import { useUI } from '../store'
import Column from '../shell/Column'

export default function ConsolePanel({ title, children }: {
  title?: ReactNode
  children: ReactNode
}) {
  const ui = useUI()
  const full = ui.consoleFull

  const icon = { fontSize: FZ.body, lineHeight: 1 }
  const controls = (
    <Group gap={3} wrap="nowrap" style={{ flex: '0 0 auto' }}>
      <ActionIcon size="md" variant="default" style={icon}
        title={full ? 'Dock to the left wall' : 'Fill the screen'}
        onClick={() => ui.setConsoleFull(!full)}>{full ? '❐' : '▢'}</ActionIcon>
      <ActionIcon size="md" variant="default" style={icon} title="Close"
        data-tut={TUT.consoleClose} onClick={() => ui.setConsole(null)}>×</ActionIcon>
    </Group>
  )

  const body = (
    <>
      {/* the window controls ride the top-right of the pane in both states */}
      <Group justify="space-between" wrap="nowrap" px="sm" py={5}
        style={{
          flex: '0 0 auto', position: full ? 'sticky' : 'relative', top: 0, zIndex: 2,
          background: 'rgba(8,11,15,0.99)', borderBottom: '1px solid var(--mantine-color-dark-5)',
        }}>
        <Text span fz={FZ.hint} c="dark.3" style={{ letterSpacing: 1.4, whiteSpace: 'nowrap' }}>
          {title}
        </Text>
        {controls}
      </Group>
      <Box style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: full ? 24 : 12 }}>
        {children}
      </Box>
    </>
  )

  if (full) {
    return (
      <Box style={{
        // the whole screen under the top bar — over the rails, not inside them
        position: 'fixed', left: 0, top: TOPBAR_H, right: 0, bottom: 0, zIndex: 60,
        background: 'rgba(8,11,15,0.985)', overflow: 'auto',
        fontFamily: 'Consolas, "Courier New", monospace', userSelect: 'none',
      }}>{body}</Box>
    )
  }
  // docked: ui/shell/Column owns the geometry and the drag, same as the rails
  // and the team stations
  return (
    <Column side="left" width={ui.consoleW} setWidth={ui.setConsoleW}
      style={{
        background: 'rgba(8,11,15,0.985)', userSelect: 'none',
        fontFamily: 'Consolas, "Courier New", monospace',
      }}>{body}</Column>
  )
}
