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
import { Badge, Box, Button, Group, MultiSelect, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { libraryIds } from '../packs'
import type { Pack } from '../packs/types'
import { catalogForm, catalogLibrary, type ManifestEditor } from './usePackManifest'

const MONO = 'Consolas, monospace'

interface TroopKind { key: string; name: string; weapons?: string[]; expend?: string[] }

export default function PackTroops({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [newKey, setNewKey] = useState('')
  if (!ed.manifest) return <Text fz="sm" c="dark.3" p="md">{ed.msg ?? 'READING pack.json…'}</Text>

  const cat = (ed.value('catalogs') as Record<string, unknown>) ?? {}
  const form = catalogForm({ ...ed.manifest, catalogs: cat }, 'troops')
  const lib = catalogLibrary(ed.manifest)

  const setTroops = (v: unknown) => ed.set('catalogs', { ...cat, troops: v })

  // what a kind can be given: this pack's own resolved weapons and grenades
  const weaponOpts = Object.keys(p.catalogs?.weapons ?? {})
  const expendOpts = Object.keys(p.catalogs?.expendables ?? {})

  const SaveBar = () => (
    <Group gap={10} mt="lg" pt={12} style={{ borderTop: '1px solid #22303d' }}>
      <Button size="xs" variant={ed.dirty ? 'filled' : 'default'}
        disabled={!ed.dirty || ed.busy} onClick={() => void ed.save()}>
        {ed.busy ? 'SAVING…' : 'SAVE TO pack.json'}
      </Button>
      {ed.msg && <Text fz={10} c={ed.msg.startsWith('FAILED') ? '#e8524a' : '#7ec87e'}>{ed.msg}</Text>}
    </Group>
  )

  // --- inherited: nothing authored -----------------------------------------
  if (form === 'inherited') {
    return (
      <Box maw={700}>
        <Group gap={8} mb={6}>
          <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
          <Text fz={11} c="#9ab8d0">
            {lib ? `from the '${lib}' library` : `from ${p.inherits ?? 'the canonical pack'}`}
          </Text>
        </Group>
        <Text fz={10} c="dark.3" mb={12} maw={560}>
          This pack authors no troop kinds of its own, so it fields somebody else's —
          {' '}{Object.keys(p.catalogs?.troops ?? {}).length} of them. Taking ownership copies
          them in as a starting point; after that they are yours to change, and nothing
          upstream will change them again.
        </Text>
        <Button size="xs" variant="default"
          onClick={() => setTroops({ ...(p.catalogs?.troops ?? {}) })}>
          AUTHOR OWN TABLE ({Object.keys(p.catalogs?.troops ?? {}).length} KINDS)
        </Button>
        <SaveBar />
      </Box>
    )
  }

  // --- subset: choose which library entries this pack fields ---------------
  if (form === 'subset') {
    const chosen = (cat.troops as string[]) ?? []
    const available = libraryIds(lib, 'troops')
    return (
      <Box maw={700}>
        <Group gap={8} mb={6}>
          <Badge size="sm" variant="outline" color="blue">SUBSET</Badge>
          <Text fz={11} c="#9ab8d0">of the '{lib}' library</Text>
        </Group>
        <Text fz={10} c="dark.3" mb={12} maw={560}>
          This pack picks which library entries it fields. The entries themselves belong to
          the library and are shared by reference with every pack that draws on it, so they
          cannot be edited here — changing one would rearm somebody else's army.
        </Text>
        <MultiSelect size="xs" data={available} value={chosen} searchable
          label="KINDS THIS PACK FIELDS" styles={{ input: { fontFamily: MONO } }}
          onChange={v => setTroops(v.length ? v : undefined)} />
        <SaveBar />
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
      <Group gap={8} mb={10}>
        <Badge size="sm" variant="outline" color="green">OWN TABLE</Badge>
        <Text fz={11} c="#9ab8d0">{keys.length} KIND{keys.length === 1 ? '' : 'S'}</Text>
      </Group>

      {keys.length === 0 && (
        <Text fz={10} c="dark.3" mb={10}>
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
                <Text fz={9} c="dark.3" style={{ letterSpacing: 1.5 }}>KEY</Text>
                <Text fz={12} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>{k}</Text>
              </Box>
              <TextInput size="xs" label="NAME" value={t.name ?? ''} style={{ flex: 1 }}
                styles={{ input: { fontFamily: MONO } }}
                onChange={e => patch(k, { name: e.currentTarget.value })} />
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => drop(k)}>
                REMOVE
              </Button>
            </Group>
            <Group gap={10} mt={8} grow align="flex-start">
              <MultiSelect size="xs" label="WEAPONS" data={weaponOpts} value={t.weapons ?? []}
                searchable styles={{ input: { fontFamily: MONO } }}
                onChange={v => patch(k, { weapons: v })} />
              <MultiSelect size="xs" label="EXPENDABLES" data={expendOpts} value={t.expend ?? []}
                searchable styles={{ input: { fontFamily: MONO } }}
                onChange={v => patch(k, { expend: v.length ? v : undefined })} />
            </Group>
          </Box>
        )
      })}

      <Group gap={8} mt={12}>
        <TextInput size="xs" placeholder="NEW_KIND_KEY" value={newKey} spellCheck={false}
          styles={{ input: { fontFamily: MONO } }} w={220}
          onChange={e => setNewKey(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <Button size="compact-xs" variant="default" disabled={!newKey.trim()} onClick={add}>
          ＋ ADD KIND
        </Button>
        <Text fz={9} c="dark.3">
          A key is an id — compositions and billet tables both name it.
        </Text>
      </Group>

      <SaveBar />
    </Box>
  )
}
