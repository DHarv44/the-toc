import { useState } from 'react'
import MapView from './map/MapView.jsx'
import HUD from './ui/HUD.jsx'
import Splash from './ui/Splash.jsx'
import { S, initGame, initDevGame, startLoop } from './game/sim.js'
import { MAP_SIZES } from './game/mapgen.js'

export default function App() {
  // if a game is already running (e.g. after an HMR remount), skip the splash
  const [started, setStarted] = useState(() => !!S.map)

  const begin = (mode, size = 'large') => {
    if (mode === 'dev') initDevGame()
    else initGame(Date.now() % 100000, MAP_SIZES[size] ?? MAP_SIZES.large)
    startLoop()
    setStarted(true)
  }

  if (!started) return <Splash onStart={begin} />

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <MapView />
      <HUD />
    </div>
  )
}
