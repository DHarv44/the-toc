// Dev-only harness entry, dynamically imported by index.html when the page is opened
// with ?golden. Exposes the golden run against whichever sims are present:
//   window.__golden()     — old sim (window.__game)
//   window.__goldenNew()  — new sim (window.__newGame), once it exists
//   window.__goldenDiff() — run both, compare digests
import { runGolden, type GoldenApi, type GoldenResult } from './golden'

declare global {
  interface Window {
    __game?: GoldenApi
    __newGame?: GoldenApi
    __golden?: () => GoldenResult
    __goldenNew?: () => GoldenResult
    __goldenDiff?: () => { match: boolean; old: GoldenResult['summary']; new: GoldenResult['summary'] }
  }
}

window.__golden = () => {
  if (!window.__game) throw new Error('old sim not loaded')
  return runGolden(window.__game)
}
window.__goldenNew = () => {
  if (!window.__newGame) throw new Error('new sim not loaded yet')
  return runGolden(window.__newGame)
}
window.__goldenDiff = () => {
  const a = window.__golden!()
  const b = window.__goldenNew!()
  if (a.digest !== b.digest) {
    // dump both so the first divergence is findable
    console.log('OLD', a.digest)
    console.log('NEW', b.digest)
  }
  return { match: a.digest === b.digest, old: a.summary, new: b.summary }
}

console.log('[golden] harness loaded — __golden() / __goldenNew() / __goldenDiff()')
