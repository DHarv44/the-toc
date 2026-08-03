// THE SCRIPT PANEL — ONE MISSION's script edited beside the map, forms
// GENERATED from the vocabulary descriptors (descriptors.ts). Place params
// autocomplete over the scenario's authored places + the map's real gazetteer
// + the builtin anchors; effect order is preserved (declaration order is the
// determinism law). A RAW JSON toggle exposes the exact pack-file sections
// for power editing. The tutorial section is carried opaque — preserved on
// save, never edited here.
import { useState } from 'react'
import {
  Autocomplete, Box, Button, Checkbox, Group, MultiSelect, NumberInput,
  Select, Text, Textarea, TextInput,
} from '@mantine/core'
import type {
  MissionCondition, MissionEffect, MissionObjective, MissionObjectiveKind,
} from '../../packs/types'
import type { MissionScript } from '../../scenario/types'
import { STRUCTURES, type StructureTypeKey } from '../../domains/installations/catalog'
import {
  CONDITION_FIELDS, CONDITION_KINDS, EFFECT_FIELDS, EFFECT_KINDS,
  OBJECTIVE_FIELDS, OBJECTIVE_KINDS, conditionDefault, effectDefault,
  objectiveDefault, getPath, setPath, type FieldSpec,
} from './descriptors'
import { isBuiltinPlace } from '../../scenario/content'

const MONO = 'Consolas, monospace'

// list helpers — reorder matters (declaration order law)
const moveItem = <T,>(a: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d
  if (j < 0 || j >= a.length) return a
  const b = [...a]; const t = b[i]!; b[i] = b[j]!; b[j] = t
  return b
}
const dropItem = <T,>(a: T[], i: number): T[] => a.filter((_, k) => k !== i)
const patchItem = <T,>(a: T[], i: number, v: T): T[] => a.map((x, k) => (k === i ? v : x))

// a JSON param that the form language can't say — parsed on blur, red on error
function JsonField({ label, value, opt, placeholder, onApply }: {
  label: string; value: unknown; opt?: boolean; placeholder?: string
  onApply: (v: unknown) => void
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value)))
  const [bad, setBad] = useState(false)
  return (
    <Textarea size="xs" label={label} mb={4} autosize minRows={1}
      value={text} error={bad} placeholder={placeholder}
      styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
      onChange={ev => setText(ev.currentTarget.value)}
      onBlur={() => {
        const t = text.trim()
        if (!t && opt) { setBad(false); onApply(undefined); return }
        try { onApply(JSON.parse(t)); setBad(false) } catch { setBad(true) }
      }} />
  )
}

/** The place a ref actually names — a bare name, or the `place` of an object
 *  PlaceRef ({place, toward, range}). Null when nothing is set yet. */
export function refPlaceName(v: unknown): string | null {
  if (typeof v === 'string') return v || null
  if (v && typeof v === 'object') {
    const p = (v as { place?: unknown }).place
    return typeof p === 'string' && p ? p : null
  }
  return null
}

/** A ref pointing at a place nobody authored — the dangling reference that
 *  used to be discovered at play time, said out loud at authoring time. */
export function placeIssue(v: unknown, placeNames: string[]): string | null {
  const name = refPlaceName(v)
  if (!name) return null                       // unset is not wrong, just unset
  if (placeNames.includes(name) || isBuiltinPlace(name)) return null
  return `NO PLACE NAMED "${name}"`
}

