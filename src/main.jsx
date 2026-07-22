import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initGame, startLoop } from './game/sim.js'

initGame(Date.now() % 100000)
startLoop()

createRoot(document.getElementById('root')).render(<App />)
