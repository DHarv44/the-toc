// TUTORIAL VOCABULARY DESCRIPTORS — the curriculum's half of descriptors.ts.
//
// TutCondition and TutAnchor are discriminated unions with a `kind`, exactly
// like MissionCondition and MissionEffect, so the forms generate from tables
// the same way and the script inspector renders them with the same components.
// Adding a teaching condition to the engine costs one row here.
//
// The labels are written for a person choosing a lesson, not for a schema.
// 'callup-cat' is "CALL UP · a capability opened"; the author is picking the
// moment in the drill-down they want to talk over, and the tree of rungs is
// the thing they have to reason about.
import type { FieldSpec } from './descriptors'
import type { TutAnchor, TutCondition } from '../../packs/types'

// --- conditions -------------------------------------------------------------
// grouped in the order a curriculum reaches for them: the UI first (most
// lessons teach a control), then the world, then the combinators.

export const TUT_CONDITION_KINDS: TutCondition['kind'][] = [
  // reading the order
  'briefed', 'vtc-paged',
  // the rails and the pickers
  'rail-open', 'callup-open', 'callup-base', 'callup-cat', 'callup-co',
  // selection and orders
  'selected-only', 'selected-struct', 'selected-carrier', 'group-selected',
  'mode-is', 'roe-set', 'attack-ordered',
  // the force on the ground
  'fielded', 'drone-aloft', 'unit-beyond', 'view-near-hq', 'enemy-spotted',
  'column-has-orders', 'column-routed', 'column-at',
  'force-holding', 'force-at-marker', 'dug-in', 'area-clear',
  'structure-built', 'convoy-running',
  // combinators
  'not', 'all',
]

/** what each condition MEANS, in the author's language — shown under the picker
 *  so a curriculum writer is choosing a teachable moment, not a type name */
export const TUT_CONDITION_DOC: Partial<Record<TutCondition['kind'], string>> = {
  'briefed': 'The opening VTC has been acknowledged.',
  'vtc-paged': 'The player drove the deck by hand rather than letting it walk.',
  'rail-open': 'A side rail is expanded.',
  'callup-open': 'The CALL UP picker is open.',
  'callup-base': 'A garrison has been picked inside CALL UP.',
  'callup-cat': 'A capability group is open inside CALL UP.',
  'callup-co': 'A company under that capability is open.',
  'selected-only': 'Exactly one unit is selected, and it is of this type.',
  'selected-struct': 'A structure of this kind is selected.',
  'selected-carrier': 'The selected unit carries a drone.',
  'group-selected': 'At least this many units are selected together.',
  'mode-is': 'The command mode matches (prefix match — "build" catches "build:FOB").',
  'roe-set': 'A unit of this type has been put on this ROE.',
  'attack-ordered': 'A line unit has an attack order.',
  'fielded': 'This many are on the ground.',
  'drone-aloft': 'A drone is up.',
  'unit-beyond': 'A unit of this type is this far from the player HQ.',
  'view-near-hq': 'The map is centred within this distance of the HQ.',
  'enemy-spotted': 'Any live contact is on the COP.',
  'column-has-orders': 'These types have been given a move order.',
  'column-routed': 'These types are routed toward the place, or already there.',
  'column-at': 'These types have ARRIVED at the place.',
  'force-holding': 'The force is holding within the place.',
  'force-at-marker': 'The force has closed on a COMPUTED point — the engine works it out from the ground, so the lesson never authors a coordinate the terrain may not honour.',
  'dug-in': 'The force is dug in within the place.',
  'area-clear': 'Nothing hostile remains inside the place.',
  'structure-built': 'A structure of this kind has been completed.',
  'convoy-running': 'A supply convoy is on the road.',
  'not': 'Inverts the condition inside it.',
  'all': 'Every condition inside it holds.',
}

