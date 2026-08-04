// THE CURRICULUM EDITOR — a tutorial step, and one of its hints.
//
// A tutorial was the last part of a mission the builder carried OPAQUE: the
// panel said "21 steps — edited in the pack file" and that was the whole
// affordance. It is also the most writing-heavy content in the game, and you
// could not read a single line of it without launching the campaign and
// playing to the beat you wanted to check.
//
// Two things make this editable rather than merely exposed:
//
//   THE HINT LIST IS A DECISION TABLE, not a sequence. The first hint whose
//   `when` matches renders THIS FRAME. So a step is "what do I say right now,
//   given where the player has got to" — nothing selected, tell them to
//   select; selected, tell them to launch. The panel says so, because reading
//   the array as a script is the obvious wrong assumption.
//
//   THE CARD IS PREVIEWED. Tutorial copy is 90% of the work and it was
//   invisible. The preview renders the same text, action line and pacing the
//   player will see, at the size they will see it.
import { Box, Checkbox, Group, NumberInput, Select, Text, Textarea, TextInput } from '@mantine/core'
import type { TutAnchor, TutCondition, TutHint, TutStep } from '../../packs/types'
import type { Sel } from '../../scenario/edit'
import {
  TUT_ANCHOR_COMPUTED, TUT_ANCHOR_DOC, TUT_ANCHOR_FIELDS, TUT_ANCHOR_KINDS,
  TUT_CONDITION_DOC, TUT_CONDITION_FIELDS, TUT_CONDITION_KINDS,
  tutAnchorDefault, tutConditionDefault,
} from './tutDescriptors'
import { TUT_TARGETS, fieldTarget } from '../tutTargets'
import { FieldInput, Note } from './scriptFields'
import {
  DATA_FONT, field, IconBtn, INK, PanelHead, Row, Section, TextBtn, UI_FONT,
} from './panel'

const move = <T,>(a: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d
  if (j < 0 || j >= a.length) return a
  const b = [...a]; const t = b[i]!; b[i] = b[j]!; b[j] = t
  return b
}

/** the recursive teaching-condition form — `not` wraps one, `all` wraps many */
function TutCondForm({ c, depth, placeNames, unitTypes, onChange }: {
  c: TutCondition
  depth: number
  placeNames: string[]
  unitTypes: string[]
  onChange: (c: TutCondition) => void
}) {
  const doc = TUT_CONDITION_DOC[c.kind]
  return (
    <Box ml={depth ? 8 : 0} style={depth ? { borderLeft: `1px solid ${INK.line}` } : undefined}>
      <Row label={depth ? 'and' : 'Condition'} hint={doc}>
        <Select size="xs" value={c.kind} data={TUT_CONDITION_KINDS} styles={field} searchable
          onChange={k => k && onChange(tutConditionDefault(k as TutCondition['kind']))} />
      </Row>
      {c.kind === 'not' && (
        <TutCondForm c={c.of} depth={depth + 1} placeNames={placeNames} unitTypes={unitTypes}
          onChange={n => onChange({ ...c, of: n })} />
      )}
      {c.kind === 'all' && (
        <>
          {c.of.map((sub, i) => (
            <Group key={i} gap={4} align="flex-start" wrap="nowrap" pr={8}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <TutCondForm c={sub} depth={depth + 1} placeNames={placeNames}
                  unitTypes={unitTypes}
                  onChange={n => onChange({ ...c, of: c.of.map((x, k) => (k === i ? n : x)) })} />
              </Box>
              <IconBtn title="Remove" danger
                onClick={() => onChange({ ...c, of: c.of.filter((_, k) => k !== i) })}>✕</IconBtn>
            </Group>
          ))}
          <Box px={8} py={4}>
            <TextBtn onClick={() => onChange({ ...c, of: [...c.of, tutConditionDefault('briefed')] })}>
              ＋ Condition
            </TextBtn>
          </Box>
        </>
      )}
      {c.kind !== 'not' && c.kind !== 'all' && (TUT_CONDITION_FIELDS[c.kind] ?? []).map(f => (
        // unit-type params get the pack's own catalog rather than free text —
        // the whole class of bug this tool keeps finding
        f.path === 'type'
          ? (
            <Row key={f.path} label="Unit type">
              <Select size="xs" styles={field} searchable data={unitTypes}
                value={(c as Record<string, unknown>).type as string ?? null}
                onChange={v => v && onChange({ ...c, type: v } as TutCondition)} />
            </Row>
          )
          : (
            <FieldInput key={f.path} f={f} obj={c} placeNames={placeNames}
              onChange={n => onChange(n as TutCondition)} />
          )
      ))}
    </Box>
  )
}

