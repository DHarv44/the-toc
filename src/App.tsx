// App shell: splash → top bar over a three-column body (command rail | map |
// net rail). Ported verbatim from src/App.jsx.
import { useState } from 'react'
import MapView from './map/MapView'
import HUD from './ui/HUD'
import TopBar from './ui/TopBar'
import CommandPanel from './ui/CommandPanel'
import NetPanel from './ui/NetPanel'
import Splash, { type StartFn } from './ui/Splash'
import { S } from './engine/state'
import { initGame, initDevGame } from './engine/scenario'
import { startLoop } from './engine/SimLoop'
import { MAP_SIZES } from './world/WorldMap'

export default function App() {
  // if a game is already running (e.g. after an HMR remount), skip the splash
  const [started, setStarted] = useState(() => !!S.map)

  const begin: StartFn = (mode, size = 'large', difficulty) => {
    if (mode === 'dev') initDevGame()
    else initGame(Date.now() % 100000, MAP_SIZES[size] ?? MAP_SIZES.large, difficulty)
    startLoop()
    setStarted(true)
  }

  if (!started) return <Splash onStart={begin} />

  // top bar over a three-column body: command rail | map | net rail. The rails are
  // real layout siblings, so collapsing one genuinely widens the map rather than
  // just uncovering it (MapView sizes its canvas from clientWidth/Height).
  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <CommandPanel />
        {/* map column — HUD overlays (tray, toasts, feeds, menus) anchor to this box */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          <MapView />
          <HUD />
        </div>
        <NetPanel />
      </div>
    </div>
  )
}
