// Start screen. Top level is CAMPAIGN / SKIRMISH / DEV SANDBOX (ROADMAP →
// Game Modes → main-menu structure): Skirmish is the umbrella for single-match
// play and runs three steps — mode, map, difficulty. Every map is a pack map
// (P6): a map sets its own size, and a checkout with none authors one in the
// MAP EDITOR first.
import { useEffect, useState, type ReactNode } from 'react'
import { MODES, MODE_ORDER, type ModeId } from '../engine/modes'
import { setCampaignCommander } from '../engine/campaign'
import { listSaves, deleteSave, type SaveMeta } from '../engine/saves-db'
import { fmtClock } from './styles'
import { packMap, packMaps } from '../packs/map-files'
import { packScenarios, type PackScenarioEntry } from '../packs/scenario-files'
import { allPacks, PACKS, playerPack } from '../packs'
import { playableFormations } from '../packs/orgquery'
import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, type DifficultyKey,
} from '../domains/economy/difficulty'

// The three ways a game actually starts, said out loud rather than encoded in
// six optional positional arguments: the sandbox, an AUTHORED scenario (its
// own type is the ruleset), or a QUICK BATTLE on a bare map under a picked mode.
export type StartReq =
  | {
      kind: 'dev'
      /** the ARMY the sandbox plays, by pack id. The ground is separate — a
       *  map is terrain, not a nationality — so any pack drops onto any map.
       *  Absent = the bootstrap lineup. */
      army?: string
    }
  | {
      kind: 'scenario'
      /** 'packId/scenarioId' */
      scenario: string
      difficulty: DifficultyKey
      /** guided tutorial cues (campaign scenarios) */
      tutorial?: boolean
      /** skirmish only: the battalion the player took, if not the default */
      chair?: string
    }
  | {
      kind: 'quick'
      /** 'packId/mapId' */
      terrain: string
      gameMode: ModeId
      difficulty: DifficultyKey
    }
  | {
      kind: 'continue'
      /** a save point from engine/saves-db — resume the war exactly there */
      saveId: string
      /** 'packId/scenarioId' — the session keeps saving under this key */
      campaign: string
    }
export type StartFn = (req: StartReq) => void

/** the scenario's ground, resolved — null when unauthored or not installed */
const groundOf = (s: PackScenarioEntry) => {
  if (!s.spec.map) return null
  const [p, m] = s.spec.map.split('/') as [string, string]
  return packMap(p, m) ?? null
}

// modes on the roadmap but not yet playable — shown greyed so the selector reads
// as a real choice with a future, not a single lonely button
const COMING_SOON = [
  { label: 'ZONE CAPTURE', sub: 'Contested-line control · push the front zone by zone' },
  { label: 'SPEC OPS', sub: 'Small team, one objective, night · get in, get it done, get out' },
  { label: 'CUSTOM SCENARIO', sub: 'Build your own battle · pick the victory condition, save and share' },
]

// difficulty accent runs cool -> hot as it gets harder
const DIFF_ACCENT: Record<DifficultyKey, string> = {
  recruit: '#3a5a3a', regular: '#2a5a8a', veteran: '#8a6a2a', elite: '#8a3a2a',
}

// commander-name defaults: the box comes pre-filled, the player types over it
// or keeps it. Pure flavor pool — the name is theirs either way.
const CO_NAMES = ['HARMON', 'VOSS', 'REYES', 'CALLAHAN', 'MERCER', 'OKAFOR', 'SLOANE', 'KINCAID']

