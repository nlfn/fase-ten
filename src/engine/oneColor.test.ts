import { describe, expect, it } from 'vitest'
import {
  arrangeSelection,
  buildDeck,
  buildGroup,
  canHit,
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
import { num, nums, wild } from './testUtils'

const spec = (kind: GroupSpec['kind'], size: number, extra: Partial<GroupSpec> = {}): GroupSpec => ({ kind, size, ...extra })
const setOf = (code: string) => `single:${code}` as PhaseSet

describe('a set in one color', () => {
  const pair = spec('set', 2, { oneColor: true })

  it('needs the same number and the same color', () => {
    expect(buildGroup(pair, [num(5, 'red'), num(5, 'red')])).toMatchObject({ kind: 'set', value: 5, color: 'red' })
    expect(buildGroup(pair, [num(5, 'red'), num(5, 'blue')])).toBeNull()
    expect(buildGroup(pair, [num(5, 'red'), num(6, 'red')])).toBeNull()
    expect(buildGroup(pair, [num(5, 'red'), wild()])).not.toBeNull()
    expect(buildGroup(spec('set', 3, { oneColor: true }), [num(5, 'red'), num(5, 'red'), wild()])).not.toBeNull()
  })

  it('only takes cards of its own color afterwards, and Wilds', () => {
    const body = buildGroup(pair, [num(5, 'red'), num(5, 'red')])!
    expect(canHit(body, num(5, 'red'))).toBe(true)
    expect(canHit(body, num(5, 'blue'))).toBe(false)
    expect(canHit(body, num(6, 'red'))).toBe(false)
    expect(canHit(body, wild())).toBe(true)
  })

  it('lays down as two matched pairs, whichever way they are picked', () => {
    const set = setOf('s2c-s2c')
    const hand = [num(5, 'red'), num(9, 'blue'), num(5, 'red'), num(9, 'blue')]
    expect(arrangeSelection(hand, 0, set)).not.toBeNull()
    expect(arrangeSelection([num(5, 'red'), num(5, 'blue'), num(9, 'blue'), num(9, 'blue')], 0, set)).toBeNull()
    expect(matchPhase(0, [[num(5, 'red'), num(5, 'red')], [num(9, 'blue'), num(9, 'blue')]], set)).not.toBeNull()
  })

  it('is counted exactly by the estimate', () => {
    const set = setOf('s2c-s3')
    // Two red 5s are the pair, three 8s of mixed colors are the set.
    expect(phaseMissing([num(5, 'red'), num(5, 'red'), num(8, 'red'), num(8, 'blue'), num(8, 'green')], 0, set)).toBe(0)
    // 5 red and 5 blue are the same number but not a matched pair.
    expect(phaseMissing([num(5, 'red'), num(5, 'blue'), num(8, 'red'), num(8, 'blue'), num(8, 'green')], 0, set)).toBe(1)
  })
})

describe('a run of evens or odds in one color', () => {
  it('needs one color and steps by two', () => {
    const evens = spec('parity', 4, { parity: 'even', oneColor: true })
    const body = buildGroup(evens, [num(2, 'red'), num(4, 'red'), num(6, 'red'), num(8, 'red')])!
    expect(body).toMatchObject({ kind: 'run', step: 2, color: 'red' })
    expect(buildGroup(evens, [num(2, 'red'), num(4, 'blue'), num(6, 'red'), num(8, 'red')])).toBeNull()
    expect(canHit(body, num(10, 'red'))).toBe(true)
    expect(canHit(body, num(10, 'blue'))).toBe(false)
  })
})

describe('phase codes with one color', () => {
  it('round trips, and a plain run in one color is a color run', () => {
    expect(encodeGroups(decodeGroups('s2c-e4cn')!)).toBe('s2c-e4cn')
    expect(decodeGroups('r4c')).toEqual([spec('colorRun', 4)])
    expect(encodeGroups(decodeGroups('r4c')!)).toBe('k4')
    expect(decodeGroups('s2cn')).toEqual([spec('set', 2, { oneColor: true, noWild: true })])
  })

  it('refuses nonsense', () => {
    expect(decodeGroups('b4c')).toBeNull()
    expect(decodeGroups('k4c')).toBeNull()
    expect(decodeGroups('c5c')).toBeNull()
    expect(groupsProblem([spec('rainbow', 4, { oneColor: true })])).toContain('rainbow')
    expect(groupsProblem([spec('set', 3, { oneColor: true, noWild: true })])).toContain('2')
    expect(groupsProblem([spec('set', 2, { oneColor: true, noWild: true })])).toBeNull()
    expect(groupsProblem([spec('set', 3, { oneColor: true })])).toBeNull()
  })

  it('names them with the modifiers in one set of parentheses', () => {
    expect(describeGroups([spec('set', 2, { oneColor: true }), spec('set', 2, { oneColor: true })])).toBe('2 sets of 2 (one color)')
    expect(describeGroups([spec('parity', 6, { parity: 'even', oneColor: true, noWild: true })])).toBe('1 run of 6 evens (one color, no wilds)')
    expect(describeGroups([spec('set', 2, { oneColor: true }), spec('set', 3)])).toBe('1 set of 2 (one color) + 1 set of 3')
    expect(describeGroups([spec('run', 6, { noWild: true })])).toBe('1 run of 6 (no wilds)')
  })
})

describe('estimate against solver with one color mixed in', () => {
  const codes = ['s2c-s2c', 's2c-s3', 'e3c-s3', 'o4c-s2', 's3c-k3', 's2c-s2c-s2c-s2c', 's2c-e3c-s2', 'e2c-o2c-s2c-s2-s2', 's2cn-s3n']
  it('says 0 missing whenever a layout exists', () => {
    let seed = 41
    let layouts = 0
    for (let trial = 0; trial < 120; trial++) {
      const shuffled = shuffleWithSeed(
        buildDeck().filter((c) => trial % 2 === 0 || c.kind === 'wild' || (c.kind === 'number' && c.value <= 6)),
        seed,
      )
      seed = shuffled.seed
      const hand = shuffled.items.slice(0, 11)
      for (const code of codes) {
        const set = setOf(code)
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

  it('the estimate for a short hand is never more than the true shortfall (no Wild closes a gap it cannot)', () => {
    // A hand of low cards cannot become a one-color evens run of 4 with only 3 evens in one color, a Wild fills the 4th.
    const set = setOf('e4c')
    expect(phaseMissing([num(2, 'red'), num(4, 'red'), num(6, 'red'), num(8, 'blue')], 0, set)).toBe(1)
    expect(phaseMissing([num(2, 'red'), num(4, 'red'), num(6, 'red'), wild()], 0, set)).toBe(0)
    expect(phaseMissing([...nums(2, 4, 6, 8)], 0, set)).toBeLessThanOrEqual(3)
  })
})

describe('bots play single rounds with one color groups', () => {
  const players = [
    { name: 'Ann', isBot: true },
    { name: 'Bot A', isBot: true },
    { name: 'Bot B', isBot: true },
  ]
  for (const code of ['s2c-s2c-s2c', 'e4c-s3', 'o3c-s2c-s2', 's3c-r4', 'e2c-o2c-s2-s2-s2', 's2cn-s3']) {
    it(`finishes ${code}`, () => {
      let s = createGame(players, 33, 'single', setOf(code))
      const bot = createBot('expert', () => 0.5)
      let steps = 0
      while (s.status === 'playing' && steps++ < 60000) {
        const r = applyAction(s, bot.chooseAction(s))
        if (!r.ok) throw new Error(`${code}: ${r.error}`)
        s = r.state
      }
      expect(s.status, code).toBe('gameOver')
      expect(s.players[s.winners[0]].score).toBe(0)
    })
  }
})
