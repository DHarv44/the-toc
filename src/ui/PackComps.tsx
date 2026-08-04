// COMPS — what a fieldable element is actually MADE of: the vehicles it rolls
// with and the people who ride and walk. This is the table that ties the troop
// kinds on the TROOPS tab into something a commander can put on the map.
//
// It also carries the one live check worth having here. Strength is derived
// from the roster (P2.5), so a unit type's declared `troops` and the sum of
// its composition's dismounts are the same number said twice — and when they
// disagree, the declaration is the one that is wrong. The tab says so rather
// than letting it rot until somebody notices a platoon fielding 32 of an
// establishment of 38.
import { Badge, Box, Button, Group, NumberInput, Select, Text } from '@mantine/core'
import { useState } from 'react'
import { libraryIds } from '../packs'
import type { Pack } from '../packs/types'
import { catalogForm, catalogLibrary, type ManifestEditor } from './usePackManifest'
import { ManifestNotice, SaveBar, SourceBadge, SUBSET_NOTE } from './packEdit'
import { MultiSelect } from '@mantine/core'

const MONO = 'Consolas, monospace'

interface Row { kind?: string; type?: string; n: number }
interface Comp { unit: string; vehicles?: Row[]; dismounts?: Row[] }

export default function PackComps({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [newKey, setNewKey] = useState<string | null>(null)
  if (!ed.manifest) return <ManifestNotice ed={ed} />

  const cat = (ed.value('catalogs') as Record<string, unknown>) ?? {}
  const form = catalogForm({ ...ed.manifest, catalogs: cat }, 'comps')
  const lib = catalogLibrary(ed.manifest)
  const setComps = (v: unknown) => ed.set('catalogs', { ...cat, comps: v })

  if (form === 'inherited') {
    const n = Object.keys(p.catalogs?.comps ?? {}).length
    return (
      <Box maw={700}>
        <SourceBadge form={form} lib={lib} p={p} />
        <Text fz={15} c="dark.3" mb={12} maw={560}>
          This pack authors no compositions of its own, so its elements are built to somebody
          else's establishment — {n} of them. Taking ownership copies them in as a starting
          point; after that they are yours, and nothing upstream will change them again.
        </Text>
        <Button size="sm" variant="default" onClick={() => setComps({ ...(p.catalogs?.comps ?? {}) })}>
          AUTHOR OWN TABLE ({n} COMPOSITIONS)
        </Button>
        <SaveBar ed={ed} />
      </Box>
    )
  }

  if (form === 'subset') {
    const chosen = (cat.comps as string[]) ?? []
    return (
      <Box maw={700}>
        <SourceBadge form={form} lib={lib} p={p} />
        <Text fz={15} c="dark.3" mb={12} maw={560}>{SUBSET_NOTE}</Text>
        <MultiSelect size="sm" data={libraryIds(lib, 'comps')} value={chosen} searchable
          label="COMPOSITIONS THIS PACK FIELDS" styles={{ input: { fontFamily: MONO } }}
          onChange={v => setComps(v.length ? v : undefined)} />
        <SaveBar ed={ed} />
      </Box>
    )
  }

  // --- own table -----------------------------------------------------------
  const table = (cat.comps as Record<string, Comp>) ?? {}
  const keys = Object.keys(table)
  const vehOpts = Object.keys(p.catalogs?.vehicles ?? {})
  const kindOpts = Object.keys(p.catalogs?.troops ?? {})
  // a composition builds a UNIT TYPE, so only types this pack ships qualify,
  // and only ones that have no composition yet can be added
  const unitOpts = Object.keys(p.catalogs?.units ?? {}).filter(u => !table[u])

  // `unit` names the unit type this composition builds, which IS the key it is
  // filed under — default it rather than letting a hand-authored table that
  // omitted it lose the field on the first edit
  const patch = (key: string, next: Partial<Comp>) => {
    const cur = table[key]
    setComps({ ...table, [key]: { ...cur, ...next, unit: cur?.unit ?? key } })
  }
  const drop = (key: string) => { const { [key]: _g, ...rest } = table; setComps(rest) }

  const rows = (c: Comp, field: 'vehicles' | 'dismounts'): Row[] => c[field] ?? []
  const setRow = (key: string, field: 'vehicles' | 'dismounts', i: number, next: Partial<Row>) => {
    const list = [...rows(table[key]!, field)]
    list[i] = { ...list[i]!, ...next } as Row
    patch(key, { [field]: list })
  }
  const addRow = (key: string, field: 'vehicles' | 'dismounts') =>
    patch(key, { [field]: [...rows(table[key]!, field), field === 'vehicles' ? { type: vehOpts[0], n: 1 } : { kind: kindOpts[0], n: 1 }] })
  const dropRow = (key: string, field: 'vehicles' | 'dismounts', i: number) =>
    patch(key, { [field]: rows(table[key]!, field).filter((_, j) => j !== i) })

  return (
    <Box maw={880}>
      <SourceBadge form={form} p={p} count={keys.length} />

      {keys.length === 0 && (
        <Text fz={15} c="dark.3" mb={10}>
          No compositions. A unit type with none cannot be built, so nothing here can be fielded.
        </Text>
      )}

      {keys.map(k => {
        const c = table[k]!
        const dis = rows(c, 'dismounts')
        const veh = rows(c, 'vehicles')
        const heads = dis.reduce((n, r) => n + (r.n || 0), 0)
        // the declared establishment, said twice — see the header note
        const declared = p.catalogs?.units?.[k]?.troops
        const mismatch = declared != null && heads !== declared
        return (
          <Box key={k} mb={10} p={10}
            style={{ border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }}>
            <Group gap={10} wrap="nowrap" align="baseline">
              <Text fz={16} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
              <Text fz={15} c="dark.3" style={{ flex: 1 }}>
                {p.catalogs?.units?.[k]?.name ?? 'NO UNIT TYPE OF THIS KEY'}
              </Text>
              <Badge size="sm" variant="outline" color={mismatch ? 'orange' : 'gray'}>
                {heads} TROOPS{declared != null ? ` · DECLARED ${declared}` : ''}
              </Badge>
              <Button size="compact-sm" variant="subtle" color="red" onClick={() => drop(k)}>REMOVE</Button>
            </Group>

            {mismatch && (
              <Text fz={14} c="orange.5" mt={4}>
                The unit type declares {declared} and this roster builds {heads}. Strength comes
                from the ROSTER, so the declaration is the one that is wrong.
              </Text>
            )}

            <Group gap={20} mt={10} align="flex-start">
              <Box style={{ flex: 1 }}>
                <Text fz={14} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>VEHICLES</Text>
                {veh.length === 0 && <Text fz={15} c="dark.3" mb={4}>none — this element walks</Text>}
                {veh.map((r, i) => (
                  <Group key={i} gap={6} mb={4} wrap="nowrap">
                    <Select size="sm" data={vehOpts} value={r.type ?? null} searchable
                      style={{ flex: 1 }} styles={{ input: { fontFamily: MONO } }}
                      onChange={v => v && setRow(k, 'vehicles', i, { type: v })} />
                    <NumberInput size="sm" w={70} min={1} value={r.n}
                      onChange={v => setRow(k, 'vehicles', i, { n: Number(v) || 1 })} />
                    <Button size="compact-sm" variant="subtle" color="red"
                      onClick={() => dropRow(k, 'vehicles', i)}>✕</Button>
                  </Group>
                ))}
                <Button size="compact-sm" variant="default" mt={2} disabled={!vehOpts.length}
                  onClick={() => addRow(k, 'vehicles')}>＋ VEHICLE</Button>
              </Box>

              <Box style={{ flex: 1 }}>
                <Text fz={14} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>DISMOUNTS</Text>
                {dis.map((r, i) => (
                  <Group key={i} gap={6} mb={4} wrap="nowrap">
                    <Select size="sm" data={kindOpts} value={r.kind ?? null} searchable
                      style={{ flex: 1 }} styles={{ input: { fontFamily: MONO } }}
                      onChange={v => v && setRow(k, 'dismounts', i, { kind: v })} />
                    <NumberInput size="sm" w={70} min={1} value={r.n}
                      onChange={v => setRow(k, 'dismounts', i, { n: Number(v) || 1 })} />
                    <Button size="compact-sm" variant="subtle" color="red"
                      onClick={() => dropRow(k, 'dismounts', i)}>✕</Button>
                  </Group>
                ))}
                <Button size="compact-sm" variant="default" mt={2} disabled={!kindOpts.length}
                  onClick={() => addRow(k, 'dismounts')}>＋ DISMOUNT</Button>
              </Box>
            </Group>
          </Box>
        )
      })}

      <Group gap={8} mt={12}>
        <Select size="sm" w={260} placeholder="UNIT TYPE WITH NO COMPOSITION" value={newKey}
          data={unitOpts.map(u => ({ value: u, label: `${u} — ${p.catalogs.units[u]?.name ?? u}` }))}
          onChange={setNewKey} />
        <Button size="compact-sm" variant="default" disabled={!newKey}
          onClick={() => { if (newKey) { setComps({ ...table, [newKey]: { unit: newKey, vehicles: [], dismounts: [] } }); setNewKey(null) } }}>
          ＋ ADD COMPOSITION
        </Button>
        {unitOpts.length === 0 && keys.length > 0 && (
          <Text fz={14} c="dark.3">Every unit type this pack ships already has one.</Text>
        )}
      </Group>

      <SaveBar ed={ed} />
    </Box>
  )
}