export default function Splash({ onStart, onPacks, onMaps, onScenarios }: {
  onStart: StartFn; onPacks: () => void; onMaps: () => void; onScenarios: () => void
}) {
  const [top, setTop] = useState<'skirmish' | 'campaign' | 'sandbox' | null>(null)
  // every army this build ships — the sandbox lets you play ANY of them, since
  // the ground and the army are independent
  const armies = allPacks()
  const [campaignSel, setCampaignSel] = useState<PackScenarioEntry | null>(null)
  const [skirmishSel, setSkirmishSel] = useState<PackScenarioEntry | null>(null)
  // save points for the picked campaign (newest first) — read from IndexedDB
  // whenever a campaign is selected, and again after a delete
  const [saves, setSaves] = useState<SaveMeta[]>([])
  const [savesEpoch, setSavesEpoch] = useState(0)
  useEffect(() => {
    if (!campaignSel) { setSaves([]); return }
    let live = true
    void listSaves(`${campaignSel.packId}/${campaignSel.scenarioId}`)
      .then(l => { if (live) setSaves(l) })
      .catch(() => { if (live) setSaves([]) })
    return () => { live = false }
  }, [campaignSel, savesEpoch])
  // which battalion the player takes for a skirmish scenario (null = not yet
  // asked; a campaign's chair is scripted and never asked)
  const [chair, setChair] = useState<string | null>(null)
  const [campaignTut, setCampaignTut] = useState(true) // guided tutorial checkbox (on by default)
  const [commander, setCommander] = useState(() => CO_NAMES[Math.floor(Math.random() * CO_NAMES.length)]!)
  const [gameMode, setGameMode] = useState<ModeId | null>(null)
  // undefined = not chosen yet · string = 'packId/mapId'
  const [terrain, setTerrain] = useState<string | undefined>(undefined)

  const maps = packMaps()
  // one content object, split by the AUTHORED type (SCENARIO-MODEL.md):
  // campaign-typed scenarios play from CAMPAIGNS, the rest from SKIRMISH.
  // A scenario only starts once its ground exists; until then its card says why.
  const scenarios = packScenarios()
  const campaigns = scenarios.filter(s => s.spec.type === 'campaign')
  const skirmishScns = scenarios.filter(s => s.spec.type !== 'campaign')
  // the chairs this scenario's BLUFOR pack allows a player to take
  const chairs = skirmishSel
    ? playableFormations(PACKS[skirmishSel.spec.sides?.friend ?? playerPack().id] ?? playerPack())
    : []

  const hint =
    top == null ? 'ONE BATTALION. YOUR TOC.'
    : top === 'campaign' ? 'ONE LONG OPERATION — YOUR FORCE AND YOUR LOSSES CARRY MISSION TO MISSION'
    : top === 'sandbox' ? 'THE GROUND AND THE ARMY ARE SEPARATE — ANY PACK DROPS ONTO ANY MAP'
    : gameMode == null ? 'THE MODE SETS THE OBJECTIVE — AND WHAT DEFEAT MEANS'
    : terrain === undefined ? 'REAL GROUND, AUTHORED IN THE MAP EDITOR — THE MAP SETS ITS OWN SIZE'
    : 'DIFFICULTY SETS SUPPLY, STARTING FORCE AND HOW LONG FIREFIGHTS RUN'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, #0e1a24 0%, #05080b 70%)',
      color: '#c8d8e8', fontFamily: 'Consolas, monospace', userSelect: 'none',
    }}>
      {/* faint grid backdrop */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(#2a3a48 1px, transparent 1px), linear-gradient(90deg, #2a3a48 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 38 }}>
        <div style={{ fontSize: 52, fontWeight: 'bold', letterSpacing: 10, color: '#7ec8ff' }}>TOC</div>
        <div style={{ fontSize: 13, letterSpacing: 6, color: '#54708a', marginTop: 4 }}>TACTICAL OPERATIONS CENTER</div>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#3d5265', marginTop: 10 }}>
          COMMAND-AND-CONTROL · v0.1
        </div>
      </div>

      {top == null ? (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>NEW GAME</SectionLabel>
          {campaigns.length ? (
            <SplashButton label="CAMPAIGNS" sub="One battalion's war · missions and losses carry forward"
              accent="#7ec8ff" onClick={() => setTop('campaign')} />
          ) : (
            <ComingSoon label="CAMPAIGNS" sub="No installed pack ships a campaign" />
          )}
          <SplashButton label="SKIRMISH" sub="Single battle · pick the mode, the ground and the odds"
            accent="#2a5a8a" onClick={() => setTop('skirmish')} />

          <div style={{ height: 18 }} />
          <SectionLabel>SANDBOX</SectionLabel>
          {maps.length ? (
            <SplashButton label="DEV SANDBOX" sub="Staged test map · fog off · full supply · dev controls"
              accent="#3a5a3a"
              onClick={() => (armies.length > 1 ? setTop('sandbox') : onStart({ kind: 'dev' }))} />
          ) : (
            <ComingSoon label="DEV SANDBOX" sub="Needs a pack map · author one in the MAP EDITOR" />
          )}

          <div style={{ height: 18 }} />
          <SectionLabel>TOOLS</SectionLabel>
          <SplashButton label="PACK BUILDER" sub="Inspect and build content packs · units, platforms, formation"
            accent="#6a4a8a" onClick={onPacks} />
          <SplashButton label="MAP EDITOR" sub="Groundwork · real terrain, real roads · author a battlefield"
            accent="#4a6a8a" onClick={onMaps} />
          <SplashButton label="SCENARIO BUILDER" sub="Place the war on a pack map · units, bases, objectives · ships in the pack"
            accent="#8a6a2a" onClick={onScenarios} />
        </div>
      ) : top === 'sandbox' ? (
        <div style={{ position: 'relative', width: 340, maxHeight: '58vh', overflowY: 'auto' }}>
          <SectionLabel>SANDBOX · WHOSE ARMY</SectionLabel>
          {armies.map((p) => (
            <SplashButton key={p.id} label={p.abbr ?? p.id}
              sub={`${p.name}${p.nick ? ` · ${p.nick}` : ''} · ${p.formation?.chair ?? 'NO FORMATION'}`}
              accent="#3a5a3a"
              onClick={() => onStart({ kind: 'dev', army: p.id })} />
          ))}
          <BackButton onClick={() => setTop(null)}>← BACK</BackButton>
        </div>
      ) : top === 'campaign' && campaignSel == null ? (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>CAMPAIGNS · CHOOSE</SectionLabel>
          {campaigns.map((e) => {
            const g = groundOf(e)
            return g ? (
              <SplashButton key={`${e.packId}/${e.scenarioId}`} label={e.name}
                sub={`${e.packId.toUpperCase()} · OPERATION ${e.spec.operation ?? e.name} · ${g.name.toUpperCase()}`}
                accent="#7ec8ff" onClick={() => setCampaignSel(e)} />
            ) : (
              <ComingSoon key={`${e.packId}/${e.scenarioId}`} label={e.name}
                sub={`${e.packId.toUpperCase()} · Awaiting authored ground — bind a map in the SCENARIO BUILDER`} />
            )
          })}
          <BackButton onClick={() => setTop(null)}>← BACK</BackButton>
        </div>
      ) : top === 'campaign' ? (
        <div style={{ position: 'relative', width: 340, maxHeight: '62vh', overflowY: 'auto' }}>
          {/* CONTINUE — the latest save point; the rest of the list is the
              roll-back: any earlier point loads, ✕ deletes. Autosaves prune
              themselves (saves-db); manual points are the player's. */}
          <SectionLabel>{campaignSel!.name} · CONTINUE</SectionLabel>
          {saves.length > 0 ? (
            <>
              <SplashButton label="CONTINUE" accent="#3a8a5a"
                sub={`${saves[0]!.label} · ${fmtAgo(saves[0]!.ts)}`}
                stats={`MISSION CLOCK ${fmtClock(saves[0]!.simT)} · ${saves[0]!.kind === 'auto' ? 'AUTOSAVE' : 'MANUAL SAVE'} · ${(DIFFICULTIES[saves[0]!.difficulty as DifficultyKey]?.label ?? saves[0]!.difficulty).toUpperCase()}`}
                onClick={() => onStart({ kind: 'continue', saveId: saves[0]!.id, campaign: saves[0]!.campaign })} />
              {saves.length > 1 && (
                <>
                  <SectionLabel>ROLL BACK</SectionLabel>
                  {saves.slice(1).map((m) => (
                    <SaveRow key={m.id} meta={m}
                      onLoad={() => onStart({ kind: 'continue', saveId: m.id, campaign: m.campaign })}
                      onDelete={() => { void deleteSave(m.id).then(() => setSavesEpoch(e => e + 1)) }} />
                  ))}
                </>
              )}
              <div style={{ height: 14 }} />
            </>
          ) : (
            <div style={{
              padding: '10px 16px', borderRadius: 3, marginBottom: 8, opacity: 0.5,
              background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
              borderLeft: '3px solid #35414d',
            }}>
              <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fb4c8' }}>NO SAVE ON FILE</div>
              <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>
                The campaign autosaves as you play — SAVE in the top bar marks a point to roll back to
              </div>
            </div>
          )}
          <SectionLabel>NEW CAMPAIGN</SectionLabel>
          {DIFFICULTY_ORDER.map((k) => {
            const d = DIFFICULTIES[k]
            return (
              <SplashButton key={k} label={d.label} sub={d.sub} accent={DIFF_ACCENT[k]}
                stats={toughness(d.damageMul)}
                recommended={k === DEFAULT_DIFFICULTY}
                onClick={() => {
                  setCampaignCommander(commander)
                  onStart({
                    kind: 'scenario', difficulty: k, tutorial: campaignTut,
                    scenario: `${campaignSel!.packId}/${campaignSel!.scenarioId}`,
                  })
                }} />
            )
          })}
          {/* the task force commander is YOU — keep the suggested name or type your own */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: '#7f97ab', flex: '0 0 auto' }}>COMMANDER · LTC</span>
            <input value={commander} maxLength={18} spellCheck={false}
              onChange={(e) => setCommander(e.target.value.toUpperCase())}
              style={{
                flex: 1, minWidth: 0, background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
                borderRadius: 3, color: '#dceeff', fontFamily: 'inherit', fontSize: 12,
                letterSpacing: 2, padding: '5px 8px', outline: 'none',
              }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <BackButton onClick={() => setCampaignSel(null)}>← CAMPAIGNS</BackButton>
            </div>
            <CheckRow checked={campaignTut} onToggle={() => setCampaignTut(v => !v)}
              label="TUTORIAL HINTS" sub="On-screen prompts teach each action as it comes up" />
          </div>
        </div>
      ) : skirmishSel != null && chairs.length > 1 && chair == null ? (
        // YOUR COMMAND — a skirmish scenario names a default chair, but the
        // battalion you sit in is the player's to choose. Same authored
        // battle, a different command: the task org re-derives around you.
        <div style={{ position: 'relative', width: 340, maxHeight: '58vh', overflowY: 'auto' }}>
          <SectionLabel>{skirmishSel.name} · YOUR COMMAND</SectionLabel>
          {chairs.map((f) => (
            <SplashButton key={f.desig} label={f.desig} sub={f.label}
              accent="#4a6a8a"
              recommended={f.desig === (skirmishSel.spec.player ?? chairs[0]!.desig)}
              onClick={() => setChair(f.desig)} />
          ))}
          <BackButton onClick={() => setSkirmishSel(null)}>
            ← {skirmishSel.name} — CHANGE
          </BackButton>
        </div>
      ) : skirmishSel != null ? (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>
            {skirmishSel.name} · DIFFICULTY{chair ? ` · ${chair}` : ''}
          </SectionLabel>
          {DIFFICULTY_ORDER.map((k) => {
            const d = DIFFICULTIES[k]
            return (
              <SplashButton key={k} label={d.label} sub={d.sub} accent={DIFF_ACCENT[k]}
                stats={toughness(d.damageMul)}
                recommended={k === DEFAULT_DIFFICULTY}
                onClick={() => onStart({
                  kind: 'scenario', difficulty: k, ...(chair ? { chair } : {}),
                  scenario: `${skirmishSel.packId}/${skirmishSel.scenarioId}`,
                })} />
            )
          })}
          <BackButton onClick={() => { setChair(null); setSkirmishSel(null) }}>
            ← {skirmishSel.name} — CHANGE
          </BackButton>
        </div>
      ) : gameMode == null ? (
        <div style={{ position: 'relative', width: 340, maxHeight: '58vh', overflowY: 'auto' }}>
          <SectionLabel>SKIRMISH · QUICK BATTLE</SectionLabel>
          {MODE_ORDER.map((id) => (
            <SplashButton key={id} label={MODES[id].label} sub={MODES[id].sub} accent="#2a5a8a"
              onClick={() => setGameMode(id)} />
          ))}
          {COMING_SOON.map((m) => <ComingSoon key={m.label} label={m.label} sub={m.sub} />)}
          {/* authored scenarios — the type badge says which rules judge them,
              the card says which ground; one click skips mode AND map */}
          {skirmishScns.length > 0 && (
            <>
              <div style={{ height: 12 }} />
              <SectionLabel>SKIRMISH · SCENARIOS</SectionLabel>
              {skirmishScns.map((e) => {
                const g = groundOf(e)
                return g ? (
                  <SplashButton key={`${e.packId}/${e.scenarioId}`} label={e.name}
                    sub={`${MODES[e.spec.type]?.label ?? e.spec.type} · ${g.name.toUpperCase()} · authored scenario`}
                    accent="#8a6a2a" onClick={() => setSkirmishSel(e)} />
                ) : (
                  <ComingSoon key={`${e.packId}/${e.scenarioId}`} label={e.name}
                    sub="Awaiting authored ground — bind a map in the SCENARIO BUILDER" />
                )
              })}
            </>
          )}
          <BackButton onClick={() => setTop(null)}>← BACK</BackButton>
        </div>
      ) : terrain === undefined ? (
        <div style={{ position: 'relative', width: 340, maxHeight: '58vh', overflowY: 'auto' }}>
          <SectionLabel>SKIRMISH · STEP 2 OF 3 · MAP</SectionLabel>
          {/* real ground, authored in the MAP EDITOR, shipped by packs. A map
              sets its own size — and the force caps that come with it. */}
          {maps.map((m) => (
            <SplashButton key={`${m.packId}/${m.mapId}`} label={m.name}
              sub={`${m.packId.toUpperCase()} pack map · real terrain, real roads, real names`}
              accent="#4a6a8a" onClick={() => setTerrain(`${m.packId}/${m.mapId}`)} />
          ))}
          {!maps.length && (
            <ComingSoon label="NO MAPS INSTALLED" sub="Author one in the MAP EDITOR — it saves into a pack" />
          )}
          <BackButton onClick={() => setGameMode(null)}>
            ← {MODES[gameMode].label} — CHANGE
          </BackButton>
        </div>
      ) : (
        <div style={{ position: 'relative', width: 340 }}>
          <SectionLabel>SKIRMISH · STEP 3 OF 3 · DIFFICULTY</SectionLabel>
          {DIFFICULTY_ORDER.map((k) => {
            const d = DIFFICULTIES[k]
            return (
              <SplashButton key={k} label={d.label} sub={d.sub} accent={DIFF_ACCENT[k]}
                stats={`${d.supplies.toLocaleString()} SUPPLY · ${d.startForce} UNIT${d.startForce > 1 ? 'S' : ''} · ${toughness(d.damageMul)}`}
                recommended={k === DEFAULT_DIFFICULTY}
                onClick={() => onStart({
                  kind: 'quick', difficulty: k, gameMode, terrain,
                })} />
            )
          })}
          <BackButton onClick={() => setTerrain(undefined)}>
            ← {maps.find((m) => `${m.packId}/${m.mapId}` === terrain)?.name ?? terrain} — CHANGE
          </BackButton>
        </div>
      )}

      <div style={{ position: 'relative', marginTop: 34, fontSize: 10, color: '#3d5265', letterSpacing: 1 }}>
        {hint}
      </div>
    </div>
  )
}

