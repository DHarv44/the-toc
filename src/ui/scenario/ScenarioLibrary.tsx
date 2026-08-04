// THE LIBRARY — the Scenario Builder's front door. A document tool opens on
// its documents: every scenario every installed pack ships, one row each
// (type badge, ground, missions), plus NEW SCENARIO. You cannot reach the
// editor without a scenario AND ground — opening a groundless one (a campaign
// awaiting its map) asks for the map right here, so the editor never exists
// in a half-state.
//
// It is a LIST, not a wall of cards. Unreal's and Unity's project browsers are
// dense rows with a filter above them, because a shelf of big cards stops
// working at about a dozen items and packs will ship more than that.
import { useMemo, useState } from 'react'
import { Box, Group, Select, Text, TextInput } from '@mantine/core'
import { allPacks } from '../../packs'
import { packMaps } from '../../packs/map-files'
import { packScenarios, type PackScenarioEntry } from '../../packs/scenario-files'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'
import { DATA_FONT, field, INK, Section, TextBtn, UI_FONT } from './panel'

export interface NewScenarioCfg {
  name: string
  packId: string
  type: ModeId
  mapRef: string
}

// Mode labels are authored in caps for the game's own screens. The badge in a
// tool list is chrome, so it is cased like the rest of the chrome — otherwise
// "Campaign" and "ATTACK & DEFEND" sit in the same column shouting unevenly.
const typeLabel = (t: ModeId) => {
  const raw = t === 'campaign' ? 'Campaign' : (MODES[t]?.label ?? t)
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

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

  const [filter, setFilter] = useState('')
  // NEW SCENARIO expands in place — the Section owns the open/closed state
  const [newName, setNewName] = useState('NEW SCENARIO')
  const [newPack, setNewPack] = useState(() => allPacks()[0]?.id ?? '')
  const [newType, setNewType] = useState<ModeId>('attack-defend')
  const [newMap, setNewMap] = useState<string | null>(null)

  // opening a groundless scenario expands ITS row into a map prompt
  const [groundFor, setGroundFor] = useState<string | null>(null) // 'pack/sid'
  const [groundPick, setGroundPick] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return scenarios
    return scenarios.filter(e =>
      e.name.toLowerCase().includes(q)
      || e.packId.toLowerCase().includes(q)
      || e.spec.type.toLowerCase().includes(q))
  }, [scenarios, filter])

  return (
    <Box pos="fixed" inset={0} bg="#05080b" style={{
      zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflowY: 'auto',
    }}>
      <Box w={680} py={36}>
        <Group align="flex-start" mb={18}>
          <Box style={{ flex: 1 }}>
            <Text style={{
              fontFamily: DATA_FONT, fontSize: 24, fontWeight: 700, letterSpacing: 1.5,
              color: INK.value,
            }}>
              SCENARIO BUILDER
            </Text>
            <Text style={{ fontFamily: UI_FONT, fontSize: 12.5, color: INK.dim }}>
              Pick a scenario to edit, or start a new one.
            </Text>
          </Box>
          <TextBtn onClick={onExit}>◀ Main menu</TextBtn>
        </Group>

        <Box style={{ border: `1px solid ${INK.line}`, borderRadius: 3, overflow: 'hidden' }}>
          {/* NEW SCENARIO — the create row, expanding in place */}
          <Section title="＋ New scenario" defaultOpen={false}>
            <Box p={10}>
              <Group grow mb={8}>
                <TextInput size="xs" styles={field} label="Name" value={newName}
                  onChange={ev => setNewName(ev.currentTarget.value.toUpperCase())} />
              </Group>
              <Group grow mb={8}>
                <Select size="xs" styles={field} label="Pack (saves into)" value={newPack}
                  data={allPacks().map(p => ({ value: p.id, label: p.abbr ?? p.id }))}
                  onChange={v => v && setNewPack(v)} />
                <Select size="xs" styles={field} label="Type" value={newType}
                  data={TYPE_OPTIONS}
                  onChange={v => v && setNewType(v as ModeId)} />
              </Group>
              <Select size="xs" styles={field} label="Map (the ground)" mb={10}
                placeholder="pick a map…" value={newMap} data={mapData}
                onChange={v => setNewMap(v)} />
              <TextBtn onClick={() => {
                if (!newMap || !newName.trim()) return
                onNew({ name: newName.trim(), packId: newPack, type: newType, mapRef: newMap })
              }}>Create</TextBtn>
              {(!newMap || !newName.trim()) && (
                <Text mt={6} style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim }}>
                  A scenario needs a name and ground before it can open.
                </Text>
              )}
            </Box>
          </Section>

          <Box px={10} py={6} style={{ borderTop: `1px solid ${INK.line}` }}>
            <TextInput size="xs" styles={field} value={filter}
              placeholder={`Filter ${scenarios.length} scenarios…`}
              onChange={ev => setFilter(ev.currentTarget.value)} />
          </Box>

          {/* the shelf */}
          {shown.map(e => {
            const key = `${e.packId}/${e.scenarioId}`
            const nMissions = e.spec.missions?.length ?? 0
            const mapName = e.spec.map
              ? (maps.find(m => `${m.packId}/${m.mapId}` === e.spec.map)?.name
                ?? e.spec.map)
              : null
            const asking = groundFor === key
            const campaign = e.spec.type === 'campaign'
            return (
              <Box key={key}
                style={{
                  borderTop: `1px solid ${INK.line}`, cursor: 'pointer',
                  background: asking ? '#141c24' : undefined,
                }}
                onMouseEnter={ev => { ev.currentTarget.style.background = '#141c24' }}
                onMouseLeave={ev => {
                  ev.currentTarget.style.background = asking ? '#141c24' : 'transparent'
                }}
                onClick={() => {
                  if (e.spec.map) onOpen(e, e.spec.map)
                  else { setGroundFor(asking ? null : key); setGroundPick(null) }
                }}>
                <Group gap={10} wrap="nowrap" px={12} py={9}>
                  <Box style={{
                    width: 3, alignSelf: 'stretch', borderRadius: 2,
                    background: campaign ? '#8a6a2a' : '#2a5a8a',
                  }} />
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text truncate style={{
                      fontFamily: DATA_FONT, fontSize: 14, fontWeight: 700, color: INK.value,
                    }}>
                      {e.name}
                    </Text>
                    <Text truncate style={{
                      fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim,
                    }}>
                      {mapName ?? '⚠ no ground yet'}
                      {nMissions > 0 && ` · ${nMissions} mission${nMissions > 1 ? 's' : ''}`}
                      {' · '}{e.packId} pack
                    </Text>
                  </Box>
                  <Text style={{
                    fontFamily: UI_FONT, fontSize: 11.5, flex: '0 0 auto',
                    color: campaign ? INK.warn : INK.accent,
                  }}>
                    {typeLabel(e.spec.type)}
                  </Text>
                </Group>
                {asking && (
                  <Box px={12} pb={10} onClick={ev => ev.stopPropagation()}>
                    <Text mb={6} style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.warn }}>
                      This scenario has no ground. Choose its map — saving binds it.
                    </Text>
                    <Group gap={8}>
                      <Select size="xs" styles={field} placeholder="pick a map…"
                        value={groundPick} data={mapData} style={{ flex: 1 }}
                        onChange={v => setGroundPick(v)} />
                      <TextBtn onClick={() => groundPick && onOpen(e, groundPick)}>Open</TextBtn>
                    </Group>
                  </Box>
                )}
              </Box>
            )
          })}
          {shown.length === 0 && (
            <Text px={12} py={10} style={{
              fontFamily: UI_FONT, fontSize: 12.5, color: INK.dim,
              borderTop: `1px solid ${INK.line}`,
            }}>
              {scenarios.length === 0
                ? 'No scenarios in any installed pack yet — start with New scenario.'
                : 'Nothing matches that filter.'}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}
