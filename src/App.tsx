// App shell: splash → top bar over a three-column body (command rail | map |
// net rail). Ported verbatim from src/App.jsx.
import { useEffect, useRef, useState } from 'react'
import BaseUnderFire, { IncomingBanner } from './ui/BaseUnderFire'
import MapView from './map/MapView'
import HUD, { SelectionTray } from './ui/HUD'
import TaskOrgBar from './ui/TaskOrgBar'
import TopBar from './ui/TopBar'
import CommandConsole from './ui/CommandConsole'
import { RailTabs } from './ui/Rail'
import FeedsPanel from './ui/FeedsPanel'
import PoppedFeeds from './ui/feeds/PoppedFeeds'
import Stations from './ui/station/Stations'
import NetPanel from './ui/NetPanel'
import Splash, { type StartFn } from './ui/Splash'
import EndScreenGate from './ui/EndScreen'
import { CampaignObjectives } from './ui/CampaignHUD'
import { VtcOpener, VtcFrago } from './ui/Vtc'
import S1Console from './ui/S1Console'
import StaffConsole from './ui/StaffConsole'
import PackViewer from './ui/PackViewer'
import PackBuilder from './ui/PackBuilder'
import MapEditor from './ui/MapEditor'
import ScenarioBuilder from './ui/scenario/ScenarioBuilder'
import ErrorBoundary from './ui/ErrorBoundary'
import TutorialOverlay from './ui/tutorial'
import InsigniaTest from './ui/InsigniaTest'
import { S } from './engine/state'
import { initGame, initDevGame, initScenarioGame } from './engine/scenario'
import { startLoop, stopLoop } from './engine/SimLoop'
import type { ScenarioSpec } from './scenario/types'
import { buildGameMap } from './world/mapref'
import { packMap, packMaps } from './packs/map-files'
import { playerPack } from './packs'
import { setActiveScenario, setCampaignTutorial } from './engine/campaign'
import { packScenario } from './packs/scenario-files'

