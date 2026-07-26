// DIV HQ secure video conference — how orders arrive. A FRAGO opens a mock VTC
// window: the commanding general's "camera" feed (stylized silhouette, speaking
// bars driven by the procedural briefing voice), the task force's platoon
// leaders as attendee tiles below, and a staff POWERPOINT deck rendered live
// from world state. The opening OPORD is the first VTC (blocking, sim held);
// FRAGOs mid-fight are non-blocking — the world keeps running while higher
// talks. Every received order lands in CampaignState.fragoLog and can be
// recalled (replayed) from the objectives tracker at any time.
//
// The deck: THREE slides for this operation — CLEAR the town, DEFEND it until
// the FOB stands, BUILD the FOB — each just what a staff slide would carry: a
// map inset with operational graphics and a handful of task fragments.
import { useEffect, useMemo, useState } from 'react'
import { S } from '../engine/state'
import { useUI } from './store'
import { ackBriefing, ackFrago, shopOfficer } from '../engine/campaign'
import { radioBrief, stopBrief, setBriefMuted, isBriefMuted } from '../audio/audio'
import { playerPack } from '../packs'
import { OPERATION_DECK, recoveryDeck, SlideDeck } from './deck'
import type { CampaignState, RecoveryRef, StaffShop } from '../engine/GameState'

// What the hosts hand to VtcWindow: an entry out of the orders log or the
// live FRAGO slot. Typed off CampaignState so a field added there (speaker,
// docOnly, shop, recovery) reaches the window instead of being quietly
// narrowed away at the door and only surviving by object identity.
type OrderEntry = NonNullable<CampaignState['frago']>
import BnHeader from './BnHeader'
import { PatchIcon } from './insignia'
import { Portrait } from './portrait'

const AMBER = '#e8b34a'
const bump = () => useUI.setState((s) => ({ tick: s.tick + 1 }))

