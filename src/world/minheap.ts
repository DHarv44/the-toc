// Binary min-heap over integer keys with float priorities. Shared by terrain
// generation (priority flood, road A*) and runtime pathfinding.
export class MinHeap {
  private k: number[] = []
  private p: number[] = []
  get size() { return this.k.length }
  push(key: number, pri: number) {
    const k = this.k, p = this.p
    k.push(key); p.push(pri)
    let i = k.length - 1
    while (i > 0) {
      const par = (i - 1) >> 1
      if (p[par]! <= p[i]!) break
      ;[k[par], k[i]] = [k[i]!, k[par]!]; [p[par], p[i]] = [p[i]!, p[par]!]
      i = par
    }
  }
  pop(): number {
    const k = this.k, p = this.p
    const top = k[0]!
    const lk = k.pop()!, lp = p.pop()!
    if (k.length) {
      k[0] = lk; p[0] = lp
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let s = i
        if (l < k.length && p[l]! < p[s]!) s = l
        if (r < k.length && p[r]! < p[s]!) s = r
        if (s === i) break
        ;[k[s], k[i]] = [k[i]!, k[s]!]; [p[s], p[i]] = [p[i]!, p[s]!]
        i = s
      }
    }
    return top
  }
}
