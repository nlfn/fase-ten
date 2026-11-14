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
import { group } from './testUtils'
import type { GroupName } from './testUtils'
import { applyAction, createGame, isSingleRound, nextRound, targetPhase } from './game'
import { createBot } from './bot'
import type { BotLevel } from './bot'
import type { GameMode, PlayerSetup } from './game'

const g = (kind: GroupName, size: number, parity?: 'even' | 'odd'): GroupSpec => group(kind, size, parity ? { parity } : {})

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

  it('a single round is a list of one phase', () => {
    const list = phasesOf('single:s3-r4' as PhaseSet)
    expect(list).toHaveLength(1)
    expect(phaseDescription(0, 'single:s3-r4' as PhaseSet)).toBe('1 set of 3 + 1 run of 4')
    expect(phaseSize(0, 'single:s3-r4' as PhaseSet)).toBe(7)
    expect(isPhaseSet('single:s3-r4,s3')).toBe(false) // one phase only
  })

  it('a list can be any length', () => {
    const set = 'list:s3-s3,r7,c7' as PhaseSet
    expect(isPhaseSet(set)).toBe(true)
    expect(phasesOf(set).map((p) => p.description)).toEqual(['2 sets of 3', '1 run of 7', '7 cards of one color'])
    expect(phasesOf(set).map((p) => p.number)).toEqual([1, 2, 3])
    expect(isPhaseSet('list:s3-s3,x9')).toBe(false)
    expect(isPhaseSet('list:')).toBe(false)
  })
})

describe('a single round game', () => {
  const players = [
    { name: 'Ann', isBot: true },
    { name: 'Bot A', isBot: true },
    { name: 'Bot B', isBot: true },
  ]

  it('starts everyone on the one phase', () => {
    const s = createGame(players, 5, 'classic', 'single:s3-s3')
    expect(isSingleRound(s)).toBe(true)
    for (const [i, p] of s.players.entries()) {
      // A single round is a list of one phase, with nothing marked done to get there.
      expect(targetPhase(s, i)).toBe(0)
      expect(p.done).toEqual([false])
      expect(p.route).toEqual([0])
    }
  })

  function play(code: string, level: BotLevel, seed: number) {
    let s = createGame(players, seed, 'classic', `single:${code}` as PhaseSet)
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

describe('games of any length', () => {
  const players: PlayerSetup[] = [
    { name: 'Bot A', isBot: true },
    { name: 'Bot B', isBot: true },
    { name: 'Bot C', isBot: true },
  ]

  function playOut(mode: GameMode, set: PhaseSet, seed: number) {
    let s = createGame(players, seed, mode, set)
    const bot = createBot('expert', () => 0.5)
    let steps = 0
    while (s.status !== 'gameOver' && steps++ < 60000) {
      if (s.status === 'roundOver') {
        s = nextRound(s)
        continue
      }
      const r = applyAction(s, bot.chooseAction(s))
      if (!r.ok) throw new Error(`${set} ${mode}: ${r.error}`)
      s = r.state
    }
    return s
  }

  it('a three phase game ends when someone has done all three, in every ordering', () => {
    const set = 'list:s3-s3,r7,c7' as PhaseSet
    for (const mode of ['classic', 'yousee', 'random', 'reverse'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = playOut(mode, set, seed)
        expect(s.status).toBe('gameOver')
        expect(s.round).toBeGreaterThanOrEqual(3)
        for (const p of s.players) {
          expect(p.done).toHaveLength(3)
          expect([...p.route].sort()).toEqual([0, 1, 2])
        }
        for (const w of s.winners) expect(s.players[w].done.every(Boolean)).toBe(true)
      }
    }
  })

  it('reverse and random routes cover a short list', () => {
    const set = 'list:s3-s3,r7,c7' as PhaseSet
    expect(createGame(players, 1, 'reverse', set).players[0].route).toEqual([2, 1, 0])
    const routes = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) routes.add(createGame(players, seed, 'random', set).players[0].route.join(''))
    expect(routes.size).toBeGreaterThan(3)
  })

  it('a twelve phase game works too', () => {
    const set = `list:${[...PHASES.map((p) => encodeGroups(p.groups)), 's3-s3-s3', 'r10'].join(',')}` as PhaseSet
    const s = playOut('classic', set, 2)
    expect(s.status).toBe('gameOver')
    expect(s.round).toBeGreaterThanOrEqual(12)
    for (const w of s.winners) expect(s.players[w].done.filter(Boolean)).toHaveLength(12)
  })
})
