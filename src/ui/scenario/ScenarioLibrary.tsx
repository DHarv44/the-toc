// THE LIBRARY — the Scenario Builder's front door. A document tool opens on
// its documents: every scenario every installed pack ships, one card each
// (type badge, ground, missions), plus NEW SCENARIO. You cannot reach the
// editor without a scenario AND ground — opening a groundless one (a campaign
// awaiting its map) asks for the map right here, so the editor never exists
// in a half-state.
import { useState } from 'react'
import { Box, Button, Group, Select, Text, TextInput } from '@mantine/core'
import { allPacks } from '../../packs'
import { packMaps } from '../../packs/map-files'
import { packScenarios, type PackScenarioEntry } from '../../packs/scenario-files'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'

const MONO = 'Consolas, monospace'

export interface NewScenarioCfg {
  name: string
  packId: string
  type: ModeId
  mapRef: string
}

const typeLabel = (t: ModeId) =>
  t === 'campaign' ? 'CAMPAIGN' : (MODES[t]?.label ?? t).toUpperCase()

const TYPE_OPTIONS = [
  ...MODE_ORDER.map(id => ({ value: id, label: MODES[id].label })),
  { value: 'campaign', label: 'CAMPAIGN' },
]

export default function ScenarioLibrary({ onOpen, onNew, onExit }: {
  /** open an existing scenario — mapRef is the scenario's own ground, or the
   *  one just chosen for a groundless scenario */
  onOpen: (e: PackScenarioEntry, mapRef: string) => void
  onNew: (cfg: NewScenarioCfg) => void
  onExit: () => void
}) {
  const scenarios = packScenarios()
  const maps = packMaps()
  const mapData = maps.map(m => ({
    value: `${m.packId}/${m.mapId}`, label: `${m.packId} · ${m.name}`,
  }))

  // NEW SCENARIO expands in place
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('NEW SCENARIO')
  const [newPack, setNewPack] = useState(() => allPacks()[0]?.id ?? '')
  const [newType, setNewType] = useState<ModeId>('attack-defend')
  const [newMap, setNewMap] = useState<string | null>(null)

  // opening a groundless scenario expands ITS card into a map prompt
  const [groundFor, setGroundFor] = useState<string | null>(null) // 'pack/sid'
  const [groundPick, setGroundPick] = useState<string | null>(null)

  return (
    <Box pos="fixed" inset={0} bg="#05080b" style={{
      zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: MONO, overflowY: 'auto',
    }}>
      <Box w={560} py={40}>
        <Group align="center" mb={4}>
          <Box style={{ flex: 1 }}>
            <Text fz={26} fw={700} c="#dceeff" style={{ letterSpacing: 4 }}>
              SCENARIO BUILDER
            </Text>
            <Text fz={10} c="dark.3" style={{ letterSpacing: 1.5 }}>
              PICK A SCENARIO TO EDIT — OR START A NEW ONE
            </Text>
          </Box>
          <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
        </Group>

        <Box mt={24}>
          {/* NEW SCENARIO — the create card */}
          <Box mb={10} p={14} style={{
            border: '1px solid #2a3a48', borderLeft: '3px solid #7ec8ff',
            borderRadius: 3, background: 'rgba(16,26,36,0.85)',
            cursor: creating ? 'default' : 'pointer',
          }}
            onClick={() => { if (!creating) setCreating(true) }}>
            <Text fz={15} fw={700} c="#e6f0f8" style={{ letterSpacing: 3 }}>
              ＋ NEW SCENARIO
            </Text>
            {!creating && (
              <Text fz={10} c="#7f97ab" mt={2}>
                Name it, pick its pack, its type and its ground — then build
              </Text>
            )}
            {creating && (
              <Box mt={10} onClick={ev => ev.stopPropagation()}>
                <TextInput size="xs" label="NAME" value={newName} mb={8}
                  styles={{ input: { fontFamily: MONO } }}
                  onChange={ev => setNewName(ev.currentTarget.value.toUpperCase())} />
                <Group grow mb={8}>
                  <Select size="xs" label="PACK (SAVES INTO)" value={newPack}
                    data={allPacks().map(p => ({ value: p.id, label: p.abbr ?? p.id }))}
                    onChange={v => v && setNewPack(v)} />
                  <Select size="xs" label="TYPE" value={newType}
                    data={TYPE_OPTIONS}
                    onChange={v => v && setNewType(v as ModeId)} />
                </Group>
                <Select size="xs" label="MAP (THE GROUND)" placeholder="PICK A MAP…"
                  value={newMap} data={mapData} mb={10}
                  onChange={v => setNewMap(v)} />
                <Group gap={8}>
                  <Button size="compact-sm" disabled={!newMap || !newName.trim()}
                    onClick={() => onNew({
                      name: newName.trim(), packId: newPack, type: newType, mapRef: newMap!,
                    })}>
                    CREATE
                  </Button>
                  <Button size="compact-sm" variant="subtle" c="dark.2"
                    onClick={() => setCreating(false)}>CANCEL</Button>
                </Group>
              </Box>
            )}
          </Box>

          {/* the shelf */}
          {scenarios.map(e => {
            const key = `${e.packId}/${e.scenarioId}`
            const nMissions = e.spec.missions?.length ?? 0
            const mapName = e.spec.map
              ? (maps.find(m => `${m.packId}/${m.mapId}` === e.spec.map)?.name.toUpperCase()
                ?? e.spec.map.toUpperCase())
              : null
            const asking = groundFor === key
            return (
              <Box key={key} mb={8} p={14} style={{
                border: '1px solid #22303d',
                borderLeft: `3px solid ${e.spec.type === 'campaign' ? '#8a6a2a' : '#2a5a8a'}`,
                borderRadius: 3, background: 'rgba(16,26,36,0.85)', cursor: 'pointer',
              }}
                onClick={() => {
                  if (e.spec.map) onOpen(e, e.spec.map)
                  else { setGroundFor(asking ? null : key); setGroundPick(null) }
                }}>
                <Group gap={8} wrap="nowrap">
                  <Text fz={15} fw={700} c="#e6f0f8" style={{ letterSpacing: 2, flex: 1 }} truncate>
                    {e.name}
                  </Text>
                  <Text fz={9} c="#7ec8ff" style={{ letterSpacing: 1 }}>
                    {typeLabel(e.spec.type)}
                  </Text>
                </Group>
                <Text fz={10} c="#7f97ab" mt={2}>
                  {mapName ?? '⚠ NO GROUND YET'}
                  {nMissions > 0 && ` · ${nMissions} MISSION${nMissions > 1 ? 'S' : ''}`}
                  {' · '}{e.packId.toUpperCase()} PACK
                </Text>
                {asking && (
                  <Box mt={10} onClick={ev => ev.stopPropagation()}>
                    <Text fz={10} c="#e0b34e" mb={6}>
                      THIS SCENARIO HAS NO GROUND — CHOOSE ITS MAP (SAVING BINDS IT)
                    </Text>
                    <Group gap={8}>
                      <Select size="xs" placeholder="PICK A MAP…" value={groundPick}
                        data={mapData} style={{ flex: 1 }}
                        onChange={v => setGroundPick(v)} />
                      <Button size="compact-sm" disabled={!groundPick}
                        onClick={() => onOpen(e, groundPick!)}>OPEN</Button>
                    </Group>
                  </Box>
                )}
              </Box>
            )
          })}
          {scenarios.length === 0 && (
            <Text fz={10} c="dark.3" mt={8}>
              NO SCENARIOS IN ANY INSTALLED PACK YET — START WITH NEW SCENARIO
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}
