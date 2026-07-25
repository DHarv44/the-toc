// S2 / S3 / S4 staff consoles (task #31 jump start) — one component, three
// shops, all reading live state the way their real desk would. Follows the
// S1Console pattern: full console over the map column, REQUEST <report>
// button through the shared reports pipeline (VTC-then-document), per-shop
// report list. S6 joins when EW/net systems exist.
import { Box, Button, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import { useUI } from './store'
import type { StaffShop } from '../engine/GameState'
import { OPERATION, openReport, queueReport, recallFrago, unreadReports } from '../engine/campaign'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { orbitAuthority, windowOpen } from '../domains/assets/service'
import { playerPack } from '../packs'
import BnHeader from './BnHeader'
import { locRef } from '../world/ref'
import { fmtClock } from './styles'

const MONO: React.CSSProperties = { fontFamily: 'Consolas, monospace' }

const Th = ({ children }: { children?: React.ReactNode }) => (
  <Table.Th><Text fz={10} c="dark.3" style={{ letterSpacing: 1 }}>{children}</Text></Table.Th>
)
const Td = ({ children, c = 'dark.1' }: { children?: React.ReactNode; c?: string }) => (
  <Table.Td><Text fz={11} c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</Text></Table.Td>
)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box mt="md">
      <Text fz="xs" c="dark.3" pb={4} style={{ letterSpacing: 2, borderBottom: '1px solid #22303d' }}>{title}</Text>
      {children}
    </Box>
  )
}

// shared header: title + the shop's REQUEST button + its report list —
// everything human-facing comes from the PACK's staff section data
function ShopFrame({ shop, children }: { shop: StaffShop; children: React.ReactNode }) {
  const pack = playerPack()
  const info = pack.staff?.[shop]
  const report = info?.report ?? shop.toUpperCase()
  const pending = S.campaign?.reports.pending.find(p => p.shop === shop)
  const logs = S.campaign ? S.campaign.reports.log.filter(e => e.shop === shop) : []
  return (
    <Box pos="absolute" inset={0} p="lg"
      style={{ zIndex: 40, overflow: 'auto', background: 'rgba(8,11,15,0.985)', userSelect: 'none', ...MONO }}>
      <BnHeader plate={info?.label ?? shop.toUpperCase()}
        sub={`${(info?.name ?? '').toUpperCase()} · ${pack.name.toUpperCase()}`} about={info} />
      <Group justify="flex-end" mt={8}>
        {S.campaign && (
          <Button size="xs" variant="default" disabled={!!pending}
            onClick={() => queueReport(S, false, shop)}>
            {pending ? `${report} INBOUND ~${Math.max(0, Math.ceil(pending.readyT - S.t))}S` : `REQUEST ${report}`}
          </Button>
        )}
      </Group>
      {children}
      {S.campaign && (
        <Section title={`${report}S ON FILE`}>
          {logs.length === 0 && <Text fz={11} c="dark.3" mt={6}>NONE — REQUEST ONE, OR COMPLETE A MISSION.</Text>}
          {[...logs].reverse().map(e => (
            <UnstyledButton key={e.id} w="100%" onClick={() => openReport(S, e.id)}>
              <Group gap={10} px={4} py={6} style={{ borderTop: '1px solid #141e28' }}>
                <Text span fz={12} fw={700} c={e.read ? 'dark.2' : '#ff8a7e'}>{e.read ? '▸' : '●'}</Text>
                <Text span fz={12} c={e.read ? 'dark.1' : '#dceeff'}>{e.title}</Text>
              </Group>
            </UnstyledButton>
          ))}
        </Section>
      )}
    </Box>
  )
}