// wall-clock recency for a save point — coarse on purpose, it's a menu line
function fmtAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 90) return 'JUST NOW'
  if (s < 3600) return `${Math.round(s / 60)} MIN AGO`
  if (s < 86400 * 2) return `${Math.round(s / 3600)} H AGO`
  return `${Math.round(s / 86400)} DAYS AGO`
}

/** One earlier save point in the roll-back list: click loads it, ✕ deletes it. */
function SaveRow({ meta, onLoad, onDelete }: {
  meta: SaveMeta; onLoad: () => void; onDelete: () => void
}) {
  return (
    <div
      onClick={onLoad}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7ec8ff' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a48' }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        padding: '6px 10px 6px 12px', borderRadius: 3, marginBottom: 6,
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        borderLeft: `3px solid ${meta.kind === 'auto' ? '#35414d' : '#8a6a2a'}`,
        transition: 'border-color 0.12s',
      }}>
      <span style={{
        flex: '0 0 auto', fontSize: 8, letterSpacing: 1, padding: '2px 5px', borderRadius: 2,
        color: meta.kind === 'auto' ? '#7f97ab' : '#e8c87a',
        border: `1px solid ${meta.kind === 'auto' ? '#35414d' : '#8a6a2a'}`,
      }}>{meta.kind === 'auto' ? 'AUTO' : 'SAVE'}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, letterSpacing: 1, color: '#dceeff' }}>{meta.label}</span>
        <span style={{ fontSize: 9, letterSpacing: 1, color: '#54708a', marginLeft: 8 }}>
          {fmtClock(meta.simT)} · {fmtAgo(meta.ts)}
        </span>
      </span>
      <button title="Delete this save point"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#e08a8a' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#54708a' }}
        style={{
          flex: '0 0 auto', background: 'none', border: 'none', cursor: 'pointer',
          color: '#54708a', fontFamily: 'inherit', fontSize: 12, padding: '0 2px',
        }}>✕</button>
    </div>
  )
}

