// THE COLUMN, AS A LIST YOU CAN REORDER BY HAND.
//
// A team's members were rendered with the same generic palette row the
// independent elements use — name, lineage, strength — which says nothing about
// the one thing a team member has that a loose element does not: A PLACE IN THE
// COLUMN. Where an element sits in the order of march decides who takes the
// first contact, who eats the mine, and which third of the column has nothing
// hardened in it. That is the fact this list exists to show.
//
// So each row is a TRACK, and reads left to right the way a track does:
//
//   ⠿  LEAD  ▣  GOLF-7   MI   100%  MOVING
//   ⠿  02    ▣  HOTEL-8  AR    92%  MOVING  •
//
// serial · symbol · callsign · branch · strength · what it is doing · exception
//
// AND YOU CAN DRAG IT. Reordering a march column was two arrows in a staff
// console, one swap per click, which is a fine way to express "move this one
// back one place" and a terrible way to express "the tanks lead". Dragging is
// the direct manipulation of an ordered list, and this list IS the order.
//
// Drag AUTHORS the plan — see domains/movement/march. Until somebody orders it
// by hand the column re-forms from where the elements are standing every time
// it is given a route; once ordered, it obeys and pays for the reshuffle. That
// is a real cost and the S3 board says so; picking a row up is consenting to it.
import { useRef, useState } from 'react'
import type { Unit } from '../../engine/GameState'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { marchPlan, setMarchOrder } from '../../domains/movement/march'
import { reformMarch } from '../../domains/forces/orders'
import { liftState } from '../../domains/forces/loadplan'
import { hardness } from '../../domains/forces/elements'
import { centerView } from '../../map/view'
import { PaletteIcon } from '../palette'
import { FZ } from '../styles'
import { useUI } from '../store'

const WARN = '#e0b34e'

/** What this element is DOING — the two words a commander scans for. Same
 *  vocabulary as the task org bar, because they are the same question. */
function stateOf(u: Unit): { text: string; tone: string } {
  if (u.targetId || u.breaking) return { text: 'CONTACT', tone: '#ff9e6a' }
  if (u.path.length) return { text: u.colWait ? 'FIRM' : 'MOVING', tone: u.colWait ? '#7ec87e' : '#8fb0c8' }
  if (u.posture === 'dig') return { text: 'DUG IN', tone: '#7ec87e' }
  return { text: 'HOLD', tone: '#6d7f90' }
}

/** Serial in the column. LEAD and TRAIL are named because those two places are
 *  decisions and the numbers in between are consequences of them. */
const placeOf = (i: number, n: number): string =>
  i === 0 ? 'LEAD' : i === n - 1 ? 'TRAIL' : String(i + 1).padStart(2, '0')

