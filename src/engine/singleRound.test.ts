import { describe, expect, it } from 'vitest'
import {
  ALTERNATE_CANDIDATES,
  PHASES,
  decodeGroups,
  describeGroups,
  encodeGroups,
  groupsProblem,
  isPhaseSet,
  phaseDescription,
  phaseSize,
  phasesOf,
} from './phases'
import type { GroupSpec, PhaseSet } from './phases'
import { applyAction, createGame, nextRound, targetPhase } from './game'
import { createBot } from './bot'
import type { BotLevel } from './bot'

const g = (kind: GroupSpec['kind'], size: number, parity?: 'even' | 'odd'): GroupSpec =>
  parity ? { kind, size, parity } : { kind, size }

describe('phases as text', () => {
  it('round trips every known phase, and names it the way the lists do', () => {
    for (const def of [...PHASES, ...ALTERNATE_CANDIDATES]) {
      const code = encodeGroups(def.groups)
      expect(decodeGroups(code), code).toEqual(def.groups)
      expect(describeGroups(def.groups)).toBe(def.description)
    }
  })

  it('names phases that are not on any list', () => {
    expect(describeGroups([g('set', 5), g('run', 4)])).toBe('1 set of 5 + 1 run of 4')
    expect(describeGroups([g('set', 2), g('set', 2), g('run', 3)])).toBe('2 sets of 2 + 1 run of 3')
    expect(describeGroups([g('parity', 4, 'odd'), g('rainbow', 4)])).toBe('1 run of 4 odds + 1 rainbow run of 4')
    expect(describeGroups([g('colorRun', 4), g('colorRun', 4)])).toBe('2 runs of 4 (one color)')
    expect(describeGroups([g('color', 3), g('set', 3), g('set', 3)])).toBe('3 of one color + 2 sets of 3')
  })

  it('rejects phases that cannot be played', () => {
    expect(groupsProblem([])).not.toBeNull()
    expect(groupsProblem([g('set', 6), g('run', 5)])).toContain('10')
    expect(groupsProblem([g('parity', 7, 'even')])).toContain('6')
    expect(groupsProblem([g('rainbow', 6)])).toContain('multiple of 4')
    expect(groupsProblem([g('set', 1)])).not.toBeNull()
    expect(groupsProblem([g('set', 2), g('set', 2), g('set', 2), g('set', 2), g('set', 2)])).toBeNull()
    expect(groupsProblem(Array.from({ length: 6 }, () => g('set', 1)))).toContain('5')
    expect(groupsProblem([g('run', 10)])).toBeNull()
    expect(decodeGroups('s3-x4')).toBeNull()
    expect(decodeGroups('s30')).toBeNull()
    expect(decodeGroups('')).toBeNull()
  })

  it('recognizes phase sets, including single rounds', () => {
    expect(isPhaseSet('classic')).toBe(true)
    expect(isPhaseSet('alternate')).toBe(true)
    expect(isPhaseSet('single:s3-r4')).toBe(true)
    expect(isPhaseSet('single:nonsense')).toBe(false)
    expect(isPhaseSet('other')).toBe(false)
  })

  it('a single round fills every slot with the one phase', () => {
    const slots = phasesOf('single:s3-r4' as PhaseSet)
    expect(slots).toHaveLength(10)
    for (let i = 0; i < 10; i++) {
      expect(phaseDescription(i, 'single:s3-r4' as PhaseSet)).toBe('1 set of 3 + 1 run of 4')
      expect(phaseSize(i, 'single:s3-r4' as PhaseSet)).toBe(7)
    }
  })
})

describe('a single round game', () => {
  const players = [
    { name: 'Ann', isBot: true },
    { name: 'Bot A', isBot: true },
    { name: 'Bot B', isBot: true },
  ]

  it('starts everyone on the one phase', () => {
    const s = createGame(players, 5, 'single', 'single:s3-s3')
    for (const p of s.players) {
      expect(targetPhase(s, p)).toBe(9)
      expect(p.done.filter(Boolean)).toHaveLength(9)
    }
  })

  function play(code: string, level: BotLevel, seed: number) {
    let s = createGame(players, seed, 'single', `single:${code}` as PhaseSet)
    const bot = createBot(level, () => 0.5)
    let steps = 0
    while (s.status === 'playing' && steps++ < 20000) {
      const r = applyAction(s, bot.chooseAction(s))
      if (!r.ok) throw new Error(`${code}: ${r.error}`)
      s = r.state
    }
    return s
  }

  it('ends after one round, and whoever went out wins with zero points', () => {
    for (const code of ['s3-s3', 'r4-s3', 'k6', 'b8', 'p6', 'e5-s3', 'c7', 'r10', 's2-s2-s2-s2-s2', 'k2-r2-e2-s2-c2']) {
      for (const level of ['easy', 'expert'] as const) {
        const s = play(code, level, 11)
        expect(s.status, `${code} ${level}`).toBe('gameOver')
        expect(s.round).toBe(1)
        const winner = s.roundResult?.winner
        expect(winner).not.toBeNull()
        expect(s.winners).toEqual([winner])
        expect(s.players[winner as number].score).toBe(0)
        expect(s.players[winner as number].hand).toHaveLength(0)
        // Nobody else can finish with zero, so there is never a tiebreaker.
        expect(s.tieNext).toBeNull()
      }
    }
  })

  it('does not offer a next round', () => {
    const s = play('s3-s3', 'expert', 3)
    expect(nextRound(s)).toBe(s)
  })
})