// damageMul is the "unit health" knob inverted — render it as how long fights last
function toughness(mul: number): string {
  if (mul <= 0.6) return 'LONG FIGHTS'
  if (mul <= 0.8) return 'STEADY FIGHTS'
  if (mul <= 1) return 'SHARP FIGHTS'
  return 'LETHAL'
}

function SectionLabel({ children }: { children?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px',
      color: '#5f7d95', fontSize: 10, letterSpacing: 2,
    }}>
      <span>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#2a3a48,transparent)' }} />
    </div>
  )
}

function ComingSoon({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 3, marginBottom: 8, opacity: 0.4,
      background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
      borderLeft: '3px solid #35414d', cursor: 'default',
    }}>
      <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 'bold', color: '#e6f0f8' }}>
        {label}
        <span style={{ fontSize: 8.5, letterSpacing: 1, color: '#7f97ab', marginLeft: 8 }}>IN DEVELOPMENT</span>
      </div>
      <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// A small inline checkbox — deliberately NOT card-styled, so it never reads as a
// selectable option alongside the difficulty cards.
function CheckRow({ checked, onToggle, label, sub }: {
  checked: boolean; onToggle: () => void; label: string; sub: string
}) {
  return (
    <button onClick={onToggle} title={sub}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        background: 'none', border: 'none', padding: '0 2px 12px', margin: 0,
        color: checked ? '#9fd0f5' : '#7f97ab', fontFamily: 'inherit',
      }}>
      <span style={{
        flex: '0 0 auto', width: 15, height: 15, borderRadius: 3, fontSize: 11, lineHeight: '14px',
        textAlign: 'center', color: checked ? '#0a0e12' : 'transparent',
        background: checked ? '#7ec8ff' : 'transparent', border: `1px solid ${checked ? '#7ec8ff' : '#4a6478'}`,
      }}>✓</span>
      <span style={{ fontSize: 11, letterSpacing: 1.5 }}>{label}</span>
    </button>
  )
}

