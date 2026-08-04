// SCRIPT FIELD RENDERERS — one input per descriptor kind, and the recursive
// condition form.
//
// These used to live inside the script panel, which owned both the LISTS of
// objectives and triggers and the FORMS for each one. Now the outline owns the
// lists and the inspector owns the forms, so the renderers are shared and
// neither panel has to know about the other.
//
// The forms are GENERATED from descriptors.ts — one row per engine verb. A new
// verb ships a descriptor and gets its editor for free; there is no bespoke UI
// per verb anywhere in this tool, and that is deliberate: the engine's
// vocabulary changes faster than any hand-written panel could keep up with.
import { useState } from 'react'
import {
  Autocomplete, Box, Button, Checkbox, Group, NumberInput, Select, Text, Textarea, TextInput,
} from '@mantine/core'
import type { MissionCondition } from '../../packs/types'
import { STRUCTURES, type StructureTypeKey } from '../../domains/installations/catalog'
import {
  CONDITION_FIELDS, CONDITION_KINDS, conditionDefault, getPath, setPath, type FieldSpec,
} from './descriptors'
import { isBuiltinPlace } from '../../scenario/content'
import { field, IconBtn, INK, Row, TextBtn, UI_FONT } from './panel'

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

/** Descriptor labels are written for a machine ('ZONE RADIUS M', 'RADIO FROM').
 *  The panel is read by a person, so they are rendered in sentence case with
 *  the unit split out — the property grid's job, not the descriptor's. */
function pretty(label: string): { text: string; unit?: string } {
  let s = label.trim()
  let unit: string | undefined
  const m = /\s+(M|METRES|MS|°)$/i.exec(s)
  if (m) { unit = m[1] === '°' ? '°' : ' m'; s = s.slice(0, m.index) }
  s = s.replace(/\s*·.*$/, '')
  const words = s.toLowerCase().split(/\s+/)
  const head = words[0] ?? ''
  return {
    text: (head.charAt(0).toUpperCase() + head.slice(1) + ' ' + words.slice(1).join(' ')).trim(),
    unit,
  }
}

// a JSON param that the form language can't say — parsed on blur, red on error
function JsonField({ value, opt, placeholder, onApply }: {
  value: unknown; opt?: boolean; placeholder?: string
  onApply: (v: unknown) => void
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value)))
  const [bad, setBad] = useState(false)
  return (
    <Textarea size="xs" autosize minRows={1} styles={field}
      value={text} error={bad} placeholder={placeholder}
      onChange={ev => setText(ev.currentTarget.value)}
      onBlur={() => {
        const t = text.trim()
        if (!t && opt) { setBad(false); onApply(undefined); return }
        try { onApply(JSON.parse(t)); setBad(false) } catch { setBad(true) }
      }} />
  )
}

