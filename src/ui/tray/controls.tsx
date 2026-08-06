// THE COMMAND DOCK'S PARTS.
//
// Split out of ui/HUD, which had grown to fifteen hundred lines holding the map
// overlay, the selection tray, two context menus and the whole drone-feed
// window. A file that size has no seams, so every change to the command bar
// meant reading past four unrelated systems to find it — and the bar is the
// thing the player touches most.
//
// Everything here is presentation with no opinion about what a unit is: a
// labelled cluster, a one-of-N picker, a fixed grid of ability cells. The tray
// decides what goes in them.
import type { CSSProperties, ReactNode } from 'react'
import { FZ, btn } from '../styles'

/** A labelled cluster. The tray had grown into two undifferentiated walls of
 *  same-weight buttons; grouping under a caption is what makes "what does this
 *  unit do on contact" a two-second read instead of a scan. */
export function Seg({ label, children, warn }: {
  label: string; children: ReactNode; warn?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        color: warn ? '#e0b34e' : '#6d8296', fontSize: FZ.hint, letterSpacing: 0.8, fontWeight: 600,
      }}>{label}</span>
      {children}
    </div>
  )
}

/** The shared value, or null for MIXED. */
export function one<T>(vals: T[]): T | null {
  const s = new Set(vals)
  return s.size === 1 ? [...s][0]! : null
}

/** ONE OF THESE, NOT THREE OF THOSE.
 *
 *  Actions on contact, weapons control and march interval are each a choice of
 *  one from three, and they were drawn as loose buttons identical to MOUNT and
 *  RTB — so nine mutually exclusive states looked like nine independent things
 *  to press. Joined into a single control with one border, the shape says what
 *  it is before a word is read, and the lit segment IS the state readout, which
 *  is why the caption no longer carries it.
 *
 *  MIXED still goes in the caption, because a segmented control cannot show a
 *  value it does not have and that is precisely the case worth shouting. */
export function Pick<T extends string>({ label, value, options, onPick, title }: {
  label: string
  value: T | null
  options: readonly (readonly [T, string])[]
  onPick: (v: T) => void
  title?: (v: T) => string
}) {
  return (
    <Seg label={value ? label : `${label} · MIXED`} warn={!value}>
      <div style={{
        display: 'flex', border: '1px solid #2f4356', borderRadius: 2, overflow: 'hidden',
      }}>
        {options.map(([id, text], i) => (
          <button key={id} onClick={() => onPick(id)} title={title?.(id)}
            style={{
              padding: '3px 11px', fontSize: FZ.label, letterSpacing: 0.4, cursor: 'pointer',
              fontFamily: 'inherit', border: 'none',
              borderLeft: i ? '1px solid #2f4356' : undefined,
              background: value === id ? '#255a8c' : 'rgba(20,28,36,0.9)',
              color: value === id ? '#eaf4ff' : '#8b9cad',
              fontWeight: value === id ? 700 : 400,
            }}>{text}</button>
        ))}
      </div>
    </Seg>
  )
}

/** ONE SLOT OF THE COMMAND CARD. `show` false leaves the cell EMPTY rather
 *  than removing it — that is the entire point of the thing. */
export interface CmdSlot {
  key: string
  label: string
  hot?: string
  title?: string
  show: boolean
  active?: boolean
  tone?: string
  tut?: string
  on: () => void
}

// READABLE TYPE COSTS SPACE, AND THE SPACE IS THE CHEAPER OF THE TWO. These
// were 88×21 carrying a 9.5 px label and a 7.5 px hotkey — under the floor in
// ui/styles, which exists precisely because picking a size per element ratchets
// downward until nothing on the screen can be read. The cells grew to fit the
// scale rather than the scale shrinking to fit the cells.
const CARD_COLS = 4
const CELL_W = 124
const CELL_H = 26

