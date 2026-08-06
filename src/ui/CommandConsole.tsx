// COMMAND — the commander's own console, in the same chrome as the staff's.
//
// This was three things: a rail of drill-down trees for the bases, a separate
// full-screen DASHBOARD behind a ▤ in the top bar, and a CALL UP flyout that
// later became a GARRISON rail. Three destinations, all about the same
// formation, none of them looking like the S-shop pages they sit beside.
//
// It is one page now, with the S-pages' own tab strip:
//
//   OVERVIEW       the commander, the command group, and the one-glance tiles
//   INSTALLATIONS  every base at once — the LEDGER the bottom bar is the watch for
//   GARRISON       everything still in barracks, anywhere
//   ACTIONS        what the commander asks DIVISION for
//
// WHY GARRISON ENDED UP HERE. Calling a platoon up under contact is a fast act,
// and burying it a tab deep would have made the frequent case worse — except
// that it is not the fast path any more. The bottom bar fields from one base in
// one click, and a team's station attaches straight out of garrison. What is
// left is the DELIBERATE act: building the force before committing it, which is
// exactly what belongs on a console page.
import { Box, Group, Text } from '@mantine/core'
import { S } from '../engine/state'
import { commandsStructure } from '../domains/forces/command'
import { STRUCTURES, FACILITIES, type StructureTypeKey } from '../domains/installations/catalog'
import { playerPack } from '../packs'
import { commanderOf, commandSlot } from '../packs/orgquery'
import { rankW } from '../packs/ranks'
import { deployContext, garrisonSlots } from './palette'
import { runItem } from './install/actions'
import ConsolePanel from './console/ConsolePanel'
import { Section, StaffTable, StaffTabs, Th, Td } from './staff'
import { CommandOverview } from './CommandDashboard'
import GarrisonTree from './install/GarrisonTree'
import { Portrait } from './portrait'
import { BnDui } from './insignia'
import { useUI } from './store'
import { TUT } from './tutTargets'
import { fmtClock } from './styles'
import { centerView } from '../map/view'

const BASE_ORDER: readonly StructureTypeKey[] = ['HQ', 'FOB', 'AFLD', 'OP']

export default function CommandConsole() {
  useUI(s => s.tick)
  const ui = useUI()
  if (ui.console !== 'cmd') return null
  const pack = playerPack()
  const bn = pack.formation?.chair

  return (
    <ConsolePanel title={`COMMAND — ${(bn ?? pack.abbr ?? '').toUpperCase()}`}>
      <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
        {bn && <BnDui bn={bn} h={54} />}
        <Box>
          <Text fz={26} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>COMMAND</Text>
          <Text fz="xs" c="dark.3" style={{ letterSpacing: 1.5 }}>
            {bn ?? pack.abbr} · {pack.name.toUpperCase()} · MISSION {fmtClock(S.t)}
          </Text>
        </Box>
      </Group>

      {/* THE TAB IT WAS LEFT ON IS THE TAB IT OPENS ON. Folding garrison into a
          console only works if reaching it stays one click; a page that always
          resets to OVERVIEW would have made the deliberate act two. */}
      {/* the tutorial's old CALL UP anchor: that button opened a picker, and
          the picker is this tab */}
      <div data-tut={TUT.callUp}>
        <StaffTabs active={ui.cmdTab} onTab={k => ui.setCmdTab(k as typeof ui.cmdTab)}
          tabs={[
            { key: 'overview', label: 'OVERVIEW' },
            { key: 'installations', label: 'INSTALLATIONS' },
            { key: 'garrison', label: 'GARRISON' },
            { key: 'actions', label: 'ACTIONS' },
          ]} />
      </div>

      {ui.cmdTab === 'overview' && <><CommandGroup /><CommandOverview /></>}
      {ui.cmdTab === 'installations' && <Installations />}
      {ui.cmdTab === 'garrison' && (
        <Section title="IN GARRISON — CLICK AN ELEMENT TO FIELD IT">
          <GarrisonTree />
        </Section>
      )}
      {ui.cmdTab === 'actions' && <Actions />}
    </ConsolePanel>
  )
}

/** WHO IS COMMANDING, AND WHO IS STANDING BESIDE THEM. The S-pages open with
 *  the desk's people; the commander's page opens with the command group, and
 *  for the same reason: a headquarters is people before it is data. */
function CommandGroup() {
  const pack = playerPack()
  const bn = pack.formation?.chair
  const slot = commandSlot(S.org, bn ?? '')
  const cdr = commanderOf(S.org, bn ?? '')
  // the rest of the command group, senior first — the XO and the sergeant major
  // are the two the commander actually fights the battalion with
  const rest = (slot?.soldiers ?? [])
    .filter(s => s.id !== cdr?.id && !s.replaced)
    .sort((a, b) => rankW(b.rank) - rankW(a.rank))
    .slice(0, 3)
  if (!cdr) return null
  return (
    <Section title="COMMAND GROUP">
      <Group gap="lg" mt={6} align="flex-start" wrap="wrap">
        {[cdr, ...rest].map(s => (
          <Group key={s.id} gap={10} wrap="nowrap"
            style={{ border: '1px solid #22303d', borderRadius: 4, padding: 8, minWidth: 230 }}>
            <Portrait seed={String(s.id)} kia={s.status === 'KIA'} w={38} h={46} />
            <Box>
              <Text fz="sm" fw={700} c="#dceeff">{s.rank} {s.name}</Text>
              <Text fz={11} c="dark.3">{s.pos ?? (s.id === cdr.id ? 'COMMANDING' : '')}</Text>
              <Text fz={11} c={s.status === 'FIT' ? 'dark.3' : '#e0b34e'}>{s.status}</Text>
            </Box>
          </Group>
        ))}
      </Group>
    </Section>
  )
}

