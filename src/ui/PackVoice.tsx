// VOICE — the army's WORDS. The desks that write, the procedure they speak,
// and the forms they write on.
//
// These three are one thing, which is why they share a tab: the S1 desk
// produces a PERSTAT, the PERSTAT is a report template, and the net is how any
// of it gets said out loud. All three are prose, so this tab is text areas
// rather than the row-and-column forms the structural tabs use — trying to
// make a report template look like a table would fight what it is.
//
// The engine fills templates BY FIELD NAME and knows nothing else about them:
// {asg} {kia} {dtg} in a report, {callsign} {higher} {msg} on the net. A field
// with nothing to say resolves empty, so a template may reference one that is
// not always there.
import { Badge, Box, Button, Group, Text, TextInput, Textarea } from '@mantine/core'
import { useState } from 'react'
import type { Pack } from '../packs/types'
import type { ManifestEditor } from './usePackManifest'
import { ManifestNotice, SaveBar } from './packEdit'

const MONO = 'Consolas, monospace'
const CARD = { border: '1px solid #22303d', borderRadius: 3, background: 'rgba(16,26,36,0.6)' }

interface Desk {
  label: string; name: string; full: string; report: string
  alt?: string; desks?: string[]; desc?: string; detail?: string
}
interface Net {
  higher?: string[]; closings?: string[]; control?: string
  broadcast?: string; call?: string; range?: string; rangeFloor?: number
}
interface Report { head: string; paras: string[]; sign: string; phrases?: Record<string, string> }

const list = (v: string[] | undefined) => (v ?? []).join(', ')
const toList = (s: string) => { const a = s.split(',').map(x => x.trim()).filter(Boolean); return a.length ? a : undefined }