export default function App() {
  // if a game is already running (e.g. after an HMR remount), skip the splash
  const [started, setStarted] = useState(() => !!S.map)
  const [packs, setPacks] = useState(false) // PACK BUILDER route (menu-level tool)
  const [maps, setMaps] = useState(false)   // MAP EDITOR route (Groundwork, menu-level tool)
  const [scenarios, setScenarios] = useState(false) // SCENARIO BUILDER route (Eden, menu-level tool)
  // PLAYTEST: a sim running over a document that is still open on the bench.
  // The builder stays MOUNTED behind it — hidden, not unmounted — so coming
  // back finds the same undo history, the same selection and the same view.
  // Losing an hour of authoring to a playtest would make the button useless.
  const [playtest, setPlaytest] = useState(false)
  // The dev sandbox can swap S.map for another pack map at runtime. Everything
  // reads S live except mount-time work (MapView's baked layer, the initial
  // framing) — so a swap bumps this key and the game layout remounts over the
  // new ground. Dev-only mechanism for a dev-only control.
  const [mapEpoch, setMapEpoch] = useState(0)
  useEffect(() => {
    const bump = () => setMapEpoch(e => e + 1)
    window.addEventListener('toc-remap', bump)
    return () => window.removeEventListener('toc-remap', bump)
  }, [])
  const shakeRef = useRef<HTMLDivElement>(null) // base-under-fire shakes the whole TOC

  // TEMP: /?insignia renders the patch/rank/portrait gallery (dev eyeballing)
  if (window.location.search.includes('insignia')) return <InsigniaTest />

  // map building is async (the pack file is read and decoded) — the splash
  // stays up while buildGameMap resolves the MapRef into ground
  const begin: StartFn = (req) => {
    void (async () => {
      if (req.kind === 'dev') {
        // the sandbox runs on real ground: BAGHDAD from the 1CD pack, else the
        // first pack map installed (the splash greys the button when none are)
        const dev = packMap('1cd', 'baghdad') ?? packMaps()[0]
        if (!dev) throw new Error('no pack maps installed — author one in the MAP EDITOR')
        initDevGame(
          await buildGameMap({ kind: 'pack', packId: dev.packId, mapId: dev.mapId }), 1337,
          // the army the splash picked; its opponent stays the bootstrap one
          req.army ? { friend: req.army } : undefined,
        )
      } else if (req.kind === 'scenario') {
        // an AUTHORED scenario ('packId/scenarioId') — its type IS the mode
        // (SCENARIO-MODEL.md): campaign-typed plays the campaign runner,
        // skirmish types run their ruleset over the authored situation
        const [sp, sid] = req.scenario.split('/') as [string, string]
        const entry = packScenario(sp, sid)
        if (!entry) throw new Error(`scenario '${req.scenario}' is not installed`)
        if (!entry.spec.map) throw new Error(`scenario '${req.scenario}' has no authored ground`)
        const [mp, mid] = entry.spec.map.split('/') as [string, string]
        const map = await buildGameMap({ kind: 'pack', packId: mp, mapId: mid })
        const isCampaign = entry.spec.type === 'campaign'
        if (isCampaign) {
          setActiveScenario(entry.spec)       // read by startCampaign
          setCampaignTutorial(!!req.tutorial)
        }
        // campaign rng is fixed (reproducible operation); skirmish rolls.
        // The chair is the scenario's unless a skirmish player took another.
        initScenarioGame(map, entry.spec, isCampaign ? 1 : (Date.now() % 100000),
          req.difficulty, req.chair)
      } else {
        // QUICK BATTLE — a bare pack map under the picked ruleset, default staging
        const [packId, mapId] = req.terrain.split('/') as [string, string]
        const map = await buildGameMap({ kind: 'pack', packId, mapId })
        initGame(map, Date.now() % 100000, req.difficulty, req.gameMode)
      }
      startLoop()
      setStarted(true)
    })().catch((e) => console.error('failed to start game', e))
  }

  // The BUILDERS are TOOLS, not game modes: they open off the main menu with
  // no sim running behind them, and return to the menu.
  // the PACK BUILDER hands off to the other two tools rather than
  // reimplementing them: a pack is the HOME of its maps and scenarios, but
  // authoring either is the MAP EDITOR's and SCENARIO BUILDER's job
  // Each tool sits behind a BOUNDARY. React unmounts the whole tree on an
  // uncaught render error, so before this a single bad keystroke in a tool
  // blanked the entire app — with the author's unsaved document inside it.
  if (packs) {
    return (
      <ErrorBoundary what="PACK BUILDER" onExit={() => setPacks(false)}>
        <PackBuilder onExit={() => setPacks(false)}
          onOpenMaps={() => { setPacks(false); setMaps(true) }}
          onOpenScenarios={() => { setPacks(false); setScenarios(true) }} />
      </ErrorBoundary>
    )
  }
  if (maps) {
    return (
      <ErrorBoundary what="MAP EDITOR" onExit={() => setMaps(false)}>
        <MapEditor onExit={() => setMaps(false)} />
      </ErrorBoundary>
    )
  }
  // PLAY FROM THE BUILDER. Runs the IN-MEMORY document — saved or not — so an
  // experiment is playable without first committing it to disk. The whole
  // point is the loop: change a thing, see it, change it again.
  const playScenario = (spec: ScenarioSpec) => {
    void (async () => {
      if (!spec.map) throw new Error('the scenario has no ground')
      const [mp, mid] = spec.map.split('/') as [string, string]
      const map = await buildGameMap({ kind: 'pack', packId: mp, mapId: mid })
      const isCampaign = spec.type === 'campaign'
      if (isCampaign) { setActiveScenario(spec); setCampaignTutorial(false) }
      initScenarioGame(map, spec, isCampaign ? 1 : (Date.now() % 100000))
      startLoop()
      setPlaytest(true)
      setStarted(true)
    })().catch(e => console.error('playtest failed to start', e))
  }
  const endPlaytest = () => {
    stopLoop()
    S.map = null            // the builder's own ground is loaded separately
    setStarted(false)
    setPlaytest(false)
  }

  // top bar over the rail row (P5): [INSTALLATIONS|BATTLE GROUPS] map [FEEDS|NET].
  // Every rail is a real layout sibling — collapsing one genuinely widens the
  // map. The map column is itself a flex COLUMN: the map area (with its
  // overlays) on top, the selection tray as a real row below it.
  // Rendered from a function because a PLAYTEST shows the same layout with a
  // stop bar over it, and two copies of this would drift apart.
  const game = (banner: React.ReactNode) => (
    <div ref={shakeRef} key={mapEpoch} style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: '#2a2b2e', // in-game backdrop: neutral dark grey (menu keeps the theme blue)
    }}>
      <BaseUnderFire shakeRef={shakeRef} />
      <TopBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* every tab for this edge, in one column that nothing can move — see
            ui/Rail RailTabs. Opening a rail used to slide its neighbour's tab
            across by the panel width. */}
        <RailTabs side="left" />
        {/* THE STAFF CONSOLES ARE A LEFT WALL, not a takeover. Mounted here as
            real layout siblings so a docked one NARROWS the map instead of
            covering it — reading a LOGSTAT used to cost you the whole common
            operational picture. Each still has a FULL state (ui/console/
            ConsolePanel) which goes fixed over the viewport, so the old
            behaviour is one button away when the document is the work. */}
        <CommandConsole />
        <S1Console />
        <StaffConsole />
        <PackViewer />
        {/* map column: map area above, selection tray below */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            <MapView />
            <HUD />
            {/* campaign objectives tracker + FRAGO VTC — null outside campaign mode */}
            <CampaignObjectives />
            <VtcFrago />
            {/* base-under-fire INCOMING banner: top of the map/console pane */}
            <IncomingBanner />
          </div>
          {/* the force, always on screen and always one key away — above the
              tray, because it is what you pick BEFORE you have a selection */}
          <TaskOrgBar />
          <SelectionTray />
        </div>
        {/* THE RIGHT WALL: one full-height column per open team, stacked left
            to right in the order they were opened. See ui/station. */}
        <Stations />
        <FeedsPanel />
        <NetPanel />
        <RailTabs side="right" />
      </div>
      {/* feeds mirrored onto a second screen — the GL context stays in this
          document; those windows hold a 2D copy. See ui/feeds/PoppedFeeds. */}
      <PoppedFeeds />
      {/* campaign opening OPORD — the first VTC; holds the sim until acknowledged */}
      <VtcOpener />
      {/* campaign guided-tutorial cues (renders null outside a tutorial campaign) */}
      <TutorialOverlay />
      {/* end-of-match overlay: unmounts with the layout on NEW GAME, so a fresh
          match always gets a fresh (undismissed) gate */}
      <EndScreenGate onNewGame={() => setStarted(false)} />
      {banner}
    </div>
  )

  // The builder stays MOUNTED underneath a playtest — hidden, so its canvas
  // measures zero and stops drawing, but its undo history, selection and view
  // are untouched. Losing an hour of authoring to a playtest would make the
  // button not worth pressing.
  if (scenarios) {
    return (
      <>
        <div style={{ display: playtest ? 'none' : 'contents' }}>
          <ErrorBoundary what="SCENARIO BUILDER" onExit={() => setScenarios(false)}>
            <ScenarioBuilder onExit={() => setScenarios(false)} onPlay={playScenario} />
          </ErrorBoundary>
        </div>
        {playtest && game(<PlaytestBar onStop={endPlaytest} />)}
      </>
    )
  }
  if (!started) {
    return <Splash onStart={begin} onPacks={() => setPacks(true)} onMaps={() => setMaps(true)}
      onScenarios={() => setScenarios(true)} />
  }
  return game(null)
}

/** The bar that says you are inside a test, and gets you out of it. Unreal
 *  and Unity both put one over the viewport during play for the same reason:
 *  without it the running sim is indistinguishable from the real game, and
 *  there is no obvious way back to what you were editing. */
function PlaytestBar({ onStop }: { onStop: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 12, zIndex: 500,
      padding: '6px 8px 6px 14px', borderRadius: 3,
      background: 'rgba(12,26,18,0.94)', border: '1px solid #2f6b4a',
      boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
      fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', fontSize: 12.5,
    }}>
      <span style={{ color: '#a8e0bd' }}>▶ Playtest — this is your unsaved document</span>
      <button onClick={onStop} style={{
        fontFamily: 'inherit', fontSize: 12.5, padding: '4px 12px', borderRadius: 2,
        border: '1px solid #2f6b4a', background: '#16341f', color: '#dbf0e2',
        cursor: 'pointer',
      }}>
        ■ Stop
      </button>
    </div>
  )
}
