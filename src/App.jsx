import MapView from './map/MapView.jsx'
import HUD from './ui/HUD.jsx'

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <MapView />
      <HUD />
    </div>
  )
}
