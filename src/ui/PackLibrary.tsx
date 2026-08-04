// THE PACK LIBRARY — the Pack Builder's front door, in the same grammar as
// the Scenario Builder's: a document tool opens on its documents. Every army
// this build knows about, one card each, plus NEW PACK.
//
// It lists allPacks(), which is the CATALOGUE — not the lineup. Those are
// different questions ("what armies exist" vs "who is fighting this battle"),
// and asking the second one here is what once made a finished army invisible
// to every content tool in the app.
import { useState } from 'react'
import { Box, Button, Group, Select, Text, TextInput } from '@mantine/core'
import { allPacks } from '../packs'
import { walkFormation } from '../packs/types'
import { echelonAt } from '../packs/orgquery'
import { packMaps } from '../packs/map-files'
import { packScenarios } from '../packs/scenario-files'
import { newPackManifest, savePackManifest, slugifyPackId } from '../packs/io'
import type { Pack } from '../packs/types'
import { PatchIcon } from './insignia'

const MONO = 'Consolas, monospace'

const count = (n: number, one: string, many = `${one}S`) =>
  `${n} ${n === 1 ? one : many}`

/** What a pack IS, in one line, read off its own content. Nothing here is
 *  assumed: a pack with no formation says so rather than showing zeroes. */
function summarize(p: Pack): string {
  const parts: string[] = []
  const w = walkFormation(p.formation)
  if (w.length) {
    const rungs = Math.max(...w.map(x => x.rung)) + 1
    const ladder = [p.formation?.top?.name ?? 'FORMATION',
      ...Array.from({ length: rungs }, (_, r) => echelonAt(p, r))].join(' → ')
    parts.push(ladder)
    parts.push(count(w.length, 'FORMATION'))
  } else {
    parts.push('NO FORMATION')
  }
  const units = Object.keys(p.catalogs?.units ?? {}).length
  if (units) parts.push(count(units, 'UNIT TYPE'))
  return parts.join(' · ')
}

