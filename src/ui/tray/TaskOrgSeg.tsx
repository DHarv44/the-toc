// TASK ORGANIZATION, from the map. Three buttons, and which of them exist
// depends entirely on what is selected — a control that offers you FORM when
// everything selected is already in a team is a control that has to be read
// before it can be used.
//
// The S3 board remains where a team is EDITED (order of march, interval,
// contact drill, the load plan). This is only where one gets made and unmade,
// because that is the decision you make with units under the cursor.
import type { Unit } from '../../engine/GameState'
import { underPlayerCommand } from '../../domains/forces/command'
import { formTeam, joinTeam, leaveTeam, teamById, teamOf } from '../../domains/forces/teams'
import { toast } from '../../domains/comms/radio'
import { btn } from '../styles'
import { useUI } from '../store'
import { optBtn } from './controls'

export default function TaskOrgSeg({ units }: { units: Unit[] }) {
  const ui = useUI()
  const mine = units.filter(underPlayerCommand)
  if (!mine.length) return null
  const teams = mine.map(u => teamOf(u))
  const free = mine.filter((_, i) => !teams[i])
  const held = mine.filter((_, i) => teams[i])
  // every selected element already in ONE team — the selection IS a team
  const only = teams[0] && teams.every(t => t && t.id === teams[0]!.id) ? teams[0]! : null
  // exactly one team represented, plus loose elements: they can join it
  const named = [...new Set(teams.filter(Boolean).map(t => t!.id))]
  const joinTo = named.length === 1 && free.length ? teamById(named[0]!) : null

  return (
    <>
      {free.length >= 2 && (
        <button style={btn(false)}
          title={`Form ${free.map(u => u.label).join(', ')} into a team, named for ${free[0]!.label}`}
          onClick={() => {
            const t = formTeam(free.map(u => u.id))
            if (t) toast(`${t.name} TASK ORGANIZED`)
          }}>FORM TEAM</button>
      )}
      {joinTo && (
        <button style={btn(false)}
          title={`Attach ${free.map(u => u.label).join(', ')} to ${joinTo.name}`}
          onClick={() => {
            for (const u of free) joinTeam(joinTo.id, u.id)
            toast(`${free.length} ATTACHED TO ${joinTo.name}`)
          }}>JOIN {joinTo.name}</button>
      )}
      {held.length > 0 && (
        <button style={btn(false)}
          title={`Detach ${held.map(u => u.label).join(', ')} from ${held.length === 1 ? 'its team' : 'their teams'}`}
          onClick={() => { for (const u of held) leaveTeam(u.id) }}>DETACH</button>
      )}
      {/* A BUTTON HAS TO SAY WHAT IT DOES. This read `TEAM BRAVO ▸`, which is
          the shape of "select the team" and is not what it does — it leaves the
          map for a full-screen staff console. Selecting a team is the task org
          bar's job now (ui/TaskOrgBar), so this one is free to name its own:
          the movement order is the document it opens. */}
      {only && (
        <button style={{ ...optBtn(false), color: '#9fb3c6' }}
          title={`Open ${only.name}'s movement order — order of march, interval, actions on contact, load plan`}
          onClick={() => ui.setConsole('s3')}>MOVEMENT ORDER ▸</button>
      )}
      {!free.length && !held.length && (
        <span style={{ fontSize: 9, color: '#54708a' }}>—</span>
      )}
    </>
  )
}
