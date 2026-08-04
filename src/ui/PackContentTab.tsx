// CONTENT — the maps and scenarios this pack ships.
//
// It does NOT edit either. The MAP EDITOR and the SCENARIO BUILDER already
// author them, both with working save paths, and rebuilding a terrain tool or
// an entity sheet inside a tab would be a second implementation of a solved
// problem. What was missing is the OTHER half: a pack is the HOME of this
// content — it lives in src/packs/<id>/maps and /scenarios, ships with the
// army, and is discovered by the same globs — and there was nowhere in the
// pack tool that said so.
//
// So this lists what the pack has, says what each thing is, and hands off.
import { Badge, Box, Button, Group, Text } from '@mantine/core'
import { packMaps } from '../packs/map-files'
import { packScenarios } from '../packs/scenario-files'
import { MODES } from '../engine/modes'
import type { Pack } from '../packs/types'

const MONO = 'Consolas, monospace'

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box mb={6} p={10}
      style={{ border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }}>
      {children}
    </Box>
  )
}

export default function PackContentTab({ p, onOpenMaps, onOpenScenarios }: {
  p: Pack
  onOpenMaps?: () => void
  onOpenScenarios?: () => void
}) {
  const maps = packMaps().filter(m => m.packId === p.id)
  const scenarios = packScenarios().filter(s => s.packId === p.id)

  // a scenario's ground may belong to ANOTHER pack — a map is terrain, not a
  // nationality, and the MI borrows 1CD's until it authors its own
  const groundOf = (ref?: string) => {
    if (!ref) return null
    const [mp, mid] = ref.split('/')
    const m = packMaps().find(x => x.packId === mp && x.mapId === mid)
    return { name: m?.name ?? mid ?? ref, foreign: mp !== p.id, packId: mp }
  }

  return (
    <Box maw={860}>
      {/* MAPS */}
      <Group gap={8} mb={8} align="baseline">
        <Text fz={15} fw={700} c="#9ab8d0" style={{ letterSpacing: 1.5 }}>MAPS</Text>
        <Text fz={15} c="dark.3">{maps.length}</Text>
        <Button size="compact-sm" variant="default" ml="auto" onClick={onOpenMaps}
          disabled={!onOpenMaps}>
          OPEN MAP EDITOR
        </Button>
      </Group>
      {maps.length === 0 && (
        <Text fz={15} c="dark.3" mb={14}>
          This pack ships no ground. Author one in the MAP EDITOR and save it into
          {' '}<span style={{ fontFamily: MONO }}>{p.id}</span> — a scenario can still borrow
          another pack's map in the meantime.
        </Text>
      )}
      {maps.map(m => (
        <Row key={m.mapId}>
          <Group gap={10} wrap="nowrap" align="baseline">
            <Text fz={16} fw={700} c="#dceeff">{m.name}</Text>
            <Text fz={15} c="dark.3" style={{ fontFamily: MONO, flex: 1 }}>
              {p.id}/{m.mapId}
            </Text>
            {/* WHO FIGHTS ON THIS GROUND — counted across every pack, not just
                this one. Ground is lent: the MI's Camp Currie sits on 1CD's
                Kabul, and a count that hid that would make the map look unused */}
            {(() => {
              const on = packScenarios().filter(s => s.spec.map === `${p.id}/${m.mapId}`)
              const foreign = on.filter(s => s.packId !== p.id).length
              return (
                <Text fz={15} c="dark.3">
                  {on.length} SCENARIO{on.length === 1 ? '' : 'S'}
                  {foreign > 0 && ` · ${foreign} FROM ANOTHER PACK`}
                </Text>
              )
            })()}
          </Group>
        </Row>
      ))}

      {/* SCENARIOS */}
      <Group gap={8} mt={20} mb={8} align="baseline">
        <Text fz={15} fw={700} c="#9ab8d0" style={{ letterSpacing: 1.5 }}>SCENARIOS</Text>
        <Text fz={15} c="dark.3">{scenarios.length}</Text>
        <Button size="compact-sm" variant="default" ml="auto" onClick={onOpenScenarios}
          disabled={!onOpenScenarios}>
          OPEN SCENARIO BUILDER
        </Button>
      </Group>
      {scenarios.length === 0 && (
        <Text fz={15} c="dark.3">
          This pack ships no scenarios, so there is no way to play it. Author one in the
          SCENARIO BUILDER — it decides which army takes which side, so a pack becomes
          playable the moment a scenario names it.
        </Text>
      )}
      {scenarios.map(s => {
        const g = groundOf(s.spec.map)
        const isCampaign = s.spec.type === 'campaign'
        const n = s.spec.missions?.length ?? 0
        const sides = s.spec.sides
        return (
          <Row key={s.scenarioId}>
            <Group gap={10} wrap="nowrap" align="baseline">
              <Text fz={16} fw={700} c="#dceeff">{s.name}</Text>
              <Badge size="sm" variant="outline" color={isCampaign ? 'yellow' : 'blue'}>
                {isCampaign ? 'CAMPAIGN' : (MODES[s.spec.type]?.label ?? s.spec.type).toUpperCase()}
              </Badge>
              <Text fz={15} c="dark.3" style={{ fontFamily: MONO, flex: 1 }}>
                {p.id}/{s.scenarioId}
              </Text>
              {isCampaign && <Text fz={15} c="dark.3">{n} MISSION{n === 1 ? '' : 'S'}</Text>}
            </Group>
            <Group gap={14} mt={4}>
              <Text fz={15} c={g ? (g.foreign ? '#c8a25f' : 'dark.3') : 'orange.5'}>
                GROUND: {g ? `${g.name.toUpperCase()}${g.foreign ? ` · BORROWED FROM ${g.packId?.toUpperCase()}` : ''}`
                  : 'NONE — bind a map in the SCENARIO BUILDER'}
              </Text>
              {sides && (
                <Text fz={15} c="dark.3">
                  SIDES: {(sides.friend ?? '?').toUpperCase()} vs {(sides.hostile ?? '?').toUpperCase()}
                  {sides.friend && sides.friend !== p.id && ' — this pack is not the player here'}
                </Text>
              )}
              {s.spec.player && <Text fz={15} c="dark.3">CHAIR: {s.spec.player}</Text>}
            </Group>
          </Row>
        )
      })}
    </Box>
  )
}
