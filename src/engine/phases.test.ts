import { describe, expect, it } from 'vitest'
import { buildDeck, shuffleWithSeed } from './cards'
import type { Card } from './cards'
import {
  PHASES,
  arrangeSelection,
  buildColor,
  buildRun,
  buildSet,
  canHit,
  findPhaseLayout,
  hitMeld,
  matchPhase,
  phaseMissing,
} from './phases'
import type { Meld } from './phases'
import { num, nums, skip, wild } from './testUtils'

describe('buildSet', () => {
  it('accepts matching numbers of any color', () => {
    const body = buildSet([num(5, 'red'), num(5, 'blue'), num(5, 'green')], 3)
    expect(body?.value).toBe(5)
  })
  it('lets Wilds stand in', () => {
    expect(buildSet([num(7), wild(), wild()], 3)?.value).toBe(7)
  })
  it('rejects mixed numbers, too few cards, Skips, and all-Wild groups', () => {
    expect(buildSet([num(5), num(5), num(6)], 3)).toBeNull()
    expect(buildSet([num(5), num(5)], 3)).toBeNull()
    expect(buildSet([num(5), num(5), skip()], 3)).toBeNull()
    expect(buildSet([wild(), wild(), wild()], 3)).toBeNull()
  })
  it('accepts more cards than the minimum', () => {
    expect(buildSet(nums(4, 4, 4, 4), 3)).not.toBeNull()
  })
})

describe('buildRun', () => {
  it('accepts consecutive numbers in any order and any colors', () => {
    const body = buildRun([num(6, 'blue'), num(3), num(5, 'green'), num(4, 'yellow')], 4)
    expect(body).toMatchObject({ start: 3, end: 6 })
    expect(body?.cards.map((c) => (c.kind === 'number' ? c.value : 0))).toEqual([3, 4, 5, 6])
  })
  it('puts Wilds in the gaps', () => {
    const w = wild()
    const body = buildRun([num(3), num(5), num(6), w], 4)
    expect(body).toMatchObject({ start: 3, end: 6 })
    expect(body?.cards[1]).toBe(w)
  })
  it('extends upward with spare Wilds, then downward at the top', () => {
    expect(buildRun([num(4), num(5), num(6), wild()], 4)).toMatchObject({ start: 4, end: 7 })
    expect(buildRun([num(10), num(11), num(12), wild()], 4)).toMatchObject({ start: 9, end: 12 })
  })
  it('rejects duplicates, gaps too big for the Wilds, and Skips', () => {
    expect(buildRun([num(3), num(3), num(4), num(5)], 4)).toBeNull()
    expect(buildRun([num(3), num(7), num(8), wild()], 4)).toBeNull()
    expect(buildRun([num(3), num(4), num(5), skip()], 4)).toBeNull()
  })
  it('does not wrap around from 12 to 1', () => {
    expect(buildRun([num(11), num(12), num(1), num(2)], 4)).toBeNull()
  })
  it('rejects a run that would need to go past 12', () => {
    expect(buildRun([num(11), num(12), wild(), wild()], 4)).toMatchObject({ start: 9, end: 12 })
    expect(buildRun([num(1), num(12), ...Array.from({ length: 9 }, wild)], 11)).toBeNull()
  })
  it('requires at least one natural card', () => {
    expect(buildRun([wild(), wild(), wild(), wild()], 4)).toBeNull()
  })
})

describe('buildColor', () => {
  it('accepts one color with Wilds', () => {
    const cards = [...nums(1, 3, 5, 7, 9, 11), wild()]
    expect(buildColor(cards, 7)?.color).toBe('red')
  })
  it('rejects two colors', () => {
    const cards = [...nums(1, 3, 5, 7, 9, 11), num(2, 'blue')]
    expect(buildColor(cards, 7)).toBeNull()
  })
})

describe('matchPhase', () => {
  it('Phase 1: two sets of 3', () => {
    const groups = [nums(5, 5, 5), nums(9, 9, 9)]
    expect(matchPhase(0, groups)).toHaveLength(2)
    expect(matchPhase(0, [nums(5, 5, 5), nums(9, 9, 8)])).toBeNull()
  })
  it('Phase 2: set of 3 + run of 4, groups in either order', () => {
    const set = nums(8, 8, 8)
    const runCards = nums(1, 2, 3, 4)
    expect(matchPhase(1, [set, runCards])).toHaveLength(2)
    const swapped = matchPhase(1, [runCards, set])
    expect(swapped?.map((b) => b.kind)).toEqual(['run', 'set'])
  })
  it('Phase 9: set of 5 + set of 2, in either order', () => {
    expect(matchPhase(8, [nums(4, 4, 4, 4, 4), nums(7, 7)])).toHaveLength(2)
    expect(matchPhase(8, [nums(7, 7), nums(4, 4, 4, 4, 4)])).toHaveLength(2)
    expect(matchPhase(8, [nums(4, 4, 4, 4), nums(7, 7, 7)])).toBeNull()
  })
  it('rejects the wrong number of groups', () => {
    expect(matchPhase(0, [nums(5, 5, 5)])).toBeNull()
  })
})