// one descriptor-driven field over a verb object
function FieldInput({ f, obj, placeNames, onChange, onCenter }: {
  f: FieldSpec
  obj: unknown
  placeNames: string[]
  onChange: (next: unknown) => void
  /** show this place on the sheet — where IS the objective, actually */
  onCenter?: (name: string) => void
}) {
  const v = getPath(obj, f.path)
  const set = (nv: unknown) => onChange(setPath(obj, f.path, nv))
  switch (f.kind) {
    case 'place':
    case 'placeOrNull': {
      // a plain name edits in place; an object PlaceRef (offsets/toward) shows
      // as JSON and round-trips through parse — one input for both forms
      const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
      const issue = placeIssue(v, placeNames)
      const name = refPlaceName(v)
      const canCenter = !!name && !isBuiltinPlace(name) && placeNames.includes(name)
      return (
        <Box mb={4}>
          <Group gap={4} align="flex-end" wrap="nowrap">
            <Autocomplete size="xs" label={f.label} value={s} data={placeNames}
              error={!!issue} style={{ flex: 1 }}
              styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
              onChange={nv => {
                const t = nv.trim()
                if (!t) { set(f.kind === 'placeOrNull' ? null : ''); return }
                if (t.startsWith('{')) { try { set(JSON.parse(t)) } catch { set(nv) } }
                else set(nv)
              }} />
            <Button size="compact-xs" variant="default" px={5} disabled={!canCenter}
              title={canCenter ? `Show ${name} on the sheet` : 'Pick an authored place to locate it'}
              onClick={() => canCenter && onCenter?.(name!)}>◎</Button>
          </Group>
          {issue && <Text fz={8.5} c="#e8524a" mt={2}>⚠ {issue}</Text>}
        </Box>
      )
    }
    case 'number':
      return (
        <NumberInput size="xs" label={f.label} mb={4}
          value={typeof v === 'number' ? v : ''}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={nv => set(typeof nv === 'number' ? nv : f.opt ? undefined : 0)} />
      )
    case 'string':
      return (
        <TextInput size="xs" label={f.label} mb={4} value={typeof v === 'string' ? v : ''}
          placeholder={f.placeholder}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={ev => set(ev.currentTarget.value || (f.opt ? undefined : ''))} />
      )
    case 'text':
      return (
        <Textarea size="xs" label={f.label} mb={4} autosize minRows={2}
          value={typeof v === 'string' ? v : ''}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={ev => set(ev.currentTarget.value)} />
      )
    case 'bool':
      // the radio `at` param is the one enum-flag: checked = 'ctx'
      if (f.path.endsWith('.at')) {
        return (
          <Checkbox size="xs" label={f.label} mb={4} checked={v === 'ctx'}
            onChange={ev => set(ev.currentTarget.checked ? 'ctx' : undefined)} />
        )
      }
      return (
        <Checkbox size="xs" label={f.label} mb={4} checked={!!v}
          onChange={ev => set(ev.currentTarget.checked)} />
      )
    case 'unitList':
    case 'stringList': {
      const s = Array.isArray(v) ? (v as string[]).join(', ') : ''
      return (
        <TextInput size="xs" label={f.label} mb={4} value={s}
          placeholder={f.placeholder ?? 'MECH, INF, MOR'}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={ev => {
            const list = ev.currentTarget.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean)
            set(list.length || !f.opt ? list : undefined)
          }} />
      )
    }
    case 'structKind':
      return (
        <Select size="xs" label={f.label} mb={4}
          value={typeof v === 'string' ? v : null}
          data={Object.keys(STRUCTURES) as StructureTypeKey[]}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={nv => nv && set(nv)} />
      )
    case 'json':
      return (
        <JsonField label={f.label} value={v} opt={f.opt} placeholder={f.placeholder}
          onApply={nv => set(nv)} />
      )
  }
}

