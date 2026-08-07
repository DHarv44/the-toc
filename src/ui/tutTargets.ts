// THE PUBLISHED TUTORIAL ANCHORS — every `data-tut` id a curriculum may point
// at, in one place.
//
// A TutAnchor of kind 'ui' carries a bare string, and the overlay resolves it
// with document.querySelector(`[data-tut="..."]`). Nothing checked it. The ids
// were seventeen string literals scattered across six components, so a
// curriculum could name `vtc-akc` and simply point at nothing — no error, no
// missing cue in the console, just a hint card floating unanchored beside a
// lesson the player cannot find.
//
// This is the register. The components stamp these constants rather than
// literals, so a rename cannot desync the two, and the scenario builder offers
// the list as a picker instead of a text field.
//
// `field-<TYPE>` is the one TEMPLATED family: the CALL UP palette publishes a
// row per unit type, so the ids are pack nouns and the set depends on which
// army is playing. fieldTarget() is the only sanctioned way to build one.
import type { UnitTypeKey } from '../domains/forces/catalog'

export const TUT = {
  // the VTC — the opening order, and the only way a tasking arrives
  vtcWindow: 'vtc-window',
  vtcDeck: 'vtc-deck',
  vtcNav: 'vtc-nav',
  vtcNext: 'vtc-next',
  vtcVoice: 'vtc-voice',
  vtcAck: 'vtc-ack',
  // the rails
  railForces: 'rail-forces',
  callUp: 'call-up',
  garrisonList: 'garrison-list',
  // the COMMAND console's GARRISON tab alone (call-up rings the whole strip)
  garrisonTab: 'garrison-tab',
  // the console shell's close button (any open console)
  consoleClose: 'console-close',
  // the structure tray (bottom bar): a base's QRF picker chip
  qrfTab: 'qrf-tab',
  // the selection tray's order verbs
  uasRaven: 'uas-raven',
  buildFob: 'build-fob',
  rtb: 'rtb',
  garrison: 'garrison',
  supplyRun: 'supply-run',
  attackMode: 'attack-mode',
  roeBreak: 'roe-break',
  digIn: 'dig-in',
} as const

export type TutTargetId = typeof TUT[keyof typeof TUT]

// THE TEMPLATED FAMILIES. Four of the anchors are not fixed strings at all —
// they are built from pack nouns, because the thing being pointed at is a row
// in a list the ARMY defines. The CALL UP drill-down publishes one per rung:
// the garrison, the capability under it, the company under that. A curriculum
// teaching the drill has to name each rung it wants to talk over.
//
// These have to be built through these helpers, not by hand. The first cut of
// this register listed only `field-` and immediately reported eight false
// errors against the one shipped curriculum, every one of them a real anchor
// this file had simply failed to know about.

/** the CALL UP row for one unit type */
export const fieldTarget = (type: UnitTypeKey | string): string => `field-${type}`
/** a garrison rung in the CALL UP drill (`b.kind` — the base kind) */
export const callupBaseTarget = (baseKind: string): string => `callup-base-${baseKind}`
/** a capability group under a garrison */
export const callupCatTarget = (cat: string): string => `callup-cat-${cat}`
/** a company under a capability */
export const callupCoTarget = (cat: string, co: string): string => `callup-co-${cat}-${co}`

/** What each anchor is, for the builder's picker. A curriculum author is
 *  choosing a thing on screen, not a CSS selector, so the list says where it
 *  lives and what it does. */
export const TUT_TARGETS: { id: TutTargetId; where: string; what: string }[] = [
  { id: TUT.vtcWindow, where: 'VTC', what: 'The whole teleconference window' },
  { id: TUT.vtcDeck, where: 'VTC', what: 'The briefing deck — the operation graphic' },
  { id: TUT.vtcNav, where: 'VTC', what: 'Deck arrows and slide previews' },
  { id: TUT.vtcNext, where: 'VTC', what: 'The next-slide arrow alone' },
  { id: TUT.vtcVoice, where: 'VTC', what: 'The voice toggle' },
  { id: TUT.vtcAck, where: 'VTC', what: 'ACKNOWLEDGE — releases the net' },
  { id: TUT.railForces, where: 'Rails', what: 'The FORCES rail strip (collapsed edge)' },
  { id: TUT.callUp, where: 'Rails', what: 'The CALL UP picker' },
  { id: TUT.garrisonList, where: 'Rails', what: 'The garrison list' },
  { id: TUT.garrisonTab, where: 'Command console', what: 'The GARRISON tab alone' },
  { id: TUT.consoleClose, where: 'Console shell', what: 'The ✕ that closes the open console' },
  { id: TUT.qrfTab, where: 'Structure tray', what: 'A base\'s QRF picker chip' },
  { id: TUT.uasRaven, where: 'Selection tray', what: '⊕ RAVEN — launch the hand UAV' },
  { id: TUT.buildFob, where: 'Selection tray', what: 'BUILD FOB' },
  { id: TUT.rtb, where: 'Selection tray', what: 'RTB — return to base' },
  { id: TUT.garrison, where: 'Selection tray', what: 'GARRISON' },
  { id: TUT.supplyRun, where: 'Selection tray', what: 'SUPPLY RUN — the convoy order' },
  { id: TUT.attackMode, where: 'Selection tray', what: 'ATTACK — the assault order mode' },
  { id: TUT.roeBreak, where: 'Selection tray', what: 'ROE: BREAK' },
  { id: TUT.digIn, where: 'Selection tray', what: 'DIG IN' },
]

/** Every anchor id valid for a given army: the fixed set, plus the CALL UP
 *  rows the army's own catalog and structure produce. The templated families
 *  are validated by SHAPE — a capability name is a pack string the builder
 *  cannot enumerate without walking the live org, and an author naming a
 *  capability their army does not have is a different mistake from a typo in a
 *  fixed control id. */
export function tutTargetIds(unitTypes: readonly string[]): string[] {
  return [...TUT_TARGETS.map(t => t.id as string), ...unitTypes.map(fieldTarget)]
}

/** the prefixes whose suffix is pack data rather than a published constant */
const TEMPLATED = ['field-', 'callup-base-', 'callup-cat-', 'callup-co-']

/** Is this a target the interface can actually resolve? Fixed ids must match
 *  exactly; templated ones must carry a non-empty suffix. */
export function isTutTarget(sel: string, unitTypes: readonly string[]): boolean {
  if (tutTargetIds(unitTypes).includes(sel)) return true
  return TEMPLATED.some(p => sel.startsWith(p) && sel.length > p.length)
}