/** one descriptor-driven field over a verb object */
export function FieldInput({ f, obj, placeNames, onChange, onCenter }: {
  f: FieldSpec
  obj: unknown
  placeNames: string[]
  onChange: (next: unknown) => void
  /** show this place on the sheet — where IS the objective, actually */
  onCenter?: (name: string) => void
}) {
  const v = getPath(obj, f.path)
  const set = (nv: unknown) => onChange(setPath(obj, f.path, nv))
  const { text: label, unit } = pretty(f.label)
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
        <Row label={label} warn={issue ?? undefined}>
          <Group gap={4} wrap="nowrap">
            <Autocomplete size="xs" value={s} data={placeNames}
              error={!!issue} style={{ flex: 1 }} styles={field}
              onChange={nv => {
                const t = nv.trim()
                if (!t) { set(f.kind === 'placeOrNull' ? null : ''); return }
                if (t.startsWith('{')) { try { set(JSON.parse(t)) } catch { set(nv) } }
                else set(nv)
              }} />
            <IconBtn disabled={!canCenter}
              title={canCenter ? `Show ${name} on the sheet` : 'Pick an authored place to locate it'}
              onClick={() => canCenter && onCenter?.(name!)}>◎</IconBtn>
          </Group>
        </Row>
      )
    }
    case 'number':
      return (
        <Row label={label}>
          <NumberInput size="xs" styles={field} suffix={unit}
            value={typeof v === 'number' ? v : ''}
            onChange={nv => set(typeof nv === 'number' ? nv : f.opt ? undefined : 0)} />
        </Row>
      )
    case 'string':
      return (
        <Row label={label}>
          <TextInput size="xs" styles={field} value={typeof v === 'string' ? v : ''}
            placeholder={f.placeholder}
            onChange={ev => set(ev.currentTarget.value || (f.opt ? undefined : ''))} />
        </Row>
      )
    case 'text':
      // prose gets the full width: a paragraph in a 140px column is useless
      return (
        <Row label={label} wide>
          <Textarea size="xs" autosize minRows={2} styles={field}
            value={typeof v === 'string' ? v : ''}
            onChange={ev => set(ev.currentTarget.value)} />
        </Row>
      )
    case 'bool':
      // the radio `at` param is the one enum-flag: checked = 'ctx'
      if (f.path.endsWith('.at')) {
        return (
          <Row label={label}>
            <Checkbox size="xs" checked={v === 'ctx'}
              onChange={ev => set(ev.currentTarget.checked ? 'ctx' : undefined)} />
          </Row>
        )
      }
      return (
        <Row label={label}>
          <Checkbox size="xs" checked={!!v}
            onChange={ev => set(ev.currentTarget.checked)} />
        </Row>
      )
    case 'unitList':
    case 'stringList': {
      const s = Array.isArray(v) ? (v as string[]).join(', ') : ''
      return (
        <Row label={label}>
          <TextInput size="xs" styles={field} value={s}
            placeholder={f.placeholder ?? 'MECH, INF, MOR'}
            onChange={ev => {
              const list = ev.currentTarget.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean)
              set(list.length || !f.opt ? list : undefined)
            }} />
        </Row>
      )
    }
    case 'structKind':
      return (
        <Row label={label}>
          <Select size="xs" styles={field}
            value={typeof v === 'string' ? v : null}
            data={Object.keys(STRUCTURES) as StructureTypeKey[]}
            onChange={nv => nv && set(nv)} />
        </Row>
      )
    case 'json':
      return (
        <Row label={label} wide hint={f.placeholder}>
          <JsonField value={v} opt={f.opt} placeholder={f.placeholder}
            onApply={nv => set(nv)} />
        </Row>
      )
  }
}

/** recursive condition form — all/any nest, leaves render descriptor fields */
export function CondForm({ c, depth, objectiveIds, placeNames, onChange, onCenter }: {
  c: MissionCondition
  depth: number
  objectiveIds: string[]
  placeNames: string[]
  onChange: (c: MissionCondition) => void
  onCenter?: (name: string) => void
}) {
  const nested = c.kind === 'all' || c.kind === 'any'
  const bad = (c.kind === 'objective-active' || c.kind === 'objective-complete')
    && !!c.objective && !objectiveIds.includes(c.objective)
  return (
    <Box ml={depth ? 8 : 0}
      style={depth ? { borderLeft: `1px solid ${INK.line}` } : undefined}>
      <Row label={depth ? 'and / or' : 'Condition'}>
        <Select size="xs" value={c.kind} data={CONDITION_KINDS} styles={field}
          onChange={k => k && onChange(conditionDefault(k as MissionCondition['kind']))} />
      </Row>
      {(c.kind === 'objective-active' || c.kind === 'objective-complete') ? (
        <Row label="Objective"
          warn={bad ? `No objective "${c.objective}" in this mission` : undefined}>
          <Autocomplete size="xs" value={c.objective} data={objectiveIds} styles={field}
            error={bad} onChange={v => onChange({ ...c, objective: v })} />
        </Row>
      ) : !nested && (CONDITION_FIELDS[c.kind] ?? []).map(f => (
        <FieldInput key={f.path} f={f} obj={c} placeNames={placeNames} onCenter={onCenter}
          onChange={nc => onChange(nc as MissionCondition)} />
      ))}
      {nested && (
        <>
          {c.of.map((sub, i) => (
            <Group key={i} gap={4} align="flex-start" wrap="nowrap" pr={8}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <CondForm c={sub} depth={depth + 1} objectiveIds={objectiveIds}
                  placeNames={placeNames} onCenter={onCenter}
                  onChange={nc => onChange({
                    ...c, of: c.of.map((x, k) => (k === i ? nc : x)),
                  })} />
              </Box>
              <IconBtn title="Remove" danger
                onClick={() => onChange({ ...c, of: c.of.filter((_, k) => k !== i) })}>✕</IconBtn>
            </Group>
          ))}
          <Box px={8} py={4}>
            <TextBtn onClick={() => onChange({ ...c, of: [...c.of, conditionDefault('objective-active')] })}>
              ＋ Condition
            </TextBtn>
          </Box>
        </>
      )}
    </Box>
  )
}

/** the panel's small print, in the tool's voice */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text px={10} py={6} style={{
      fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim, lineHeight: 1.45,
    }}>
      {children}
    </Text>
  )
}
