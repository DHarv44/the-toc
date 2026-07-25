// Personnel-recovery service (DUSTWUN): drives the clock on downed sites.
// - an enemy element sitting on the site captures it (survivors → POW odds)
// - a friendly element securing the site (close, no enemies near, short dwell)
//   resolves the truth via casualties.resolveDownedSite — a MED element on the
//   recovery saves more of the wounded
// The tick only watches geometry and time; all fate math lives in casualties.
import { S } from '../../engine/state'
import { resolveDownedSite } from './casualties'
import { releaseSlot } from './pipeline'
import { assetSiteSecured } from '../assets/service'
import { radio, toast } from '../comms/radio'
import { grid } from '../../lib/format'

const SECURE_RANGE = 220     // a friendly element on the site
const THREAT_RANGE = 600     // no live enemies inside this = secure enough to work
const CAPTURE_RANGE = 350    // an enemy sitting on the site takes the survivors
const SECURE_DWELL = 30      // seconds on-site before the sweep resolves

export function recoveryUpdate(dt: number): void {
  if (!S.downed.length) return
  for (const site of S.downed) {
    if (site.resolved) continue
    const enemyOn = S.units.some(u => u.side !== site.side && u.strength > 0
      && Math.hypot(u.x - site.x, u.y - site.y) < CAPTURE_RANGE)
    if (enemyOn && site.capturedT == null) {
      site.capturedT = S.t
      if (site.side === 'friend') {
        radio('NET', 'loss', `ENEMY ON ${site.label} LKP — SURVIVORS AT RISK OF CAPTURE`, site.x, site.y)
      }
    }
    const friendOn = S.units.some(u => u.side === site.side && u.strength > 0
      && Math.hypot(u.x - site.x, u.y - site.y) < SECURE_RANGE)
    const threat = S.units.some(u => u.side !== site.side && u.strength > 0
      && Math.hypot(u.x - site.x, u.y - site.y) < THREAT_RANGE)
    if (!friendOn || threat) { site.secureT = 0; continue }
    site.secureT += dt
    if (site.secureT < SECURE_DWELL) continue

    // the sweep: a MED element on the recovery improves WIA survival
    const medBonus = S.units.some(u => u.side === site.side && u.type === 'MED'
      && u.strength > 0 && Math.hypot(u.x - site.x, u.y - site.y) < 450)
    const out = resolveDownedSite(site, { medBonus })
    releaseSlot(site.unitId) // the platoon keeps its colors — cadre rebuilds in garrison
    // a HIGHER-echelon convoy site: the assist was optional — favor with
    // division, and a salvage roll on the iron it was hauling
    if (site.respFrom && site.side === 'friend') assetSiteSecured(site)
    if (site.side === 'friend') {
      const bits = [
        out.fit ? `${out.fit} RECOVERED FIT` : '',
        out.wia ? `${out.wia} WIA EVACUATED` : '',
        out.kia ? `${out.kia} KIA CONFIRMED` : '',
        out.mia ? `${out.mia} MIA` : '',
      ].filter(Boolean).join(', ')
      radio('NET', 'arrive', `${site.label} SITE SECURED GRID ${grid(site.x, site.y)} — ${bits || 'NO PERSONNEL FOUND'}`, site.x, site.y)
      toast(`${site.label} SITE SECURED — ${bits || 'NO SURVIVORS'}`)
    }
  }
  // resolved sites leave the map once the sweep reports out
  for (let i = S.downed.length - 1; i >= 0; i--) {
    if (S.downed[i]!.resolved) S.downed.splice(i, 1)
  }
}
