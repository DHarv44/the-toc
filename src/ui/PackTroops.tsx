// TROOPS — the people a composition is built out of, and what each of them
// carries. For an army whose fighting power is worn rather than driven this
// is the most important table in the pack: the Mobile Infantry's Marauder,
// Command and Scout suits are all troop kinds, and none of them were visible
// anywhere in the builder before this tab existed.
//
// The tab has to respect HOW the table is authored (usePackManifest
// catalogForm), because the three forms mean genuinely different things:
//
//   own       edit the entries — they are this pack's
//   subset    pick WHICH library entries this pack fields. The entries
//             themselves are NOT editable here: they are shared BY REFERENCE
//             with every other pack drawing on the same library, so editing
//             one would silently rearm somebody else's army.
//   inherited nothing authored — say where it comes from, and offer to take
//             ownership by copying the resolved table in.
import { Box, Button, Group, MultiSelect, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { libraryIds } from '../packs'
import type { Pack } from '../packs/types'
import { catalogForm, catalogLibrary, type ManifestEditor } from './usePackManifest'
import { ManifestNotice, SaveBar, SourceBadge, SUBSET_NOTE } from './packEdit'

const MONO = 'Consolas, monospace'

interface TroopKind { key: string; name: string; weapons?: string[]; expend?: string[] }

export default function PackTroops({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [newKey, setNewKey] = useState('')
  if (!ed.manifest) return <ManifestNotice ed={ed} />

  const cat = (ed.value('catalogs') as Record<string, unknown>) ?? {}
  const form = catalogForm({ ...ed.manifest, catalogs: cat }, 'troops')
  const lib = catalogLibrary(ed.manifest)

  const setTroops = (v: unknown) => ed.set('catalogs', { ...cat, troops: v })

  // what a kind can be given: this pack's own resolved weapons and grenades
  const weaponOpts = Object.keys(p.catalogs?.weapons ?? {})
  const expendOpts = Object.keys(p.catalogs?.expendables ?? {})

  // --- inherited: nothing authored -----------------------------------------
  if (form === 'inherited') {
    return (
      <Box maw={700}>
        <SourceBadge form={form} lib={lib} p={p} />
        <Text fz={15} c="dark.3" mb={12} maw={560}>
          This pack authors no troop kinds of its own, so it fields somebody else's —
          {' '}{Object.keys(p.catalogs?.troops ?? {}).length} of them. Taking ownership copies
          them in as a starting point; after that they are yours to change, and nothing
          upstream will change them again.
        </Text>
        <Button size="sm" variant="default"
          onClick={() => setTroops({ ...(p.catalogs?.troops ?? {}) })}>
          AUTHOR OWN TABLE ({Object.keys(p.catalogs?.troops ?? {}).length} KINDS)
        </Button>
        <SaveBar ed={ed} />
      </Box>
    )
  }

  // --- subset: choose which library entries this pack fields ---------------
  if (form === 'subset') {
    const chosen = (cat.troops as string[]) ?? []
    return (
      <Box maw={700}>
        <SourceBadge form={form} lib={lib} p={p} />
        <Text fz={15} c="dark.3" mb={12} maw={560}>{SUBSET_NOTE}</Text>
        <MultiSelect size="sm" data={libraryIds(lib, 'troops')} value={chosen} searchable
          label="KINDS THIS PACK FIELDS" styles={{ input: { fontFamily: MONO } }}
          onChange={v => setTroops(v.length ? v : undefined)} />
        <SaveBar ed={ed} />
      </Box>
    )
  }

  // --- own: the pack's own table -------------------------------------------
  const table = (cat.troops as Record<string, TroopKind>) ?? {}
  const keys = Object.keys(table)
  const patch = (key: string, next: Partial<TroopKind>) =>
    setTroops({ ...table, [key]: { ...table[key], key, ...next } })
  const drop = (key: string) => {
    const { [key]: _gone, ...rest } = table
    setTroops(rest)
  }
  const add = () => {
    const k = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    if (!k || table[k]) return
    setTroops({ ...table, [k]: { key: k, name: k, weapons: [] } })
    setNewKey('')
  }

  return (
    <Box maw={860}>
      <SourceBadge form={form} p={p} count={keys.length} />

      {keys.length === 0 && (
        <Text fz={15} c="dark.3" mb={10}>
          No troop kinds. A composition is built out of these, so an army with none can
          field nothing.
        </Text>
      )}

      {keys.map(k => {
        const t = table[k]!
        return (
          <Box key={k} mb={8} p={10}
            style={{ border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }}>
            <Group gap={10} wrap="nowrap" align="flex-end">
              <Box w={140} style={{ flex: '0 0 auto' }}>
                <Text fz={14} c="dark.3" style={{ letterSpacing: 1.5 }}>KEY</Text>
                <Text fz={16} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
              </Box>
              <TextInput size="sm" label="NAME" value={t.name ?? ''} style={{ flex: 1 }}
                styles={{ input: { fontFamily: MONO } }}
                onChange={e => patch(k, { name: e.currentTarget.value })} />
              <Button size="compact-sm" variant="subtle" color="red" onClick={() => drop(k)}>
                REMOVE
              </Button>
            </Group>
            <Group gap={10} mt={8} grow align="flex-start">
              <MultiSelect size="sm" label="WEAPONS" data={weaponOpts} value={t.weapons ?? []}
                searchable styles={{ input: { fontFamily: MONO } }}
                onChange={v => patch(k, { weapons: v })} />
              <MultiSelect size="sm" label="EXPENDABLES" data={expendOpts} value={t.expend ?? []}
                searchable styles={{ input: { fontFamily: MONO } }}
                onChange={v => patch(k, { expend: v.length ? v : undefined })} />
            </Group>
          </Box>
        )
      })}

      <Group gap={8} mt={12}>
        <TextInput size="sm" placeholder="NEW_KIND_KEY" value={newKey} spellCheck={false}
          styles={{ input: { fontFamily: MONO } }} w={220}
          onChange={e => setNewKey(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <Button size="compact-sm" variant="default" disabled={!newKey.trim()} onClick={add}>
          ＋ ADD KIND
        </Button>
        <Text fz={14} c="dark.3">
          A key is an id — compositions and billet tables both name it.
        </Text>
      </Group>

      <SaveBar ed={ed} />
    </Box>
  )
}
