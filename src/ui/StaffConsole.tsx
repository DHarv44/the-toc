// S2 / S3 / S4 staff consoles — one file, three shops, all reading live state
// the way their real desk would. Every one is built from the shared staff kit
// (./staff): StaffView gives the frame, header and tabs; RequestReport and
// ReportList give the shop its product through the reports pipeline. Nothing
// about the chrome is written twice.
import { useState } from 'react'
import { Group, Table, Text, UnstyledButton } from '@mantine/core'
import { S } from '../engine/state'
import { useUI } from './store'
import { operation, recallFrago, unreadReports } from '../engine/campaign'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { VEHICLES } from '../domains/forces/composition'
import { orbitAuthority, windowOpen } from '../domains/assets/service'
import { repairSiteOf } from '../domains/installations/service'
import { locRef } from '../world/ref'
import { fmtClock } from './styles'
import {
  Metric, ReportList, RequestReport, Section, StaffTable, StaffView, Td, Th, type StaffTab,
} from './staff'

const OK_C = '#7ec87e'
const WARN_C = '#e8c547'
const BAD_C = '#e8524a'

function S2Console() {
  const contacts = [...S.contacts.entries()]
  const live = contacts.filter(([, c]) => c.live && !c.unknown)
  const stale = contacts.filter(([, c]) => !c.live && !c.unknown)
  const unknown = contacts.filter(([, c]) => c.unknown)
  const drones = S.drones.filter(d => !d.tether)
  const aero = S.drones.some(d => d.tether != null)
  return (
    <StaffView shop="s2">
      <Group justify="flex-end" mt={8}><RequestReport shop="s2" /></Group>
      <Section title={`CURRENT TRACKS — ${live.length} LIVE · ${stale.length} STALE · ${unknown.length} UNIDENTIFIED`}>
        <StaffTable head={<><Th>TYPE</Th><Th>STATE</Th><Th>LOCATION</Th><Th ta="right">STRENGTH</Th></>}>
          {contacts.slice(0, 40).map(([id, c]) => (
            <Table.Tr key={id}>
              <Td c={c.unknown ? WARN_C : '#ff8a7e'}>{c.unknown ? '?' : (UNIT_TYPES[c.type]?.abbr ?? c.type)}</Td>
              <Td c={c.live ? '#ff8a7e' : 'dark.3'}>{c.live ? 'LIVE' : `STALE ${Math.round((S.t - c.lastSeen) / 60)}M`}</Td>
              <Td>{S.map ? locRef(S.map, c.x, c.y) : '—'}</Td>
              <Td ta="right">{c.unknown ? 'NOT ASSESSED' : `${Math.round(c.strength)}%`}</Td>
            </Table.Tr>
          ))}
        </StaffTable>
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
      <Section title="INTSUMS ON FILE"><ReportList shop="s2" /></Section>
    </StaffView>
  )
}

