// SCRIPT VOCABULARY DESCRIPTORS — the builder's forms are GENERATED from
// these tables, one entry per engine verb (packs/types MissionObjective /
// MissionCondition / MissionEffect). Add a verb to the engine, describe its
// params here, and the script panel renders it — no bespoke UI per verb.
// A param the form language can't say cleanly (nested one-offs like
// spawn-garrison's `contact`) falls back to a validated JSON field.
import type {
  MissionCondition, MissionEffect, MissionObjective, MissionObjectiveKind,
} from '../../packs/types'

export interface FieldSpec {
  /** dotted path into the verb object ('zone.place') */
  path: string
  label: string
  kind: 'place' | 'placeOrNull' | 'number' | 'string' | 'text' | 'bool'
    | 'unitList' | 'structKind' | 'stringList' | 'json'
  /** optional param — clearing the input deletes the key */
  opt?: boolean
  placeholder?: string
}

// --- objectives -------------------------------------------------------------

export const OBJECTIVE_KINDS: MissionObjectiveKind[] =
  ['recon-area', 'clear-area', 'defeat-group', 'build', 'deliver']

export const OBJECTIVE_FIELDS: Record<MissionObjectiveKind, FieldSpec[]> = {
  'recon-area': [
    { path: 'zone.place', label: 'ZONE PLACE', kind: 'place' },
    { path: 'zone.r', label: 'ZONE RADIUS M', kind: 'number' },
  ],
  'clear-area': [
    { path: 'zone.place', label: 'ZONE PLACE', kind: 'place' },
    { path: 'zone.r', label: 'ZONE RADIUS M', kind: 'number' },
  ],
  'defeat-group': [
    { path: 'groupTag', label: 'GROUP TAG', kind: 'string', placeholder: 'REINFORCEMENT' },
  ],
  'build': [
    { path: 'structKind', label: 'STRUCTURE', kind: 'structKind' },
    { path: 'zone.place', label: 'ZONE PLACE', kind: 'place' },
    { path: 'zone.r', label: 'ZONE RADIUS M', kind: 'number' },
  ],
  'deliver': [
    { path: 'amount', label: 'SUPPLY AMOUNT', kind: 'number' },
  ],
}

export function objectiveDefault(kind: MissionObjectiveKind, n: number): MissionObjective {
  const base = { id: `obj-${n}`, label: 'NEW OBJECTIVE', kind }
  switch (kind) {
    case 'recon-area':
    case 'clear-area': return { ...base, zone: { place: '', r: 420 } }
    case 'defeat-group': return { ...base, groupTag: '' }
    case 'build': return { ...base, structKind: 'FOB', zone: { place: '', r: 520 } }
    case 'deliver': return { ...base, amount: 200 }
  }
}

// --- conditions -------------------------------------------------------------

export const CONDITION_KINDS: MissionCondition['kind'][] = [
  'objective-active', 'objective-complete', 'structure-exists',
  'mainline-at-least', 'all', 'any',
]

/** leaf-condition fields; 'all'/'any' recurse in the form instead */
export const CONDITION_FIELDS: Partial<Record<MissionCondition['kind'], FieldSpec[]>> = {
  'objective-active': [{ path: 'objective', label: 'OBJECTIVE ID', kind: 'string' }],
  'objective-complete': [{ path: 'objective', label: 'OBJECTIVE ID', kind: 'string' }],
  'structure-exists': [{ path: 'struct', label: 'STRUCTURE', kind: 'structKind' }],
  'mainline-at-least': [{ path: 'index', label: 'MAINLINE INDEX', kind: 'number' }],
}

export function conditionDefault(kind: MissionCondition['kind']): MissionCondition {
  switch (kind) {
    case 'objective-active': return { kind, objective: '' }
    case 'objective-complete': return { kind, objective: '' }
    case 'structure-exists': return { kind, struct: 'FOB' }
    case 'mainline-at-least': return { kind, index: 1 }
    case 'all': return { kind, of: [] }
    case 'any': return { kind, of: [] }
  }
}

// --- effects ----------------------------------------------------------------

export const EFFECT_KINDS: MissionEffect['kind'][] = [
  'set-allow', 'front-line', 'spawn-garrison', 'place-force', 'set-roe',
  'opfor-objective', 'spawn-group', 'deploy-column', 'name-structure',
  'release-asset', 'radio', 'toast', 'frago',
]

const RADIO_FIELDS: FieldSpec[] = [
  { path: 'radio.from', label: 'RADIO FROM', kind: 'string', placeholder: 'NET' },
  { path: 'radio.cat', label: 'RADIO CATEGORY', kind: 'string', opt: true, placeholder: 'contact / arrive' },
  { path: 'radio.text', label: 'RADIO TEXT', kind: 'text' },
  { path: 'radio.at', label: 'TAG TO LAST SPAWN POINT (ctx)', kind: 'bool' },
]

