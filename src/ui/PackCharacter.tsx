// CHARACTER — the things that make an army sound and look like itself rather
// than like the one next door: its rank ladder, its decorations, and how it
// designates a fielded element on the net.
//
// RANKS is the load-bearing one. The ORDER is the seniority — the engine reads
// nothing else, no weights, no grades — which is exactly why the editor makes
// order first-class with move-up/move-down rather than leaving it to whatever
// sequence a JSON file happened to be typed in. `seniorOf` finds a platoon
// leader by ladder position alone, so getting this list in the wrong order is
// not a cosmetic mistake: it changes who commands.
import { Badge, Box, Button, Group, NumberInput, Switch, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Pack } from '../packs/types'
import type { ManifestEditor } from './usePackManifest'
import { SaveBar } from './packEdit'
import { RankIcon, RibbonIcon } from './insignia'

const MONO = 'Consolas, monospace'
const CARD = { border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }

interface Insignia {
  chevrons?: [number, number]; diamond?: boolean; spec?: boolean
  bars?: number; stars?: number; oak?: boolean; eagle?: boolean
}
interface Rank { key: string; name: string; insignia?: Insignia }
interface Award { key: string; name: string; abbr: string; ribbon: string[]; on?: string }
interface Callsigns { pool?: string[]; prefix?: string; pad?: number }