/** where the cue points */
function AnchorForm({ a, placeNames, unitTypes, onChange }: {
  a: TutAnchor
  placeNames: string[]
  unitTypes: string[]
  onChange: (a: TutAnchor) => void
}) {
  const computed = TUT_ANCHOR_COMPUTED.includes(a.kind)
  return (
    <>
      <Row label="Anchor" hint={TUT_ANCHOR_DOC[a.kind]}>
        <Select size="xs" value={a.kind} data={TUT_ANCHOR_KINDS} styles={field}
          onChange={k => k && onChange(tutAnchorDefault(k as TutAnchor['kind']))} />
      </Row>
      {/* THE UI TARGET IS A PICKER. It used to be a bare string resolved with
          querySelector, so a typo produced a hint pointing at nothing — no
          error, no missing cue, just an unanchored card. */}
      {a.kind === 'ui' && (
        <Row label="Target" hint="What the interface actually publishes.">
          <Select size="xs" styles={field} searchable value={a.sel || null}
            data={[
              { group: 'Controls', items: TUT_TARGETS.map(t => ({ value: t.id, label: `${t.where} · ${t.what}` })) },
              { group: 'CALL UP rows', items: unitTypes.map(t => ({ value: fieldTarget(t), label: `Field ${t}` })) },
            ]}
            onChange={v => v && onChange({ ...a, sel: v })} />
        </Row>
      )}
      {a.kind !== 'ui' && (TUT_ANCHOR_FIELDS[a.kind] ?? []).map(f => (
        f.path === 'type'
          ? (
            <Row key={f.path} label="Unit type">
              <Select size="xs" styles={field} searchable data={unitTypes}
                value={(a as Record<string, unknown>).type as string ?? null}
                onChange={v => v && onChange({ ...a, type: v } as TutAnchor)} />
            </Row>
          )
          : (
            <FieldInput key={f.path} f={f} obj={a} placeNames={placeNames}
              onChange={n => onChange(n as TutAnchor)} />
          )
      ))}
      {computed && (
        <Note>
          Computed from the running world — the builder cannot draw it on the
          sheet without a sim, so this one is only previewable in PLAY.
        </Note>
      )}
    </>
  )
}

/** THE CARD, as the player gets it. Copy is the work here, and it was
 *  invisible until you played to the beat. */
function CardPreview({ hint }: { hint: TutHint }) {
  if (hint.hide) {
    return (
      <Box px={10} py={8}>
        <Text style={{ fontFamily: UI_FONT, fontSize: 12, color: INK.dim }}>
          Shows nothing this frame — a deliberate silence.
        </Text>
      </Box>
    )
  }
  return (
    <Box p={10}>
      <Box p={12} style={{
        border: '1px solid #2a4256', borderRadius: 3, background: 'rgba(10,20,30,0.95)',
        maxWidth: 330,
      }}>
        <Text style={{
          fontFamily: UI_FONT, fontSize: 13, lineHeight: 1.5, color: '#dbe6f0',
          whiteSpace: 'pre-wrap',
        }}>
          {hint.text || <span style={{ color: INK.bad }}>No text — this card renders empty</span>}
        </Text>
        {hint.action && (
          <Text mt={8} style={{
            fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 600, color: '#8fd4ff',
          }}>
            {hint.action}
          </Text>
        )}
        {hint.next && (
          <Box mt={10} style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 2,
            border: '1px solid #35506a', background: '#16222e',
            fontFamily: UI_FONT, fontSize: 12, color: '#9ab8d0',
          }}>
            NEXT
          </Box>
        )}
      </Box>
      <Text mt={6} style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim }}>
        {hint.next ? 'Holds until the player clicks NEXT.'
          : hint.dwell ? `Holds ${hint.dwell}s, then falls through to the next hint.`
          : 'Holds until this step’s done condition is met.'}
      </Text>
    </Box>
  )
}