export const EFFECT_FIELDS: Record<MissionEffect['kind'], FieldSpec[]> = {
  'set-allow': [
    { path: 'field', label: 'ALLOW FIELDING', kind: 'bool' },
    { path: 'support', label: 'ALLOW SUPPORT', kind: 'bool' },
    { path: 'drone', label: 'ALLOW DRONES', kind: 'bool' },
  ],
  'front-line': [
    { path: 'place', label: 'PLACE', kind: 'place' },
    { path: 'offsetY', label: 'OFFSET Y M (+SOUTH)', kind: 'number', opt: true },
  ],
  'spawn-garrison': [
    { path: 'at', label: 'AT', kind: 'place' },
    { path: 'units', label: 'UNITS', kind: 'unitList' },
    { path: 'spreadX', label: 'SPREAD X M', kind: 'number', opt: true },
    { path: 'strip', label: 'STRIP STOWAGE KEYS', kind: 'stringList', opt: true, placeholder: 'M_JAVELIN' },
    { path: 'contact', label: 'SEED CONTACT { scatter, unknown? }', kind: 'json', opt: true, placeholder: '{ "scatter": 380, "unknown": true }' },
  ],
  'place-force': [
    { path: 'at', label: 'AT', kind: 'place' },
    { path: 'units', label: 'UNITS', kind: 'unitList' },
    { path: 'radius', label: 'ARC RADIUS M', kind: 'number' },
  ],
  'set-roe': [
    { path: 'type', label: 'UNIT TYPE', kind: 'string', placeholder: 'SCT' },
    { path: 'roe', label: 'ROE', kind: 'string', placeholder: 'break' },
  ],
  'opfor-objective': [
    { path: 'place', label: 'PLACE (EMPTY = CLEAR)', kind: 'placeOrNull' },
  ],
  'spawn-group': [
    { path: 'tag', label: 'GROUP TAG', kind: 'string', placeholder: 'REINFORCEMENT' },
    { path: 'units', label: 'UNITS', kind: 'unitList' },
    { path: 'at', label: 'AT', kind: 'place' },
  ],
  'deploy-column': [
    { path: 'units', label: 'UNITS', kind: 'unitList' },
    { path: 'margin', label: 'EDGE MARGIN M', kind: 'number' },
    { path: 'spacing', label: 'SPACING M', kind: 'number' },
    { path: 'moveTo', label: 'MOVE TO { anchor, offsets }', kind: 'json', placeholder: '{ "anchor": "OBJ KEATON", "offsets": [[0,0],[80,40]] }' },
  ],
  'name-structure': [
    { path: 'struct', label: 'STRUCTURE', kind: 'structKind' },
    { path: 'near', label: 'NEAR', kind: 'place' },
    { path: 'r', label: 'WITHIN M', kind: 'number' },
    { path: 'label', label: 'NEW LABEL', kind: 'string', placeholder: 'FOB KEATON' },
  ],
  'release-asset': [
    { path: 'asset', label: 'ASSET', kind: 'string', placeholder: 'SHADOW' },
    { path: 'formation', label: 'FROM FORMATION', kind: 'string', placeholder: '1ACB' },
    { path: 'radio', label: 'RADIO { from, text }', kind: 'json', opt: true, placeholder: '{ "from": "DIV G3", "text": "…" }' },
  ],
  'radio': RADIO_FIELDS,
  'toast': [{ path: 'text', label: 'TEXT', kind: 'text' }],
  'frago': [
    { path: 'title', label: 'TITLE', kind: 'string' },
    { path: 'text', label: 'TEXT', kind: 'text' },
  ],
}

export function effectDefault(kind: MissionEffect['kind']): MissionEffect {
  switch (kind) {
    case 'set-allow': return { kind, field: true, support: false, drone: true }
    case 'front-line': return { kind, place: '' }
    case 'spawn-garrison': return { kind, at: '', units: [] }
    case 'place-force': return { kind, at: '', units: [], radius: 260 }
    case 'set-roe': return { kind, type: 'SCT', roe: 'break' }
    case 'opfor-objective': return { kind, place: '' }
    case 'spawn-group': return { kind, tag: '', units: [], at: '' }
    case 'deploy-column':
      return { kind, units: [], edge: 'south', margin: 60, spacing: 14, moveTo: { anchor: '', offsets: [] } }
    case 'name-structure': return { kind, struct: 'FOB', near: '', r: 520, label: '' }
    case 'release-asset': return { kind, asset: '', formation: '' }
    case 'radio': return { kind, radio: { from: 'NET', text: '' } }
    case 'toast': return { kind, text: '' }
    case 'frago': return { kind, title: '', text: '' }
  }
}

// --- dotted-path helpers (the form's read/write seam) -----------------------

export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (a, k) => (a as Record<string, unknown> | undefined)?.[k], o)
}

/** immutably set (or delete, when v === undefined) a dotted path */
export function setPath<T>(o: T, path: string, v: unknown): T {
  const ks = path.split('.')
  const root = { ...(o as Record<string, unknown>) }
  let cur = root
  for (let i = 0; i < ks.length - 1; i++) {
    cur[ks[i]!] = { ...((cur[ks[i]!] ?? {}) as Record<string, unknown>) }
    cur = cur[ks[i]!] as Record<string, unknown>
  }
  const last = ks[ks.length - 1]!
  if (v === undefined) delete cur[last]
  else cur[last] = v
  return root as T
}
