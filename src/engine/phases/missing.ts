// How many cards a hand is short of a phase. This is exact: it is the smallest number of cards that would
// have to be added to the hand before the phase could be laid down, so 0 means it can be laid down now.
//
// How it works. Every group aims at a target (a set of 7s, a run from 3 to 6, red). For one choice of
// targets the question is how to share out the hand: usually no card fits two targets and each group
// simply takes what it can, and when cards are wanted twice a small matching sorts it out. The search
// tries the most promising targets first and stops looking down a branch as soon as it cannot beat the
// best found so far.
//
// Wilds fill any gap in a group that allows them, except that every group keeps one place for a
// natural card (a group made only of Wilds is not allowed).

import { COLORS, MAX_VALUE, MIN_VALUE } from '../cards'
import type { Card, NumberCard } from '../cards'
import { encodeGroups } from './codes'
import { defsOf } from './lists'
import type { PhaseSet } from './lists'
import { valuesFor } from './melds'
import { sameSpec } from './spec'
import type { GroupSpec } from './spec'

/** Number of bits set. Hands are kept as bit masks: bit i is the i-th natural card. */
function bits(x: number): number {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/** One thing a group could aim at, and the cards in hand that would fit it. */
interface Target {
  mask: number // every card that fits
  top: number // the most cards it can hold when it gets all of them
  /** Runs: for each number of the run that the hand has, the cards with that number. Sets and color groups: null. */
  slots: number[] | null
  /** Rainbow runs: the same, split by color. */
  byColor: number[][] | null
}

const MAX_CARDS = 30

/** A rainbow run: the most numbers that can be covered when no color is used more than `cap` times. */
function rainbowCount(byColor: readonly number[][], allowed: number, cap: number): number {
  const owner: number[][] = [[], [], [], []] // for each color, the positions using it
  const tryPlace = (pos: number, seen: boolean[]): boolean => {
    for (let k = 0; k < 4; k++) {
      if (seen[k] || (byColor[pos][k] & allowed) === 0) continue
      seen[k] = true
      if (owner[k].length < cap) {
        owner[k].push(pos)
        return true
      }
      for (let m = 0; m < owner[k].length; m++) {
        if (tryPlace(owner[k][m], seen)) {
          owner[k][m] = pos
          return true
        }
      }
    }
    return false
  }
  let covered = 0
  for (let pos = 0; pos < byColor.length; pos++) if (tryPlace(pos, [false, false, false, false])) covered++
  return covered
}

/** How many cards this target holds when it may only use the cards in `allowed`. */
function countFor(spec: GroupSpec, t: Target, allowed: number): number {
  if (t.byColor) return rainbowCount(t.byColor, allowed, spec.size >> 2)
  if (t.slots) {
    let n = 0
    for (const s of t.slots) if (s & allowed) n++
    return n
  }
  return Math.min(spec.size, bits(t.mask & allowed))
}

/** Every target worth aiming at for one group, best first. Targets no card in hand fits are left out. */
function targetsFor(spec: GroupSpec, cards: readonly NumberCard[], colorOf: readonly number[]): Target[] {
  const out: Target[] = []
  const seen = new Set<number>()
  const add = (t: Target) => {
    // Two runs that would hold exactly the same cards are the same choice.
    if (t.mask === 0 || seen.has(t.mask)) return
    seen.add(t.mask)
    out.push(t)
  }
  const pick = (test: (c: NumberCard, k: number) => boolean): number => {
    let mask = 0
    for (let i = 0; i < cards.length; i++) if (test(cards[i], colorOf[i])) mask |= 1 << i
    return mask
  }
  const pool = (mask: number) => add({ mask, top: Math.min(spec.size, bits(mask)), slots: null, byColor: null })
  const colors = spec.oneColor ? [0, 1, 2, 3] : [-1]

  if (spec.kind === 'color') {
    for (let k = 0; k < 4; k++) pool(pick((_, col) => col === k))
  } else if (spec.kind === 'set') {
    for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
      for (const k of colors) pool(pick((c, col) => c.value === v && (k < 0 || col === k)))
    }
  } else {
    const line = valuesFor(spec.parity)
    for (let s = 0; s + spec.size <= line.length; s++) {
      for (const k of colors) {
        const slots: number[] = []
        const byColor: number[][] = []
        let mask = 0
        for (let j = 0; j < spec.size; j++) {
          const v = line[s + j]
          const m = pick((c, col) => c.value === v && (k < 0 || col === k))
          if (m === 0) continue
          mask |= m
          slots.push(m)
          if (spec.rainbow) byColor.push([0, 1, 2, 3].map((q) => pick((c, col) => c.value === v && col === q)))
        }
        if (spec.rainbow) add({ mask, top: rainbowCount(byColor, mask, spec.size >> 2), slots, byColor })
        else add({ mask, top: slots.length, slots, byColor: null })
      }
    }
  }
  return out.sort((a, b) => b.top - a.top)
}