export default function PackCharacter({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [section, setSection] = useState<'ranks' | 'awards' | 'callsigns'>('ranks')
  const [newRank, setNewRank] = useState('')
  if (!ed.manifest) return <Text fz="sm" c="dark.3" p="md">{ed.msg ?? 'READING pack.json…'}</Text>

  const ranks = (ed.value('ranks') as Rank[] | undefined) ?? []
  const awards = (ed.value('awards') as Record<string, Award> | undefined) ?? {}
  const cs = (ed.value('callsigns') as Callsigns | undefined) ?? {}
  const ownsRanks = ed.owns('ranks')
  const ownsAwards = ed.owns('awards')

  const setRanks = (v: Rank[]) => ed.set('ranks', v)
  const setAwards = (v: Record<string, Award>) => ed.set('awards', v)

  const Inherited = ({ what, n, onTake }: { what: string; n: number; onTake: () => void }) => (
    <Box mb={14}>
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
        <Text fz={11} c="#9ab8d0">from {p.inherits ?? 'the canonical pack'}</Text>
      </Group>
      <Text fz={10} c="dark.3" mb={10} maw={560}>
        This pack authors no {what} of its own — it uses somebody else's {n}.
      </Text>
      <Button size="xs" variant="default" onClick={onTake}>AUTHOR OWN {what.toUpperCase()} ({n})</Button>
    </Box>
  )

  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= ranks.length) return
    const next = [...ranks]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setRanks(next)
  }

  const setIns = (i: number, n: Partial<Insignia>) => {
    const cur = ranks[i]!.insignia ?? {}
    const merged: Insignia = { ...cur, ...n }
    // drop the falsy keys so an unset device does not litter the manifest
    const clean = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== false && v !== 0),
    ) as Insignia
    setRanks(ranks.map((r, j) => (j === i
      ? { ...r, insignia: Object.keys(clean).length ? clean : undefined }
      : r)))
  }

  return (
    <Box maw={900}>
      <Group gap={4} mb={14}>
        {(['ranks', 'awards', 'callsigns'] as const).map(s => (
          <Button key={s} size="compact-xs" variant={section === s ? 'filled' : 'default'}
            onClick={() => setSection(s)}>
            {s === 'ranks' ? `RANKS (${ranks.length})`
              : s === 'awards' ? `AWARDS (${Object.keys(awards).length})` : 'CALLSIGNS'}
          </Button>
        ))}
      </Group>

      {/* ---------------------------------------------------------------- */}
      {section === 'ranks' && (
        <>
          {!ownsRanks && (
            <Inherited what="ranks" n={(p.ranks ?? []).length}
              onTake={() => setRanks(JSON.parse(JSON.stringify(p.ranks ?? [])) as Rank[])} />
          )}
          {ownsRanks && (
            <>
              <Text fz={10} c="dark.3" mb={10} maw={620}>
                JUNIOR FIRST — the order IS the seniority and the engine reads nothing else.
                A platoon's leader is found by ladder position, so moving a rank changes who
                commands, not just how a card looks.
              </Text>
              {ranks.map((r, i) => {
                const ins = r.insignia ?? {}
                const ch = ins.chevrons ?? [0, 0]
                return (
                  <Group key={i} gap={6} mb={4} wrap="nowrap" align="center" p={6} style={CARD}>
                    <Text fz={9} c="dark.3" w={22} ta="right">{i + 1}</Text>
                    <Box w={26}><RankIcon rank={r.key} /></Box>
                    <TextInput size="xs" w={80} value={r.key} styles={{ input: { fontFamily: MONO } }}
                      onChange={e => setRanks(ranks.map((x, j) => j === i ? { ...x, key: e.currentTarget.value.toUpperCase() } : x))} />
                    <TextInput size="xs" style={{ flex: 1 }} value={r.name}
                      onChange={e => setRanks(ranks.map((x, j) => j === i ? { ...x, name: e.currentTarget.value } : x))} />
                    <NumberInput size="xs" w={58} min={0} max={4} value={ch[0]} title="chevrons"
                      onChange={v => setIns(i, { chevrons: [Number(v) || 0, ch[1]] })} />
                    <NumberInput size="xs" w={58} min={0} max={4} value={ch[1]} title="rockers"
                      onChange={v => setIns(i, { chevrons: [ch[0], Number(v) || 0] })} />
                    <NumberInput size="xs" w={54} min={0} max={5} value={ins.bars ?? 0} title="officer bars"
                      onChange={v => setIns(i, { bars: Number(v) || undefined })} />
                    <NumberInput size="xs" w={54} min={0} max={5} value={ins.stars ?? 0} title="general stars"
                      onChange={v => setIns(i, { stars: Number(v) || undefined })} />
                    <Group gap={2} wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" disabled={i === 0}
                        onClick={() => move(i, -1)}>▲</Button>
                      <Button size="compact-xs" variant="subtle" disabled={i === ranks.length - 1}
                        onClick={() => move(i, 1)}>▼</Button>
                      <Button size="compact-xs" variant="subtle" color="red"
                        onClick={() => setRanks(ranks.filter((_, j) => j !== i))}>✕</Button>
                    </Group>
                  </Group>
                )
              })}
              <Group gap={8} mt={10}>
                <TextInput size="xs" w={140} placeholder="NEW RANK KEY" value={newRank}
                  styles={{ input: { fontFamily: MONO } }}
                  onChange={e => setNewRank(e.currentTarget.value.toUpperCase())} />
                <Button size="compact-xs" variant="default" disabled={!newRank.trim()}
                  onClick={() => { setRanks([...ranks, { key: newRank.trim(), name: newRank.trim() }]); setNewRank('') }}>
                  ＋ RANK (at the top — move it down)
                </Button>
              </Group>
              <Text fz={9} c="dark.3" mt={6}>
                Columns after the name: chevrons, rockers, officer bars, general stars.
              </Text>
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'awards' && (
        <>
          {!ownsAwards && (
            <Inherited what="awards" n={Object.keys(p.awards ?? {}).length}
              onTake={() => setAwards(JSON.parse(JSON.stringify(p.awards ?? {})) as Record<string, Award>)} />
          )}
          {ownsAwards && (
            <>
              <Text fz={10} c="dark.3" mb={10} maw={620}>
                `ON` is the criterion the engine awards against — today only <b>wound</b> and
                <b> wound-civ</b> are issued automatically. An award with no criterion is
                decoration the army has but nothing yet earns.
              </Text>
              {Object.entries(awards).map(([k, a]) => {
                const write = (n: Partial<Award>) => setAwards({ ...awards, [k]: { ...a, ...n } })
                return (
                  <Box key={k} mb={6} p={8} style={CARD}>
                    <Group gap={8} wrap="nowrap" align="flex-end">
                      <Box w={30}><RibbonIcon stripes={a.ribbon ?? []} /></Box>
                      <TextInput size="xs" w={90} value={a.abbr ?? ''} placeholder="PH"
                        styles={{ input: { fontFamily: MONO } }}
                        onChange={e => write({ abbr: e.currentTarget.value })} />
                      <TextInput size="xs" style={{ flex: 1 }} value={a.name ?? ''}
                        onChange={e => write({ name: e.currentTarget.value })} />
                      <TextInput size="xs" w={110} value={a.on ?? ''} placeholder="on (wound)"
                        styles={{ input: { fontFamily: MONO } }}
                        onChange={e => write({ on: e.currentTarget.value || undefined })} />
                      <Button size="compact-xs" variant="subtle" color="red"
                        onClick={() => { const { [k]: _g, ...rest } = awards; setAwards(rest) }}>✕</Button>
                    </Group>
                    <TextInput size="xs" mt={4} value={(a.ribbon ?? []).join(', ')}
                      placeholder="#7a1c1c, #d8d2c4, #7a1c1c" styles={{ input: { fontFamily: MONO } }}
                      onChange={e => write({ ribbon: e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  </Box>
                )
              })}
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'callsigns' && (
        <Box maw={620}>
          <Text fz={10} c="dark.3" mb={12}>
            How this army designates a fielded element. A POOL gives them names; a PREFIX
            counts them instead — which is what a COP does for a force whose designations it
            does not know, and why hostile tracks never read like friendly ones. There is
            deliberately NO inheritance here: borrowing the canonical pack's would have the
            opposition answering to ALPHA and BRAVO.
          </Text>
          <Text fz={10} fw={700} c="#9ab8d0" mb={4} style={{ letterSpacing: 1.5 }}>POOL</Text>
          <TextInput size="xs" mb={12} value={(cs.pool ?? []).join(', ')}
            placeholder="ALPHA, BRAVO, CHARLIE…" styles={{ input: { fontFamily: MONO } }}
            onChange={e => {
              const pool = e.currentTarget.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
              ed.set('callsigns', { ...cs, pool: pool.length ? pool : undefined })
            }} />
          <Group gap={10} align="flex-end">
            <TextInput size="xs" w={110} label="PREFIX" value={cs.prefix ?? ''} placeholder="E"
              styles={{ input: { fontFamily: MONO } }}
              onChange={e => ed.set('callsigns', { ...cs, prefix: e.currentTarget.value || undefined })} />
            <NumberInput size="xs" w={90} label="PAD" min={0} max={4} value={cs.pad ?? 0}
              onChange={v => ed.set('callsigns', { ...cs, pad: Number(v) || undefined })} />
            <Text fz={9} c="dark.3">
              {cs.pool?.length ? `named — ${cs.pool[0]}, ${cs.pool[1] ?? '…'}`
                : cs.prefix ? `counted — ${cs.prefix}${'0'.repeat(Math.max(0, (cs.pad ?? 2) - 1))}1`
                  : 'unset — elements get a plain count'}
            </Text>
          </Group>
          <Switch mt={14} size="xs" checked={!!cs.pool?.length}
            label="use a NAME POOL rather than a count"
            onChange={e => ed.set('callsigns', e.currentTarget.checked
              ? { ...cs, pool: cs.pool?.length ? cs.pool : ['ALPHA', 'BRAVO', 'CHARLIE'] }
              : { ...cs, pool: undefined })} />
        </Box>
      )}

      <SaveBar ed={ed} />
    </Box>
  )
}
