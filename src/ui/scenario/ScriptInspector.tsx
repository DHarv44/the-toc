// THE SCRIPT INSPECTOR — one script node's attributes, in the same panel that
// edits a tank, and in the same property-grid language.
//
// Before this, an objective was a card in a long scrolling list of every
// objective and trigger in the mission, each one fully expanded, in a 320px
// rail. Finding the one you wanted meant scrolling past all the others; there
// was no sense of WHERE you were; and the mission's own fields (brief, frago)
// sat above the pile rather than being a thing you could select.
//
// Now the outline says what exists and this says what the selected one IS. The
// four cases below are the four kinds of node the outline offers.
import { Box, Group, MultiSelect, Select, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import type {
  MissionEffect, MissionObjective, MissionObjectiveKind, MissionTrigger,
} from '../../packs/types'
import type { MissionScript } from '../../scenario/types'
import type { Sel } from '../../scenario/edit'
import {
  EFFECT_FIELDS, EFFECT_KINDS, OBJECTIVE_FIELDS, OBJECTIVE_KINDS,
  effectDefault, objectiveDefault,
} from './descriptors'
import { CondForm, FieldInput, Note } from './scriptFields'
import {
  DATA_FONT, field, IconBtn, INK, PanelHead, Row, Section, TextBtn,
} from './panel'

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

const move = <T,>(a: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d
  if (j < 0 || j >= a.length) return a
  const b = [...a]; const t = b[i]!; b[i] = b[j]!; b[j] = t
  return b
}

/** the verbs every script node shares, in the header where the thing is named */
function Verbs({ onUp, onDown, onDelete }: {
  onUp?: () => void; onDown?: () => void; onDelete: () => void
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <IconBtn title="Earlier" disabled={!onUp} onClick={() => onUp?.()}>↑</IconBtn>
      <IconBtn title="Later" disabled={!onDown} onClick={() => onDown?.()}>↓</IconBtn>
      <IconBtn title="Delete (Ctrl+Z takes it back)" danger onClick={onDelete}>✕</IconBtn>
    </Group>
  )
}

export default function ScriptInspector({
  sel, mission, placeNames, onSelect, onPatchMission, onCenter,
}: {
  sel: Exclude<Sel, { k: 'entity' } | { k: 'tutStep' } | { k: 'tutHint' }>
  mission: MissionScript
  placeNames: string[]
  onSelect: (s: Sel) => void
  /** every edit here is a patch to the ONE mission on the bench */
  onPatchMission: (patch: Partial<MissionScript>) => void
  onCenter?: (name: string) => void
}) {
  const [raw, setRaw] = useState<string | null>(null)
  const [rawErr, setRawErr] = useState<string | null>(null)
  const objectives = mission.objectives ?? []
  const triggers = mission.triggers ?? []
  const objectiveIds = objectives.map(o => o.id)
  const m = sel.m

  const setObjectives = (v: MissionObjective[]) => onPatchMission({ objectives: v })
  const setTriggers = (v: MissionTrigger[]) => onPatchMission({ triggers: v })

  // ---------------------------------------------------------------- MISSION
  if (sel.k === 'mission') {
    if (raw != null) {
      return (
        <Box style={{ background: INK.bg }}>
          <PanelHead kind="Raw JSON" name={mission.name || mission.id}
            right={
              <Group gap={4} wrap="nowrap">
                <TextBtn onClick={() => {
                  try {
                    const v = JSON.parse(raw) as Partial<MissionScript>
                    onPatchMission({
                      brief: v.brief, frago: v.frago,
                      objectives: v.objectives ?? [], triggers: v.triggers ?? [],
                    })
                    setRawErr(null); setRaw(null)
                  } catch (e) { setRawErr(String((e as Error).message ?? e)) }
                }}>Apply</TextBtn>
                <IconBtn title="Cancel" onClick={() => setRaw(null)}>✕</IconBtn>
              </Group>
            } />
          {rawErr && <Note>{rawErr}</Note>}
          <Box p={8}>
            <Textarea autosize minRows={20} value={raw} styles={field}
              onChange={ev => setRaw(ev.currentTarget.value)} />
          </Box>
        </Box>
      )
    }
    return (
      <Box style={{ background: INK.bg }}>
        <PanelHead kind="Mission" name={mission.name || mission.id}
          right={<TextBtn title="Edit the whole script as JSON" onClick={() => {
            setRaw(JSON.stringify({
              brief: mission.brief, frago: mission.frago, objectives, triggers,
            }, null, 2))
            setRawErr(null)
          }}>JSON</TextBtn>} />

        <Section title="Identity">
          <Row label="Name">
            <TextInput size="xs" styles={field} value={mission.name}
              onChange={ev => {
                const v = ev.currentTarget.value
                onPatchMission({ name: v.toUpperCase() })
              }} />
          </Row>
          <Row label="Id" hint="What the filename and cross-references use.">
            <TextInput size="xs" styles={field} value={mission.id}
              onChange={ev => {
                const v = ev.currentTarget.value
                onPatchMission({ id: slugify(v) || mission.id })
              }} />
          </Row>
        </Section>

        <Section title="Briefing">
          <Row label="Brief" wide hint="The opener OPORD.">
            <Textarea size="xs" autosize minRows={4} styles={field}
              value={mission.brief ?? ''}
              onChange={ev => onPatchMission({ brief: ev.currentTarget.value || undefined })} />
          </Row>
          {/* the tasking card dropped when this mission activates mid-stream */}
          <Row label="FRAGO title" hint="Empty means no card is dropped.">
            <TextInput size="xs" styles={field} value={mission.frago?.title ?? ''}
              onChange={ev => {
                const title = ev.currentTarget.value
                onPatchMission({
                  frago: title ? { title, text: mission.frago?.text ?? '' } : undefined,
                })
              }} />
          </Row>
          {mission.frago && (
            <Row label="FRAGO text" wide>
              <Textarea size="xs" autosize minRows={3} styles={field}
                value={mission.frago.text}
                onChange={ev => onPatchMission({
                  frago: { title: mission.frago!.title, text: ev.currentTarget.value },
                })} />
            </Row>
          )}
        </Section>

        <Section title="Script" note={`${objectives.length} obj · ${triggers.length} trig`}>
          <Group gap={6} px={8} py={4}>
            <TextBtn onClick={() => {
              const o = objectiveDefault('clear-area', objectives.length + 1)
              setObjectives([...objectives, o])
              onSelect({ k: 'objective', m, i: objectives.length })
            }}>＋ Objective</TextBtn>
            <TextBtn onClick={() => {
              setTriggers([...triggers, {
                id: `trigger-${triggers.length + 1}`,
                when: { kind: 'objective-active', objective: '' }, do: [],
              }])
              onSelect({ k: 'trigger', m, i: triggers.length })
            }}>＋ Trigger</TextBtn>
            <TextBtn onClick={() => {
              const steps = mission.tutorial?.steps ?? []
              onPatchMission({
                tutorial: {
                  ...(mission.tutorial ?? {}),
                  steps: [...steps, {
                    id: `lesson-${steps.length + 1}`,
                    done: { kind: 'briefed' },
                    hints: [{ text: '', next: true }],
                  }],
                },
              })
              onSelect({ k: 'tutStep', m, s: steps.length })
            }}>＋ Lesson</TextBtn>
          </Group>
          <Note>Pick one in the outline to edit it.</Note>
        </Section>

        {mission.tutorial?.reactive?.length ? (
          <Note>
            {mission.tutorial.reactive.length} reactive tip
            {mission.tutorial.reactive.length === 1 ? '' : 's'} — these fire on an
            engine verb rather than on progress, and are carried through the
            file untouched.
          </Note>
        ) : null}
      </Box>
    )
  }

  // -------------------------------------------------------------- OBJECTIVE
  if (sel.k === 'objective') {
    const o = objectives[sel.i]
    if (!o) return null
    const patch = (n: MissionObjective) =>
      setObjectives(objectives.map((x, k) => (k === sel.i ? n : x)))
    return (
      <Box style={{ background: INK.bg }}>
        <PanelHead kind={`Objective ${String(sel.i + 1).padStart(2, '0')}`}
          name={o.label || o.id}
          right={<Verbs
            onUp={sel.i > 0 ? () => {
              setObjectives(move(objectives, sel.i, -1))
              onSelect({ k: 'objective', m, i: sel.i - 1 })
            } : undefined}
            onDown={sel.i < objectives.length - 1 ? () => {
              setObjectives(move(objectives, sel.i, 1))
              onSelect({ k: 'objective', m, i: sel.i + 1 })
            } : undefined}
            onDelete={() => {
              setObjectives(objectives.filter((_, k) => k !== sel.i))
              onSelect({ k: 'mission', m })
            }} />} />

        <Section title="Objective">
          <Row label="Label">
            <TextInput size="xs" styles={field} value={o.label}
              onChange={ev => patch({ ...o, label: ev.currentTarget.value.toUpperCase() })} />
          </Row>
          <Row label="Id" hint="What triggers call it.">
            <TextInput size="xs" styles={field} value={o.id}
              onChange={ev => patch({ ...o, id: ev.currentTarget.value })} />
          </Row>
          <Row label="Kind">
            <Select size="xs" styles={field} value={o.kind} data={OBJECTIVE_KINDS}
              onChange={k => k && patch({
                // CARRY WHAT STILL FITS across a kind change. Switching kinds
                // used to reset the whole objective, so a zone you had already
                // placed and named was gone the moment you decided it was a
                // CLEAR rather than a RECON — two verbs that take the same zone.
                ...objectiveDefault(k as MissionObjectiveKind, sel.i + 1),
                ...('zone' in o && o.zone ? { zone: o.zone } : {}),
                id: o.id, label: o.label,
                ...(o.reports ? { reports: o.reports } : {}),
                ...(o.notes ? { notes: o.notes } : {}),
              } as MissionObjective)} />
          </Row>
          {OBJECTIVE_FIELDS[o.kind].map(f => (
            <FieldInput key={f.path} f={f} obj={o} placeNames={placeNames} onCenter={onCenter}
              onChange={no => patch(no as MissionObjective)} />
          ))}
        </Section>

        <Section title="On close" defaultOpen={!!o.reports?.length || !!o.notes?.length}>
          <Row label="Staff reports">
            <MultiSelect size="xs" styles={field} value={o.reports ?? []}
              data={['s1', 's2', 's3', 's4']} placeholder="none"
              onChange={v => patch({
                ...o, reports: v.length ? (v as MissionObjective['reports']) : undefined,
              })} />
          </Row>
          {/* The TASKS column on this objective's briefing slide. LEAVE IT
              EMPTY: the deck writes those lines from the objective's own
              parameters, so they cannot go stale when the objective changes.
              Words typed here override that and are yours to maintain. */}
          <Row label="Briefing notes" wide
            hint="One per line. Empty is best — the deck writes the tasks from the objective, so they cannot go stale.">
            <Textarea size="xs" autosize minRows={2} styles={field}
              value={(o.notes ?? []).join('\n')}
              onChange={ev => {
                const lines = ev.currentTarget.value.split('\n')
                patch({ ...o, notes: lines.some(l => l.trim()) ? lines : undefined })
              }} />
          </Row>
        </Section>
      </Box>
    )
  }

  // ---------------------------------------------------------------- TRIGGER
  const t = triggers[sel.i]
  if (!t) return null
  const patchT = (n: MissionTrigger) =>
    setTriggers(triggers.map((x, k) => (k === sel.i ? n : x)))

  if (sel.k === 'trigger') {
    return (
      <Box style={{ background: INK.bg }}>
        <PanelHead kind="Trigger" name={t.id}
          right={<Verbs
            onUp={sel.i > 0 ? () => {
              setTriggers(move(triggers, sel.i, -1))
              onSelect({ k: 'trigger', m, i: sel.i - 1 })
            } : undefined}
            onDown={sel.i < triggers.length - 1 ? () => {
              setTriggers(move(triggers, sel.i, 1))
              onSelect({ k: 'trigger', m, i: sel.i + 1 })
            } : undefined}
            onDelete={() => {
              setTriggers(triggers.filter((_, k) => k !== sel.i))
              onSelect({ k: 'mission', m })
            }} />} />

        <Section title="Identity">
          <Row label="Id">
            <TextInput size="xs" styles={field} value={t.id}
              onChange={ev => patchT({ ...t, id: ev.currentTarget.value })} />
          </Row>
        </Section>

        <Section title="When">
          <CondForm c={t.when} depth={0} objectiveIds={objectiveIds} placeNames={placeNames}
            onCenter={onCenter} onChange={nc => patchT({ ...t, when: nc })} />
        </Section>

        <Section title="Do" note={`${t.do.length} in order`}>
          {t.do.map((e, j) => (
            <Row key={j} label={String(j + 1).padStart(2, '0')}>
              <Group gap={4} wrap="nowrap">
                <Box style={{
                  flex: 1, minWidth: 0, cursor: 'pointer', fontFamily: DATA_FONT,
                  fontSize: 13, color: INK.value, padding: '4px 6px',
                }}
                  onClick={() => onSelect({ k: 'effect', m, i: sel.i, j })}>
                  {e.kind}
                </Box>
                <IconBtn title="Earlier" disabled={j === 0}
                  onClick={() => patchT({ ...t, do: move(t.do, j, -1) })}>↑</IconBtn>
                <IconBtn title="Later" disabled={j === t.do.length - 1}
                  onClick={() => patchT({ ...t, do: move(t.do, j, 1) })}>↓</IconBtn>
                <IconBtn title="Remove" danger
                  onClick={() => patchT({ ...t, do: t.do.filter((_, k) => k !== j) })}>✕</IconBtn>
              </Group>
            </Row>
          ))}
          <Box px={8} py={4}>
            <TextBtn onClick={() => {
              patchT({ ...t, do: [...t.do, effectDefault('radio')] })
              onSelect({ k: 'effect', m, i: sel.i, j: t.do.length })
            }}>＋ Effect</TextBtn>
          </Box>
          <Note>
            Declaration order is the determinism law — effects fire top to
            bottom. Pick one to edit it.
          </Note>
        </Section>
      </Box>
    )
  }

  // ----------------------------------------------------------------- EFFECT
  const e = t.do[sel.j]
  if (!e) return null
  const patchE = (n: MissionEffect) =>
    patchT({ ...t, do: t.do.map((x, k) => (k === sel.j ? n : x)) })
  return (
    <Box style={{ background: INK.bg }}>
      <PanelHead kind={`Effect ${String(sel.j + 1).padStart(2, '0')}`} name={e.kind}
        right={<Verbs
          onUp={sel.j > 0 ? () => {
            patchT({ ...t, do: move(t.do, sel.j, -1) })
            onSelect({ k: 'effect', m, i: sel.i, j: sel.j - 1 })
          } : undefined}
          onDown={sel.j < t.do.length - 1 ? () => {
            patchT({ ...t, do: move(t.do, sel.j, 1) })
            onSelect({ k: 'effect', m, i: sel.i, j: sel.j + 1 })
          } : undefined}
          onDelete={() => {
            patchT({ ...t, do: t.do.filter((_, k) => k !== sel.j) })
            onSelect({ k: 'trigger', m, i: sel.i })
          }} />} />
      <Section title="Effect">
        <Row label="Kind">
          <Select size="xs" styles={field} value={e.kind} data={EFFECT_KINDS}
            onChange={k => k && patchE(effectDefault(k as MissionEffect['kind']))} />
        </Row>
        {EFFECT_FIELDS[e.kind].map(f => (
          <FieldInput key={f.path} f={f} obj={e} placeNames={placeNames} onCenter={onCenter}
            onChange={ne => patchE(ne as MissionEffect)} />
        ))}
      </Section>
      <Note>Fires when {t.id} · {t.when.kind}.</Note>
    </Box>
  )
}