/**
 * Places filled when each group holds n[g] natural cards and the Wilds go wherever they are allowed.
 * A group that allows Wilds can take one for every gap, but always keeps one place for a natural card.
 */
function filled(specs: readonly GroupSpec[], n: readonly number[], wilds: number): number {
  let naturals = 0
  let room = 0
  for (let g = 0; g < specs.length; g++) {
    naturals += n[g]
    if (!specs[g].noWild) room += Math.min(specs[g].size - n[g], specs[g].size - 1)
  }
  return naturals + Math.min(wilds, room)
}

/**
 * The most places that can be filled when cards are wanted by more than one group: a maximum flow from
 * the cards (and the Wilds) to the places. `fixed` holds the groups whose natural cards are already
 * decided (rainbow runs), which only take Wilds here.
 */
function shareOut(
  specs: readonly GroupSpec[],
  chosen: ReadonlyArray<Target | null>,
  available: number,
  fixed: ReadonlyArray<number | null>,
  wilds: number,
): number {
  // Nodes: 0 source, 1 sink, then whatever is added. Edges are stored in pairs (i and i ^ 1 are opposites).
  const head: number[] = [-1, -1]
  const to: number[] = []
  const cap: number[] = []
  const next: number[] = []
  const node = () => head.push(-1) - 1
  const edge = (a: number, b: number, c: number) => {
    to.push(b); cap.push(c); next.push(head[a]); head[a] = to.length - 1
    to.push(a); cap.push(0); next.push(head[b]); head[b] = to.length - 1
  }
  const cardNode = new Map<number, number>()
  const cardAt = (i: number) => {
    let id = cardNode.get(i)
    if (id === undefined) {
      id = node()
      cardNode.set(i, id)
      edge(0, id, 1)
    }
    return id
  }
  const feed = (mask: number, place: number) => {
    for (let m = mask & available; m !== 0; m &= m - 1) edge(cardAt(31 - Math.clz32(m & -m)), place, 1)
  }
  const pool = wilds > 0 ? node() : -1
  if (pool >= 0) edge(0, pool, wilds)
  let total = 0

  for (let g = 0; g < specs.length; g++) {
    const spec = specs[g]
    const t = chosen[g]
    // The Wilds this group may take: one for every place but one.
    const wild = pool >= 0 && !spec.noWild ? node() : -1
    if (wild >= 0) edge(pool, wild, spec.size - 1)
    const place = (c: number, mask: number) => {
      if (c <= 0) return
      const id = node()
      edge(id, 1, c)
      if (wild >= 0) edge(wild, id, c)
      if (mask !== 0) feed(mask, id)
    }
    const held = fixed[g]
    if (held !== null) {
      total += held
      place(spec.size - held, 0)
    } else if (!t) {
      place(spec.size, 0)
    } else if (t.slots) {
      for (const s of t.slots) place(1, s)
      place(spec.size - t.slots.length, 0) // numbers of the run the hand has no card for
    } else {
      place(spec.size, t.mask)
    }
  }

  const seen = new Uint8Array(head.length)
  const push = (u: number): boolean => {
    if (u === 1) return true
    seen[u] = 1
    for (let e = head[u]; e >= 0; e = next[e]) {
      if (cap[e] > 0 && !seen[to[e]] && push(to[e])) {
        cap[e]--
        cap[e ^ 1]++
        return true
      }
    }
    return false
  }
  for (;;) {
    seen.fill(0)
    if (!push(0)) break
    total++
  }
  return total
}

