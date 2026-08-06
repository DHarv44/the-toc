// THE RIGHT WALL. Every open team station, in the order they were opened.
//
// Left to right is oldest to newest, so a station opens against the tab column
// it was opened from and pushes the ones already there inboard. The alternative
// — newest on the left — would make every station you already had jump one
// column's width sideways the moment you opened another, which is the same
// mistake the rail tabs used to make.
//
// There is no cap. Two stations at 360 px leave most of a 1600 px screen to the
// map, three do not, and that is a budget the commander can feel directly and
// undo with one click. A rule that refuses the third one is a rule that has to
// be right about a screen it cannot see.
import { MantineProvider } from '@mantine/core'
import { useUI } from '../store'
import { theme } from '../theme'
import PopOut from '../shell/PopOut'
import { teamById } from '../../domains/forces/teams'
import TeamStation from './TeamStation'

export default function Stations() {
  useUI((s) => s.tick)
  const ui = useUI()
  // a disbanded team's id simply stops matching — TeamStation renders null and
  // the column goes with it, without anybody having to sweep the list
  return (
    <>
      {ui.stations.map(id => <TeamStation key={id} teamId={id} />)}
      {/* ON THE OTHER SCREEN. Rendered from here rather than from the right
          wall, so a popped station survives its tab being closed — the point of
          sending it out is that it stays up while you work the map. */}
      {ui.poppedStations.map(id => (
        <PopOut key={`w${id}`} title={`TOC · ${teamById(id)?.name ?? 'TEAM'}`}
          w={420} h={900} onClose={() => ui.popStation(id, false)}>
          <MantineProvider theme={theme} defaultColorScheme="dark">
            <TeamStation teamId={id} popped />
          </MantineProvider>
        </PopOut>
      ))}
    </>
  )
}