// recursive condition form — all/any nest, leaves render descriptor fields
function CondForm({ c, depth, objectiveIds, placeNames, onChange, onCenter }: {
  c: MissionCondition
  depth: number
  objectiveIds: string[]
  placeNames: string[]
  onChange: (c: MissionCondition) => void
  onCenter?: (name: string) => void
}) {
  const nested = c.kind === 'all' || c.kind === 'any'
  return (
    <Box pl={depth ? 8 : 0} mb={4}
      style={depth ? { borderLeft: '1px solid #2a3a48' } : undefined}>
      <Select size="xs" mb={4} value={c.kind} data={CONDITION_KINDS}
        styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
        onChange={k => k && onChange(conditionDefault(k as MissionCondition['kind']))} />
      {(c.kind === 'objective-active' || c.kind === 'objective-complete') ? (
        <>
          <Autocomplete size="xs" label="OBJECTIVE ID" mb={2} value={c.objective}
            data={objectiveIds}
            error={!!c.objective && !objectiveIds.includes(c.objective)}
            styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
            onChange={v => onChange({ ...c, objective: v })} />
          {!!c.objective && !objectiveIds.includes(c.objective) && (
            <Text fz={8.5} c="#e8524a" mb={4}>⚠ NO OBJECTIVE "{c.objective}" IN THIS MISSION</Text>
          )}
        </>
      ) : !nested && (CONDITION_FIELDS[c.kind] ?? []).map(f => (
        <FieldInput key={f.path} f={f} obj={c} placeNames={placeNames} onCenter={onCenter}
          onChange={nc => onChange(nc as MissionCondition)} />
      ))}
      {nested && (
        <>
          {c.of.map((sub, i) => (
            <Group key={i} gap={4} align="flex-start" wrap="nowrap">
              <Box style={{ flex: 1 }}>
                <CondForm c={sub} depth={depth + 1} objectiveIds={objectiveIds}
                  placeNames={placeNames} onCenter={onCenter}
                  onChange={nc => onChange({ ...c, of: patchItem(c.of, i, nc) })} />
              </Box>
              <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
                onClick={() => onChange({ ...c, of: dropItem(c.of, i) })}>✕</Button>
            </Group>
          ))}
          <Button size="compact-xs" variant="default" mb={4}
            onClick={() => onChange({ ...c, of: [...c.of, conditionDefault('objective-active')] })}>
            ＋ CONDITION
          </Button>
        </>
      )}
    </Box>
  )
}

const card: React.CSSProperties = {
  border: '1px solid #22303d', borderRadius: 4, padding: 6, marginBottom: 6,
}

