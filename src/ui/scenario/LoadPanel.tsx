// LOAD SCENARIO — the pack tree as a panel (user-specced): flat rows, one
// per scenario, the TYPE as a badge; a scenario with missions shows them
// indented (they travel with it on load). Click a row = LOAD (edit the
// original — map, situation, every mission's script). [PORT] = copy into the
// CURRENT workspace instead: same ground verbatim, new ground = same
// relative positions + staged re-anchoring. Mission rows port individually —
// the training mission ships once and lands in any scenario.
import { Box, Button, Group, Text } from '@mantine/core'
import { MODES } from '../../engine/modes'
import type { PackScenarioEntry } from '../../packs/scenario-files'

const MONO = 'Consolas, monospace'

export default function LoadPanel({ entries, currentKey, portEnabled, onLoad, onPortScenario, onPortMission }: {
  entries: PackScenarioEntry[]
  /** '<packId>/<scenarioId>' of the loaded scenario — highlighted */
  currentKey: string | null
  /** PORT needs ground on the bench */
  portEnabled: boolean
  onLoad: (e: PackScenarioEntry) => void
  onPortScenario: (e: PackScenarioEntry) => void
  onPortMission: (e: PackScenarioEntry, missionIdx: number) => void
}) {
  return (
    <Box p="xs" style={{ fontFamily: MONO }}>
      <Text fz={9} c="dark.3" mb={6} style={{ letterSpacing: 1.5 }}>LOAD SCENARIO</Text>
      {entries.length === 0 && (
        <Text fz={10} c="dark.3">
          NO SCENARIOS IN ANY INSTALLED PACK — BUILD ONE AND SAVE IT
        </Text>
      )}
      {entries.map(e => {
        const key = `${e.packId}/${e.scenarioId}`
        const active = key === currentKey
        const badge = e.spec.type === 'campaign'
          ? 'CAMPAIGN' : (MODES[e.spec.type]?.label ?? e.spec.type).toUpperCase()
        const mapName = e.spec.map ? e.spec.map.split('/')[1]!.toUpperCase() : 'NO GROUND'
        return (
          <Box key={key} mb={4}>
            <Group gap={4} wrap="nowrap"
              onClick={() => onLoad(e)}
              style={{
                cursor: 'pointer', padding: '4px 6px', borderRadius: 3,
                border: `1px solid ${active ? '#7ec8ff' : '#22303d'}`,
                background: active ? 'rgba(126,200,255,0.08)' : 'transparent',
              }}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text fz={11} c={active ? '#dceeff' : '#c8d8e8'} truncate>
                  {e.name}
                </Text>
                <Text fz={8.5} c="dark.3">
                  {badge} · {mapName} · {e.packId.toUpperCase()}
                </Text>
              </Box>
              <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
                disabled={!portEnabled}
                title="Copy into the current workspace on the loaded ground"
                onClick={ev => { ev.stopPropagation(); onPortScenario(e) }}>
                PORT
              </Button>
            </Group>
            {(e.spec.missions ?? []).map((m, i) => (
              <Group key={m.id} gap={4} wrap="nowrap" pl={14} py={1}>
                <Text fz={9} c="dark.2" style={{ flex: 1 }} truncate>
                  {String(i + 1).padStart(2, '0')} · {m.name || m.id}
                </Text>
                <Button size="compact-xs" variant="subtle" c="dark.2" px={4}
                  disabled={!portEnabled}
                  title="Copy this mission's script into the current scenario"
                  onClick={() => onPortMission(e, i)}>
                  PORT
                </Button>
              </Group>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
