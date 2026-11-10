import { describe, expect, it } from 'vitest'
import { buildDeck, shuffleWithSeed } from './cards'
import {
  ALTERNATE_CANDIDATES,
  ALTERNATE_PHASES,
  PHASE_SETS,
  arrangeSelection,
  buildRainbow,
  buildRun,
  canHit,
  findPhaseLayout,
  hitMeld,
  matchPhase,
  phaseMissing,
  runEndsFor,
} from './phases'
import type { Meld, PhaseSet, RunBody } from './phases'
import { applyAction, createGame, nextRound, upgradeSavedState } from './game'
import type { GameState } from './game'
import { createBot } from './bot'
import { craftedGame, num, nums, wild } from './testUtils'

// Every candidate, by position in ALTERNATE_CANDIDATES.
;(PHASE_SETS as Record<string, unknown>).lab = ALTERNATE_CANDIDATES
const LAB = 'lab' as PhaseSet
const at = (text: string) => {
  const i = ALTERNATE_CANDIDATES.findIndex((p) => p.description === text)
  if (i < 0) throw new Error(`no candidate called ${text}`)
  return i
}
const meld = (body: RunBody): Meld & RunBody => ({ ...body, id: 1, owner: 0 })

describe('runs of evens and odds', () => {
  it('accepts consecutive evens or odds and nothing else', () => {
    expect(buildRun(nums(2, 4, 6, 8, 10), 5, { parity: 'even' })).toMatchObject({ start: 2, end: 10, step: 2 })
    expect(buildRun(nums(3, 5, 7, 9, 11), 5, { parity: 'odd' })).toMatchObject({ start: 3, end: 11, step: 2 })
    expect(buildRun(nums(2, 4, 5, 8, 10), 5, { parity: 'even' })).toBeNull()
    expect(buildRun(nums(2, 4, 6, 8, 12), 5, { parity: 'even' })).toBeNull() // 10 is missing
    expect(buildRun(nums(2, 2, 6, 8, 10), 5, { parity: 'even' })).toBeNull()
  })

  it('lets Wilds fill the gaps and the ends', () => {
    const body = buildRun([num(2), wild(), num(6), wild(), wild()], 5, { parity: 'even' })
    expect(body).toMatchObject({ start: 2, end: 10 })
    expect(buildRun([num(12), num(10), wild(), wild(), wild()], 5, { parity: 'even' })).toMatchObject({ start: 4, end: 12 })
  })

  it('a run of six evens is the only one there is, and nothing can be added to it', () => {
    const body = buildRun(nums(2, 4, 6, 8, 10, 12), 6, { parity: 'even' })!
    expect(body).toMatchObject({ start: 2, end: 12 })
    expect(runEndsFor(meld(body), num(2))).toEqual([])
    expect(canHit(body, wild())).toBe(false)
    expect(buildRun(nums(1, 3, 5, 7, 9, 11), 6, { parity: 'odd' })).toMatchObject({ start: 1, end: 11 })
    expect(buildRun([...nums(2, 4, 6, 8, 10, 12), wild()], 6, { parity: 'even' })).toBeNull() // too long
  })

  it('only takes the next number in steps of two', () => {
    const m = meld(buildRun(nums(4, 6, 8, 10, 12).slice(0, 4), 4, { parity: 'even' })!) // 4 to 10
    expect(canHit(m, num(12))).toBe(true)
    expect(canHit(m, num(2))).toBe(true)
    expect(canHit(m, num(11))).toBe(false)
    expect(canHit(m, num(3))).toBe(false)
    expect(hitMeld(m, num(12))).toBe(true)
    expect(m).toMatchObject({ start: 4, end: 12 })
    expect(hitMeld(m, num(2))).toBe(true)
    expect(m).toMatchObject({ start: 2, end: 12 })
    expect(canHit(m, wild())).toBe(false)
  })
})

describe('runs in one color', () => {
  it('needs every card to match', () => {
    const six = [1, 2, 3, 4, 5, 6].map((v) => num(v, 'blue'))
    expect(buildRun(six, 6, { sameColor: true })).toMatchObject({ color: 'blue', start: 1, end: 6 })
    expect(buildRun([...six.slice(0, 5), num(6, 'red')], 6, { sameColor: true })).toBeNull()
    expect(buildRun([...six.slice(0, 5), wild()], 6, { sameColor: true })).not.toBeNull()
  })

  it('only takes cards of its own color (or a Wild) at the ends', () => {
    const m = meld(buildRun([3, 4, 5, 6, 7, 8].map((v) => num(v, 'green')), 6, { sameColor: true })!)
    expect(canHit(m, num(9, 'green'))).toBe(true)
    expect(canHit(m, num(9, 'red'))).toBe(false)
    expect(canHit(m, num(2, 'green'))).toBe(true)
    expect(canHit(m, wild())).toBe(true)
  })
})