describe('hitting', () => {
  const meld = <T extends Meld>(m: T): T => m

  it('sets take the same number or a Wild', () => {
    const body = buildSet(nums(5, 5, 5), 3)!
    expect(canHit(body, num(5, 'blue'))).toBe(true)
    expect(canHit(body, wild())).toBe(true)
    expect(canHit(body, num(6))).toBe(false)
    expect(canHit(body, skip())).toBe(false)
  })

  it('runs extend at either end', () => {
    const body = buildRun(nums(4, 5, 6, 7), 4)!
    const m = meld({ ...body, id: 1, owner: 0 })
    expect(canHit(m, num(3))).toBe(true)
    expect(canHit(m, num(8))).toBe(true)
    expect(canHit(m, num(9))).toBe(false)
    expect(canHit(m, num(5))).toBe(false)

    expect(hitMeld(m, num(8))).toBe(true)
    expect(m).toMatchObject({ start: 4, end: 8 })
    expect(hitMeld(m, num(3))).toBe(true)
    expect(m).toMatchObject({ start: 3, end: 8 })
    expect(m.cards).toHaveLength(6)
  })

  it('a Wild can go on either end, chosen by the player', () => {
    const body = buildRun(nums(4, 5, 6, 7), 4)!
    const low = { ...body, cards: body.cards.slice(), id: 1, owner: 0 }
    const high = { ...body, cards: body.cards.slice(), id: 2, owner: 0 }
    expect(hitMeld(low, wild(), 'low')).toBe(true)
    expect(low).toMatchObject({ start: 3, end: 7 })
    expect(hitMeld(high, wild(), 'high')).toBe(true)
    expect(high).toMatchObject({ start: 4, end: 8 })
  })

  it('a run ending at 12 cannot go higher, and one starting at 1 cannot go lower', () => {
    const top = { ...buildRun(nums(9, 10, 11, 12), 4)!, id: 1, owner: 0 }
    expect(canHit(top, wild(), 'high')).toBe(false)
    expect(canHit(top, wild(), 'low')).toBe(true)
    const bottom = { ...buildRun(nums(1, 2, 3, 4), 4)!, id: 2, owner: 0 }
    expect(canHit(bottom, wild(), 'low')).toBe(false)
    expect(canHit(bottom, num(5))).toBe(true)
  })

  it('a failed hit changes nothing', () => {
    const m = { ...buildSet(nums(5, 5, 5), 3)!, id: 1, owner: 0 }
    expect(hitMeld(m, num(9))).toBe(false)
    expect(m.cards).toHaveLength(3)
  })

  it('color groups take that color or a Wild', () => {
    const body = buildColor([...nums(1, 2, 3, 4, 5, 6, 7)], 7)!
    expect(canHit(body, num(12, 'red'))).toBe(true)
    expect(canHit(body, num(12, 'blue'))).toBe(false)
    expect(canHit(body, wild())).toBe(true)
  })
})

describe('findPhaseLayout', () => {
  it('keeps the pair that leaves a card to add (phase 9: 1s with a Wild, then 3s rather than 5s)', () => {
    const hand = [
      ...[1, 1, 1, 1].map((v) => num(v)),
      ...[3, 3, 3].map((v) => num(v, 'blue')),
      ...[5, 5].map((v) => num(v, 'green')),
      wild(),
    ]
    const layout = findPhaseLayout(hand, 8)!
    const values = layout.map((g) => g.filter((c) => c.kind === 'number').map((c) => (c as { value: number }).value))
    expect(values.flat().filter((v) => v === 3)).toHaveLength(2)
    expect(values.flat().filter((v) => v === 5)).toHaveLength(0)
  })

  it('finds two sets of 3 and leaves the rest', () => {
    const hand: Card[] = [...nums(5, 5, 5, 9, 9, 9), num(1), num(2), num(12), skip()]
    const layout = findPhaseLayout(hand, 0)
    expect(layout).not.toBeNull()
    expect(matchPhase(0, layout!)).not.toBeNull()
    expect(layout!.flat()).toHaveLength(6)
  })

  it('does not spend Wilds when natural cards will do', () => {
    const hand: Card[] = [...nums(5, 5, 5, 9, 9, 9), wild(), wild(), num(1)]
    const layout = findPhaseLayout(hand, 0)!
    expect(layout.flat().some((c) => c.kind === 'wild')).toBe(false)
  })

  it('uses Wilds when it has to', () => {
    const hand: Card[] = [...nums(5, 5, 9, 9, 9), wild(), num(1), num(2), num(12)]
    const layout = findPhaseLayout(hand, 0)!
    expect(layout.flat().filter((c) => c.kind === 'wild')).toHaveLength(1)
  })

  it('finds a run of 7 with a Wild in the gap (Phase 4)', () => {
    const hand: Card[] = [...nums(3, 4, 5, 7, 8, 9), wild(), num(12), num(12), skip()]
    const layout = findPhaseLayout(hand, 3)
    expect(layout).not.toBeNull()
    expect(matchPhase(3, layout!)).not.toBeNull()
  })

  it('finds 7 cards of one color (Phase 8)', () => {
    const hand: Card[] = [
      ...[1, 2, 3, 4, 5, 6].map((v) => num(v, 'blue')),
      wild(),
      num(9, 'red'),
      num(9, 'green'),
      skip(),
    ]
    expect(findPhaseLayout(hand, 7)).not.toBeNull()
  })

  it('finds a set plus a run that do not share cards (Phase 2)', () => {
    const hand: Card[] = [...nums(8, 8, 8, 1, 2, 3, 4), num(11), num(12), skip()]
    const layout = findPhaseLayout(hand, 1)!
    expect(new Set(layout.flat().map((c) => c.id)).size).toBe(7)
  })

  it('returns null when the phase is not possible', () => {
    const hand: Card[] = [...nums(1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10)]
    expect(findPhaseLayout(hand, 0)).toBeNull()
  })

  it('never uses Skip cards', () => {
    const hand: Card[] = [...nums(5, 5, 9, 9, 9), skip(), skip(), num(1)]
    expect(findPhaseLayout(hand, 0)).toBeNull()
  })
})