/** The most places these targets can fill between them. */
function evaluate(specs: readonly GroupSpec[], chosen: ReadonlyArray<Target | null>, wilds: number): number {
  let once = 0
  let twice = 0
  for (const t of chosen) {
    if (!t) continue
    twice |= once & t.mask
    once |= t.mask
  }
  if (twice === 0) return filled(specs, chosen.map((t) => (t ? t.top : 0)), wilds)

  // A rainbow run has a rule about colors that the matching cannot express, so every way of giving it the
  // cards it shares with another group is tried. Those are a card or two at most.
  const fixed: Array<number | null> = specs.map(() => null)
  let best = 0
  const rainbows = (g: number, available: number) => {
    if (g === specs.length) {
      best = Math.max(best, shareOut(specs, chosen, available, fixed, wilds))
      return
    }
    const t = chosen[g]
    if (!t || !t.byColor) {
      rainbows(g + 1, available)
      return
    }
    const shared = t.mask & twice & available
    const own = t.mask & ~twice
    // Every subset of the shared cards, the full set first.
    for (let sub = shared; ; sub = (sub - 1) & shared) {
      fixed[g] = countFor(specs[g], t, own | sub)
      rainbows(g + 1, available & ~(own | sub))
      if (sub === 0) break
    }
    fixed[g] = null
  }
  rainbows(0, once)
  return best
}

/** The most places of the phase that the hand can fill, Wilds included. */
function mostFilled(specs: readonly GroupSpec[], cards: readonly NumberCard[], wilds: number): number {
  const needed = specs.reduce((sum, g) => sum + g.size, 0)
  const colorOf = cards.map((c) => COLORS.indexOf(c.color))
  const lists = specs.map((spec) => targetsFor(spec, cards, colorOf))
  const tops = lists.map((l) => (l.length > 0 ? l[0].top : 0))
  // What the groups after g can add at the very most.
  const after = specs.map((_, g) => tops.slice(g + 1).reduce((a, b) => a + b, 0))

  const chosen: Array<Target | null> = specs.map(() => null)
  const at: number[] = specs.map(() => 0)
  const n: number[] = specs.map(() => 0)
  let best = filled(specs, n, wilds) // with no natural card placed at all

  const go = (g: number, union: number) => {
    if (best >= needed) return
    if (g === specs.length) {
      best = Math.max(best, evaluate(specs, chosen, wilds))
      return
    }
    const list = lists[g]
    // Two groups that ask for the same thing are interchangeable, so only look at them in one order.
    const from = g > 0 && sameSpec(specs[g - 1], specs[g]) ? at[g - 1] : 0
    for (let i = from; i <= list.length; i++) {
      const t = i < list.length ? list[i] : null // the last choice is to aim at nothing in hand
      // The targets are in order, so once one cannot beat the best neither can the rest.
      n[g] = t ? t.top : 0
      for (let h = g + 1; h < specs.length; h++) n[h] = tops[h]
      if (filled(specs, n, wilds) <= best) break
      // A card only counts once, however many groups want it.
      const u = union | (t ? t.mask : 0)
      if (bits(u) + after[g] + wilds <= best) continue
      chosen[g] = t
      at[g] = i
      go(g + 1, u)
      if (best >= needed) return
    }
    chosen[g] = null
  }
  go(0, 0)
  return Math.min(best, needed)
}

const cache = new Map<string, number>()
const CACHE_LIMIT = 20_000
const codeOf = new WeakMap<readonly GroupSpec[], string>()

/**
 * How many more cards are needed to complete the phase (0 means the hand can lay down now).
 * Skips are ignored. The answer is exact, and it is remembered, because the computer players ask
 * about the same hands again and again.
 */
export function phaseMissing(hand: readonly Card[], phaseIdx: number, set: PhaseSet = 'classic'): number {
  const specs = defsOf(set)[phaseIdx]?.groups
  if (!specs) return 0
  return missingFor(hand, specs)
}

/** The same for any list of groups. */
export function missingFor(hand: readonly Card[], specs: readonly GroupSpec[]): number {
  const cards: NumberCard[] = []
  let wilds = 0
  const tally = new Array<number>(4 * (MAX_VALUE + 1)).fill(0)
  for (const c of hand) {
    if (c.kind === 'wild') wilds++
    else if (c.kind === 'number' && cards.length < MAX_CARDS) {
      cards.push(c)
      tally[4 * c.value + COLORS.indexOf(c.color)]++
    }
  }
  let code = codeOf.get(specs)
  if (code === undefined) {
    code = encodeGroups(specs)
    codeOf.set(specs, code)
  }
  const key = `${code}|${wilds}|${tally.join('')}`
  const known = cache.get(key)
  if (known !== undefined) return known

  const needed = specs.reduce((sum, g) => sum + g.size, 0)
  const missing = needed - mostFilled(specs, cards, wilds)
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, missing)
  return missing
}