export default function PackLibrary({ onOpen, onExit }: {
  onOpen: (packId: string) => void
  onExit: () => void
}) {
  const packs = allPacks()
  const maps = packMaps()
  const scenarios = packScenarios()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('NEW ARMY')
  const [newAbbr, setNewAbbr] = useState('NEW')
  const [inherits, setInherits] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const newId = slugifyPackId(newName)
  const taken = packs.some(p => p.id === newId)

  const create = async () => {
    if (!newId || taken) return
    setBusy(true); setMsg(null)
    try {
      await savePackManifest(newId, newPackManifest({
        id: newId, name: newName.trim(), abbr: newAbbr.trim().toUpperCase() || newId.toUpperCase(),
        ...(inherits ? { inherits } : {}),
      }))
      // discovery is a build-time glob, so the new army is not in this page's
      // PACKS yet — say so plainly rather than opening an editor on nothing
      setMsg(`CREATED src/packs/${newId}/pack.json — RELOAD TO OPEN IT`)
      setCreating(false)
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

  return (
    <Box pos="fixed" inset={0} bg="#05080b" style={{
      zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: MONO, overflowY: 'auto',
    }}>
      <Box w={620} py={40}>
        <Group align="center" mb={4}>
          <Box style={{ flex: 1 }}>
            <Text fz={26} fw={700} c="#dceeff" style={{ letterSpacing: 4 }}>PACK BUILDER</Text>
            <Text fz={15} c="dark.3" style={{ letterSpacing: 1.5 }}>
              PICK AN ARMY TO INSPECT AND EDIT — OR START A NEW ONE
            </Text>
          </Box>
          <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
        </Group>

        <Box mt={24}>
          {/* NEW PACK — the create card, expanding in place */}
          <Box mb={10} p={14} style={{
            border: '1px solid #2a3a48', borderLeft: '3px solid #7ec8ff',
            borderRadius: 3, background: 'rgba(16,26,36,0.85)',
            cursor: creating ? 'default' : 'pointer',
          }}
            onClick={() => { if (!creating) { setCreating(true); setMsg(null) } }}>
            <Text fz={18} fw={700} c="#e6f0f8" style={{ letterSpacing: 3 }}>＋ NEW PACK</Text>
            {!creating && (
              <Text fz={15} c="#7f97ab" mt={2}>
                Name the army — it saves a manifest into src/packs/ and the app finds it
              </Text>
            )}
            {creating && (
              <Box mt={10} onClick={ev => ev.stopPropagation()}>
                <Group grow mb={8}>
                  <TextInput size="sm" label="NAME" value={newName}
                    styles={{ input: { fontFamily: MONO } }}
                    onChange={ev => setNewName(ev.currentTarget.value)} />
                  <TextInput size="sm" label="ABBR" value={newAbbr} maxLength={8}
                    styles={{ input: { fontFamily: MONO } }}
                    onChange={ev => setNewAbbr(ev.currentTarget.value.toUpperCase())} />
                </Group>
                <Select size="sm" label="INHERITS (OPTIONAL)" value={inherits} clearable
                  placeholder="NOTHING — AN ARMY OF ITS OWN"
                  data={packs.map(p => ({ value: p.id, label: `${p.abbr ?? p.id} — ${p.name}` }))}
                  onChange={setInherits} mb={4} />
                <Text fz={14} c="dark.3" mb={10}>
                  A parent supplies functional content this pack does not ship — platforms,
                  billets, ranks. Leave it empty for a whole army of its own: inheriting
                  somebody else's rifles hides what yours is missing.
                </Text>
                <Group gap={8}>
                  <Button size="compact-sm" loading={busy}
                    disabled={!newId || taken || !newName.trim()} onClick={create}>
                    CREATE
                  </Button>
                  <Button size="compact-sm" variant="subtle" c="dark.2"
                    onClick={() => setCreating(false)}>CANCEL</Button>
                  <Text fz={15} c={taken ? 'orange.5' : 'dark.3'}>
                    {taken ? `src/packs/${newId}/ ALREADY EXISTS`
                      : newId ? `src/packs/${newId}/pack.json` : 'NAME IT FIRST'}
                  </Text>
                </Group>
              </Box>
            )}
          </Box>

          {msg && (
            <Text fz={15} c={msg.startsWith('FAILED') ? 'orange.5' : '#7ec87e'} mb={10}>{msg}</Text>
          )}

          {/* the shelf — every army this build knows about */}
          {packs.map(p => {
            const nMaps = maps.filter(m => m.packId === p.id).length
            const nScen = scenarios.filter(s => s.packId === p.id).length
            const parent = p.inherits
            return (
              <Box key={p.id} mb={8} p={14} style={{
                border: '1px solid #22303d', borderLeft: '3px solid #2a5a8a',
                borderRadius: 3, background: 'rgba(16,26,36,0.85)', cursor: 'pointer',
              }} onClick={() => onOpen(p.id)}>
                <Group gap={10} wrap="nowrap" align="flex-start">
                  {p.patch && <PatchIcon id={p.patch} h={30} />}
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={8} wrap="nowrap">
                      <Text fz={18} fw={700} c="#e6f0f8" style={{ letterSpacing: 2 }}>
                        {p.abbr ?? p.id}
                      </Text>
                      <Text fz={16} c="#9ab8d0" truncate style={{ flex: 1 }}>{p.name}</Text>
                      {p.nick && <Text fz={15} c="#c8a25f">{p.nick.toUpperCase()}</Text>}
                    </Group>
                    <Text fz={15} c="dark.3" mt={3}>{summarize(p)}</Text>
                    <Text fz={15} c="dark.3" mt={2}>
                      {p.id}
                      {parent ? ` · INHERITS ${parent.toUpperCase()}` : ' · STANDALONE'}
                      {` · ${count(nMaps, 'MAP')} · ${count(nScen, 'SCENARIO')}`}
                    </Text>
                  </Box>
                </Group>
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
