// IDENTITY — who this army IS, and the handful of fields a new pack cannot
// start without. Everything here is authored straight into pack.json.
//
// The tab exists because NEW PACK writes a skeleton with an id, a name and an
// abbreviation, and every other way of filling the rest in was "open the JSON
// in an editor". These are also the fields that carry no structure worth
// inspecting — a motto is a motto — so a plain form is the right shape.
//
// INHERITED values are shown but marked. A thin variant that declares no
// ranks is not a pack with no ranks; it is a pack borrowing its parent's, and
// the difference matters the moment somebody edits one.
import { Badge, Box, Button, Group, Select, Text, TextInput } from '@mantine/core'
import { allPacks } from '../packs'
import type { Pack } from '../packs/types'
import type { ManifestEditor } from './usePackManifest'
import { PatchIcon } from './insignia'
import { ManifestNotice } from './packEdit'

const MONO = 'Consolas, monospace'

function Field({ label, hint, own, inherited, children }: {
  label: string; hint?: string; own: boolean; inherited?: string; children: React.ReactNode
}) {
  return (
    <Box mb={14}>
      <Group gap={8} align="baseline" mb={3}>
        <Text fz={15} fw={700} c="#9ab8d0" style={{ letterSpacing: 1.5 }}>{label}</Text>
        {!own && inherited && (
          <Badge size="sm" variant="outline" color="yellow">INHERITED · {inherited}</Badge>
        )}
      </Group>
      {children}
      {hint && <Text fz={14} c="dark.3" mt={3}>{hint}</Text>}
    </Box>
  )
}

export default function PackIdentity({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  if (!ed.manifest) return <ManifestNotice ed={ed} />

  const str = (k: string) => String(ed.value(k) ?? '')
  const text = (k: string, placeholder?: string) => (
    <TextInput size="sm" value={str(k)} placeholder={placeholder} spellCheck={false}
      styles={{ input: { fontFamily: MONO } }}
      onChange={e => ed.set(k, e.currentTarget.value)} />
  )

  // a pack may inherit from any OTHER pack; itself would be a cycle, and the
  // loader throws on those rather than looping
  const parents = allPacks().filter(x => x.id !== p.id)
    .map(x => ({ value: x.id, label: `${x.abbr ?? x.id} — ${x.name}` }))

  // startForce is an ORDER, not a set — the same unit type appears more than
  // once, and the difficulty takes a prefix — so it is edited as a list
  const units = Object.keys(p.catalogs?.units ?? {})
  const force = (ed.value('startForce') as string[] | undefined) ?? []
  const setForce = (next: string[]) => ed.set('startForce', next.length ? next : undefined)

  const cats = (ed.value('cats') as string[] | undefined) ?? []

  return (
    <Box maw={620}>
      <Field label="NAME" own={ed.owns('name')} hint="The army's full name — '1st Cavalry Division'">
        {text('name')}
      </Field>

      <Group grow align="flex-start">
        <Field label="ABBR" own={ed.owns('abbr')} hint="Short form on every header">
          {text('abbr')}
        </Field>
        <Field label="NICKNAME" own={ed.owns('nick')} hint="'First Team' — worn, not official">
          {text('nick')}
        </Field>
      </Group>

      <Field label="MOTTO" own={ed.owns('motto')} hint="Division-level heraldry, quoted in headers">
        {text('motto')}
      </Field>

      <Field label="PATCH" own={ed.owns('patch')}
        hint="Shoulder-sleeve insignia id, drawn procedurally by ui/insignia — no art file">
        <Group gap={10} wrap="nowrap">
          <Box style={{ flex: 1 }}>{text('patch', 'none')}</Box>
          {str('patch') && <PatchIcon id={str('patch')} h={34} />}
        </Group>
      </Field>

      <Field label="INHERITS" own={ed.owns('inherits')}
        hint="A parent supplies FUNCTIONAL content this pack does not ship — platforms, billets, ranks. Leave it empty for an army of its own: borrowing somebody else's rifles hides what yours is missing.">
        <Select size="sm" clearable data={parents} value={str('inherits') || null}
          placeholder="NOTHING — AN ARMY OF ITS OWN"
          onChange={v => ed.set('inherits', v ?? undefined)} />
      </Field>

      <Field label="CAPABILITY GROUPS" own={ed.owns('cats')}
        inherited={p.inherits}
        hint="The order CALL UP drills through them. Each answers a question a commander asks under contact.">
        <TextInput size="sm" value={cats.join(', ')} spellCheck={false}
          placeholder="ARMOR, INFANTRY, RECONNAISSANCE"
          styles={{ input: { fontFamily: MONO } }}
          onChange={e => {
            const next = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean)
            ed.set('cats', next.length ? next : undefined)
          }} />
      </Field>

      <Field label="STARTING FORCE" own={ed.owns('startForce')} inherited={p.inherits}
        hint="What is already on the ground when a battle opens, IN FIELDING ORDER — the difficulty decides how many of these get fielded, so the tiers are prefixes of this one list.">
        <Group gap={6} mb={6} wrap="wrap">
          {force.length === 0 && <Text fz={15} c="dark.3">NONE — this army starts with nothing on the ground</Text>}
          {force.map((k, i) => (
            <Badge key={`${k}:${i}`} size="sm" variant="outline" color="blue"
              rightSection={
                <Text span fz={15} style={{ cursor: 'pointer' }}
                  onClick={() => setForce(force.filter((_, j) => j !== i))}>✕</Text>
              }>
              {i + 1}. {k}
            </Badge>
          ))}
        </Group>
        <Select size="sm" placeholder="＋ ADD AN ELEMENT" value={null}
          data={units.map(u => ({ value: u, label: `${u} — ${p.catalogs.units[u]?.name ?? u}` }))}
          onChange={v => v && setForce([...force, v])} />
        {units.length === 0 && (
          <Text fz={14} c="orange.5" mt={3}>
            This pack ships no unit types yet — author some before it can field anything.
          </Text>
        )}
      </Field>

      <Group gap={10} mt="lg" pt={12} style={{ borderTop: '1px solid #22303d' }}>
        <Button size="sm" variant={ed.dirty ? 'filled' : 'default'}
          disabled={!ed.dirty || ed.busy} onClick={() => void ed.save()}>
          {ed.busy ? 'SAVING…' : 'SAVE TO pack.json'}
        </Button>
        {ed.msg && (
          <Text fz={15} c={ed.msg.startsWith('FAILED') ? '#e8524a' : '#7ec87e'}>{ed.msg}</Text>
        )}
        <Text fz={14} c="dark.3" ml="auto">
          src/packs/{p.id}/pack.json · RELOAD TO SEE IT APPLIED
        </Text>
      </Group>
    </Box>
  )
}