describe('run with two of each color', () => {
  const eight = () => [
    num(1, 'red'), num(2, 'red'), num(3, 'blue'), num(4, 'blue'),
    num(5, 'green'), num(6, 'green'), num(7, 'yellow'), num(8, 'yellow'),
  ]
  it('accepts exactly two of each color, in any arrangement', () => {
    expect(buildRainbow(eight(), 8)).toMatchObject({ start: 1, end: 8 })
    const shuffled = [num(1, 'red'), num(2, 'blue'), num(3, 'red'), num(4, 'green'), num(5, 'yellow'), num(6, 'blue'), num(7, 'green'), num(8, 'yellow')]
    expect(buildRainbow(shuffled, 8)).not.toBeNull()
  })
  it('rejects three of one color, and lets Wilds fill the missing ones', () => {
    const bad = eight()
    bad[7] = num(8, 'red')
    expect(buildRainbow(bad, 8)).toBeNull()
    const withWilds = [...eight().slice(0, 6), wild(), wild()]
    expect(buildRainbow(withWilds, 8)).not.toBeNull()
  })
  it('is a plain run afterwards, so any color can be added', () => {
    const m = meld(buildRainbow(eight(), 8)!)
    expect(m.kind === 'run' && m.color === undefined && m.step === undefined).toBe(true)
    expect(canHit(m, num(9, 'red'))).toBe(true)
  })
})

