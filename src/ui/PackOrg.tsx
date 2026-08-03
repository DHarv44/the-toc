// ORG — the templates a formation expands into, and the hand-built elements
// they name. This is the tab that makes a new army possible: everything else
// describes platforms, and this describes the SHAPE the platforms are poured
// into. Until now the only way to author it was to write JSON by hand, which
// is the single biggest reason a pack was a programming task.
//
// Two coupled tables, which is why they share a tab:
//
//   bnKinds  a template: the companies (or bare slots) a formation of this
//            kind holds. `companies` puts a rung between the formation and
//            its elements; OMITTING it means the elements hang directly off
//            the formation — a Mobile Infantry company's platoons are its
//            own, and inventing a grouping to hold them would put a rung in
//            the lineage the army does not have.
//   rosters  who stands in a hand-built element, by billet and rank. A slot
//            names one instead of a unit type when its people are listed
//            rather than generated — a command group, a staff section.
//
// Neither is a catalog table, so neither has the library `subset` form: they
// are either this pack's own or inherited whole.
import { Badge, Box, Button, Group, NumberInput, Select, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Pack } from '../packs/types'
import type { ManifestEditor } from './usePackManifest'
import { SaveBar } from './packEdit'

const MONO = 'Consolas, monospace'
const CARD = { border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }

interface SlotPlan { name: string; role?: string; type?: string; roster?: string; flight?: unknown }
interface CoPlan { co: string; slots?: SlotPlan[]; plts?: { type: string; n?: number } }
interface KindPlan { branch?: string; companies?: CoPlan[]; slots?: SlotPlan[]; plts?: { type: string; n?: number } }
interface Billet { kind: string; pos: string; rank: string; sec?: string; n?: number }

/** One job: a title, and either a fixed rank or a spread drawn by hash (the
 *  same billet is not the same rank in every platoon). */
interface Plan { pos: string; rank: string | string[] }
interface TroopBillets extends Plan { fromEnd?: Plan[]; fromStart?: Plan[] }
interface BilletTables {
  default: Plan
  dismount: Record<string, TroopBillets>
  crew: { armed: Record<string, Plan[]>; unarmed: Record<string, Plan[]> }
}

const rankText = (r: string | string[] | undefined): string =>
  Array.isArray(r) ? r.join(', ') : (r ?? '')
/** one rank stays a string, several become the spread — the shape IS the
 *  meaning here, so the field cannot just always write an array */
const rankValue = (s: string): string | string[] => {
  const parts = s.split(',').map(x => x.trim()).filter(Boolean)
  return parts.length > 1 ? parts : (parts[0] ?? '')
}

const ROLES = [
  { value: '', label: 'LINE (no role)' },
  { value: 'command', label: 'COMMAND — the commander stands here' },
  { value: 'staff', label: 'STAFF — a section of the headquarters' },
]

