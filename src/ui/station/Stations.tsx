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
import { useUI } from '../store'
import TeamStation from './TeamStation'

export default function Stations() {
  useUI((s) => s.tick)
  const stations = useUI(s => s.stations)
  if (!stations.length) return null
  // a disbanded team's id simply stops matching — TeamStation renders null and
  // the column goes with it, without anybody having to sweep the list
  return <>{stations.map(id => <TeamStation key={id} teamId={id} />)}</>
}
