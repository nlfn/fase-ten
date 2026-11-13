import { describe, expect, it } from 'vitest'
import {
  arrangeSelection,
  buildGroup,
  buildDeck,
  decodeGroups,
  describeGroups,
  encodeGroups,
  findPhaseLayout,
  groupsProblem,
  matchPhase,
  phaseMissing,
  shuffleWithSeed,
} from './index'
import type { GroupSpec, PhaseSet } from './index'
import { applyAction, createGame } from './game'
import { createBot } from './bot'
import { nums, num, wild } from './testUtils'

const SET = 'single:s3-r4n' as PhaseSet // a set that takes Wilds, and a run that does not

describe('no Wilds on one group of a phase', () => {
  it('rejects a Wild in that group only', () => {
    expect(buildGroup({ kind: 'run', size: 4, noWild: true }, nums(1, 2, 3, 4))).not.toBeNull()
    expect(buildGroup({ kind: 'run', size: 4, noWild: true }, [...nums(1, 2, 3), wild()])).toBeNull()
    expect(buildGroup({ kind: 'run', size: 4 }, [...nums(1, 2, 3), wild()])).not.toBeNull()
    expect(buildGroup({ kind: 'set', size: 3, noWild: true }, [num(5), num(5), wild()])).toBeNull()
    expect(buildGroup({ kind: 'rainbow', size: 4, noWild: true }, [num(1, 'red'), num(2, 'blue'), num(3, 'green'), wild()])).toBeNull()
  })

  it('lays down with a Wild in the set but never in the run', () => {
    expect(matchPhase(0, [[num(5), num(5), wild()], nums(1, 2, 3, 4)], SET)).not.toBeNull()
    expect(matchPhase(0, [[num(5), num(5), num(5)], [...nums(1, 2, 3), wild()]], SET)).toBeNull()
    expect(arrangeSelection([num(5), num(5), wild(), ...nums(1, 2, 3, 4)], 0, SET)).not.toBeNull()
    expect(arrangeSelection([num(5), num(5), num(5), ...nums(1, 2, 3), wild()], 0, SET)).toBeNull()
  })

  it('the solver spends Wilds only where they are allowed', () => {
    const layout = findPhaseLayout([num(5), num(5), wild(), ...nums(1, 2, 3, 4), wild()], 0, [], SET)!
    expect(layout).not.toBeNull()
    const runGroup = layout.find((g) => g.some((c) => c.kind === 'number' && c.value === 1))!
    expect(runGroup.some((c) => c.kind === 'wild')).toBe(false)
    expect(findPhaseLayout([num(5), num(5), num(5), ...nums(1, 2, 3), wild(), wild()], 0, [], SET)).toBeNull()
  })

  it('the estimate does not let Wilds close a gap in the strict group', () => {
    expect(phaseMissing([num(5), num(5), num(5), ...nums(1, 2, 3), wild(), wild()], 0, SET)).toBe(1)
    expect(phaseMissing([num(5), num(5), ...nums(1, 2, 3, 4), wild()], 0, SET)).toBe(0)
    expect(phaseMissing([num(5), ...nums(1, 2, 3), wild(), wild()], 0, SET)).toBe(1)
    // With Wilds allowed everywhere the same hands are one card closer.
    expect(phaseMissing([num(5), num(5), num(5), ...nums(1, 2, 3), wild(), wild()], 0, 'single:s3-r4' as PhaseSet)).toBe(0)
  })

  it('every group strict is the old run with no Wilds', () => {
    const all = 'single:s3n-r4n' as PhaseSet
    expect(phaseMissing([num(5), num(5), wild(), ...nums(1, 2, 3, 4)], 0, all)).toBe(1)
  })
})

describe('phase codes with no Wilds', () => {
  const g = (kind: GroupSpec['kind'], size: number, noWild = false): GroupSpec => (noWild ? { kind, size, noWild } : { kind, size })

  it('round trips, and the first single round codes still work', () => {
    const groups = [g('set', 3), g('run', 3, true), g('rainbow', 4, true)]
    expect(encodeGroups(groups)).toBe('s3-r3n-b4n')
    expect(decodeGroups('s3-r3n-b4n')).toEqual(groups)
    expect(decodeGroups('p6')).toEqual([g('run', 6, true)])
  })

  it('names it', () => {
    expect(describeGroups([g('set', 3, true), g('set', 3, true)])).toBe('2 sets of 3 (no wilds)')
    expect(describeGroups([g('set', 3), g('run', 4, true)])).toBe('1 set of 3 + 1 run of 4 (no wilds)')
    expect(describeGroups([g('run', 6, true)])).toBe('1 run of 6 (no wilds)')
    expect(describeGroups([g('color', 4, true), g('set', 3)])).toBe('4 cards (one color, no wilds) + 1 set of 3')
  })

  it('a set with no Wilds cannot be bigger than the 8 copies there are', () => {
    expect(groupsProblem([g('set', 8, true)])).toBeNull()
    expect(groupsProblem([g('set', 9, true)])).toContain('8')
    expect(groupsProblem([g('set', 9)])).toBeNull()
  })
})

describe('estimate against solver with no Wilds mixed in', () => {
  const codes = ['s3-s3n', 'k5n-s2', 'b4n-s3', 'c4n-s3', 'e4n-s3', 's4n-r4n', 'r5-s2n', 'e2-o2-s2-s2-s2', 'b4-s2-s2-s2', 's3-r3-s2-s2', 'o2-e2-k2-s2n-s2']
  it('says 0 missing whenever a layout exists', () => {
    let seed = 99
    let layouts = 0
    for (let trial = 0; trial < 80; trial++) {
      const shuffled = shuffleWithSeed(
        buildDeck().filter((c) => trial % 2 === 0 || c.kind === 'wild' || (c.kind === 'number' && c.value <= 6)),
        seed,
      )
      seed = shuffled.seed
      const hand = shuffled.items.slice(0, 11)
      for (const code of codes) {
        const set = `single:${code}` as PhaseSet
        const layout = findPhaseLayout(hand, 0, [], set)
        if (layout) {
          layouts++
          expect(phaseMissing(hand, 0, set), code).toBe(0)
          expect(matchPhase(0, layout, set), code).not.toBeNull()
        }
      }
    }
    expect(layouts).toBeGreaterThan(0)
  })
})

describe('bots play single rounds with no Wilds on some groups', () => {
  const players = [
    { name: 'Ann', isBot: true },
    { name: 'Bot A', isBot: true },
    { name: 'Bot B', isBot: true },
  ]
  for (const code of ['s3-r4n', 's5n-r3', 'b8n', 'k4n-s2', 'c5n-s3n']) {
    it(`finishes ${code}`, () => {
      let s = createGame(players, 21, 'single', `single:${code}` as PhaseSet)
      const bot = createBot('expert', () => 0.5)
      let steps = 0
      while (s.status === 'playing' && steps++ < 30000) {
        const r = applyAction(s, bot.chooseAction(s))
        if (!r.ok) throw new Error(`${code}: ${r.error}`)
        s = r.state
      }
      expect(s.status).toBe('gameOver')
      expect(s.players[s.winners[0]].score).toBe(0)
    })
  }
})
