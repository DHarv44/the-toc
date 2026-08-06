// THE WHOLE BATTALION'S GARRISON — every base, everything still in barracks.
//
// The bottom bar answers "what can THIS base give me, now". This answers "what
// is left anywhere", which is the question you ask when building a force rather
// than reacting to a contact. Same verb, reached from a different question, and
// deliberately through the SAME call (ui/forces/callup's guardedFieldSlot) —
// one home means one implementation, not one button.
//
// It drills the way the question is asked: WHERE (which garrison holds troops),
// then WHAT (the capability), then WHO (the company that owns the platoon).
// Everything starts shut.
import { useState } from 'react'
import { Text } from '@mantine/core'
import { S } from '../../engine/state'
import type { OrgSlot } from '../../engine/GameState'
import { commandsStructure } from '../../domains/forces/command'
import { UNIT_TYPES, type UnitTypeKey } from '../../domains/forces/catalog'
import { slotStrength } from '../../packs/org'
import { ownerOf } from '../../packs/orgquery'
import { useUI } from '../store'
import { unitCats, garrisonSlots, slotItem } from '../palette'
import { DrillRow, TreeLeaf } from '../tree'
import { QrfWarning, guardedFieldSlot, proceedFieldSlot } from '../forces/callup'
import { TUT, callupBaseTarget, callupCatTarget, callupCoTarget } from '../tutTargets'

export default function GarrisonTree() {
  const ui = useUI()
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const slots = garrisonSlots(true)

  // YOUR command post — a sister formation's installations are on the map but
  // are not places your battalion stages from
  const hqId = S.structures.find(s => s.kind === 'HQ' && commandsStructure(s))?.id ?? null
  const baseOf = (sl: OrgSlot) =>
    S.structures.some(s => s.id === sl.garrisonAt && commandsStructure(s)) ? sl.garrisonAt! : hqId
  const bases = [...new Set(slots.map(baseOf))]
    .map(id => S.structures.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s && commandsStructure(s))
    .map(b => ({ b, list: slots.filter(sl => baseOf(sl) === b.id) }))
  const catOf = (sl: OrgSlot) => UNIT_TYPES[sl.type as UnitTypeKey].cat
  const cat = ui.callupCat

  // group a category's elements the way the force is organized: by the COMPANY
  // that owns the platoons (order follows the org, not the alphabet)
  const cosOf = (list: OrgSlot[]) => {
    const cos: { key: string; co: string; bn: string; list: OrgSlot[] }[] = []
    for (const sl of list) {
      const key = `${sl.cmd}:${ownerOf(sl)}`
      const e = cos.find(c => c.key === key)
      if (e) e.list.push(sl)
      else cos.push({ key, co: ownerOf(sl), bn: sl.cmd, list: [sl] })
    }
    return cos
  }

  return (
    <>
      {qrfPending && (
        <QrfWarning slotId={qrfPending}
          onProceed={() => { proceedFieldSlot(qrfPending); setQrfPending(null) }}
          onCancel={() => setQrfPending(null)} />
      )}
      {/* the tutorial rings the WHOLE list — the pick is the commander's, not
          one prescribed row */}
      <div data-tut={TUT.garrisonList} style={{ maxWidth: 620 }}>
        {bases.map(({ b, list: inBase }) => {
          const baseOpen = ui.callupBase === b.id
          return (
            <div key={b.id}>
              <DrillRow tut={callupBaseTarget(b.kind)} label={b.label}
                n={inBase.length} str={slotStrength(inBase)} open={baseOpen}
                onClick={() => useUI.setState({
                  callupBase: baseOpen ? null : b.id, callupCat: null,
                })} />
              {baseOpen && unitCats().map(c => {
                const list = inBase.filter(sl => catOf(sl) === c)
                if (!list.length) return null
                const open = cat === c
                return (
                  <div key={c}>
                    <DrillRow depth={1} tut={callupCatTarget(c)} label={c}
                      n={list.length} str={slotStrength(list)} open={open}
                      onClick={() => useUI.setState({ callupCat: open ? null : c })} />
                    {open && cosOf(list).map(co => {
                      // keyed by CATEGORY too: one HHC owns scouts, mortars and
                      // medics, and opening one must not open the rest
                      const ck = `${c}|${co.key}`
                      const coOpen = ui.callupCos.includes(ck)
                      return (
                        <div key={ck}>
                          <DrillRow depth={2} tut={callupCoTarget(c, co.co)}
                            label={`${co.co} · ${co.bn}`} n={co.list.length}
                            str={slotStrength(co.list)} open={coOpen}
                            onClick={() => useUI.setState(s => ({
                              callupCos: coOpen
                                ? s.callupCos.filter(k => k !== ck)
                                : [...s.callupCos, ck],
                            }))} />
                          {coOpen && co.list.map(sl => {
                            const it = slotItem(sl, true)
                            return (
                              <TreeLeaf key={it.key} tut={it.tutSel} icon={it.icon}
                                label={it.label} note={it.note} disabled={it.disabled}
                                onClick={() => {
                                  if (!it.disabled) guardedFieldSlot(it.key!, setQrfPending)
                                }}
                                tag={sl.qrf ? `✓ QRF · ${it.tag ?? ''}` : it.tag} />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
        {bases.length === 0 && (
          <Text fz={11} c="dark.3" px="xs" py={6}>NOTHING IN GARRISON</Text>
        )}
      </div>
    </>
  )
}