export default function MarchList({ gid, members }: { gid: number; members: Unit[] }) {
  const ui = useUI()
  const plan = marchPlan(gid)
  const rank = new Map((plan?.order ?? members.map(m => m.id)).map((id, i) => [id, i]))
  const ordered = members.slice().sort((a, b) =>
    (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))

  // DRAG STATE. `over` is the gap the row would land in, 0..n — an INSERTION
  // POINT rather than a target row, because "before the lead" and "after the
  // trail" are both real places and a row index cannot name them.
  const [drag, setDrag] = useState<{ id: number } | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const rowsRef = useRef<Map<number, HTMLDivElement>>(new Map())

  /** Which gap the pointer is in, from the live row rectangles. Measured on the
   *  fly rather than cached: the rail scrolls, and a stale rectangle drops the
   *  element somewhere the player did not point at. */
  const gapAt = (clientY: number): number => {
    let i = 0
    for (const u of ordered) {
      const el = rowsRef.current.get(u.id)
      if (!el) { i++; continue }
      const r = el.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
      i++
    }
    return ordered.length
  }

  // THE DROP DECIDES, NOT THE LAST MOVE WE HAPPENED TO SEE. Reading the gap
  // from the release point means a fast drag — one that produces a single move
  // event, or none — still lands where the player let go rather than silently
  // doing nothing.
  const commit = (id: number, clientY: number) => {
    const gap = gapAt(clientY)
    const ids = ordered.map(u => u.id)
    const from = ids.indexOf(id)
    const over = gap
    const without = ids.filter(x => x !== id)
    // the gap index counts the dragged row while it is still in the list, so a
    // drop BELOW its own position lands one place high without this
    const to = over > from ? over - 1 : over
    without.splice(to, 0, id)
    setDrag(null); setOver(null)
    if (without.every((x, i) => x === ids[i])) return   // dropped where it was
    const cur = marchPlan(gid)
    setMarchOrder(gid, without, cur?.column ?? 'open', {
      ...(cur?.roe ? { roe: cur.roe } : {}),
      ...(cur?.weapons ? { weapons: cur.weapons } : {}),
      ...(cur?.disabled ? { disabled: cur.disabled } : {}),
      authored: true,
    })
    // a column already on a route re-forms NOW — an order of march you can
    // rewrite but the column ignores until the next order is not an order
    reformMarch(gid)
  }

  return (
    <div>
      {ordered.map((u, i) => {
        const type = UNIT_TYPES[u.type]
        const st = stateOf(u)
        const active = ui.selectedIds.includes(u.id)
        const lifting = liftState(u)
        // THE EXCEPTIONS, ON THE ROW THAT OWNS THEM. An element off the column's
        // ordered drill, or walking because it has lost its lift, is a fact
        // about THAT element and belongs beside it — not in a note underneath
        // the table where it reads as being about the whole team.
        const offDrill = !!plan?.roe && u.roe !== plan.roe
        const onFoot = lifting.walking.length > 0
        const soft = hardness(u) < 0.5
        const dragging = drag?.id === u.id
        return (
          <div key={u.id}>
            {/* the insertion line — where it WILL go, not where it is */}
            {over === i && drag && (
              <div style={{ height: 2, background: '#7ec8ff', margin: '1px 8px' }} />
            )}
            <div ref={el => { if (el) rowsRef.current.set(u.id, el); else rowsRef.current.delete(u.id) }}
              onClick={e => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) ui.toggleSelect(u.id)
                else ui.select(u.id)
              }}
              onDoubleClick={() => { ui.select(u.id); centerView(u) }}
              title={[
                `${u.label} · ${type.name}`,
                `${placeOf(i, ordered.length)} of the column · ${st.text} · ${Math.round(u.strength)}%`,
                u.lineage ?? null,
                u.attFrom ? `ATT ${u.attFrom}` : null,
                offDrill ? `OFF THE ORDERED DRILL — on ${u.roe.toUpperCase()}` : null,
                onFoot ? `${lifting.walking.length} ON FOOT — the column moves at their pace` : null,
                soft ? 'Nothing hardened in this element' : null,
                'Drag the grip to change the order of march',
              ].filter(Boolean).join('\n')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                cursor: 'pointer', opacity: dragging ? 0.4 : 1,
                borderLeft: `2px solid ${active ? 'var(--mantine-color-toc-3)' : 'transparent'}`,
                background: active ? 'var(--mantine-color-toc-8)' : undefined,
              }}>
              {/* THE GRIP IS ITS OWN TARGET. Making the whole row draggable
                  would mean every attempt to SELECT an element is also the
                  start of a reorder, and the two get confused at exactly the
                  moment the player is in a hurry. */}
              {/* WINDOW LISTENERS, NOT POINTER CAPTURE. Capture retargets the
                  move and up events at the grip, and getting them back out
                  through React's synthetic tree to the list that needs them is
                  a bet on propagation details. The rest of this app (the feed
                  window's drag and resize) listens on the window for the
                  duration of the gesture, which is the pattern that works here,
                  so this does the same. */}
              <span onPointerDown={e => {
                e.stopPropagation()
                e.preventDefault()
                const id = u.id
                setDrag({ id }); setOver(i)
                const move = (ev: PointerEvent) => setOver(gapAt(ev.clientY))
                const up = (ev: PointerEvent) => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                  commit(id, ev.clientY)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
                title="Drag to change the order of march"
                style={{
                  cursor: 'grab', color: '#4a6070', fontSize: FZ.label, lineHeight: 1,
                  flex: '0 0 auto', padding: '0 2px', touchAction: 'none',
                }}>⠿</span>
              <span style={{
                flex: '0 0 34px', fontSize: FZ.hint, fontWeight: 700, letterSpacing: 0.4,
                color: i === 0 ? '#ffd67e' : i === ordered.length - 1 ? '#9fb3c6' : '#5d6f80',
              }}>{placeOf(i, ordered.length)}</span>
              <PaletteIcon unit={type} w={28} h={19} scale={0.74} />
              {/* THE CALLSIGN IS THE ROW. It was the flexible column in a strip
                  of six fixed ones, so in a 270 px rail it collapsed to a single
                  letter and an ellipsis while STATE sat beside it at a
                  comfortable fifty pixels spelling out HOLD. The answer to a row
                  that does not fit is fewer columns, not smaller type — so what
                  the element is DOING rides its colour, and the word is one hover
                  away with the rest of the detail. */}
              <span style={{
                flex: 1, minWidth: 0, fontSize: FZ.label, fontWeight: 600,
                color: active ? '#dceeff' : st.tone,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{u.label}</span>
              {(offDrill || onFoot) && (
                <span style={{ flex: '0 0 auto', fontSize: FZ.hint, color: WARN }}>•</span>
              )}
              <span style={{ flex: '0 0 auto', fontSize: FZ.hint, color: '#6d8296' }}>{type.abbr}</span>
              <span style={{
                flex: '0 0 32px', textAlign: 'right', fontSize: FZ.hint,
                color: u.strength >= 85 ? '#6d7f90' : u.strength >= 60 ? '#c9a24a' : '#e07a6a',
              }}>{Math.max(0, Math.round(u.strength))}%</span>
            </div>
          </div>
        )
      })}
      {over === ordered.length && drag && (
        <div style={{ height: 2, background: '#7ec8ff', margin: '1px 8px' }} />
      )}
      {plan?.authored && (
        <div style={{ fontSize: FZ.hint, color: '#54708a', padding: '2px 8px 4px' }}>
          ORDER SET BY HAND — the column obeys it and pays for the reshuffle
        </div>
      )}
    </div>
  )
}
