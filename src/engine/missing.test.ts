// phaseMissing is exact. These tests check it against a slow search that shares none of its code:
// every way of dealing the natural cards of a hand into the groups, using the same rules that
// lay a phase down (buildGroup).

import { describe, expect, it } from 'vitest'
import { ALTERNATE_CANDIDATES, PHASES, buildDeck, buildGroup, decodeGroups, encodeGroups, findPhaseLayout, phaseMissing, shuffleWithSeed } from './index'
import type { Card, GroupSpec, PhaseSet } from './index'
import { num, nums, wild } from './testUtils'

/** The smallest number of cards to add before the phase can be laid down, found the slow way. */
function slowMissing(hand: readonly Card[], specs: readonly GroupSpec[]): number {
  const naturals = hand.filter((c) => c.kind === 'number')
  const wilds = hand.filter((c) => c.kind === 'wild').length
  const filler: Card = { id: -1, kind: 'wild' }
  // For each group, every handful of natural cards that could be part of it once the gaps are filled.
  const fits = specs.map((spec) => {
    const loose = { ...spec, noWild: false }
    const out: number[] = [0]
    for (let mask = 1; mask < 1 << naturals.length; mask++) {
      const cards = naturals.filter((_, i) => mask & (1 << i))
      if (cards.length > spec.size) continue
      const padded = [...cards, ...Array.from({ length: spec.size - cards.length }, () => filler)]
      if (buildGroup(loose, padded)) out.push(mask)
    }
    return out
  })
  const count = (m: number) => { let n = 0; for (; m; m &= m - 1) n++; return n }
  const needed = specs.reduce((sum, g) => sum + g.size, 0)
  let best = 0
  const go = (g: number, used: number, placed: number, room: number) => {
    if (g === specs.length) {
      best = Math.max(best, placed + Math.min(wilds, room))
      return
    }
    for (const mask of fits[g]) {
      if (mask & used) continue
      const n = count(mask)
      // A Wild can fill any gap in a group that allows them, but one place is always a natural card.
      const more = specs[g].noWild ? 0 : Math.min(specs[g].size - n, specs[g].size - 1)
      go(g + 1, used | mask, placed + n, room + more)
    }
  }
  go(0, 0, 0, 0)
  return needed - best
}

const CUSTOM = [
  's2c-s2c-s3', 's2cn-s3-s3', 'e4c-s3', 'o5cn-s2', 'k4-k4', 'k3-k3-s2', 'b4-s3n', 'b4-b4', 'b8-s2', 'b4-k3', 'b4-c4',
  'c4-c4', 'c5-s3', 'c3-c3-c3', 'c5-k3', 'r4n-s3', 'r4-s3n', 's3n-s3n', 'r5-r4', 'r3-r3-r3', 's2-s2-s2-s2-s2',
  's4-s3-s2', 'e3-o3-s2', 'r6n-s2c', 's3c-s3c', 'c7', 'r9', 'b8', 'k6n', 's5-s2n', 'e6-s2', 'o6n-c3',
]

function allPhases(): [PhaseSet, number, readonly GroupSpec[]][] {
  const out: [PhaseSet, number, readonly GroupSpec[]][] = []
  PHASES.forEach((p, i) => out.push(['classic', i, p.groups]))
  for (const c of ALTERNATE_CANDIDATES) out.push([`single:${encodeGroups(c.groups)}` as PhaseSet, 0, c.groups])
  for (const code of CUSTOM) out.push([`single:${code}` as PhaseSet, 0, decodeGroups(code)!])
  return out
}

/** Hands of different sizes, some heavy in Wilds, one color or one kind of number. */
function* hands(seed: number, rounds: number): Generator<Card[]> {
  let s = seed
  for (let r = 0; r < rounds; r++) {
    const sh = shuffleWithSeed(buildDeck(), s)
    s = sh.seed
    const deck = sh.items
    const numbers = deck.filter((c) => c.kind === 'number')
    const wilds = deck.filter((c) => c.kind === 'wild')
    yield deck.slice(0, 10)
    yield deck.slice(10, 21)
    yield deck.slice(21, 27)
    yield [...numbers.slice(0, 8), ...wilds.slice(0, 1 + (r % 3))]
    const reds = numbers.filter((c) => c.kind === 'number' && c.color === 'red').slice(0, 8)
    yield [...reds, ...numbers.filter((c) => !reds.includes(c)).slice(0, 2), ...wilds.slice(0, r % 2)]
    yield [...numbers.filter((c) => c.kind === 'number' && c.value % 2 === r % 2).slice(0, 9), ...wilds.slice(0, 2)]
    yield [...numbers.filter((c) => c.kind === 'number' && c.value <= 4 + (r % 5)).slice(0, 10), ...wilds.slice(0, 1)]
  }
}

const ROUNDS = 6

describe('phaseMissing is exact', () => {
  it('matches the slow search on every kind of phase', () => {
    const phases = allPhases()
    let checks = 0
    for (const hand of hands(7, ROUNDS)) {
      for (const [set, idx, specs] of phases) {
        expect(phaseMissing(hand, idx, set), `${set} with ${hand.map((c) => (c.kind === 'number' ? c.color[0] + c.value : c.kind[0])).join(' ')}`).toBe(slowMissing(hand, specs))
        checks++
      }
    }
    expect(checks).toBeGreaterThan(1000)
  }, 600_000)

  it('says 0 exactly when the hand can be laid down', () => {
    const phases = allPhases()
    let ready = 0
    for (const hand of hands(11, ROUNDS * 3)) {
      for (const [set, idx] of phases) {
        const layout = findPhaseLayout(hand, idx, [], set)
        expect(phaseMissing(hand, idx, set) === 0, `${set}`).toBe(layout !== null)
        if (layout) ready++
      }
    }
    expect(ready).toBeGreaterThan(50)
  }, 600_000)

  it('keeps one place in every group for a natural card', () => {
    // Two Wilds cannot be a set of 2 on their own, and a third Wild does not help.
    expect(phaseMissing([wild(), wild(), ...nums(1, 3)], 0, 'single:s2' as PhaseSet)).toBe(0)
    expect(phaseMissing([wild(), wild()], 0, 'single:s2' as PhaseSet)).toBe(1)
    expect(phaseMissing([wild(), wild(), wild(), wild(), num(5)], 0, 'single:s2-s2' as PhaseSet)).toBe(1)
  })

  it('shares a card two groups want the best way', () => {
    // The 5 can finish the set or the run, not both.
    const hand = [num(5, 'red'), num(5, 'blue'), ...nums(6, 7, 8)]
    expect(phaseMissing(hand, 0, 'single:s3-r4' as PhaseSet)).toBe(2)
    expect(phaseMissing([...hand, num(5, 'green')], 0, 'single:s3-r4' as PhaseSet)).toBe(1)
    expect(phaseMissing([...hand, num(5, 'green'), num(5, 'yellow')], 0, 'single:s3-r4' as PhaseSet)).toBe(0)
  })
})