function S2Console() {
  const contacts = [...S.contacts.entries()]
  const live = contacts.filter(([, c]) => c.live && !c.unknown)
  const stale = contacts.filter(([, c]) => !c.live && !c.unknown)
  const unknown = contacts.filter(([, c]) => c.unknown)
  const drones = S.drones.filter(d => !d.tether)
  const aero = S.drones.some(d => d.tether != null)
  return (
    <ShopFrame shop="s2">
      <Section title={`CURRENT TRACKS — ${live.length} LIVE · ${stale.length} STALE · ${unknown.length} UNIDENTIFIED`}>
        <Table withRowBorders={false} verticalSpacing={2}>
          <Table.Thead><Table.Tr><Th>TYPE</Th><Th>STATE</Th><Th>LOCATION</Th><Th>STRENGTH</Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {contacts.slice(0, 40).map(([id, c]) => (
              <Table.Tr key={id}>
                <Td c={c.unknown ? '#e8c547' : '#ff8a7e'}>{c.unknown ? '?' : (UNIT_TYPES[c.type]?.abbr ?? c.type)}</Td>
                <Td c={c.live ? '#ff8a7e' : 'dark.3'}>{c.live ? 'LIVE' : `STALE ${Math.round((S.t - c.lastSeen) / 60)}M`}</Td>
                <Td>{S.map ? locRef(S.map, c.x, c.y) : '—'}</Td>
                <Td>{c.unknown ? 'NOT ASSESSED' : `${Math.round(c.strength)}%`}</Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Section>
      <Section title="COLLECTION">
        <Text fz={11} c="dark.1" mt={6}>
          {drones.length} UAS AIRBORNE{drones.length ? ` (${drones.map(d => d.label).join(', ')})` : ''}
          {aero ? ' · AEROSTAT COVERAGE UP' : ' · NO AEROSTAT'}
          {' · SHADOW AUTHORITY '}{isFinite(orbitAuthority('SHADOW')) ? orbitAuthority('SHADOW') : '∞'}
          {windowOpen('SPECTRE') ? ' · CAS WINDOW OPEN' : ''}
        </Text>
        <Text fz={11} c="dark.3" mt={2}>{S.stats.enemyDestroyed} ENEMY ELEMENTS DESTROYED TO DATE</Text>
      </Section>
    </ShopFrame>
  )
}

function S3Console() {
  const c = S.campaign
  const friendly = S.units.filter(u => u.side === 'friend' && !u.respFrom)
  const dustwun = S.downed.filter(d => d.side === 'friend' && !d.resolved)
  return (
    <ShopFrame shop="s3">
      {c && (
        <Section title={`OPERATION ${OPERATION.name}`}>
          {OPERATION.objectives.map((o, i) => (
            <Group key={o.id} gap={8} mt={4}>
              <Text span fz={11} fw={700}
                c={c.status[i] === 'done' ? '#7ec87e' : c.status[i] === 'active' ? '#e8c547' : 'dark.3'}>
                {c.status[i] === 'done' ? '✓' : c.status[i] === 'active' ? '▶' : '·'}
              </Text>
              <Text span fz={11} c={c.status[i] === 'active' ? '#dceeff' : 'dark.2'}>{o.label}</Text>
            </Group>
          ))}
        </Section>
      )}
      {c && (
        <Section title="ORDERS RECEIVED">
          {c.fragoLog.map((f, i) => (
            <UnstyledButton key={i} onClick={() => recallFrago(S, i)}>
              <Text fz={11} c="dark.1" mt={2}>▸ {f.title} <Text span fz={10} c="dark.3">{fmtClock(f.t)}</Text></Text>
            </UnstyledButton>
          ))}
        </Section>
      )}
      <Section title={`TASK FORCE — ${friendly.length} FIELDED`}>
        <Table withRowBorders={false} verticalSpacing={2}>
          <Table.Thead><Table.Tr><Th>ELEMENT</Th><Th>TYPE</Th><Th>STATE</Th><Th>ROE</Th><Th>WPNS</Th><Th>STR</Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {friendly.map(u => (
              <Table.Tr key={u.id}>
                <Td c="#7ec8ff">{u.label}{u.qrfHome != null ? ' ⚡' : ''}</Td>
                <Td>{UNIT_TYPES[u.type]?.abbr ?? u.type}</Td>
                <Td c={S.t - u.lastCombatT < 60 ? '#ff8a7e' : 'dark.1'}>{S.t - u.lastCombatT < 60 ? 'IN CONTACT' : u.state.toUpperCase()}</Td>
                <Td>{u.roe.toUpperCase()}</Td>
                <Td>{u.weapons.toUpperCase()}</Td>
                <Td c={u.strength < 60 ? '#e8c547' : 'dark.1'}>{Math.round(u.strength)}%</Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Section>
      {dustwun.length > 0 && (
        <Section title="PERSONNEL RECOVERY — OPEN">
          {dustwun.map(d => (
            <Text key={d.id} fz={11} c="#9a7ec8" mt={2}>
              {d.label} — LKP {S.map ? locRef(S.map, d.x, d.y) : '—'}
            </Text>
          ))}
        </Section>
      )}
    </ShopFrame>
  )
}

function S4Console() {
  const friendly = S.units.filter(u => u.side === 'friend')
  let ok = 0, dam = 0, dest = 0
  const stow: Record<string, number> = {}
  for (const u of friendly) {
    for (const v of u.vehicles) { if (v.status === 'OK') ok++; else if (v.status === 'DAMAGED') dam++; else dest++ }
    for (const [k, n] of Object.entries(u.stowage)) stow[k] = (stow[k] ?? 0) + (n ?? 0)
  }
  const fobs = S.structures.filter(s => s.side === 'friend' && s.kind === 'FOB')
  const convoys = friendly.filter(u => u.convoy).length
  const damUnits = friendly.filter(u => u.vehicles.some(v => v.status === 'DAMAGED'))
  const A = S.assets
  return (
    <ShopFrame shop="s4">
      <Section title={`MOTORPOOL — OR RATE ${ok + dam + dest ? Math.round(ok / (ok + dam + dest) * 100) : 100}% (${ok} MC · ${dam} MAINT · ${dest} CL)`}>
        {damUnits.length === 0 && <Text fz={11} c="dark.3" mt={6}>NO VEHICLES AWAITING REPAIR.</Text>}
        {damUnits.map(u => (
          <Text key={u.id} fz={11} c="#e8c547" mt={2}>
            {u.label} — {u.vehicles.filter(v => v.status === 'DAMAGED').length} VIC(S) IN MAINTENANCE
          </Text>
        ))}
      </Section>
      <Section title="CLASS V — STOWAGE ON HAND (TF ROLLUP)">
        <Table withRowBorders={false} verticalSpacing={2}>
          <Table.Tbody>
            {Object.entries(stow).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <Table.Tr key={k}><Td c="#7ec8ff">{k}</Td><Td>{Math.floor(n)}</Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Section>
      <Section title={`FORWARD STOCK — ${fobs.length} FOB(S) · ${convoys} CONVOY(S) RUNNING`}>
        {fobs.map(f => (
          <Text key={f.id} fz={11} c="dark.1" mt={2}>{f.label} — STOCK {Math.floor(f.stock || 0)}</Text>
        ))}
      </Section>
      <Section title={`DIVISION ASSETS${A.favor > 0 ? ` · FAVOR +${A.favor}` : ''}`}>
        <Table withRowBorders={false} verticalSpacing={2}>
          <Table.Thead><Table.Tr><Th>ASSET</Th><Th>STATE</Th><Th>HOLDER</Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {A.pool.map(a => (
              <Table.Tr key={a.id}>
                <Td c="#7ec8ff">{a.id}</Td>
                <Td c={a.state === 'available' ? '#7ec87e' : a.state === 'refit' ? '#e8524a' : '#e8c547'}>{a.state.toUpperCase()}</Td>
                <Td>{a.holder ?? '—'}</Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {A.queue.length > 0 && <Text fz={11} c="#e8c547" mt={4}>{A.queue.length} REQUEST(S) ON THE DIVISION WAITING LIST</Text>}
        {A.windows.length > 0 && <Text fz={11} c="dark.1" mt={2}>{A.windows.length} ATO WINDOW(S) GRANTED</Text>}
      </Section>
    </ShopFrame>
  )
}

export default function StaffConsole() {
  useUI((st) => st.tick)
  const ui = useUI()
  if (ui.console === 's2') return <S2Console />
  if (ui.console === 's3') return <S3Console />
  if (ui.console === 's4') return <S4Console />
  return null
}
