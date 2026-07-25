// App shell: splash → top bar over a three-column body (command rail | map |
// net rail). Ported verbatim from src/App.jsx.
import { useRef, useState } from 'react'
import BaseUnderFire from './ui/BaseUnderFire'
import MapView from './map/MapView'
import HUD, { SelectionTray } from './ui/HUD'
import TopBar from './ui/TopBar'
import CommandPanel, { BattleGroupsPanel } from './ui/CommandPanel'
import FeedsPanel from './ui/FeedsPanel'
import NetPanel from './ui/NetPanel'
import Splash, { type StartFn } from './ui/Splash'
import EndScreenGate from './ui/EndScreen'
import { CampaignObjectives } from './ui/CampaignHUD'
import { VtcOpener, VtcFrago } from './ui/Vtc'
import S1Console from './ui/S1Console'
import CommandDashboard from './ui/CommandDashboard'
import PackViewer from './ui/PackViewer'
import TutorialOverlay from './ui/tutorial'
import InsigniaTest from './ui/InsigniaTest'
import { S } from './engine/state'
import { initGame, initDevGame } from './engine/scenario'
import { startLoop } from './engine/SimLoop'
import { MAP_SIZES } from './world/WorldMap'
import { loadTheater } from './world/theaters'
import { CAMPAIGN_THEATER, CAMPAIGN_SEED, setCampaignTutorial } from './engine/campaign'

export default function App() {
  // if a game is already running (e.g. after an HMR remount), skip the splash
  const [started, setStarted] = useState(() => !!S.map)
  const shakeRef = useRef<HTMLDivElement>(null) // base-under-fire shakes the whole TOC

  // TEMP: /?insignia renders the patch/rank/portrait gallery (dev eyeballing)
  if (window.location.search.includes('insignia')) return <InsigniaTest />

  // theater elevation loads async (a one-time fetch of our own baked asset,
  // then cached) — the splash stays up for the few ms it takes
  const begin: StartFn = (mode, size = 'large', difficulty, gameMode, theaterId, tutorial) => {
    void (async () => {
      if (mode === 'dev') initDevGame()
      else {
        // the campaign is always the same ground: fixed theater, Large, fixed seed
        const isCampaign = gameMode === 'campaign'
        const tId = isCampaign ? CAMPAIGN_THEATER : theaterId
        const gridSize = isCampaign ? MAP_SIZES.large : (MAP_SIZES[size] ?? MAP_SIZES.large)
        const seed = isCampaign ? CAMPAIGN_SEED : (Date.now() % 100000)
        if (isCampaign) setCampaignTutorial(!!tutorial) // read by startCampaign
        const theater = tId ? await loadTheater(tId) : undefined
        initGame(seed, gridSize, difficulty, gameMode, theater)
      }
      startLoop()
      setStarted(true)
    })().catch((e) => console.error('failed to start game', e))
  }

  if (!started) return <Splash onStart={begin} />

  // top bar over the rail row (P5): [INSTALLATIONS|BATTLE GROUPS] map [FEEDS|NET].
  // Every rail is a real layout sibling — collapsing one genuinely widens the
  // map. The map column is itself a flex COLUMN: the map area (with its
  // overlays) on top, the selection tray as a real row below it.
  return (
    <div ref={shakeRef} style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: '#2a2b2e', // in-game backdrop: neutral dark grey (menu keeps the theme blue)
    }}>
      <BaseUnderFire shakeRef={shakeRef} />
      <TopBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <CommandPanel />
        <BattleGroupsPanel />
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
            <CommandDashboard />
            <PackViewer />
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
