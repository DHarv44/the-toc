import { createTheme } from '@mantine/core'

// Mantine theme tuned to the TOC HUD look: monospace, dark blue-steel palette,
// tight radii. Used app-wide via MantineProvider (defaultColorScheme="dark").
export const theme = createTheme({
  fontFamily: 'Consolas, "Courier New", monospace',
  fontFamilyMonospace: 'Consolas, "Courier New", monospace',
  primaryColor: 'toc',
  primaryShade: { light: 6, dark: 6 },
  defaultRadius: 'xs',
  radius: { xs: '2px', sm: '3px', md: '4px' },
  colors: {
    // HUD accent blue (index 6 ≈ #2a5a8a, lighter shades for text/hover)
    toc: ['#eaf4fb', '#d3e6f5', '#a7cbea', '#79b0df', '#5599d6', '#3f8bd0', '#2a5a8a', '#24507b', '#1c3f61', '#12324f'],
    // dark scale: [0] light text … [9] near-black. Matches the panel/border tones.
    dark: ['#c8d8e8', '#9ab8d0', '#7f97ab', '#5f7d95', '#35506a', '#26384a', '#16222e', '#0e1a24', '#0a1016', '#05080b'],
  },
  components: {
    Button: { defaultProps: { size: 'compact-xs' } },
  },
})
