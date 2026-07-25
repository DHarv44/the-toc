// COMMAND DASHBOARD — the commander's one-glance console over the map column
// (▤ in the top bar). Live tiles built from the same state the staff consoles
// read: the operation, combat power, personnel, sustainment (the old top-bar
// supply/net/upkeep readouts live here now), recovery and report traffic.
import { Box, Group, Text } from '@mantine/core'
import { S } from '../engine/state'
import { useUI } from './store'
import { operation, unreadReports } from '../engine/campaign'
import { forceCount, forceCap } from '../domains/economy/economy'
import { pipelineBacklog } from '../domains/forces/pipeline'
import { playerPack } from '../packs'
import { BnDui } from './insignia'
import { fmtClock } from './styles'

function Tile({ label, children, accent = '#3d5a75' }: {
  label: string; children: React.ReactNode; accent?: string
}) {
  return (
    <Box p="md" style={{
      border: '1px solid #22303d', borderTop: `3px solid ${accent}`, borderRadius: 4,
      background: '#0d141c', minWidth: 260, flex: '1 1 260px',
    }}>
      <Text fz="xs" c="dark.3" style={{ letterSpacing: 2 }}>{label}</Text>
      {children}
    </Box>
  )
}

const Big = ({ v, c = '#dceeff' }: { v: React.ReactNode; c?: string }) => (
  <Text fz={30} fw={700} c={c} lh={1.2} style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</Text>
)
const Sub = ({ v, c = '#9ab8d0' }: { v: React.ReactNode; c?: string }) => (
  <Text fz="sm" c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</Text>
)

export default function CommandDashboard() {
  useUI((st) => st.tick)
  const ui = useUI()
  if (ui.console !== 'dash') return null

  const pack = playerPack()
  const playerBn = pack.formation?.playerBn
  const c = S.campaign

  // personnel rollup (fielded + garrisoned TF slots)
  let asg = 0, fit = 0, wia = 0, kia = 0, mia = 0
  const tally = (list: { status: string; replaced?: boolean }[]) => {
    for (const s of list) {
      if (!s.replaced) asg++
      if (s.status === 'FIT') fit++
      else if (s.status === 'WIA') wia++
      else if (s.status === 'KIA') kia++
      else if (s.status === 'MIA') mia++
    }
  }
  for (const u of S.units) if (u.side === 'friend') tally(u.soldiers)
  for (const sl of S.org?.slots ?? []) if (sl.tf && sl.type && sl.unitId == null) tally(sl.soldiers)

  // sustainment is PHYSICAL now (no point economy): forward stock is what the
  // trucks have actually hauled, readiness is the motorpool queue
  const fobStock = S.structures.filter(s => s.side === 'friend' && s.kind === 'FOB')
    .reduce((n, s) => n + Math.floor(s.stock || 0), 0)
  const convoys = S.units.filter(u => u.side === 'friend' && u.convoy).length
  const dustwun = S.downed.filter(d => d.side === 'friend' && !d.resolved).length
  const vicsDam = S.units.filter(u => u.side === 'friend')
    .reduce((n, u) => n + u.vehicles.filter(v => v.status === 'DAMAGED').length, 0)

  return (
    <Box pos="absolute" inset={0} p="lg"
      style={{
        zIndex: 40, overflow: 'auto', background: 'rgba(8,11,15,0.985)',
        fontFamily: 'Consolas, monospace', userSelect: 'none',
      }}>
      <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
        {playerBn && <BnDui bn={playerBn} h={54} />}
        <Box>
          <Text fz={26} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>COMMAND DASHBOARD</Text>
          <Text fz="xs" c="dark.3" style={{ letterSpacing: 1.5 }}>
            {playerBn ?? pack.abbr} · {pack.name.toUpperCase()} · MISSION {fmtClock(S.t)}
          </Text>
        </Box>
      </Group>

      <Group gap="md" mt="md" align="stretch" wrap="wrap">
        {c && (
          <Tile label="OPERATION" accent="#7ec8ff">
            <Big v={operation().name} />
            <Sub v={`OBJECTIVE ${Math.min(c.objIdx + 1, operation().objectives.length)}/${operation().objectives.length} — ${operation().objectives[c.objIdx]?.label ?? 'COMPLETE'}`} />
          </Tile>
        )}
        <Tile label="COMBAT POWER" accent="#7ec87e">
          <Big v={`${forceCount()}/${forceCap()}`} />
          <Sub v="ELEMENTS FIELDED / FORCE CAP" />
        </Tile>
        <Tile label="PERSONNEL" accent="#d4b23a">
          <Big v={`${fit}/${asg}`} />
          <Sub v={<>FIT / ASSIGNED · <span style={{ color: '#e8c547' }}>{wia} WIA</span> · <span style={{ color: '#e8524a' }}>{kia} KIA</span> · <span style={{ color: '#9a7ec8' }}>{mia} MIA</span></>} />
          <Sub v={`${pipelineBacklog()} REPLACEMENTS REQUESTED · NEXT PACKET ${Math.max(0, Math.ceil((S.replT - S.t) / 60))} MIN`} />
        </Tile>
        <Tile label="SUSTAINMENT" accent="#c8843c">
          <Big v={fobStock.toLocaleString()} c="#e8c547" />
          <Sub v={`FORWARD STOCK AT FOBS · ${convoys} CONVOY${convoys === 1 ? '' : 'S'} RUNNING`} />
          <Sub v={`${vicsDam} VIC${vicsDam === 1 ? '' : 'S'} DAMAGED AWAITING MOTORPOOL`} />
        </Tile>
        <Tile label="PERSONNEL RECOVERY" accent={dustwun ? '#9a7ec8' : '#3d5a75'}>
          <Big v={dustwun} c={dustwun ? '#9a7ec8' : '#dceeff'} />
          <Sub v={dustwun ? 'DUSTWUN SITES OPEN — SECURE THE LKP' : 'NO OPEN CASES'} />
        </Tile>
        <Tile label="STAFF TRAFFIC" accent={unreadReports(S) ? '#d43a3a' : '#3d5a75'}>
          <Big v={unreadReports(S)} c={unreadReports(S) ? '#ff8a7e' : '#dceeff'} />
          <Sub v={unreadReports(S) ? 'UNREAD REPORTS — S1 HOLDS THE TRAFFIC' : 'NO UNREAD TRAFFIC'} />
        </Tile>
      </Group>
    </Box>
  )
}