export default function PackOrg({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [section, setSection] = useState<'templates' | 'rosters' | 'billets'>('templates')
  const [newKind, setNewKind] = useState('')
  const [newRoster, setNewRoster] = useState('')
  if (!ed.manifest) return <Text fz="sm" c="dark.3" p="md">{ed.msg ?? 'READING pack.json…'}</Text>

  const kinds = (ed.value('bnKinds') as Record<string, KindPlan>) ?? {}
  const rosters = (ed.value('rosters') as Record<string, Billet[]>) ?? {}
  const ownsKinds = ed.owns('bnKinds')
  const ownsRosters = ed.owns('rosters')

  const unitOpts = Object.keys(p.catalogs?.units ?? {})
  const troopOpts = Object.keys(p.catalogs?.troops ?? {})
  const rankOpts = (p.ranks ?? []).map(r => r.key)
  const rosterKeys = Object.keys(rosters)

  const setKinds = (v: Record<string, KindPlan>) => ed.set('bnKinds', v)
  const setRosters = (v: Record<string, Billet[]>) => ed.set('rosters', v)

  const billets = ed.value('billets') as BilletTables | undefined
  const ownsBillets = ed.owns('billets')
  const setBillets = (v: BilletTables) => ed.set('billets', v)

  /** a title + its rank (or rank spread) — the row every billet table is made of */
  const PlanRow = ({ plan, onChange, onDrop, label }: {
    plan: Plan; onChange: (n: Partial<Plan>) => void; onDrop?: () => void; label?: string
  }) => (
    <Group gap={6} mt={4} wrap="nowrap" align="flex-end">
      {label && <Text fz={9} c="dark.3" w={70} style={{ flex: '0 0 auto' }}>{label}</Text>}
      <TextInput size="xs" style={{ flex: 1 }} value={plan.pos ?? ''} placeholder="Rifleman"
        onChange={e => onChange({ pos: e.currentTarget.value })} />
      <TextInput size="xs" w={200} value={rankText(plan.rank)} placeholder="PVT, PFC, SPC"
        styles={{ input: { fontFamily: MONO } }}
        onChange={e => onChange({ rank: rankValue(e.currentTarget.value) })} />
      {onDrop && <Button size="compact-xs" variant="subtle" color="red" onClick={onDrop}>✕</Button>}
    </Group>
  )

  // --- an inherited table: offer to take ownership -------------------------
  const Inherited = ({ what, n, onTake }: { what: string; n: number; onTake: () => void }) => (
    <Box mb={14}>
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
        <Text fz={11} c="#9ab8d0">from {p.inherits ?? 'the canonical pack'}</Text>
      </Group>
      <Text fz={10} c="dark.3" mb={10} maw={560}>
        This pack authors no {what} of its own, so its formations are built to somebody
        else's — {n} of them. Taking ownership copies them in; after that they are yours.
      </Text>
      <Button size="xs" variant="default" onClick={onTake}>AUTHOR OWN {what.toUpperCase()} ({n})</Button>
    </Box>
  )

  // --- one slot row --------------------------------------------------------
  const SlotRow = ({ s, onChange, onDrop }: {
    s: SlotPlan; onChange: (n: Partial<SlotPlan>) => void; onDrop: () => void
  }) => (
    <Group gap={6} mb={4} wrap="nowrap" align="flex-end">
      <TextInput size="xs" w={120} value={s.name} placeholder="1st PLT"
        styles={{ input: { fontFamily: MONO } }}
        onChange={e => onChange({ name: e.currentTarget.value })} />
      <Select size="xs" w={150} data={ROLES} value={s.role ?? ''}
        onChange={v => onChange({ role: v || undefined })} />
      {/* a slot is EITHER a fieldable unit type or a hand-built roster */}
      <Select size="xs" w={150} clearable placeholder="UNIT TYPE" data={unitOpts}
        value={s.type ?? null} styles={{ input: { fontFamily: MONO } }}
        onChange={v => onChange({ type: v ?? undefined, roster: v ? undefined : s.roster })} />
      <Select size="xs" w={150} clearable placeholder="ROSTER" data={rosterKeys}
        value={s.roster ?? null} styles={{ input: { fontFamily: MONO } }}
        onChange={v => onChange({ roster: v ?? undefined, type: v ? undefined : s.type })} />
      <Button size="compact-xs" variant="subtle" color="red" onClick={onDrop}>✕</Button>
    </Group>
  )

  const slotsEditor = (list: SlotPlan[], write: (next: SlotPlan[]) => void) => (
    <>
      {list.map((s, i) => (
        <SlotRow key={i} s={s}
          onChange={n => write(list.map((x, j) => (j === i ? { ...x, ...n } : x)))}
          onDrop={() => write(list.filter((_, j) => j !== i))} />
      ))}
      <Button size="compact-xs" variant="default" mt={2}
        onClick={() => write([...list, { name: 'NEW SLOT' }])}>＋ SLOT</Button>
    </>
  )

  return (
    <Box maw={900}>
      <Group gap={4} mb={14}>
        {(['templates', 'rosters', 'billets'] as const).map(s => (
          <Button key={s} size="compact-xs" variant={section === s ? 'filled' : 'default'}
            onClick={() => setSection(s)}>
            {s === 'templates' ? `TEMPLATES (${Object.keys(kinds).length})`
              : s === 'rosters' ? `ROSTERS (${rosterKeys.length})`
                : `BILLETS (${Object.keys(billets?.dismount ?? {}).length})`}
          </Button>
        ))}
      </Group>

      {/* ---------------------------------------------------------------- */}
      {section === 'templates' && (
        <>
          {!ownsKinds && (
            <Inherited what="templates" n={Object.keys(p.bnKinds ?? {}).length}
              onTake={() => setKinds({ ...(p.bnKinds ?? {}) } as Record<string, KindPlan>)} />
          )}
          {ownsKinds && Object.entries(kinds).map(([k, plan]) => {
            const hasCos = Array.isArray(plan.companies)
            return (
              <Box key={k} mb={10} p={10} style={CARD}>
                <Group gap={10} wrap="nowrap" align="center">
                  <Text fz={12} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
                  <TextInput size="xs" w={110} placeholder="branch" value={plan.branch ?? ''}
                    onChange={e => setKinds({ ...kinds, [k]: { ...plan, branch: e.currentTarget.value || undefined } })} />
                  <Badge size="xs" variant="outline" color={hasCos ? 'blue' : 'green'}>
                    {hasCos ? 'HAS A COMPANY RUNG' : 'ELEMENTS HANG DIRECTLY OFF IT'}
                  </Badge>
                  <Button size="compact-xs" variant="subtle" ml="auto"
                    onClick={() => setKinds({
                      ...kinds,
                      [k]: hasCos
                        ? { branch: plan.branch, slots: (plan.companies ?? []).flatMap(c => c.slots ?? []) }
                        : { branch: plan.branch, companies: [{ co: 'HHC', slots: plan.slots ?? [] }] },
                    })}>
                    {hasCos ? 'REMOVE THE RUNG' : 'ADD A COMPANY RUNG'}
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="red"
                    onClick={() => { const { [k]: _g, ...rest } = kinds; setKinds(rest) }}>REMOVE</Button>
                </Group>

                {hasCos ? (
                  <Box mt={8}>
                    {(plan.companies ?? []).map((c, ci) => (
                      <Box key={ci} mt={6} pl={10} style={{ borderLeft: '2px solid #2a3a48' }}>
                        <Group gap={6} mb={4}>
                          <TextInput size="xs" w={120} value={c.co}
                            styles={{ input: { fontFamily: MONO } }}
                            onChange={e => setKinds({
                              ...kinds,
                              [k]: { ...plan, companies: plan.companies!.map((x, j) => j === ci ? { ...x, co: e.currentTarget.value } : x) },
                            })} />
                          <Button size="compact-xs" variant="subtle" color="red"
                            onClick={() => setKinds({ ...kinds, [k]: { ...plan, companies: plan.companies!.filter((_, j) => j !== ci) } })}>
                            ✕ COMPANY
                          </Button>
                        </Group>
                        {slotsEditor(c.slots ?? [], next => setKinds({
                          ...kinds,
                          [k]: { ...plan, companies: plan.companies!.map((x, j) => j === ci ? { ...x, slots: next } : x) },
                        }))}
                      </Box>
                    ))}
                    <Button size="compact-xs" variant="default" mt={6}
                      onClick={() => setKinds({ ...kinds, [k]: { ...plan, companies: [...(plan.companies ?? []), { co: 'NEW CO', slots: [] }] } })}>
                      ＋ COMPANY
                    </Button>
                  </Box>
                ) : (
                  <Box mt={8}>
                    {slotsEditor(plan.slots ?? [], next => setKinds({ ...kinds, [k]: { ...plan, slots: next } }))}
                  </Box>
                )}
              </Box>
            )
          })}
          {ownsKinds && (
            <Group gap={8} mt={12}>
              <TextInput size="xs" w={220} placeholder="NEW-KIND-KEY" value={newKind}
                styles={{ input: { fontFamily: MONO } }}
                onChange={e => setNewKind(e.currentTarget.value.toUpperCase())} />
              <Button size="compact-xs" variant="default" disabled={!newKind.trim() || !!kinds[newKind.trim()]}
                onClick={() => { setKinds({ ...kinds, [newKind.trim()]: { slots: [] } }); setNewKind('') }}>
                ＋ TEMPLATE
              </Button>
              <Text fz={9} c="dark.3">A formation names one of these as its `kind`.</Text>
            </Group>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'rosters' && (
        <>
          {!ownsRosters && (
            <Inherited what="rosters" n={Object.keys(p.rosters ?? {}).length}
              onTake={() => setRosters({ ...(p.rosters ?? {}) } as Record<string, Billet[]>)} />
          )}
          {ownsRosters && Object.entries(rosters).map(([k, list]) => (
            <Box key={k} mb={10} p={10} style={CARD}>
              <Group gap={10} wrap="nowrap" align="center">
                <Text fz={12} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
                <Text fz={10} c="dark.3" style={{ flex: 1 }}>
                  {list.reduce((n, b) => n + (b.n ?? 1), 0)} PEOPLE
                </Text>
                <Button size="compact-xs" variant="subtle" color="red"
                  onClick={() => { const { [k]: _g, ...rest } = rosters; setRosters(rest) }}>REMOVE</Button>
              </Group>
              {/* leaders are listed LAST — casualty order, which is what makes
                  seniorOf work without any billet vocabulary in the engine */}
              {list.map((b, i) => {
                const write = (n: Partial<Billet>) =>
                  setRosters({ ...rosters, [k]: list.map((x, j) => (j === i ? { ...x, ...n } : x)) })
                return (
                  <Group key={i} gap={6} mt={4} wrap="nowrap" align="flex-end">
                    <Select size="xs" w={140} data={troopOpts} value={b.kind ?? null} searchable
                      placeholder="TROOP KIND" styles={{ input: { fontFamily: MONO } }}
                      onChange={v => v && write({ kind: v })} />
                    <TextInput size="xs" style={{ flex: 1 }} value={b.pos} placeholder="S1 — Personnel"
                      onChange={e => write({ pos: e.currentTarget.value })} />
                    <Select size="xs" w={90} data={rankOpts} value={b.rank ?? null} searchable
                      placeholder="RANK" styles={{ input: { fontFamily: MONO } }}
                      onChange={v => v && write({ rank: v })} />
                    <TextInput size="xs" w={110} value={b.sec ?? ''} placeholder="sub-element"
                      onChange={e => write({ sec: e.currentTarget.value || undefined })} />
                    <NumberInput size="xs" w={64} min={1} value={b.n ?? 1}
                      onChange={v => write({ n: Number(v) > 1 ? Number(v) : undefined })} />
                    <Button size="compact-xs" variant="subtle" color="red"
                      onClick={() => setRosters({ ...rosters, [k]: list.filter((_, j) => j !== i) })}>✕</Button>
                  </Group>
                )
              })}
              <Button size="compact-xs" variant="default" mt={6}
                onClick={() => setRosters({ ...rosters, [k]: [...list, { kind: troopOpts[0] ?? '', pos: 'NEW BILLET', rank: rankOpts[0] ?? '' }] })}>
                ＋ BILLET
              </Button>
            </Box>
          ))}
          {ownsRosters && (
            <Group gap={8} mt={12}>
              <TextInput size="xs" w={220} placeholder="NEW_ROSTER_KEY" value={newRoster}
                styles={{ input: { fontFamily: MONO } }}
                onChange={e => setNewRoster(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
              <Button size="compact-xs" variant="default" disabled={!newRoster.trim() || !!rosters[newRoster.trim()]}
                onClick={() => { setRosters({ ...rosters, [newRoster.trim()]: [] }); setNewRoster('') }}>
                ＋ ROSTER
              </Button>
              <Text fz={9} c="dark.3">Leaders go LAST — a roster is written in casualty order.</Text>
            </Group>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'billets' && (
        <>
          {!ownsBillets && (
            <Inherited what="billets" n={Object.keys(p.billets?.dismount ?? {}).length}
              onTake={() => setBillets(JSON.parse(JSON.stringify(p.billets)) as BilletTables)} />
          )}
          {ownsBillets && billets && (() => {
            const write = (n: Partial<BilletTables>) => setBillets({ ...billets, ...n })
            const dis = billets.dismount ?? {}
            const setKind = (k: string, n: Partial<TroopBillets>) =>
              write({ dismount: { ...dis, [k]: { ...dis[k]!, ...n } } })
            const seats = (armed: 'armed' | 'unarmed') => billets.crew?.[armed] ?? {}
            const setSeats = (armed: 'armed' | 'unarmed', size: string, list: Plan[]) =>
              write({ crew: { ...billets.crew, [armed]: { ...seats(armed), [size]: list } } })
            return (
              <>
                <Text fz={10} c="dark.3" mb={12} maw={620}>
                  What each job is CALLED and who holds it. The engine keeps only the shape —
                  that a group's LAST entries are its leadership, because rosters run in
                  casualty order, and that seat 0 of an armed vehicle commands it. Every title
                  and rank here is the army's own. Several ranks, comma separated, are a spread
                  drawn by hash: the same billet is not the same rank in every platoon.
                </Text>

                <Text fz={11} fw={700} c="#9ab8d0" mb={2} style={{ letterSpacing: 1.5 }}>DEFAULT</Text>
                <Text fz={9} c="dark.3" mb={4}>Anyone a table below does not name.</Text>
                <Box mb={16} p={8} style={CARD}>
                  <PlanRow plan={billets.default ?? { pos: '', rank: '' }}
                    onChange={n => write({ default: { ...billets.default, ...n } })} />
                </Box>

                <Text fz={11} fw={700} c="#9ab8d0" mb={2} style={{ letterSpacing: 1.5 }}>
                  DISMOUNT — BY TROOP KIND
                </Text>
                <Text fz={9} c="dark.3" mb={6}>
                  FROM END names the billets at the back of a kind's group — that is where a
                  platoon's command sits, because the last one standing is the leader.
                </Text>
                {Object.entries(dis).map(([k, t]) => (
                  <Box key={k} mb={8} p={10} style={CARD}>
                    <Group gap={10} align="center">
                      <Text fz={12} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
                      <Text fz={9} c="dark.3" style={{ flex: 1 }}>
                        {p.catalogs?.troops?.[k]?.name ?? 'NO TROOP KIND OF THIS KEY'}
                      </Text>
                      <Button size="compact-xs" variant="subtle" color="red"
                        onClick={() => { const { [k]: _g, ...rest } = dis; write({ dismount: rest }) }}>
                        REMOVE
                      </Button>
                    </Group>
                    <PlanRow label="BASE" plan={t} onChange={n => setKind(k, n)} />
                    {(t.fromEnd ?? []).map((b, i) => (
                      <PlanRow key={`e${i}`} label={i === 0 ? 'FROM END' : ''} plan={b}
                        onChange={n => setKind(k, { fromEnd: t.fromEnd!.map((x, j) => j === i ? { ...x, ...n } : x) })}
                        onDrop={() => setKind(k, { fromEnd: t.fromEnd!.filter((_, j) => j !== i) })} />
                    ))}
                    {(t.fromStart ?? []).map((b, i) => (
                      <PlanRow key={`s${i}`} label={i === 0 ? 'FROM START' : ''} plan={b}
                        onChange={n => setKind(k, { fromStart: t.fromStart!.map((x, j) => j === i ? { ...x, ...n } : x) })}
                        onDrop={() => setKind(k, { fromStart: t.fromStart!.filter((_, j) => j !== i) })} />
                    ))}
                    <Group gap={6} mt={6}>
                      <Button size="compact-xs" variant="default"
                        onClick={() => setKind(k, { fromEnd: [...(t.fromEnd ?? []), { pos: 'Leader', rank: '' }] })}>
                        ＋ FROM END
                      </Button>
                      <Button size="compact-xs" variant="default"
                        onClick={() => setKind(k, { fromStart: [...(t.fromStart ?? []), { pos: 'Gunner', rank: '' }] })}>
                        ＋ FROM START
                      </Button>
                    </Group>
                  </Box>
                ))}
                <Select size="xs" w={260} mb={18} value={null} placeholder="＋ TROOP KIND WITH NO BILLETS"
                  data={troopOpts.filter(t => !dis[t])}
                  onChange={v => v && write({ dismount: { ...dis, [v]: { pos: 'Trooper', rank: '' } } })} />

                <Text fz={11} fw={700} c="#9ab8d0" mb={2} style={{ letterSpacing: 1.5 }}>
                  CREW — BY SEAT
                </Text>
                <Text fz={9} c="dark.3" mb={6}>
                  Keyed by CREW SIZE ('*' = any size not named); the last seat repeats for any
                  further hands. An army that crews nothing leaves these empty.
                </Text>
                {(['armed', 'unarmed'] as const).map(a => (
                  <Box key={a} mb={10}>
                    <Text fz={10} c="#9ab8d0" mb={4}>{a.toUpperCase()}</Text>
                    {Object.keys(seats(a)).length === 0 && (
                      <Text fz={9} c="dark.3" mb={4}>none — nothing of this pack's is crewed</Text>
                    )}
                    {Object.entries(seats(a)).map(([size, list]) => (
                      <Box key={size} mb={6} p={8} style={CARD}>
                        <Group gap={10}>
                          <Text fz={11} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>
                            {size === '*' ? 'ANY SIZE' : `${size}-HAND`}
                          </Text>
                          <Button size="compact-xs" variant="subtle" color="red" ml="auto"
                            onClick={() => { const { [size]: _g, ...rest } = seats(a); write({ crew: { ...billets.crew, [a]: rest } }) }}>
                            REMOVE
                          </Button>
                        </Group>
                        {list.map((b, i) => (
                          <PlanRow key={i} label={`SEAT ${i}`} plan={b}
                            onChange={n => setSeats(a, size, list.map((x, j) => j === i ? { ...x, ...n } : x))}
                            onDrop={() => setSeats(a, size, list.filter((_, j) => j !== i))} />
                        ))}
                        <Button size="compact-xs" variant="default" mt={6}
                          onClick={() => setSeats(a, size, [...list, { pos: 'Crewman', rank: '' }])}>＋ SEAT</Button>
                      </Box>
                    ))}
                  </Box>
                ))}
              </>
            )
          })()}
        </>
      )}

      <SaveBar ed={ed} />
    </Box>
  )
}