function SplashButton({ label, sub, stats, accent, recommended, onClick }: {
  label: string
  sub: string
  stats?: string
  accent: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.borderColor = '#7ec8ff' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,26,36,0.85)'; e.currentTarget.style.borderColor = '#2a3a48' }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '10px 16px', borderRadius: 3, color: '#e6f0f8', marginBottom: 8,
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        fontFamily: 'inherit', transition: 'background 0.12s, border-color 0.12s',
        borderLeft: `3px solid ${accent}`,
      }}>
      <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 'bold' }}>
        {label}
        {recommended && <span style={{ fontSize: 8.5, letterSpacing: 1, color: '#7ec8ff', marginLeft: 8 }}>DEFAULT</span>}
      </div>
      <div style={{ fontSize: 10, letterSpacing: 1, color: '#7f97ab', marginTop: 2 }}>{sub}</div>
      {stats && (
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#54708a', marginTop: 4 }}>{stats}</div>
      )}
    </button>
  )
}

function BackButton({ children, onClick }: { children?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#9ab8d0' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#54708a' }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'none', border: 'none', padding: '8px 2px 0', marginTop: 4,
        color: '#54708a', fontFamily: 'inherit', fontSize: 10, letterSpacing: 1.5,
      }}>{children}</button>
  )
}
