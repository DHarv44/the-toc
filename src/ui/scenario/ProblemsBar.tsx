// THE PROBLEMS BAR — a strip under the sheet that opens into the list.
//
// This is Unreal's Message Log and Unity's console: one place where everything
// wrong with the document is written down, and every line is a jump to the
// thing that is wrong. It replaces two truncating chips in the toolbar that
// could not finish a sentence.
//
// Collapsed it is one line, so a clean document costs nothing. It only insists
// when there are errors — the count goes red and the strip stays visible.
import { useState } from 'react'
import { Box, Group, Text } from '@mantine/core'
import type { Problem } from './problems'
import type { Sel } from '../../scenario/edit'
import { DATA_FONT, INK, UI_FONT } from './panel'

export default function ProblemsBar({ problems, onGo }: {
  problems: Problem[]
  onGo: (s: Sel) => void
}) {
  const [open, setOpen] = useState(false)
  const errors = problems.filter(p => p.level === 'error').length
  const warns = problems.length - errors

  return (
    <Box style={{
      borderTop: `1px solid ${INK.line}`, background: '#0c1218', flex: '0 0 auto',
      maxHeight: open ? '38%' : undefined, display: 'flex', flexDirection: 'column',
    }}>
      <Group gap={10} px={12} py={5} wrap="nowrap"
        style={{ cursor: 'pointer', flex: '0 0 auto' }}
        onClick={() => setOpen(v => !v)}>
        <Text style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.dim }}>
          {open ? '▾' : '▸'} Problems
        </Text>
        {errors > 0 && (
          <Text style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.bad }}>
            {errors} error{errors === 1 ? '' : 's'}
          </Text>
        )}
        {warns > 0 && (
          <Text style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.warn }}>
            {warns} warning{warns === 1 ? '' : 's'}
          </Text>
        )}
        {problems.length === 0 && (
          <Text style={{ fontFamily: UI_FONT, fontSize: 12, color: '#5f8a6b' }}>
            Nothing wrong
          </Text>
        )}
        <Box style={{ flex: 1 }} />
        {!open && problems[0] && (
          <Text truncate style={{
            fontFamily: UI_FONT, fontSize: 12, maxWidth: 460,
            color: problems[0].level === 'error' ? INK.bad : INK.warn,
          }}>
            {problems[0].text}
          </Text>
        )}
      </Group>

      {open && (
        <Box style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {problems.length === 0 && (
            <Text px={12} py={6} style={{
              fontFamily: UI_FONT, fontSize: 12, color: INK.dim,
            }}>
              Every place resolves, every trigger does something, and the ruleset
              has what it judges on.
            </Text>
          )}
          {problems.map((p, i) => (
            <Group key={i} gap={10} px={12} py={4} wrap="nowrap"
              style={{ cursor: p.at ? 'pointer' : 'default' }}
              onMouseEnter={ev => { ev.currentTarget.style.background = '#141c24' }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
              onClick={() => p.at && onGo(p.at)}>
              <Text style={{
                fontFamily: UI_FONT, fontSize: 12, flex: '0 0 auto',
                color: p.level === 'error' ? INK.bad : INK.warn,
              }}>
                {p.level === 'error' ? '✕' : '⚠'}
              </Text>
              <Text style={{
                fontFamily: DATA_FONT, fontSize: 11.5, color: INK.dim,
                flex: '0 0 130px', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {p.where}
              </Text>
              <Text style={{ fontFamily: UI_FONT, fontSize: 12.5, color: INK.value, flex: 1 }}>
                {p.text}
              </Text>
            </Group>
          ))}
        </Box>
      )}
    </Box>
  )
}