describe('arrangeSelection', () => {
  it('splits a mixed-up selection into the two groups (Phase 1)', () => {
    const cards = [num(9), num(5), num(9), num(5), num(9), num(5)]
    const groups = arrangeSelection(cards, 0)
    expect(groups).not.toBeNull()
    expect(groups!.map((g) => g.length).sort()).toEqual([3, 3])
  })
  it('handles a set plus a run (Phase 2)', () => {
    const cards = [num(3), num(8), num(1), num(8), num(2), num(8), num(4)]
    const groups = arrangeSelection(cards, 1)
    expect(groups).not.toBeNull()
    expect(matchPhase(1, groups!)).not.toBeNull()
  })
  it('handles a single group (Phase 4)', () => {
    expect(arrangeSelection(nums(1, 2, 3, 4, 5, 6, 7), 3)).toHaveLength(1)
    expect(arrangeSelection(nums(1, 2, 3, 4, 5, 6, 9), 3)).toBeNull()
  })
  it('rejects selections that do not make the phase, or are empty', () => {
    expect(arrangeSelection(nums(5, 5, 5, 9, 9, 8), 0)).toBeNull()
    expect(arrangeSelection([], 0)).toBeNull()
  })
  it('accepts a bigger set than the minimum (Phase 9: 5 + 2)', () => {
    expect(arrangeSelection(nums(4, 4, 4, 4, 4, 7, 7), 8)).not.toBeNull()
  })
})

describe('phaseMissing', () => {
  it('is 0 when the phase can be laid down', () => {
    expect(phaseMissing([...nums(5, 5, 5, 9, 9, 9), num(1), num(2)], 0)).toBe(0)
  })
  it('counts the cards still needed', () => {
    expect(phaseMissing([...nums(5, 5, 9, 9, 1, 2, 3, 12)], 0)).toBe(2)
  })
  it('lets Wilds cover the gap', () => {
    expect(phaseMissing([...nums(5, 5, 9, 9), wild()], 0)).toBe(1)
  })
  it('works for runs and color groups', () => {
    expect(phaseMissing(nums(1, 2, 3, 4, 5, 6), 3)).toBe(1)
    expect(phaseMissing([...nums(1, 2, 3), num(4, 'blue')], 7)).toBe(4)
  })
  it('is never negative and never above the phase size', () => {
    for (let p = 0; p < PHASES.length; p++) {
      const total = PHASES[p].groups.reduce((s, g) => s + g.size, 0)
      const m = phaseMissing([skip()], p)
      expect(m).toBe(total)
      expect(phaseMissing([wild(), wild(), wild()], p)).toBeLessThanOrEqual(total)
    }
  })
})

describe('solver agrees with the estimate', () => {
  // Random hands from the full deck rarely make a phase, so also draw from a
  // pool of low cards and Wilds, where sets and short runs are common.
  const pools: Array<{ name: string; keep: (c: Card) => boolean }> = [
    { name: 'full deck', keep: () => true },
    { name: 'low cards and Wilds', keep: (c) => c.kind === 'wild' || (c.kind === 'number' && c.value <= 4) },
  ]

  for (const pool of pools) {
    it(`whenever a layout exists the estimate says 0 missing (${pool.name})`, () => {
      let seed = 12345
      let layouts = 0
      for (let trial = 0; trial < 80; trial++) {
        const shuffled = shuffleWithSeed(buildDeck().filter(pool.keep), seed)
        seed = shuffled.seed
        const hand = shuffled.items.slice(0, 11)
        for (let p = 0; p < PHASES.length; p++) {
          const layout = findPhaseLayout(hand, p)
          if (layout) {
            layouts++
            expect(phaseMissing(hand, p)).toBe(0)
            expect(matchPhase(p, layout)).not.toBeNull()
          }
        }
      }
      if (pool.name !== 'full deck') expect(layouts).toBeGreaterThan(0)
    })
  }
})
