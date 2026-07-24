// Campaign tutorial: guided, gated teaching steps that live entirely in the UI.
// The engine only stores two plain fields (S.campaign.tutorial / tutStep); the
// step DEFINITIONS, advancement, pause handling and the on-screen cues all live
// here. Each step has a sim-observable `done(S)` and an adaptive `hint(S, ui)`
// that changes as the player makes progress. Gated steps pause the sim (speed 0)
// until done, then resume — so the player can't skip past an unlearned action.
import { useEffect } from 'react'
import { S } from '../engine/state'
import { MISSIONS } from '../engine/campaign'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { useUI, type UIState } from './store'

export interface TutorialHint {
  text: string
  targetSel?: string           // data-tut key to ring-highlight; absent = no ring
  anchor?: 'left' | 'bottom'   // where the callout sits (beside a rail item, or map-bottom)
}

export interface TutorialStep {
  id: string
  gate?: boolean                              // pause the sim until done
  done: (S: typeof import('../engine/state').S) => boolean
  hint: (S: typeof import('../engine/state').S, ui: UIState) => TutorialHint
}

// Curriculum, keyed by mission id (front-loaded; empty by mission 4). More steps
// land per mission as the fuller curriculum is wired.
export const TUTORIALS: Record<string, TutorialStep[]> = {
  lodgment: [
    {
      id: 'deploy-drone',
      gate: true, // hold the mission until they've launched a Raven once
      done: () => S.drones.length > 0,
      hint: (_S, ui) => {
        const sel = ui.selectedIds.length === 1
          ? S.units.find(u => u.id === ui.selectedIds[0]) : undefined
        const isCarrier = !!sel && sel.side === 'friend'
          && (UNIT_TYPES[sel.type].carries?.length ?? 0) > 0
        if (!isCarrier) {
          return { text: 'SELECT A PLATOON — left-click one of your units near the HQ. Rifle and scout platoons each carry a hand-launched Raven UAV.', anchor: 'bottom' }
        }
        return { text: 'LAUNCH THE RAVEN — in the COMMAND rail on the left, under ORGANIC UAS, click the ⊕ to send its drone up over the platoon.', targetSel: 'uas', anchor: 'left' }
      },
    },
  ],
}

const ACCENT = '#7ec8ff'

export default function TutorialOverlay() {
  const tick = useUI(s => s.tick)
  const ui = useUI()
  const c = S.campaign

  // advance / pause: runs each 10 Hz tick. Sim-observable done() only; the sim
  // stays paused while a gated step is unfinished, then resumes.
  useEffect(() => {
    if (!c || !c.tutorial || c.complete || !c.briefed || c.debrief) return
    const steps = TUTORIALS[MISSIONS[c.mission - 1]?.id ?? ''] ?? []
    if (c.tutStep >= steps.length) return
    const step = steps[c.tutStep]!
    if (step.done(S)) {
      c.tutStep++
      const next = steps[c.tutStep]
      S.speed = next?.gate ? 0 : 1 // resume, or hold for the next gated step
    } else if (step.gate && S.speed !== 0) {
      S.speed = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  if (!c || !c.tutorial || c.complete || !c.briefed || c.debrief) return null
  const steps = TUTORIALS[MISSIONS[c.mission - 1]?.id ?? ''] ?? []
  if (c.tutStep >= steps.length) return null
  const hint = steps[c.tutStep]!.hint(S, ui)

  // locate the ring target (if any); fall back to a bottom callout when absent
  let ring: DOMRect | null = null
  if (hint.targetSel) {
    const el = document.querySelector(`[data-tut="${hint.targetSel}"]`)
    if (el) ring = el.getBoundingClientRect()
  }
  const anchor = ring ? 'left' : 'bottom'

  const skip = () => { if (S.campaign) { S.campaign.tutorial = false; if (S.speed === 0) S.speed = 1 } }

  return (
    <>
      <style>{`@keyframes tutPulse {
        0%,100% { box-shadow: 0 0 0 2px ${ACCENT}88, 0 0 12px 3px ${ACCENT}33; }
        50%     { box-shadow: 0 0 0 3px ${ACCENT}ff, 0 0 26px 8px ${ACCENT}66; }
      }`}</style>

      {/* the slow-pulsing highlight ring over the target element */}
      {ring && (
        <div style={{
          position: 'fixed', zIndex: 108, pointerEvents: 'none',
          left: ring.left - 5, top: ring.top - 5, width: ring.width + 10, height: ring.height + 10,
          border: `2px solid ${ACCENT}`, borderRadius: 5,
          animation: 'tutPulse 1.5s ease-in-out infinite',
        }} />
      )}

      {/* the callout: beside the ring (rail item) or centered at the map bottom */}
      <div style={anchor === 'left' && ring
        ? { position: 'fixed', zIndex: 109, left: ring.right + 14, top: Math.max(8, ring.top + ring.height / 2 - 34), width: 300 }
        : { position: 'fixed', zIndex: 109, left: '50%', bottom: 96, transform: 'translateX(-50%)', width: 440, maxWidth: '80vw' }
      }>
        <div style={{
          position: 'relative',
          background: 'rgba(10,16,22,0.97)', border: `1px solid ${ACCENT}66`, borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4, padding: '10px 13px', fontFamily: 'Consolas, monospace', color: '#dceeff',
          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
        }}>
          {/* pointer toward the ring when anchored beside a rail item */}
          {anchor === 'left' && ring && (
            <div style={{
              position: 'absolute', left: -7, top: 28, width: 0, height: 0,
              borderTop: '7px solid transparent', borderBottom: '7px solid transparent',
              borderRight: `7px solid ${ACCENT}`,
            }} />
          )}
          <div style={{ fontSize: 8.5, letterSpacing: 2.5, color: '#5f9fd0', marginBottom: 4 }}>
            ▸ TRAINING
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>{hint.text}</div>
          <button onClick={skip}
            onMouseEnter={e => { e.currentTarget.style.color = '#9ab8d0' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a6478' }}
            style={{
              marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
              color: '#4a6478', fontFamily: 'inherit', fontSize: 9, letterSpacing: 1.5, padding: 0,
            }}>SKIP TUTORIAL</button>
        </div>
      </div>
    </>
  )
}