/** THE COMMAND CARD — a fixed grid, and the reason it is fixed is the only
 *  reason it exists.
 *
 *  What was here was a flow of captioned groups whose CONTENTS changed with the
 *  selection: MOUNT appeared only when mounted, the Raven only for a carrier,
 *  RTB only when garrisoned. So the row was a different shape for every element
 *  the player clicked, and every button in it sat somewhere else than it had a
 *  moment earlier. Left-aligning the row did not fix that, because the problem
 *  was never the alignment — it was that THE LAYOUT DEPENDED ON THE CONTENT.
 *
 *  No real-time strategy game does this, and the reason is muscle memory: a
 *  player who has to find STOP cannot press it in the half second they have.
 *  StarCraft, Company of Heroes and the Wargame series all put the abilities in
 *  a fixed grid where an unavailable one leaves its cell EMPTY and everything
 *  else stays exactly where it was. The hotkey is printed on the face, because
 *  the grid's other job is teaching the keyboard that replaces it.
 *
 *  So: twelve cells, always twelve, always in the same order. An element that
 *  cannot bridge has a hole where BRIDGE would be. */
export function CommandCard({ slots }: { slots: CmdSlot[] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${CARD_COLS}, ${CELL_W}px)`, gap: 3,
    }}>
      {slots.map(s => (s.show ? (
        <button key={s.key} data-tut={s.tut} onClick={s.on} title={s.title}
          style={{
            height: CELL_H, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: FZ.label, fontWeight: 700, letterSpacing: 0.3, borderRadius: 2,
            border: `1px solid ${s.active ? '#4d90c8' : '#2f4356'}`,
            background: s.active ? '#255a8c' : 'rgba(22,30,40,0.95)',
            color: s.active ? '#eaf4ff' : (s.tone ?? '#b3c6d8'),
            padding: '0 8px', textAlign: 'left',
          }}>
          {/* THE KEY SITS IN THE ROW, NOT IN A CORNER. As a floating badge it
              had to be tiny to stay out of the label's way, and tiny is what
              the type scale forbids — so it takes its own column at the same
              size and earns its place by being dimmer instead of smaller. */}
          {s.hot && (
            <span style={{
              flex: '0 0 auto', width: 9, textAlign: 'center', fontWeight: 700,
              color: s.active ? '#cfe6ff' : '#5d7f92',
            }}>{s.hot}</span>
          )}
          {/* A CELL IS A FIXED SIZE OR IT IS NOT A GRID. Pack labels are pack
              data — an engineer that builds an OBSERVATION POST wrapped its
              cell onto a second line and pushed the whole row out of alignment,
              which is the exact failure the grid exists to prevent. The label
              clips; the tooltip carries the whole of it. */}
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>{s.label}</span>
        </button>
      ) : (
        // THE HOLE IS THE FEATURE. An ability this element does not have leaves
        // its cell empty so that every ability it DOES have stays put.
        <div key={s.key} style={{
          height: CELL_H, borderRadius: 2, border: '1px solid rgba(40,58,72,0.35)',
        }} />
      )))}
    </div>
  )
}

// THE ORDER YOU ARE ABOUT TO GIVE, and everything else. MOVE and ATTACK are
// pressed every few seconds; GARRISON is pressed once a session, and they were
// the same size, colour and border. Weight now says which is which.
export const btnPrimary = (active: boolean, tone?: string): CSSProperties => ({
  ...btn(active), padding: '4px 14px', fontSize: FZ.body, fontWeight: 700, letterSpacing: 0.5,
  ...(tone && !active ? { color: tone } : {}),
})
export const btnGhost = (active: boolean): CSSProperties => ({
  ...btn(active), padding: '3px 10px', fontSize: FZ.label,
  ...(active ? {} : { background: 'transparent', color: '#7c92a6', borderColor: '#243444' }),
})
/** compact toggle used in the tray and the fire-mission rows */
export const optBtn = (active: boolean): CSSProperties => ({
  ...btn(active), padding: '3px 10px', fontSize: FZ.label,
})

// The command dock. `minHeight` is the reservation — the control zones' worth,
// held whether or not there is a selection to put in them, so the map never
// resizes underneath a click. It grew with the type: three 26 px rows of card
// plus the headline is what legible controls actually take.
export const trayShell: CSSProperties = {
  flex: '0 0 auto', minHeight: 118,
  background: 'rgba(10,14,18,0.94)', borderTop: '1px solid #2a3a48', color: '#c8d8e8',
  padding: '5px 12px 9px', display: 'flex', flexDirection: 'column', gap: 6,
}