export const TUT_CONDITION_FIELDS: Partial<Record<TutCondition['kind'], FieldSpec[]>> = {
  'rail-open': [{ path: 'rail', label: 'RAIL', kind: 'string', placeholder: 'forces / command / net / feeds' }],
  'callup-cat': [{ path: 'cat', label: 'CAPABILITY', kind: 'string', placeholder: 'ARMOR' }],
  'callup-co': [{ path: 'cat', label: 'CAPABILITY', kind: 'string', placeholder: 'ARMOR' }],
  'selected-only': [{ path: 'type', label: 'UNIT TYPE', kind: 'string', placeholder: 'SCT' }],
  'selected-struct': [{ path: 'struct', label: 'STRUCTURE', kind: 'structKind' }],
  'group-selected': [
    { path: 'min', label: 'AT LEAST', kind: 'number' },
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
  ],
  'mode-is': [{ path: 'mode', label: 'COMMAND MODE', kind: 'string', placeholder: 'build' }],
  'roe-set': [
    { path: 'type', label: 'UNIT TYPE', kind: 'string', placeholder: 'SCT' },
    { path: 'roe', label: 'ROE', kind: 'string', placeholder: 'break' },
  ],
  'attack-ordered': [{ path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true }],
  'fielded': [
    { path: 'type', label: 'UNIT TYPE', kind: 'string', opt: true, placeholder: 'any' },
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
    { path: 'min', label: 'AT LEAST', kind: 'number' },
  ],
  'unit-beyond': [
    { path: 'type', label: 'UNIT TYPE', kind: 'string', placeholder: 'SCT' },
    { path: 'dist', label: 'DISTANCE M', kind: 'number' },
  ],
  'view-near-hq': [{ path: 'dist', label: 'WITHIN M', kind: 'number' }],
  'column-has-orders': [{ path: 'types', label: 'TYPES', kind: 'unitList' }],
  'column-routed': [
    { path: 'types', label: 'TYPES', kind: 'unitList' },
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
  ],
  'column-at': [
    { path: 'types', label: 'TYPES', kind: 'unitList' },
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
  ],
  'area-clear': [
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
  ],
  'force-holding': [
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
    { path: 'spread', label: 'SPREAD M', kind: 'number', opt: true },
    { path: 'routed', label: 'GRADE THE ORDER, NOT THE ARRIVAL', kind: 'bool', opt: true },
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
  ],
  'force-at-marker': [
    { path: 'marker', label: 'MARKER', kind: 'string', placeholder: 'attack-pos / ap-approach / screen-marker / road-marker' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
    { path: 'routed', label: 'GRADE THE ORDER, NOT THE ARRIVAL', kind: 'bool', opt: true },
    { path: 'spread', label: 'SPREAD M', kind: 'number', opt: true },
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
  ],
  'dug-in': [
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
  ],
  'structure-built': [{ path: 'struct', label: 'STRUCTURE', kind: 'structKind' }],
}

export function tutConditionDefault(kind: TutCondition['kind']): TutCondition {
  switch (kind) {
    case 'rail-open': return { kind, rail: 'forces' }
    case 'callup-cat': return { kind, cat: '' }
    case 'callup-co': return { kind, cat: '' }
    case 'selected-only': return { kind, type: '' as never }
    case 'selected-struct': return { kind, struct: 'FOB' }
    case 'group-selected': return { kind, min: 2 }
    case 'mode-is': return { kind, mode: '' }
    case 'roe-set': return { kind, type: '' as never, roe: 'break' }
    case 'fielded': return { kind, min: 1 }
    case 'unit-beyond': return { kind, type: '' as never, dist: 800 }
    case 'view-near-hq': return { kind, dist: 1200 }
    case 'column-has-orders': return { kind, types: [] }
    case 'column-routed': return { kind, types: [], place: '', r: 400 }
    case 'column-at': return { kind, types: [], place: '', r: 400 }
    case 'area-clear': return { kind, place: '', r: 420 }
    case 'force-holding': return { kind, place: '', r: 420 }
    case 'force-at-marker': return { kind, marker: 'attack-pos', r: 300 }
    case 'dug-in': return { kind, place: '', r: 420 }
    case 'structure-built': return { kind, struct: 'FOB' }
    case 'not': return { kind, of: { kind: 'briefed' } }
    case 'all': return { kind, of: [] }
    default: return { kind } as TutCondition
  }
}

// --- anchors ----------------------------------------------------------------

export const TUT_ANCHOR_KINDS: TutAnchor['kind'][] = [
  'ui', 'unit', 'struct', 'spotted-enemy', 'point', 'box', 'force-box',
  'pan-to', 'screen-marker', 'road-marker', 'attack-pos', 'ap-approach',
]

export const TUT_ANCHOR_DOC: Partial<Record<TutAnchor['kind'], string>> = {
  'ui': 'A control on screen — pick from what the interface actually publishes.',
  'unit': 'A ring on the first friendly unit of this type.',
  'struct': 'A ring on a friendly structure of this kind.',
  'spotted-enemy': 'The live contact nearest the scouts.',
  'point': 'A place from this scenario’s gazetteer.',
  'box': 'A box around a place, at this radius.',
  'force-box': 'Computed: a padded box around what the player actually has on the ground.',
  'pan-to': 'Teaches a CAMERA move — an edge arrow and a drag glyph. The only anchor that does NOT centre the view, because the lesson is the player doing that.',
  'screen-marker': 'Computed: a standoff point toward the nearest known enemy.',
  'road-marker': 'Computed: a road waypoint partway to the strongpoint.',
  'attack-pos': 'Computed: the attack-position box short of the objective.',
  'ap-approach': 'Computed: the release point 60 m short of that box.',
}

/** The computed anchors take no parameters and cannot be previewed without a
 *  running sim — the builder says so rather than drawing a guess. */
export const TUT_ANCHOR_COMPUTED: TutAnchor['kind'][] =
  ['screen-marker', 'road-marker', 'attack-pos', 'ap-approach', 'force-box', 'spotted-enemy']

export const TUT_ANCHOR_FIELDS: Partial<Record<TutAnchor['kind'], FieldSpec[]>> = {
  // `sel` is deliberately NOT a plain string here — the inspector renders it as
  // a picker over the published set (ui/tutTargets)
  'ui': [{ path: 'sel', label: 'TARGET', kind: 'string' }],
  'unit': [{ path: 'type', label: 'UNIT TYPE', kind: 'string', placeholder: 'SCT' }],
  'struct': [{ path: 'struct', label: 'STRUCTURE', kind: 'structKind' }],
  'point': [{ path: 'place', label: 'PLACE', kind: 'place' }],
  'box': [
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'r', label: 'RADIUS M', kind: 'number' },
  ],
  'force-box': [
    { path: 'exclude', label: 'IGNORING TYPES', kind: 'unitList', opt: true },
    { path: 'pad', label: 'PADDING M', kind: 'number', opt: true },
  ],
  'pan-to': [
    { path: 'place', label: 'PLACE', kind: 'string' },
    { path: 'label', label: 'EDGE LABEL', kind: 'string', opt: true },
  ],
}

export function tutAnchorDefault(kind: TutAnchor['kind']): TutAnchor {
  switch (kind) {
    case 'ui': return { kind, sel: '' }
    case 'unit': return { kind, type: '' as never }
    case 'struct': return { kind, struct: 'FOB' }
    case 'point': return { kind, place: '' }
    case 'box': return { kind, place: '', r: 400 }
    case 'force-box': return { kind }
    case 'pan-to': return { kind, place: '' }
    default: return { kind } as TutAnchor
  }
}