describe('a run of ten', () => {
  it('needs ten different numbers, and Wilds can fill in', () => {
    expect(buildRun(nums(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 10)).toMatchObject({ start: 1, end: 10 })
    expect(buildRun([...nums(1, 2, 3, 4, 5, 6, 7, 8, 9), wild()], 10)).not.toBeNull()
    expect(buildRun(nums(1, 2, 3, 4, 5, 6, 7, 8, 9, 9), 10)).toBeNull()
  })
})

describe('alternate phases', () => {
  it('has exactly ten, numbered one to ten', () => {
    expect(ALTERNATE_PHASES).toHaveLength(10)
    expect(ALTERNATE_PHASES.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('four pairs: four sets of two, in any order', () => {
    const p = at('4 sets of 2')
    const pairs = [[num(3), num(3, 'blue')], [num(7), wild()], [num(9), num(9, 'green')], [num(12), num(12, 'blue')]]
    expect(matchPhase(p, pairs, LAB)).not.toBeNull()
    expect(matchPhase(p, [pairs[0], pairs[1], pairs[2], [num(1), num(2)]], LAB)).toBeNull()
  })

  it('finds and arranges four pairs from a hand', () => {
    const p = at('4 sets of 2')
    const hand = [num(3), num(3, 'blue'), num(7), num(7, 'blue'), num(9), num(9, 'green'), num(12), num(12, 'blue'), num(1), num(5)]
    const layout = findPhaseLayout(hand, p, [], LAB)!
    expect(layout).toHaveLength(4)
    expect(layout.every((g) => g.length === 2)).toBe(true)
    const mixed = [...hand.slice(0, 8)].reverse()
    expect(arrangeSelection(mixed, p, LAB)).not.toBeNull()
    expect(arrangeSelection([...mixed.slice(0, 7), num(1)], p, LAB)).toBeNull()
    expect(phaseMissing(hand, p, LAB)).toBe(0)
    expect(phaseMissing([num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9), num(10)], p, LAB)).toBe(4)
  })

  it('three runs of three and two runs of four', () => {
    const three = at('3 runs of 3')
    const runs = [nums(1, 2, 3), nums(4, 5, 6), nums(1, 2, 3)]
    expect(matchPhase(three, runs, LAB)).not.toBeNull()
    expect(matchPhase(at('2 runs of 4'), [nums(1, 2, 3, 4), nums(9, 10, 11, 12)], LAB)).not.toBeNull()
    const hand = [...nums(1, 2, 3, 4, 5, 6, 7, 8, 9), num(12)]
    expect(findPhaseLayout(hand, three, [], LAB)).not.toBeNull()
    expect(phaseMissing(hand, three, LAB)).toBe(0)
  })

  it('five of one color plus a set of three needs the cards to be different ones', () => {
    const p = at('5 of one color + 1 set of 3')
    const reds = [num(1), num(2), num(3), num(4), num(5)]
    const set = [num(9, 'blue'), num(9, 'green'), num(9, 'yellow')]
    expect(matchPhase(p, [reds, set], LAB)).not.toBeNull()
    expect(phaseMissing([...reds, ...set], p, LAB)).toBe(0)
    // A hand that has only three nines and five reds in total, one red nine: still works using blue/green/yellow.
    expect(phaseMissing([...reds.slice(0, 4), num(9), num(9, 'blue'), num(9, 'green')], p, LAB)).toBe(1)
  })

  it('runs of evens plus a set', () => {
    const p = at('1 run of 5 evens + 1 set of 4')
    const hand = [...nums(2, 4, 6, 8, 10), num(7, 'blue'), num(7, 'green'), num(7, 'yellow'), wild(), num(1)]
    const layout = findPhaseLayout(hand, p, [], LAB)!
    expect(layout).not.toBeNull()
    expect(phaseMissing(hand, p, LAB)).toBe(0)
    expect(matchPhase(p, [layout[0], layout[1]], LAB)).not.toBeNull()
    expect(phaseMissing(nums(1, 3, 5, 7, 9, 11, 1, 3, 5, 7), p, LAB)).toBeGreaterThan(5)
  })
})

describe('the estimate agrees with the solver for every candidate', () => {
  const pools = [
    { name: 'full deck', keep: () => true },
    { name: 'low cards and Wilds', keep: (c: { kind: string; value?: number }) => c.kind === 'wild' || (c.kind === 'number' && (c.value ?? 99) <= 5) },
  ]
  for (const pool of pools) {
    it(`whenever a layout exists the estimate says 0 missing (${pool.name})`, () => {
      let seed = 777
      let layouts = 0
      for (let trial = 0; trial < 60; trial++) {
        const shuffled = shuffleWithSeed(buildDeck().filter(pool.keep), seed)
        seed = shuffled.seed
        const hand = shuffled.items.slice(0, 11)
        for (let p = 0; p < ALTERNATE_CANDIDATES.length; p++) {
          const layout = findPhaseLayout(hand, p, [], LAB)
          if (layout) {
            layouts++
            expect(phaseMissing(hand, p, LAB)).toBe(0)
            expect(matchPhase(p, layout, LAB)).not.toBeNull()
          }
        }
      }
      if (pool.name !== 'full deck') expect(layouts).toBeGreaterThan(0)
    })
  }
})

describe('a game using the alternate phases', () => {
  const players = [
    { name: 'Ann', isBot: false },
    { name: 'Bot A', isBot: true },
  ]

  it('defaults to the classic phases, and old saves are classic', () => {
    expect(createGame(players, 3).phaseSet).toBe('classic')
    const old = structuredClone(createGame(players, 3)) as unknown as Record<string, unknown>
    delete old.phaseSet
    expect(upgradeSavedState(old as unknown as GameState).phaseSet).toBe('classic')
  })

  it('checks laid down cards against the alternate phase', () => {
    const s = craftedGame(nums(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), { phase: 0 })
    s.phaseSet = 'alternate'
    const first = ALTERNATE_PHASES[0]
    expect(first.groups.length).toBeGreaterThan(0)
    // Whatever the first alternate phase is, a plain 1 to 3 is not enough for it.
    const r = applyAction(s, { type: 'layDown', groups: [[s.players[0].hand[0].id]] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(first.description)
  })

  it('bots can play whole rounds of every ordering, and games end', () => {
    for (const mode of ['classic', 'yousee', 'random', 'reverse'] as const) {
      let s = createGame(players, 21, mode, 'alternate')
      const bot = createBot('expert', () => 0.5)
      let steps = 0
      while (s.status !== 'gameOver' && steps++ < 20000) {
        if (s.status === 'roundOver') {
          s = nextRound(s)
          continue
        }
        const result = applyAction(s, bot.chooseAction(s))
        if (!result.ok) throw new Error(`${mode}: ${result.error}`)
        s = result.state
      }
      expect(s.status).toBe('gameOver')
      expect(s.winners.length).toBeGreaterThan(0)
    }
  })
})

describe('a run with no Wilds', () => {
  const p = () => ALTERNATE_CANDIDATES.findIndex((c) => c.description === '1 run of 7, no Wilds')

  it('cannot be laid down with a Wild, and the estimate does not count Wilds', () => {
    expect(matchPhase(p(), [nums(1, 2, 3, 4, 5, 6, 7)], LAB)).not.toBeNull()
    expect(matchPhase(p(), [[...nums(1, 2, 3, 4, 5, 6), wild()]], LAB)).toBeNull()
    expect(phaseMissing([...nums(1, 2, 3, 4, 5), wild(), wild()], p(), LAB)).toBe(2)
    expect(findPhaseLayout([...nums(1, 2, 3, 4, 5, 6), wild(), wild()], p(), [], LAB)).toBeNull()
    expect(arrangeSelection([...nums(1, 2, 3, 4, 5, 6), wild()], p(), LAB)).toBeNull()
  })

  it('is a plain run once it is down, so a Wild can be added', () => {
    const m = meld(buildRun(nums(1, 2, 3, 4, 5, 6, 7), 7)!)
    expect(canHit(m, wild())).toBe(true)
  })
})
