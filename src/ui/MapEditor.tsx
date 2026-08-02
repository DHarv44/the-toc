// MAP EDITOR — Groundwork's authoring tool, mounted inside TOC.
//
// The editor is @dharv44/groundwork-builder, consumed as a package: pick a box
// of real Earth, tune it, and the export is the battlefield. TOC owns only the
// shell around it (this file) and, in P1, the SAVE TO PACK seam that writes the
// pack bytes into src/packs/<id>/maps/. Groundwork never learns what a TOC
// pack is; TOC never reimplements terrain authoring. (GROUNDWORK.md, P0.)
//
// Host obligations, per the builder's config contract:
//  - configureBuilder BEFORE mount, once — storage namespace + asset base.
//  - Endpoints: in dev the builder's defaults call /api/opentopo, /api/terrarium
//    and /api/imagery, which TOC's vite config now proxies exactly as the
//    standalone app does (key appended server-side, canvases never tainted).
//  - The Köppen raster ships inside the package; we hand its served URL back
//    as the asset base rather than copying the file anywhere.
import { Badge, Box, Button, Group, Text } from '@mantine/core'
import { Builder, configureBuilder } from '@dharv44/groundwork-builder'
import '@dharv44/groundwork-builder/styles.css'
import koppenUrl from '@dharv44/groundwork-builder/assets/koppen_0p1.png'

const MONO = 'Consolas, monospace'
const KOPPEN_FILE = 'koppen_0p1.png'

// Once, at module load — before any <Builder /> can possibly mount. The asset
// base is wherever Vite serves the package's own Köppen raster from, so the
// builder finds its file without TOC shipping a copy.
configureBuilder({
  storagePrefix: 'toc.terrain',
  assetBase: koppenUrl.slice(0, koppenUrl.lastIndexOf(KOPPEN_FILE)),
  devHooks: false, // TOC owns window.__game; the editor gets no globals here
})

export default function MapEditor({ onExit }: { onExit: () => void }) {
  return (
    <Box pos="fixed" inset={0} bg="#05080b"
      style={{ zIndex: 100, display: 'flex', flexDirection: 'column', fontFamily: MONO }}>
      <Group gap="md" align="center" px="lg" py={10}
        style={{ borderBottom: '2px solid #2a3a48', flex: '0 0 auto' }}>
        <Box style={{ flex: 1 }}>
          <Text fz={22} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>
            MAP EDITOR
          </Text>
          <Text fz={10} c="dark.3" style={{ letterSpacing: 1.5 }}>
            GROUNDWORK · PICK A BOX OF EARTH, TUNE IT, EXPORT THE BATTLEFIELD
          </Text>
        </Box>
        {/* SAVE TO PACK lands in P1 — until then the builder's own Export tab
            downloads a .gwpack you can drop into a pack folder by hand */}
        <Badge size="sm" variant="outline" color="gray">EXPORT → DOWNLOAD (P1: SAVE TO PACK)</Badge>
        <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
      </Group>

      {/* the builder owns everything below the bar; its styles are scoped to
          .gw on its own root and cannot reach TOC's chrome */}
      <Box style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Builder />
      </Box>
    </Box>
  )
}
