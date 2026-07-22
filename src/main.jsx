import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { theme } from './ui/theme.js'
import App from './App.jsx'

// The game is started from the splash screen (App). initGame/startLoop run when
// the player picks a mode; on an HMR update the sim keeps running via globalThis.
createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>
)
