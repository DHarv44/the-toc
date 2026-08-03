// App shell: splash → top bar over a three-column body (command rail | map |
// net rail). Ported verbatim from src/App.jsx.
import { useEffect, useRef, useState } from 'react'
import BaseUnderFire, { IncomingBanner } from './ui/BaseUnderFire'
import MapView from './map/MapView'
import HUD, { SelectionTray } from './ui/HUD'
import TopBar from './ui/TopBar'
import CommandRail from './ui/CommandRail'
import ForcesRail from './ui/ForcesRail'
import FeedsPanel from './ui/FeedsPanel'
import NetPanel from './ui/NetPanel'
import Splash, { type StartFn } from './ui/Splash'
import EndScreenGate from './ui/EndScreen'
import { CampaignObjectives } from './ui/CampaignHUD'
import { VtcOpener, VtcFrago } from './ui/Vtc'
import S1Console from './ui/S1Console'
import StaffConsole from './ui/StaffConsole'
import CommandDashboard from './ui/CommandDashboard'
import PackViewer from './ui/PackViewer'
import PackBuilder from './ui/PackBuilder'
import MapEditor from './ui/MapEditor'
import ScenarioBuilder from './ui/scenario/ScenarioBuilder'
import TutorialOverlay from './ui/tutorial'
import InsigniaTest from './ui/InsigniaTest'
import { S } from './engine/state'
import { initGame, initDevGame, initScenarioGame } from './engine/scenario'
import { startLoop } from './engine/SimLoop'
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
        initDevGame(await buildGameMap({ kind: 'pack', packId: dev.packId, mapId: dev.mapId }))
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
  if (packs) return <PackBuilder onExit={() => setPacks(false)} />
  if (maps) return <MapEditor onExit={() => setMaps(false)} />
  if (scenarios) return <ScenarioBuilder onExit={() => setScenarios(false)} />
  if (!started) {
    return <Splash onStart={begin} onPacks={() => setPacks(true)} onMaps={() => setMaps(true)}
      onScenarios={() => setScenarios(true)} />
  }

  // top bar over the rail row (P5): [INSTALLATIONS|BATTLE GROUPS] map [FEEDS|NET].
  // Every rail is a real layout sibling — collapsing one genuinely widens the
  // map. The map column is itself a flex COLUMN: the map area (with its
  // overlays) on top, the selection tray as a real row below it.
  return (
    <div ref={shakeRef} key={mapEpoch} style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: '#2a2b2e', // in-game backdrop: neutral dark grey (menu keeps the theme blue)
    }}>
      <BaseUnderFire shakeRef={shakeRef} />
      <TopBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <CommandRail />
        <ForcesRail />
        {/* map column: map area above, selection tray below */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            <MapView />
            <HUD />
            {/* campaign objectives tracker + FRAGO VTC — null outside campaign mode */}
            <CampaignObjectives />
            <VtcFrago />
            {/* consoles replace the map column while open */}
            <S1Console />
            <StaffConsole />
            <CommandDashboard />
            <PackViewer />
            {/* base-under-fire INCOMING banner: top of the map/console pane */}
            <IncomingBanner />
          </div>
          <SelectionTray />
        </div>
        <FeedsPanel />
        <NetPanel />
      </div>
      {/* campaign opening OPORD — the first VTC; holds the sim until acknowledged */}
      <VtcOpener />
      {/* campaign guided-tutorial cues (renders null outside a tutorial campaign) */}
      <TutorialOverlay />
      {/* end-of-match overlay: unmounts with the layout on NEW GAME, so a fresh
          match always gets a fresh (undismissed) gate */}
      <EndScreenGate onNewGame={() => setStarted(false)} />
    </div>
  )
}