// ---------------------------------------------------------------------------
// Camera tiles
// ---------------------------------------------------------------------------
function CamTile({ label, sub, h, speaking, bars, seed }: {
  label: string; sub?: string; h: number; speaking?: boolean; bars?: boolean
  seed?: string   // the REAL person's portrait seed — cameras-off VTC shows the DA photo
}) {
  // photo scales with the tile — the PRESENTER'S big tile gets a visibly
  // larger portrait than the attendee thumbnails
  const photoH = Math.round(h * 0.62)
  return (
    <div style={{
      position: 'relative', height: h, borderRadius: 3, overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 42%, #22303c 0%, #101820 70%)',
      border: '1px solid #24343f',
    }}>
      {seed ? (
        // the actual soldier's DA photo, framed like a cameras-off avatar
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ border: '1px solid #33454f', borderRadius: 3, padding: 3, background: '#0c1218' }}>
            <Portrait seed={seed} w={Math.round(photoH * 28 / 34)} h={photoH} />
          </div>
        </div>
      ) : (
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMax meet">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#060a0e" />
          <path d="M 18 100 Q 22 64 50 62 Q 78 64 82 100 Z" fill="#060a0e" />
          <rect x="44" y="68" width="12" height="5" fill="#3a4a34" />
        </svg>
      )}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
      }} />
      {bars && (
        <div style={{ position: 'absolute', left: 6, bottom: 6, display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} style={{
              width: 3, background: speaking ? '#7ec87e' : '#33454f', height: 4 + (i % 3) * 4,
              animation: speaking ? `vtcBar 0.${5 + i}s ease-in-out infinite alternate` : 'none',
            }} />
          ))}
        </div>
      )}
      {!bars && (
        // attendees are on receive: mic-muted glyph
        <div style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 9, color: '#6a4a4a' }}>🎙̶</div>
      )}
      <div style={{
        position: 'absolute', right: 5, bottom: 4, fontSize: 8, letterSpacing: 1,
        color: '#9ab8d0', background: 'rgba(6,10,14,0.75)', padding: '1px 5px', borderRadius: 2,
        whiteSpace: 'nowrap',
      }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------
// find a FIT staff officer of the player battalion by billet (the org has the
// real people — VTCs put the PROPER attendees on the line)
function bnStaff(pos: string) {
  const bn = playerPack().formation?.playerBn
  for (const sl of S.org?.slots ?? []) {
    if (sl.bn !== bn) continue
    const s = sl.soldiers.find(x => x.pos === pos && x.status === 'FIT')
    if (s) return s
  }
  return undefined
}
const seedOf = (s?: { pid?: string; id: number }) => s ? (s.pid ?? `s:${s.id}`) : undefined
// division-wide billet lookup: the CG is a REAL person on the division roster
// (org.ts generates the Commanding General with the rest of the formation)
function divStaff(pos: string) {
  for (const sl of S.org?.slots ?? []) {
    const s = sl.soldiers.find(x => x.pos === pos && x.status === 'FIT')
    if (s) return s
  }
  return undefined
}
const staffTile = (short: string, pos: string) => {
  const s = bnStaff(pos)
  return {
    label: short,
    sub: s ? `${s.rank} ${(s.name ?? '').split(' ').pop()}` : undefined,
    seed: seedOf(s), // the real person's DA photo on the tile
  }
}

export function VtcWindow({ entry, blocking, review, startSlide = 0, onClose }: {
  entry: {
    title: string; text: string
    speaker?: { name: string; title: string } // a staff officer on the line instead of the CG
    docOnly?: boolean                          // no operation deck — the document is the visual
    shop?: StaffShop                           // staff-shop document: its console header letterheads the paper
    recovery?: RecoveryRef                     // personnel recovery: its OWN deck, not the operation's
  }
  blocking?: boolean
  review?: boolean       // recalled order/report: the DOCUMENT for review — no call, no voice
  startSlide?: number
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'link' | 'live'>(review ? 'live' : 'link')
  const [speaking, setSpeaking] = useState(false)
  const [voiceOff, setVoiceOff] = useState(isBriefMuted())

  // WHICH deck this order is about. A personnel-recovery tasking is its own
  // small operation, so it brings its own slides instead of showing the
  // mainline scheme of maneuver, which has nothing to do with it.
  const deck = useMemo(
    () => (entry.recovery ? recoveryDeck(entry.recovery) : OPERATION_DECK),
    [entry],
  )

  // connect beat, then the CG reads the order (speaking bars run for the
  // exact scheduled duration; 0 = audio unavailable/muted, bars stay still).
  // A REVIEW skips all of it — it's a document, not a call.
  useEffect(() => {
    useUI.setState({ vtcPaged: false }) // each call starts unread
    if (review) { setPhase('live'); return }
    setPhase('link')
    const t1 = setTimeout(() => {
      setPhase('live')
      const dur = radioBrief(entry.text, entry.speaker?.name)
      if (dur > 0) {
        setSpeaking(true)
        const t2 = setTimeout(() => setSpeaking(false), dur * 1000)
        return () => clearTimeout(t2)
      }
    }, 900)
    return () => { clearTimeout(t1); stopBrief() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  // attendee tiles: the PROPER people for the meeting. A CG operations call
  // seats the battalion command team (XO, S3, CSM); a staff report call seats
  // that shop's chain (NCOIC) plus the XO and CSM.
  const attendees = entry.speaker
    ? [staffTile('S1 NCOIC', 'S1 NCOIC'), staffTile('CSM', 'Command Sergeant Major'), staffTile('XO', 'Executive Officer')]
    : [staffTile('XO', 'Executive Officer'), staffTile('S3', 'S3 — Operations'), staffTile('CSM', 'Command Sergeant Major')]

  const win = (
    <div data-tut="vtc-window" style={{
      width: 1760, maxWidth: '96vw',
      background: 'rgba(10,14,19,0.97)', border: '1px solid #2a3a48', borderTop: `3px solid ${AMBER}`,
      borderRadius: 4, fontFamily: 'Consolas, monospace', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      userSelect: 'none',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
        borderBottom: '1px solid #24343f',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: review ? '#54708a' : phase === 'live' ? '#d43a3a' : '#666',
          animation: !review && phase === 'live' ? 'vtcBlink 1.2s step-end infinite' : 'none',
        }} />
        {/* concise DIV HQ identity in the window bar (the PRODUCT carries the
            producing shop's full header — see ROADMAP: DIV HQ product headers) */}
        {!review && !entry.speaker && <PatchIcon id={playerPack().patch} h={15} />}
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#9ab8d0' }}>
          {review ? (entry.speaker ? 'REPORT — REVIEW COPY' : 'ORDER — REVIEW COPY')
            : entry.speaker ? `${entry.speaker.title} — SECURE VTC`
            : `${playerPack().abbr} DIV HQ — SECURE VTC`}
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: '#54708a', marginLeft: 'auto' }}>
          {review ? 'FROM THE ORDERS LOG' : phase === 'link' ? 'ESTABLISHING SECURE LINK…' : 'LINK ENCRYPTED · LIVE'}
        </span>
        {!review && <button data-tut="vtc-voice" onClick={() => {
          const next = !voiceOff
          setBriefMuted(next)
          setVoiceOff(next)
          if (next) setSpeaking(false)
        }}
          title={voiceOff ? 'Unmute the briefing voice' : 'Mute the briefing voice'}
          style={{
            padding: '2px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(16,26,36,0.85)', border: `1px solid ${voiceOff ? '#6a4a4a' : '#2a3a48'}`,
            color: voiceOff ? '#c88a8a' : '#9ab8d0', fontSize: 9, letterSpacing: 1.5,
          }}>{voiceOff ? 'VOICE OFF' : 'VOICE ON'}</button>}
      </div>

      {phase === 'link' ? (
        <div style={{
          height: 760, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#54708a', fontSize: 14, letterSpacing: 2,
          background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3px)',
        }}>
          ▚▞ CONNECTING ▞▚
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, padding: 12 }}>
          {/* roster column: the CG + attendees — a CALL thing; a review is just the document */}
          {!review && (
          <div style={{ width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* the speaker: a staff report call puts the REAL shop officer's
                photo up (resolved from the org via the report's shop); a CG
                call puts up the ACTUAL Commanding General from the division
                roster — everyone on the net is a real person */}
            {(() => {
              const cg = entry.speaker ? undefined : divStaff('Commanding General')
              return (
                <CamTile
                  label={entry.speaker ? entry.speaker.name
                    : cg ? `${cg.rank} ${(cg.name ?? '').split(' ').pop()}` : 'CG'}
                  sub={entry.speaker?.title ?? `CG · ${playerPack().abbr}`}
                  h={390} bars speaking={speaking}
                  seed={entry.shop ? seedOf(shopOfficer(S, entry.shop) ?? undefined) : seedOf(cg)} />
              )
            })()}
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#54708a' }}>
              {(() => {
                const who = entry.speaker ? entry.speaker.title.split(' —')[0] : 'CG'
                return speaking ? `— ${who} TRANSMITTING —` : `${who} STANDING BY`
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* your own preview tile, like any real VTC client — you are COBALT 6,
                  and your soldier exists in the org (the battalion commander) */}
              <CamTile label={`LTC ${S.campaign?.commander ?? 'ACTUAL'}`} sub="COBALT 6" h={124}
                seed={seedOf(bnStaff('Battalion Commander'))} />
              {attendees.map(a => <CamTile key={a.label} label={a.label} sub={a.sub} seed={a.seed} h={124} />)}
            </div>
          </div>
          )}
          {/* vertical divider: the people on the call | the product */}
          {!review && (
            <div style={{ width: 1, flex: '0 0 auto', alignSelf: 'stretch', background: '#24343f' }} />
          )}
          {/* the visual: the operation deck, or the report DOCUMENT itself */}
          {entry.docOnly ? (
            <div style={{
              flex: 1, minWidth: 0, height: 790, overflowY: 'auto', borderRadius: 2,
              background: '#e8e4da', color: '#1a1a18', padding: '34px 44px',
              fontFamily: 'Consolas, monospace',
            }}>
              <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 3, color: '#7a1f1f', fontWeight: 'bold' }}>
                SECRET//NOFORN
              </div>
              {/* the producing shop's letterhead — same proud header as its console, paper tone */}
              {entry.shop && (() => {
                const info = playerPack().staff?.[entry.shop!]
                return (
                  <div style={{ margin: '16px 0 4px' }}>
                    <BnHeader tone="paper" plate={info?.label ?? entry.shop!.toUpperCase()}
                      sub={`${(info?.name ?? '').toUpperCase()} · ${playerPack().name.toUpperCase()}`} />
                  </div>
                )
              })()}
              <div style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 2, margin: '18px 0 14px' }}>
                {entry.title}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{entry.text}</div>
              <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 3, color: '#7a1f1f', fontWeight: 'bold', marginTop: 26 }}>
                SECRET//NOFORN
              </div>
            </div>
          ) : (
          <SlideDeck deck={deck} live={phase === 'live'} startSlide={startSlide}
            onPage={() => useUI.setState({ vtcPaged: true })} />
          )}
        </div>
      )}

      {/* footer bar: mirrors the header — the call's one committing action
          lives here (ACKNOWLEDGE / END CALL / CLOSE) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
        padding: '7px 12px', borderTop: '1px solid #24343f', background: 'rgba(8,12,17,0.9)',
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: '#54708a', marginRight: 'auto' }}>
          {review ? 'REVIEW — NO ACKNOWLEDGEMENT REQUIRED' : 'ACKNOWLEDGE TO RELEASE THE NET'}
        </span>
        <button data-tut="vtc-ack" onClick={() => { stopBrief(); onClose(); bump() }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = AMBER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a48' }}
          style={{
            padding: '7px 22px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48', borderLeft: `3px solid ${AMBER}`,
            color: '#e6f0f8', fontSize: 11, letterSpacing: 2.5, fontWeight: 'bold',
          }}>{blocking ? 'ACKNOWLEDGE' : review ? 'CLOSE' : 'END CALL'}</button>
      </div>
    </div>
  )

  // keyframes injected once
  useEffect(() => {
    if (document.getElementById('vtc-keyframes')) return
    const st = document.createElement('style')
    st.id = 'vtc-keyframes'
    st.textContent = `
      @keyframes vtcBlink { 50% { opacity: 0.25; } }
      @keyframes vtcBar { from { height: 3px; } to { height: 14px; } }`
    document.head.appendChild(st)
  }, [])

  return blocking ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, rgba(14,26,36,0.95) 0%, rgba(5,8,11,0.97) 70%)',
    }}>{win}</div>
  ) : (
    <div style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 104 }}>
      {win}
    </div>
  )
}

// While ANY VTC is up, the war holds: attention is on the call. Pause on
// mount, hand the player's chosen speed back on close (a pending tutorial
// gate will re-pause itself on the next tick if it needs to).
function usePauseWhileOpen(): void {
  useEffect(() => {
    const prev = S.speed > 0 ? S.speed : 1
    S.speed = 0
    return () => { if (S.speed === 0) S.speed = prev }
  }, [])
}

// FRAGO VTC host: mounts whenever a FRAGO is open (new tasking or a recall
// from the log). Holds the sim while the call is up. The LINES OF SUPPLY call
// opens on the FOB slide; everything else starts at slide 1.
function FragoCall({ entry }: { entry: OrderEntry }) {
  usePauseWhileOpen()
  const start = entry.title === 'LINES OF SUPPLY' ? 2 : 0
  return <VtcWindow entry={entry} startSlide={start} onClose={() => ackFrago(S)} />
}

export function VtcFrago() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete || !c.briefed || c.frago == null) return null
  if (c.frago.review) {
    // recalled order: the document for review, not a call replay
    return <ReviewDoc entry={c.frago} />
  }
  return <FragoCall entry={c.frago} />
}

function ReviewDoc({ entry }: { entry: OrderEntry }) {
  usePauseWhileOpen()
  const start = entry.title === 'LINES OF SUPPLY' ? 2 : 0
  return <VtcWindow entry={entry} review startSlide={start} onClose={() => ackFrago(S)} />
}

// Blocking opener: the campaign's first VTC — the OPORD from higher. Holds the
// sim (speed 0) until acknowledged, exactly like the old briefing modal.
export function VtcOpener() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete || c.briefed) return null
  const opener = c.fragoLog[0]
  if (!opener) return null
  return <VtcWindow entry={opener} blocking onClose={() => ackBriefing(S)} />
}
