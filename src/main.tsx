import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { theme } from './ui/theme'
import App from './App'
import './devtools/hooks' // window.__game / __advance dev-console surface

// The game is started from the splash screen (App). initGame/startLoop run when
// the player picks a mode; the sim state survives HMR via globalThis stashes.
createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>
)
