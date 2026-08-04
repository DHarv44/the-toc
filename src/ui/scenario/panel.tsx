// THE EDITOR'S PANEL LANGUAGE.
//
// The builder was wearing the game's costume: everything monospace, everything
// UPPERCASE with letter-spacing, every field a full-width label stacked on top
// of a full-width bordered input. That is right for the TOC — those screens are
// military terminals and should look like one — and wrong for a tool, which is
// read the way Unreal's Details panel and Unity's Inspector are read: scanned
// down a column, hundreds of rows at a time.
//
// What those two do, and this now does:
//
//   UI SANS for chrome, MONO only for values.  A label is prose; an id, a
//   designation or a template is data. Setting both in Consolas removes the one
//   cue that tells them apart, and turns a panel into a wall of typewriter.
//
//   SENTENCE CASE.  Caps destroy word shape, which is what makes a long
//   property list scannable. Unreal writes "Cast Shadows", not "CAST SHADOWS".
//
//   TWO COLUMNS.  Label left at a fixed width, control right. The alignment
//   line down the middle is the thing your eye rides; stacked pairs double the
//   height and leave a ragged edge. Long-form controls (a brief, a JSON blob)
//   opt out and go full width, because a textarea in a 140px column is useless.
//
//   QUIET FIELDS.  Editor property fields are near-borderless until you hover
//   or focus them. A border around every value is a form; values floating in
//   rows is an inspector.
//
//   CATEGORY BANDS.  Weighted, collapsible headers, not small grey words.
//
//   COLOUR MEANS SOMETHING.  Neutral greys carry the structure; colour is kept
//   for state — selected, warning, modified. Spending blue and amber on
//   decoration leaves nothing to say "this is wrong" with.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Box, Group, Text } from '@mantine/core'

/** the chrome face — a UI sans, with the platform's own first */
export const UI_FONT =
  'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif'
/** the data face — ids, designations, coordinates, templates */
export const DATA_FONT = 'Consolas, "Cascadia Mono", monospace'

export const INK = {
  /** panel background, one step up from the app's black */
  bg: '#0e141a',
  /** a category band */
  band: '#151d26',
  line: '#212c37',
  /** a label: present, but never competing with its value */
  label: '#8b9cad',
  /** a value */
  value: '#dbe6f0',
  /** secondary text, hints */
  dim: '#6d7f90',
  accent: '#7ec8ff',
  warn: '#e0b34e',
  bad: '#e8524a',
} as const

/** Field metrics. One label column width for the whole tool, so every panel
 *  lines up with every other one. */
export const LABEL_W = 132
export const ROW_H = 26

/** A collapsible category band — Unreal's Details categories. */
export function Section({ title, note, defaultOpen = true, action, children }: {
  title: string
  note?: string
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Box>
      <Group gap={6} wrap="nowrap" px={8} py={5}
        style={{
          background: INK.band, borderTop: `1px solid ${INK.line}`,
          borderBottom: open ? `1px solid ${INK.line}` : 'none', cursor: 'pointer',
        }}
        onClick={() => setOpen(v => !v)}>
        <Text style={{
          fontFamily: UI_FONT, fontSize: 13, fontWeight: 600, color: INK.value, flex: 1,
        }}>
          {open ? '▾' : '▸'}&nbsp; {title}
        </Text>
        {note && (
          <Text style={{ fontFamily: DATA_FONT, fontSize: 12, color: INK.dim }}>{note}</Text>
        )}
        {action && <Box onClick={ev => ev.stopPropagation()}>{action}</Box>}
      </Group>
      {open && <Box py={3}>{children}</Box>}
    </Box>
  )
}

/** One property: label left, control right. `wide` drops the label onto its own
 *  line and gives the control the full width — for text bodies and JSON. */
export function Row({ label, hint, wide, warn, children }: {
  label?: string
  hint?: string
  wide?: boolean
  warn?: string
  children: ReactNode
}) {
  const lab = label && (
    <Text style={{
      fontFamily: UI_FONT, fontSize: 12.5, color: warn ? INK.warn : INK.label,
      flex: wide ? undefined : `0 0 ${LABEL_W}px`, lineHeight: 1.3,
      paddingTop: wide ? 0 : 4,
    }}>
      {label}
    </Text>
  )
  return (
    <Box px={8} py={2}>
      {wide ? (
        <>
          {lab}
          <Box mt={2}>{children}</Box>
        </>
      ) : (
        <Group gap={8} wrap="nowrap" align="flex-start">
          {lab}
          <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
        </Group>
      )}
      {hint && (
        <Text style={{
          fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.35,
          paddingLeft: wide ? 0 : LABEL_W + 8, marginTop: 2,
        }}>
          {hint}
        </Text>
      )}
      {warn && (
        <Text style={{
          fontFamily: UI_FONT, fontSize: 11.5, color: INK.bad,
          paddingLeft: wide ? 0 : LABEL_W + 8, marginTop: 2,
        }}>
          {warn}
        </Text>
      )}
    </Box>
  )
}

/** The quiet-field look, handed to Mantine's `styles`. Borderless until it
 *  matters; monospace, because everything typed into this tool is data. */
export const field = {
  input: {
    fontFamily: DATA_FONT,
    fontSize: 13,
    color: INK.value,
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 2,
    minHeight: ROW_H,
    height: 'auto',
    paddingLeft: 6,
    paddingRight: 6,
    '&:hover': { background: '#141c24', borderColor: INK.line },
    '&:focus, &:focus-within': { background: '#0a1016', borderColor: INK.accent },
    '&::placeholder': { color: '#4d5c6b' },
  },
  // Mantine puts its own label above the control; this panel owns labels
  label: { display: 'none' },
  section: { color: INK.dim },
} as const

/** the header strip at the top of an inspector: what is on the bench */
export function PanelHead({ kind, name, right }: {
  kind: string
  name: string
  right?: ReactNode
}) {
  return (
    <Group gap={8} wrap="nowrap" px={8} py={7}
      style={{ borderBottom: `1px solid ${INK.line}`, background: '#111922' }}>
      <Text style={{
        fontFamily: UI_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
        textTransform: 'uppercase', color: INK.dim, flex: '0 0 auto',
      }}>
        {kind}
      </Text>
      <Text truncate style={{
        fontFamily: DATA_FONT, fontSize: 14, fontWeight: 700, color: INK.value, flex: 1,
      }}>
        {name}
      </Text>
      {right}
    </Group>
  )
}

/** a small square icon button — the panel's only button shape */
export function IconBtn({ title, danger, disabled, onClick, children }: {
  title: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const style: CSSProperties = {
    fontFamily: UI_FONT, fontSize: 13, lineHeight: 1,
    width: 22, height: 22, borderRadius: 2, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${INK.line}`, background: '#141c24',
    color: disabled ? '#3d4a56' : danger ? INK.bad : INK.label,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
  }
  return (
    <Box component="button" title={title} disabled={disabled} style={style}
      onClick={onClick}>
      {children}
    </Box>
  )
}

/** a text button for the one or two real verbs a panel has */
export function TextBtn({ title, onClick, children }: {
  title?: string; onClick: () => void; children: ReactNode
}) {
  return (
    <Box component="button" title={title} onClick={onClick} style={{
      fontFamily: UI_FONT, fontSize: 12.5, padding: '4px 10px', borderRadius: 2,
      border: `1px solid ${INK.line}`, background: '#141c24', color: INK.label,
      cursor: 'pointer',
    }}>
      {children}
    </Box>
  )
}