/** EVERY BASE AT ONCE — the ledger. The bottom bar operates ONE installation
 *  now, which is the right shape for a decision made under contact and the
 *  wrong shape for comparing four of them. A table is the right shape for
 *  comparing, so this is a table and not the tree it replaced. */
function Installations() {
  const ui = useUI()
  const sites = S.structures
    .filter(s => s.side === 'friend' && commandsStructure(s))
    .sort((a, b) => BASE_ORDER.indexOf(a.kind) - BASE_ORDER.indexOf(b.kind))
  const hqId = sites.find(s => s.kind === 'HQ')?.id
  const slots = garrisonSlots(true)
  const homedHere = (sl: { garrisonAt?: number | null }, id: number) =>
    (S.structures.some(s => s.id === sl.garrisonAt && s.side === 'friend')
      ? sl.garrisonAt : hqId) === id

  return (
    <Section title={`INSTALLATIONS — ${sites.length}`}>
      <StaffTable minWidth={640} head={
        <><Th>INSTALLATION</Th><Th w={64}>TYPE</Th><Th w={70} ta="right">GARRISON</Th>
          <Th w={54} ta="right">QRF</Th><Th w={72} ta="right">STOCK</Th><Th>FACILITIES</Th></>
      }>
        {sites.map(st => {
          const here = slots.filter(sl => homedHere(sl, st.id))
          const qrf = here.filter(sl => sl.qrf).length
          const facs = (st.facilities ?? []).map(k => FACILITIES[k]?.name ?? k)
          return (
            <tr key={st.id} style={{ cursor: 'pointer' }}
              onClick={() => { ui.select(st.id); centerView(st) }}>
              <Td c="#7ec8ff">{st.label}</Td>
              <Td>{STRUCTURES[st.kind].name.toUpperCase()}</Td>
              <Td ta="right" c={here.length ? 'dark.1' : 'dark.3'}>{here.length}</Td>
              {/* NO QRF IS THE FACT WORTH SEEING, on the board as on the bar */}
              <Td ta="right" c={qrf ? '#7ec87e' : '#e0b34e'}>{qrf || 'NONE'}</Td>
              <Td ta="right">{st.kind === 'FOB' ? Math.floor(st.stock || 0).toLocaleString() : '—'}</Td>
              <Td c={facs.length ? 'dark.1' : 'dark.3'}>
                {st.buildT > 0 ? `UNDER CONSTRUCTION — ${Math.ceil(st.buildT)}s`
                  : facs.length ? facs.join(' · ') : 'NONE INSTALLED'}
              </Td>
            </tr>
          )
        })}
      </StaffTable>
      <Text fz={11} c="dark.3" mt={8}>
        A row goes to that base on the map. Fielding, QRF and facilities are worked from
        the INSTALLATIONS bar under the map, one base at a time.
      </Text>
    </Section>
  )
}

/** WHAT THE COMMANDER ASKS DIVISION FOR. These rows only exist at the command
 *  post — an asset request goes up the chain from the headquarters, not from a
 *  patrol base — so the page finds the HQ itself rather than asking the
 *  commander to select it first. */
function Actions() {
  const hq = S.structures.find(s => s.kind === 'HQ' && commandsStructure(s))
  const ctx = hq ? deployContext([hq.id]) : null
  const sections = (ctx?.sections ?? []).filter(s => s.header !== 'QRF' && s.header !== 'FACILITIES')
  if (!hq || !sections.length) {
    return <Section title="ACTIONS"><Text fz="sm" c="dark.3" p="md">NOTHING TO REQUEST.</Text></Section>
  }
  return (
    <>
      {sections.map(sec => (
        <Section key={sec.header} title={sec.header}>
          <Group gap={8} mt={6} wrap="wrap">
            {sec.items.map(it => (
              <Box key={it.mode} component="button" disabled={it.disabled}
                onClick={() => runItem(it, ctx?.sourceId)} title={it.tag ?? undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  border: '1px solid #22303d', borderRadius: 3, background: '#0d141c',
                  padding: '6px 10px', minWidth: 250, cursor: it.disabled ? 'default' : 'pointer',
                  opacity: it.disabled ? 0.5 : 1,
                }}>
                {it.icon}
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text fz="sm" c="#c8d8e8">{it.label}</Text>
                  {it.tag && <Text fz={11} c="dark.3" lineClamp={1}>{it.tag}</Text>}
                </Box>
                {it.note && <Text fz={11} c="dark.2">{it.note}</Text>}
              </Box>
            ))}
          </Group>
        </Section>
      ))}
    </>
  )
}