export default function ScriptPanel({ mission, placeNames, onChange, onCenter }: {
  /** the ONE mission whose script is on the bench */
  mission: MissionScript
  /** authored places + map gazetteer + builtin anchors */
  placeNames: string[]
  onChange: (patch: Partial<MissionScript>) => void
  /** put a referenced place on screen — ◎ beside every place field */
  onCenter?: (name: string) => void
}) {
  const [raw, setRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawErr, setRawErr] = useState<string | null>(null)
  const objectives = mission.objectives ?? []
  const triggers = mission.triggers ?? []
  const objectiveIds = objectives.map(o => o.id)

  if (raw) {
    return (
      <Box p="xs" style={{ fontFamily: MONO }}>
        <Group gap={6} mb={6}>
          <Text fz={9} c="dark.3" style={{ letterSpacing: 1.5, flex: 1 }}>RAW JSON</Text>
          <Button size="compact-xs" variant="default" onClick={() => {
            try {
              const v = JSON.parse(rawText) as Partial<MissionScript>
              onChange({
                brief: v.brief,
                frago: v.frago,
                objectives: v.objectives ?? [],
                triggers: v.triggers ?? [],
              })
              setRawErr(null); setRaw(false)
            } catch (e) { setRawErr(String((e as Error).message ?? e)) }
          }}>APPLY</Button>
          <Button size="compact-xs" variant="subtle" c="dark.2" onClick={() => setRaw(false)}>
            CANCEL
          </Button>
        </Group>
        {rawErr && <Text fz={9} c="#e8524a" mb={4}>{rawErr}</Text>}
        <Textarea autosize minRows={24} value={rawText}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={ev => setRawText(ev.currentTarget.value)} />
      </Box>
    )
  }

  return (
    <Box p="xs" style={{ fontFamily: MONO }}>
      <Group gap={6} mb={6}>
        <Text fz={9} c="dark.3" style={{ letterSpacing: 1.5, flex: 1 }}>
          SCRIPT · {mission.name || mission.id}
        </Text>
        <Button size="compact-xs" variant="subtle" c="dark.2" onClick={() => {
          setRawText(JSON.stringify(
            { brief: mission.brief, frago: mission.frago,
              objectives, triggers }, null, 2))
          setRawErr(null); setRaw(true)
        }}>JSON</Button>
      </Group>

      <Textarea size="xs" label="BRIEF (OPENER OPORD)" autosize minRows={2} mb={6}
        value={mission.brief ?? ''}
        styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
        onChange={ev => onChange({ brief: ev.currentTarget.value || undefined })} />
      {/* the tasking card dropped when this mission activates mid-stream */}
      <TextInput size="xs" label="FRAGO TITLE (EMPTY = NO CARD)" mb={4}
        value={mission.frago?.title ?? ''}
        styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
        onChange={ev => {
          const title = ev.currentTarget.value
          onChange({ frago: title ? { title, text: mission.frago?.text ?? '' } : undefined })
        }} />
      {mission.frago && (
        <Textarea size="xs" label="FRAGO TEXT" autosize minRows={2} mb="sm"
          value={mission.frago.text}
          styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
          onChange={ev => onChange({
            frago: { title: mission.frago!.title, text: ev.currentTarget.value },
          })} />
      )}

      <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
        OBJECTIVES · THE MISSION'S PHASES, IN ORDER
      </Text>
      {objectives.map((o, i) => (
        <Box key={i} style={card}>
          <Group gap={4} mb={4} wrap="nowrap">
            <TextInput size="xs" value={o.id} w={90}
              styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
              onChange={ev => onChange({
                objectives: patchItem(objectives, i, { ...o, id: ev.currentTarget.value }),
              })} />
            <Box style={{ flex: 1 }} />
            <Button size="compact-xs" variant="subtle" c="dark.2" px={4} disabled={i === 0}
              onClick={() => onChange({ objectives: moveItem(objectives, i, -1) })}>↑</Button>
            <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
              disabled={i === objectives.length - 1}
              onClick={() => onChange({ objectives: moveItem(objectives, i, 1) })}>↓</Button>
            <Button size="compact-xs" variant="subtle" c="#e8524a" px={4}
              onClick={() => onChange({ objectives: dropItem(objectives, i) })}>✕</Button>
          </Group>
          <TextInput size="xs" label="LABEL" mb={4} value={o.label}
            styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
            onChange={ev => onChange({
              objectives: patchItem(objectives, i,
                { ...o, label: ev.currentTarget.value.toUpperCase() }),
            })} />
          <Select size="xs" label="KIND" mb={4} value={o.kind} data={OBJECTIVE_KINDS}
            styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
            onChange={k => k && onChange({
              objectives: patchItem(objectives, i, {
                ...objectiveDefault(k as MissionObjectiveKind, i + 1),
                id: o.id, label: o.label, ...(o.reports ? { reports: o.reports } : {}),
              }),
            })} />
          {OBJECTIVE_FIELDS[o.kind].map(f => (
            <FieldInput key={f.path} f={f} obj={o} placeNames={placeNames} onCenter={onCenter}
              onChange={no => onChange({
                objectives: patchItem(objectives, i, no as MissionObjective),
              })} />
          ))}
          <MultiSelect size="xs" label="STAFF REPORTS ON CLOSE" mb={2}
            value={o.reports ?? []} data={['s1', 's2', 's3', 's4']}
            styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
            onChange={v => onChange({
              objectives: patchItem(objectives, i, {
                ...o, reports: v.length ? (v as MissionObjective['reports']) : undefined,
              }),
            })} />
        </Box>
      ))}
      <Button size="compact-xs" variant="default" mb="sm"
        onClick={() => onChange({
          objectives: [...objectives, objectiveDefault('clear-area', objectives.length + 1)],
        })}>
        ＋ OBJECTIVE
      </Button>

      <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
        TRIGGERS · WHEN → DO, EFFECTS IN ORDER
      </Text>
      {triggers.map((t, i) => (
        <Box key={i} style={card}>
          <Group gap={4} mb={4} wrap="nowrap">
            <TextInput size="xs" value={t.id} w={110}
              styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
              onChange={ev => onChange({
                triggers: patchItem(triggers, i, { ...t, id: ev.currentTarget.value }),
              })} />
            <Box style={{ flex: 1 }} />
            <Button size="compact-xs" variant="subtle" c="dark.2" px={4} disabled={i === 0}
              onClick={() => onChange({ triggers: moveItem(triggers, i, -1) })}>↑</Button>
            <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
              disabled={i === triggers.length - 1}
              onClick={() => onChange({ triggers: moveItem(triggers, i, 1) })}>↓</Button>
            <Button size="compact-xs" variant="subtle" c="#e8524a" px={4}
              onClick={() => onChange({ triggers: dropItem(triggers, i) })}>✕</Button>
          </Group>
          <Text fz={8.5} c="dark.3" mb={2}>WHEN</Text>
          <CondForm c={t.when} depth={0} objectiveIds={objectiveIds} placeNames={placeNames}
            onCenter={onCenter}
            onChange={nc => onChange({
              triggers: patchItem(triggers, i, { ...t, when: nc }),
            })} />
          <Text fz={8.5} c="dark.3" mb={2}>DO</Text>
          {t.do.map((e, j) => (
            <Box key={j} ml={6} mb={4} pl={6} style={{ borderLeft: '2px solid #2a3a48' }}>
              <Group gap={4} wrap="nowrap" mb={2}>
                <Select size="xs" value={e.kind} data={EFFECT_KINDS} style={{ flex: 1 }}
                  styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                  onChange={k => k && onChange({
                    triggers: patchItem(triggers, i,
                      { ...t, do: patchItem(t.do, j, effectDefault(k as MissionEffect['kind'])) }),
                  })} />
                <Button size="compact-xs" variant="subtle" c="dark.2" px={4} disabled={j === 0}
                  onClick={() => onChange({
                    triggers: patchItem(triggers, i, { ...t, do: moveItem(t.do, j, -1) }),
                  })}>↑</Button>
                <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
                  disabled={j === t.do.length - 1}
                  onClick={() => onChange({
                    triggers: patchItem(triggers, i, { ...t, do: moveItem(t.do, j, 1) }),
                  })}>↓</Button>
                <Button size="compact-xs" variant="subtle" c="#e8524a" px={4}
                  onClick={() => onChange({
                    triggers: patchItem(triggers, i, { ...t, do: dropItem(t.do, j) }),
                  })}>✕</Button>
              </Group>
              {EFFECT_FIELDS[e.kind].map(f => (
                <FieldInput key={f.path} f={f} obj={e} placeNames={placeNames} onCenter={onCenter}
                  onChange={ne => onChange({
                    triggers: patchItem(triggers, i,
                      { ...t, do: patchItem(t.do, j, ne as MissionEffect) }),
                  })} />
              ))}
            </Box>
          ))}
          <Button size="compact-xs" variant="default"
            onClick={() => onChange({
              triggers: patchItem(triggers, i,
                { ...t, do: [...t.do, effectDefault('radio')] }),
            })}>
            ＋ EFFECT
          </Button>
        </Box>
      ))}
      <Button size="compact-xs" variant="default" mb="sm"
        onClick={() => onChange({
          triggers: [...triggers, {
            id: `trigger-${triggers.length + 1}`,
            when: conditionDefault('objective-active'), do: [],
          }],
        })}>
        ＋ TRIGGER
      </Button>

      {mission.tutorial && (
        <Text fz={8.5} c="dark.3">
          TUTORIAL · {mission.tutorial.steps.length} STEPS — CARRIED WITH THE
          MISSION, EDITED IN THE PACK FILE
        </Text>
      )}
    </Box>
  )
}