export default function TutInspector({
  sel, step, placeNames, unitTypes, onSelect, onPatchStep, onDeleteStep, onMoveStep, stepCount,
}: {
  sel: Extract<Sel, { k: 'tutStep' } | { k: 'tutHint' }>
  step: TutStep
  placeNames: string[]
  /** the friend pack's own unit keys — conditions and anchors name pack nouns */
  unitTypes: string[]
  onSelect: (s: Sel) => void
  onPatchStep: (patch: Partial<TutStep>) => void
  onDeleteStep: () => void
  onMoveStep: (d: -1 | 1) => void
  stepCount: number
}) {
  const hints = step.hints ?? []

  // ------------------------------------------------------------------ STEP
  if (sel.k === 'tutStep') {
    return (
      <Box style={{ background: INK.bg }}>
        <PanelHead kind={`Lesson ${String(sel.s + 1).padStart(2, '0')}`} name={step.id}
          right={
            <Group gap={4} wrap="nowrap">
              <IconBtn title="Earlier" disabled={sel.s === 0} onClick={() => onMoveStep(-1)}>↑</IconBtn>
              <IconBtn title="Later" disabled={sel.s >= stepCount - 1}
                onClick={() => onMoveStep(1)}>↓</IconBtn>
              <IconBtn title="Delete (Ctrl+Z takes it back)" danger onClick={onDeleteStep}>✕</IconBtn>
            </Group>
          } />

        <Section title="Lesson">
          <Row label="Id">
            <TextInput size="xs" styles={field} value={step.id}
              onChange={ev => onPatchStep({ id: ev.currentTarget.value })} />
          </Row>
          <Row label="Hold the war"
            hint="Freezes the sim while this lesson runs — for beats the player must read rather than react to.">
            <Checkbox size="xs" checked={!!step.gate}
              onChange={ev => onPatchStep({ gate: ev.currentTarget.checked || undefined })} />
          </Row>
        </Section>

        <Section title="Done when"
          note="the player has performed the lesson">
          <TutCondForm c={step.done} depth={0} placeNames={placeNames} unitTypes={unitTypes}
            onChange={c => onPatchStep({ done: c })} />
        </Section>

        <Section title="What it says" note={`${hints.length}`}>
          <Note>
            The FIRST hint whose condition matches renders this frame — the list
            is a decision table, not a script. Put the most specific case first.
          </Note>
          {hints.map((h, i) => (
            <Row key={i} label={String(i + 1).padStart(2, '0')}>
              <Group gap={4} wrap="nowrap">
                <Box style={{
                  flex: 1, minWidth: 0, cursor: 'pointer', padding: '4px 6px',
                  fontFamily: UI_FONT, fontSize: 12.5, color: INK.value,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                  onClick={() => onSelect({ k: 'tutHint', m: sel.m, s: sel.s, h: i })}>
                  {h.hide ? '(silent)' : (h.text?.split('\n')[0] || '(no text)')}
                </Box>
                <IconBtn title="Earlier" disabled={i === 0}
                  onClick={() => onPatchStep({ hints: move(hints, i, -1) })}>↑</IconBtn>
                <IconBtn title="Later" disabled={i === hints.length - 1}
                  onClick={() => onPatchStep({ hints: move(hints, i, 1) })}>↓</IconBtn>
                <IconBtn title="Remove" danger
                  onClick={() => onPatchStep({ hints: hints.filter((_, k) => k !== i) })}>✕</IconBtn>
              </Group>
            </Row>
          ))}
          <Box px={8} py={4}>
            <TextBtn onClick={() => {
              onPatchStep({ hints: [...hints, { text: '' }] })
              onSelect({ k: 'tutHint', m: sel.m, s: sel.s, h: hints.length })
            }}>＋ Hint</TextBtn>
          </Box>
        </Section>
      </Box>
    )
  }

  // ------------------------------------------------------------------ HINT
  const h = hints[sel.h]
  if (!h) return null
  const patch = (n: Partial<TutHint>) =>
    onPatchStep({ hints: hints.map((x, k) => (k === sel.h ? { ...x, ...n } : x)) })

  return (
    <Box style={{ background: INK.bg }}>
      <PanelHead kind={`Hint ${String(sel.h + 1).padStart(2, '0')}`}
        name={step.id}
        right={
          <Group gap={4} wrap="nowrap">
            <IconBtn title="Back to the lesson"
              onClick={() => onSelect({ k: 'tutStep', m: sel.m, s: sel.s })}>◀</IconBtn>
            <IconBtn title="Remove" danger onClick={() => {
              onPatchStep({ hints: hints.filter((_, k) => k !== sel.h) })
              onSelect({ k: 'tutStep', m: sel.m, s: sel.s })
            }}>✕</IconBtn>
          </Group>
        } />

      <Section title="Preview" defaultOpen>
        <CardPreview hint={h} />
      </Section>

      <Section title="Copy">
        <Row label="Text" wide>
          <Textarea size="xs" autosize minRows={4} styles={field} value={h.text ?? ''}
            onChange={ev => patch({ text: ev.currentTarget.value || undefined })} />
        </Row>
        <Row label="Action" wide
          hint="The imperative line — what to actually click. Leave empty for a beat that only explains.">
          <TextInput size="xs" styles={field} value={h.action ?? ''}
            placeholder="CLICK ACKNOWLEDGE."
            onChange={ev => patch({ action: ev.currentTarget.value || undefined })} />
        </Row>
      </Section>

      <Section title="Shown when" defaultOpen={!!h.when}>
        {h.when ? (
          <>
            <TutCondForm c={h.when} depth={0} placeNames={placeNames} unitTypes={unitTypes}
              onChange={c => patch({ when: c })} />
            <Box px={8} py={4}>
              <TextBtn onClick={() => patch({ when: undefined })}>Always show</TextBtn>
            </Box>
          </>
        ) : (
          <>
            <Note>
              No condition — this hint is the fallback, and any hint below it can
              never render.
            </Note>
            <Box px={8} py={4}>
              <TextBtn onClick={() => patch({ when: tutConditionDefault('briefed') })}>
                ＋ Condition
              </TextBtn>
            </Box>
          </>
        )}
      </Section>

      <Section title="Pacing">
        <Row label="Wait for NEXT"
          hint="The player's clock. Prefer it for anything they have to READ — a timer either rushes a slow reader or bores a fast one.">
          <Checkbox size="xs" checked={!!h.next}
            onChange={ev => patch({
              next: ev.currentTarget.checked || undefined,
              ...(ev.currentTarget.checked ? { dwell: undefined } : {}),
            })} />
        </Row>
        <Row label="Dwell" hint="Hold N seconds, then fall through to the next hint.">
          <NumberInput size="xs" styles={field} value={h.dwell ?? ''} min={0} suffix=" s"
            disabled={!!h.next} placeholder="—"
            onChange={v => patch({ dwell: typeof v === 'number' && v > 0 ? v : undefined })} />
        </Row>
        <Row label="Silent" hint="Show no cue at all this frame — e.g. while a platoon is en route.">
          <Checkbox size="xs" checked={!!h.hide}
            onChange={ev => patch({ hide: ev.currentTarget.checked || undefined })} />
        </Row>
      </Section>

      <Section title="Where it points" defaultOpen={!!h.anchor}>
        {h.anchor ? (
          <>
            <AnchorForm a={h.anchor} placeNames={placeNames} unitTypes={unitTypes}
              onChange={a => patch({ anchor: a })} />
            <Box px={8} py={4}>
              <TextBtn onClick={() => patch({ anchor: undefined })}>No anchor</TextBtn>
            </Box>
          </>
        ) : (
          <Box px={8} py={4}>
            <TextBtn onClick={() => patch({ anchor: tutAnchorDefault('ui') })}>＋ Anchor</TextBtn>
          </Box>
        )}
      </Section>

      <Text px={10} py={8} style={{ fontFamily: DATA_FONT, fontSize: 11.5, color: INK.dim }}>
        step {step.id} · hint {sel.h + 1} of {hints.length}
      </Text>
    </Box>
  )
}
