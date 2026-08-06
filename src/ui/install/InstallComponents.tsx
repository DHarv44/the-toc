// WHAT A BASE IS MADE OF, AS CHIPS IN THE BOTTOM BAR.
//
// Selecting an installation used to throw a panel up over the map. Wrong: it
// covered the ground the commander was deciding about, and it made picking a
// base a MODE rather than a selection. The bottom bar already knows how to show
// a force — the independent elements are chips you glance across and pick from
// — and a base's contents are the same kind of list. So they are the same kind
// of row: pick a base, its components appear beside its name.
//
// Each component is a PICKER. GARRISON drops a drill (capability → company →
// element), QRF drops its duty roster and the candidates, FACILITIES and the
// division request lines drop their rows. The list opens against the chip, at
// the width of its content, and closes when you have chosen — which is what a
// combo box is, and what a panel is not.
//
// The tree inside is OURS (ui/tree). Mantine ships one and it would have owned
// the expand state; it would also have looked like a different application
// inside the same bar, and a console that is consistent everywhere except in
// one dropdown is not consistent.
import { useState } from 'react'
import { S } from '../../engine/state'
import type { OrgSlot, Structure } from '../../engine/GameState'
import { UNIT_TYPES, type UnitTypeKey } from '../../domains/forces/catalog'
import { qrfRoster, toggleQrf } from '../../domains/defense/qrf'
import { slotStrength } from '../../packs/org'
import { ownerOf } from '../../packs/orgquery'
import { deployContext, garrisonSlots, slotItem, unitCats, type DeployContext } from '../palette'
import { DrillRow, TreeLeaf } from '../tree'
import { QrfWarning, guardedFieldSlot, proceedFieldSlot } from '../forces/callup'
import { isOneClick, runItem } from './actions'

const WARN = '#e0b34e'

export interface Component {
  key: string
  label: string
  /** the number on the chip — how many of it there are */
  n: number
  /** what the count MEANS when zero is worth shouting about */
  note?: string
  tone?: string
}

/** THE SLOTS THAT ANSWER TO THIS BASE. A slot with no garrison of its own
 *  answers to the HQ, which is also where it physically stands. */
export function garrisonAt(st: Structure): OrgSlot[] {
  const hqId = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')?.id
  return garrisonSlots(true).filter(sl =>
    (S.structures.some(s => s.id === sl.garrisonAt && s.side === 'friend')
      ? sl.garrisonAt : hqId) === st.id)
}

/** What this base has to offer, in the order a commander asks for it. */
export function installComponents(st: Structure): Component[] {
  const ctx = deployContext([st.id])
  const gar = garrisonAt(st)
  const qrf = ctx?.sections.find(s => s.header === 'QRF')?.items.length ?? 0
  const out: Component[] = [
    { key: 'GARRISON', label: 'GARRISON', n: gar.length },
    // NO QRF IS THE FACT WORTH SEEING. A base with a reaction force says so
    // quietly; one without says so in amber.
    { key: 'QRF', label: 'QRF', n: qrf, note: qrf ? undefined : 'NONE STANDING', tone: qrf ? undefined : WARN },
  ]
  for (const sec of ctx?.sections ?? []) {
    if (sec.header === 'QRF') continue
    out.push({ key: sec.header, label: sec.header, n: sec.items.length })
  }
  return out
}

/** The list behind one chip. */
export default function ComponentDrop({ st, kind, onClose }: {
  st: Structure
  kind: string
  onClose: () => void
}) {
  const [open, setOpen] = useState<string[]>([])
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const toggle = (k: string) => setOpen(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))
  const isOpen = (k: string) => open.includes(k)
  const ctx: DeployContext | null = deployContext([st.id])

  const body = () => {
    if (kind === 'GARRISON') {
      const gar = garrisonAt(st)
      if (!gar.length) return <TreeLeaf label="NOBODY LEFT IN BARRACKS" disabled onClick={() => {}} />
      // THE DRILL IS THE QUESTION: which capability, then which company owns the
      // platoon. A flat list of nineteen elements is not a list anybody reads.
      return unitCats().map(c => {
        const list = gar.filter(sl => UNIT_TYPES[sl.type as UnitTypeKey].cat === c)
        if (!list.length) return null
        return (
          <div key={c}>
            <DrillRow label={c} n={list.length} str={slotStrength(list)}
              open={isOpen(c)} onClick={() => toggle(c)} />
            {isOpen(c) && list.map(sl => {
              const it = slotItem(sl, true)
              return (
                <TreeLeaf key={sl.id} depth={1} icon={it.icon}
                  label={`${sl.name} · ${ownerOf(sl)}`} note={it.note}
                  tag={sl.qrf ? `✓ QRF · ${it.tag ?? ''}` : it.tag}
                  disabled={it.disabled}
                  onClick={() => {
                    if (it.disabled) return
                    guardedFieldSlot(it.key!, setQrfPending)
                    onClose()
                  }} />
              )
            })}
          </div>
        )
      })
    }

    if (kind === 'QRF') {
      const duty = ctx?.sections.find(s => s.header === 'QRF')?.items ?? []
      const { candidates } = qrfRoster(st.id)
      if (!duty.length && !candidates.length) {
        return <TreeLeaf label="NO GARRISON HERE TO STAND QRF" disabled onClick={() => {}} />
      }
      return (
        <>
          {duty.map(it => (
            <TreeLeaf key={it.mode} icon={it.icon} label={it.label} tag={it.tag}
              note={it.note} disabled={it.disabled}
              onClick={() => { runItem(it, ctx?.sourceId); onClose() }} />
          ))}
          {candidates.length > 0 && (
            <>
              <TreeLeaf label={isOpen('ded') ? '✕ CANCEL' : '＋ DEDICATE AN ELEMENT'}
                tag={isOpen('ded') ? null : 'PICK FROM THIS GARRISON'}
                onClick={() => toggle('ded')} />
              {isOpen('ded') && candidates.map(sl => {
                const it = slotItem(sl, true)
                return (
                  <TreeLeaf key={sl.id} depth={1} icon={it.icon}
                    label={`${sl.name} · ${ownerOf(sl)}`} tag={it.tag} note={it.note}
                    onClick={() => { toggleQrf(sl.id); onClose() }} />
                )
              })}
            </>
          )}
        </>
      )
    }

    const sec = ctx?.sections.find(s => s.header === kind)
    if (!sec?.items.length) return <TreeLeaf label="NONE" disabled onClick={() => {}} />
    return sec.items.map(it => (
      <TreeLeaf key={it.mode} icon={it.icon} label={it.label} tag={it.tag}
        note={it.note} disabled={it.disabled}
        onClick={() => {
          runItem(it, ctx?.sourceId)
          // a row that arms a map mode has to get out of the way of the map
          // click it is asking for
          if (!isOneClick(it, ctx?.sourceId)) onClose()
        }} />
    ))
  }

  return (
    <div style={{ minWidth: 300, maxWidth: 460, maxHeight: '44vh', overflowY: 'auto' }}>
      {qrfPending && (
        <QrfWarning slotId={qrfPending}
          onProceed={() => { proceedFieldSlot(qrfPending); setQrfPending(null); onClose() }}
          onCancel={() => setQrfPending(null)} />
      )}
      {body()}
    </div>
  )
}