function S3Console() {
  const c = S.campaign
  const friendly = S.units.filter(u => u.side === 'friend' && !u.respFrom)
  const dustwun = S.downed.filter(d => d.side === 'friend' && !d.resolved)
  return (
    <StaffView shop="s3">
      <Group justify="flex-end" mt={8}><RequestReport shop="s3" /></Group>
      {c && (
        <Section title={`OPERATION ${operation().name}`}>
          {operation().objectives.map((o, i) => (
            <Group key={o.id} gap={8} mt={4}>
              <Text span fz={11} fw={700}
                c={c.status[i] === 'done' ? OK_C : c.status[i] === 'active' ? WARN_C : 'dark.3'}>
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
        <StaffTable head={
          <><Th>ELEMENT</Th><Th>TYPE</Th><Th>STATE</Th><Th>ROE</Th><Th>WPNS</Th><Th ta="right">STR</Th></>
        }>
          {friendly.map(u => (
            <Table.Tr key={u.id}>
              <Td c="#7ec8ff">{u.label}{u.qrfHome != null ? ' ⚡' : ''}</Td>
              <Td>{UNIT_TYPES[u.type]?.abbr ?? u.type}</Td>
              <Td c={S.t - u.lastCombatT < 60 ? '#ff8a7e' : 'dark.1'}>{S.t - u.lastCombatT < 60 ? 'IN CONTACT' : u.state.toUpperCase()}</Td>
              <Td>{u.roe.toUpperCase()}</Td>
              <Td>{u.weapons.toUpperCase()}</Td>
              <Td ta="right" c={u.strength < 60 ? WARN_C : 'dark.1'}>{Math.round(u.strength)}%</Td>
            </Table.Tr>
          ))}
        </StaffTable>
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
      <Section title="OPSUMS ON FILE"><ReportList shop="s3" /></Section>
    </StaffView>
  )
}

// ---------------------------------------------------------------------------
// S4 — LOGISTICS
// ---------------------------------------------------------------------------
type S4Tab = 'motor' | 'clv' | 'supply' | 'assets' | 'reports'

// The maintenance state of one element's vehicles. The distinction that makes
// this a motorpool board rather than a damage list: a damaged vehicle sitting
// at a base with a motorpool is IN MAINTENANCE and has a clock on it; the same
// vehicle broken down forward is DEADLINED and nothing happens to it until
// somebody drags it back.
function MotorPool() {
  const friendly = S.units.filter(u => u.side === 'friend')

  // fleet rollup by END ITEM — the way a real motorpool board is read
  const fleet = new Map<string, { ok: number; dam: number; dest: number }>()
  for (const u of friendly) {
    for (const v of u.vehicles) {
      const row = fleet.get(v.type) ?? { ok: 0, dam: 0, dest: 0 }
      if (v.status === 'OK') row.ok++
      else if (v.status === 'DAMAGED') row.dam++
      else row.dest++
      fleet.set(v.type, row)
    }
  }
  let ok = 0, dam = 0, dest = 0
  for (const r of fleet.values()) { ok += r.ok; dam += r.dam; dest += r.dest }
  const auth = ok + dam + dest
  const orRate = auth ? Math.round(ok / auth * 100) : 100

  // the deadline report: every element with something not mission capable
  const down = friendly
    .filter(u => u.vehicles.some(v => v.status !== 'OK'))
    .map(u => {
      const d = u.vehicles.filter(v => v.status === 'DAMAGED').length
      const x = u.vehicles.filter(v => v.status === 'DESTROYED').length
      const at = d > 0 ? repairSiteOf(u) : null
      const eta = at ? Math.max(0, Math.ceil((at.spec.secsPerVic - (u.repT ?? 0)) / 60)) : null
      return { u, d, x, at, eta }
    })

  const inMaint = down.filter(r => r.at).reduce((n, r) => n + r.d, 0)
  const deadlined = dam - inMaint

  return (
    <>
      <Group gap="xl" mt="md" px={4}>
        <Metric label="OR RATE" value={`${orRate}%`} c={orRate >= 90 ? OK_C : orRate >= 75 ? WARN_C : BAD_C} />
        <Metric label="MISSION CAPABLE" value={ok} c={OK_C} />
        <Metric label="IN MAINTENANCE" value={inMaint} c={inMaint ? WARN_C : 'dark.3'} />
        <Metric label="DEADLINED FWD" value={deadlined} c={deadlined ? BAD_C : 'dark.3'} />
        <Metric label="COMBAT LOSS" value={dest} c={dest ? BAD_C : 'dark.3'} />
      </Group>

      <Section title="FLEET — BY END ITEM">
        <StaffTable head={
          <>
            <Th>END ITEM</Th><Th ta="right">AUTH</Th><Th ta="right">FMC</Th>
            <Th ta="right">MAINT</Th><Th ta="right">LOSS</Th><Th ta="right">OR</Th>
          </>
        }>
          {[...fleet.entries()].sort((a, b) => (b[1].ok + b[1].dam + b[1].dest) - (a[1].ok + a[1].dam + a[1].dest))
            .map(([k, r]) => {
              const tot = r.ok + r.dam + r.dest
              const rate = tot ? Math.round(r.ok / tot * 100) : 100
              return (
                <Table.Tr key={k}>
                  <Td c="#7ec8ff">{VEHICLES[k]?.name ?? k}</Td>
                  <Td ta="right">{tot}</Td>
                  <Td ta="right" c={OK_C}>{r.ok}</Td>
                  <Td ta="right" c={r.dam ? WARN_C : 'dark.3'}>{r.dam}</Td>
                  <Td ta="right" c={r.dest ? BAD_C : 'dark.3'}>{r.dest}</Td>
                  <Td ta="right" c={rate >= 90 ? OK_C : rate >= 75 ? WARN_C : BAD_C}>{rate}%</Td>
                </Table.Tr>
              )
            })}
          {fleet.size === 0 && (
            <Table.Tr><Td c="dark.3">NOTHING FIELDED — THE FLEET IS IN GARRISON.</Td></Table.Tr>
          )}
        </StaffTable>
      </Section>

      <Section title="DEADLINE REPORT">
        {down.length === 0 && <Text fz={11} c={OK_C} mt={6}>ALL FIELDED VEHICLES MISSION CAPABLE.</Text>}
        {down.length > 0 && (
          <StaffTable head={
            <>
              <Th>ELEMENT</Th><Th>TYPE</Th><Th ta="right">MAINT</Th><Th ta="right">LOSS</Th>
              <Th>STATUS</Th><Th>LOCATION</Th>
            </>
          }>
            {down.map(({ u, d, x, at, eta }) => (
              <Table.Tr key={u.id}>
                <Td c="#7ec8ff">{u.label}</Td>
                <Td>{UNIT_TYPES[u.type]?.abbr ?? u.type}</Td>
                <Td ta="right" c={d ? WARN_C : 'dark.3'}>{d || '—'}</Td>
                <Td ta="right" c={x ? BAD_C : 'dark.3'}>{x || '—'}</Td>
                <Td c={at ? WARN_C : d ? BAD_C : 'dark.3'}>
                  {at ? `IN MAINTENANCE · ${at.site.label} · ETA ${eta} MIN`
                    : d ? 'DEADLINED — NOT AT A MOTORPOOL'
                      : 'COMBAT LOSS — NOT REPAIRABLE'}
                </Td>
                <Td>{S.map ? locRef(S.map, u.x, u.y) : '—'}</Td>
              </Table.Tr>
            ))}
          </StaffTable>
        )}
        <Text fz={10} c="dark.3" mt={8}>
          A DAMAGED VEHICLE IS ONLY WORKED AT A BASE WITH A MOTORPOOL, OUT OF CONTACT.
          DESTROYED IS A COMBAT LOSS — IT DOES NOT COME BACK.
        </Text>
      </Section>
    </>
  )
}

function S4Console() {
  const [tab, setTab] = useState<S4Tab>('motor')
  const friendly = S.units.filter(u => u.side === 'friend')
  const fobs = S.structures.filter(s => s.side === 'friend' && s.kind === 'FOB')
  const convoys = friendly.filter(u => u.convoy).length
  const A = S.assets

  const stow: Record<string, number> = {}
  for (const u of friendly) {
    for (const [k, n] of Object.entries(u.stowage)) stow[k] = (stow[k] ?? 0) + (n ?? 0)
  }

  const tabs: StaffTab[] = [
    { key: 'motor', label: 'MOTOR POOL' },
    { key: 'clv', label: 'CLASS V' },
    { key: 'supply', label: 'SUPPLY' },
    { key: 'assets', label: 'ASSETS' },
    { key: 'reports', label: 'LOGSTATS', dot: unreadReports(S, 's4'), right: true },
  ]

  return (
    <StaffView shop="s4" tabs={tabs} active={tab} onTab={(k) => setTab(k as S4Tab)}>
      {tab === 'motor' && <MotorPool />}

      {tab === 'clv' && (
        <Section title="CLASS V — STOWAGE ON HAND (TF ROLLUP)">
          <StaffTable minWidth={320} maw={460} head={<><Th>NATURE</Th><Th ta="right">ON HAND</Th></>}>
            {Object.entries(stow).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <Table.Tr key={k}><Td c="#7ec8ff">{k}</Td><Td ta="right">{Math.floor(n)}</Td></Table.Tr>
            ))}
            {Object.keys(stow).length === 0 && (
              <Table.Tr><Td c="dark.3">NOTHING FIELDED — NO ROUNDS ON THE GROUND.</Td></Table.Tr>
            )}
          </StaffTable>
        </Section>
      )}

      {tab === 'supply' && (
        <Section title={`FORWARD STOCK — ${fobs.length} FOB(S) · ${convoys} CONVOY(S) RUNNING`}>
          {fobs.length === 0 && <Text fz={11} c="dark.3" mt={6}>NO FORWARD BASES — EVERYTHING RUNS OFF THE CP.</Text>}
          {fobs.map(f => (
            <Text key={f.id} fz={11} c="dark.1" mt={2}>{f.label} — STOCK {Math.floor(f.stock || 0)}</Text>
          ))}
        </Section>
      )}

      {tab === 'assets' && (
        <Section title={`DIVISION ASSETS${A.favor > 0 ? ` · FAVOR +${A.favor}` : ''}`}>
          <StaffTable minWidth={420} maw={720} head={<><Th>ASSET</Th><Th>STATE</Th><Th>HOLDER</Th></>}>
            {A.pool.map(a => (
              <Table.Tr key={a.id}>
                <Td c="#7ec8ff">{a.id}</Td>
                <Td c={a.state === 'available' ? OK_C : a.state === 'refit' ? BAD_C : WARN_C}>{a.state.toUpperCase()}</Td>
                <Td>{a.holder ?? '—'}</Td>
              </Table.Tr>
            ))}
          </StaffTable>
          {A.queue.length > 0 && <Text fz={11} c={WARN_C} mt={4}>{A.queue.length} REQUEST(S) ON THE DIVISION WAITING LIST</Text>}
          {A.windows.length > 0 && <Text fz={11} c="dark.1" mt={2}>{A.windows.length} ATO WINDOW(S) GRANTED</Text>}
        </Section>
      )}

      {tab === 'reports' && (
        <>
          <Group justify="flex-end" mt={12}><RequestReport shop="s4" /></Group>
          <ReportList shop="s4" />
        </>
      )}
    </StaffView>
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