export default function PackVoice({ p, ed }: { p: Pack; ed: ManifestEditor }) {
  const [section, setSection] = useState<'desks' | 'net' | 'reports'>('desks')
  if (!ed.manifest) return <ManifestNotice ed={ed} />

  const staff = (ed.value('staff') as Record<string, Desk> | undefined) ?? {}
  const net = (ed.value('net') as Net | undefined) ?? {}
  const reports = (ed.value('reports') as Record<string, Report> | undefined) ?? {}
  const ownsStaff = ed.owns('staff')
  const ownsReports = ed.owns('reports')

  const setStaff = (v: Record<string, Desk>) => ed.set('staff', v)
  const setNet = (n: Partial<Net>) => ed.set('net', { ...net, ...n })
  const setReports = (v: Record<string, Report>) => ed.set('reports', v)

  const Inherited = ({ what, n, onTake }: { what: string; n: number; onTake: () => void }) => (
    <Box mb={14}>
      <Group gap={8} mb={6}>
        <Badge size="sm" variant="outline" color="yellow">INHERITED</Badge>
        <Text fz={15} c="#9ab8d0">from {p.inherits ?? 'the canonical pack'}</Text>
      </Group>
      <Text fz={15} c="dark.3" mb={10} maw={560}>
        This pack writes no {what} of its own — it uses somebody else's {n}.
      </Text>
      <Button size="sm" variant="default" onClick={onTake}>AUTHOR OWN {what.toUpperCase()} ({n})</Button>
    </Box>
  )

  const Tmpl = ({ label, value, hint, rows = 2, onChange }: {
    label: string; value: string; hint?: string; rows?: number; onChange: (v: string) => void
  }) => (
    <Box mb={8}>
      <Text fz={14} fw={700} c="#9ab8d0" mb={2} style={{ letterSpacing: 1.5 }}>{label}</Text>
      <Textarea size="sm" autosize minRows={rows} value={value}
        styles={{ input: { fontFamily: MONO } }}
        onChange={e => onChange(e.currentTarget.value)} />
      {hint && <Text fz={14} c="dark.3" mt={2}>{hint}</Text>}
    </Box>
  )

  return (
    <Box maw={860}>
      <Group gap={4} mb={14}>
        {(['desks', 'net', 'reports'] as const).map(s => (
          <Button key={s} size="compact-sm" variant={section === s ? 'filled' : 'default'}
            onClick={() => setSection(s)}>
            {s === 'desks' ? `DESKS (${Object.keys(staff).length})`
              : s === 'net' ? 'NET' : `REPORTS (${Object.keys(reports).length})`}
          </Button>
        ))}
      </Group>

      {/* ---------------------------------------------------------------- */}
      {section === 'desks' && (
        <>
          {!ownsStaff && (
            <Inherited what="desks" n={Object.keys(p.staff ?? {}).length}
              onTake={() => setStaff(JSON.parse(JSON.stringify(p.staff ?? {})) as Record<string, Desk>)} />
          )}
          {ownsStaff && Object.entries(staff).map(([k, d]) => {
            const write = (n: Partial<Desk>) => setStaff({ ...staff, [k]: { ...d, ...n } })
            return (
              <Box key={k} mb={8} p={10} style={CARD}>
                <Group gap={8} wrap="nowrap" align="flex-end">
                  <TextInput size="sm" w={70} label="LABEL" value={d.label ?? ''}
                    styles={{ input: { fontFamily: MONO } }}
                    onChange={e => write({ label: e.currentTarget.value })} />
                  <TextInput size="sm" w={130} label="FUNCTION" value={d.name ?? ''}
                    onChange={e => write({ name: e.currentTarget.value })} />
                  <TextInput size="sm" style={{ flex: 1 }} label="OFFICER'S BILLET" value={d.full ?? ''}
                    onChange={e => write({ full: e.currentTarget.value })} />
                  <TextInput size="sm" w={140} label="STANDS IN" value={d.alt ?? ''}
                    placeholder="S1 NCOIC"
                    onChange={e => write({ alt: e.currentTarget.value || undefined })} />
                  <TextInput size="sm" w={100} label="PRODUCES" value={d.report ?? ''}
                    styles={{ input: { fontFamily: MONO } }}
                    onChange={e => write({ report: e.currentTarget.value })} />
                </Group>
                <TextInput size="sm" mt={6} label="GOES BY" value={list(d.desks)}
                  placeholder="S1, G1" styles={{ input: { fontFamily: MONO } }}
                  onChange={e => write({ desks: toList(e.currentTarget.value) })} />
                <Text fz={14} c="dark.3" mt={2}>
                  Every name this desk answers to across the rungs that hold one — a battalion's
                  S1 and a division's G1 are one function under two letters, and only the army
                  can say so. A billet on a desk NAMES the desk first.
                </Text>
                <TextInput size="sm" mt={6} label="SHORT" value={d.desc ?? ''}
                  onChange={e => write({ desc: e.currentTarget.value })} />
                <Textarea size="sm" mt={6} label="DETAIL" autosize minRows={2} value={d.detail ?? ''}
                  onChange={e => write({ detail: e.currentTarget.value })} />
              </Box>
            )
          })}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'net' && (
        <Box maw={720}>
          <Text fz={15} c="dark.3" mb={12}>
            Net procedure is CULTURE: who you address, what you call the station above you, how
            you sign off, and the shape of the sentence itself. The engine knows the FIELDS a
            transmission carries — {'{control} {higher} {callsign} {msg} {range} {closing}'} —
            and nothing about the words. No inheritance: an opposing force signing off the same
            way is the thing the split exists to prevent.
          </Text>
          <Group grow mb={8}>
            <TextInput size="sm" label="CONTROL — the station that broadcasts to everyone"
              value={net.control ?? ''} styles={{ input: { fontFamily: MONO } }}
              onChange={e => setNet({ control: e.currentTarget.value || undefined })} />
            <TextInput size="sm" label="RANGE FLOOR (metres)" value={String(net.rangeFloor ?? '')}
              onChange={e => setNet({ rangeFloor: Number(e.currentTarget.value) || undefined })} />
          </Group>
          <TextInput size="sm" mb={8} label="HIGHER — what an element calls the station above it"
            value={list(net.higher)} styles={{ input: { fontFamily: MONO } }}
            onChange={e => setNet({ higher: toList(e.currentTarget.value) })} />
          <TextInput size="sm" mb={12} label="CLOSINGS — sign-off prowords"
            value={list(net.closings)} styles={{ input: { fontFamily: MONO } }}
            onChange={e => setNet({ closings: toList(e.currentTarget.value) })} />
          <Tmpl label="CALL — one element to its higher" value={net.call ?? ''}
            hint="{higher} {callsign} {msg} {range} {closing}"
            onChange={v => setNet({ call: v || undefined })} />
          <Tmpl label="BROADCAST — to all stations" value={net.broadcast ?? ''}
            hint="{control} {msg} {closing}"
            onChange={v => setNet({ broadcast: v || undefined })} />
          <Tmpl label="RANGE — the read-back, appended when far enough to matter"
            value={net.range ?? ''} hint="{n} is the distance" rows={1}
            onChange={v => setNet({ range: v || undefined })} />
        </Box>
      )}

      {/* ---------------------------------------------------------------- */}
      {section === 'reports' && (
        <>
          {!ownsReports && (
            <Inherited what="reports" n={Object.keys(p.reports ?? {}).length}
              onTake={() => setReports(JSON.parse(JSON.stringify(p.reports ?? {})) as Record<string, Report>)} />
          )}
          {ownsReports && (
            <>
              <Text fz={15} c="dark.3" mb={12} maw={660}>
                A staff report is a FORM: a heading with the time on it, numbered paragraphs in
                a fixed order, and a sign-off. The engine counts the things they are about and
                fills the blanks by field name; a blank with nothing to say resolves empty.
                PHRASES hold the alternative wordings a paragraph needs — what to write when
                there are no open cases as against when there are. The composer CHOOSES between
                them; the words are never its own.
              </Text>
              {Object.entries(reports).map(([k, r]) => {
                const write = (n: Partial<Report>) => setReports({ ...reports, [k]: { ...r, ...n } })
                return (
                  <Box key={k} mb={10} p={10} style={CARD}>
                    <Group gap={8} mb={6}>
                      <Text fz={16} fw={700} c="#dceeff" style={{ fontFamily: MONO }}>
                        {k.toUpperCase()}
                      </Text>
                      <Text fz={15} c="dark.3">{p.staff?.[k]?.report ?? ''}</Text>
                    </Group>
                    <Tmpl label="HEAD" value={r.head ?? ''} rows={1} hint="{report} {dtg}"
                      onChange={v => write({ head: v })} />
                    <Tmpl label="PARAGRAPHS — one per line, in order" rows={4}
                      value={(r.paras ?? []).join('\n')}
                      onChange={v => write({ paras: v.split('\n').filter(x => x.trim()) })} />
                    <Tmpl label="SIGN-OFF" value={r.sign ?? ''} rows={1}
                      onChange={v => write({ sign: v })} />
                    {r.phrases && (
                      <Box mt={6}>
                        <Text fz={14} fw={700} c="#9ab8d0" mb={2} style={{ letterSpacing: 1.5 }}>
                          PHRASES
                        </Text>
                        {Object.entries(r.phrases).map(([pk, pv]) => (
                          <Group key={pk} gap={6} mb={3} wrap="nowrap" align="center">
                            <Text fz={14} c="dark.3" w={90} style={{ fontFamily: MONO, flex: '0 0 auto' }}>
                              {pk}
                            </Text>
                            <TextInput size="sm" style={{ flex: 1 }} value={pv}
                              onChange={e => write({ phrases: { ...r.phrases, [pk]: e.currentTarget.value } })} />
                          </Group>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </>
          )}
        </>
      )}

      <SaveBar ed={ed} />
    </Box>
  )
}
