import { describe, expect, it } from 'vitest'
import { HAND_SIZE } from './cards'
import { applyAction, createGame, doneCount, isSittingOut, nextRound, openPhases, targetPhase } from './game'
import type { Action, GameMode, GameState, PlayerSetup } from './game'
import { createBot } from './bot'
import { craftedGame, ids, num, nums, skip } from './testUtils'

function run(state: GameState, action: Action): GameState {
  const result = applyAction(state, action)
  if (!result.ok) throw new Error(`Expected action to succeed: ${result.error}`)
  return result.state
}

const HUMAN_AND_BOT: PlayerSetup[] = [
  { name: 'Ann', isBot: false },
  { name: 'Bot', isBot: true },
]
const TWO_BOTS: PlayerSetup[] = [
  { name: 'Bot A', isBot: true },
  { name: 'Bot B', isBot: true },
]
const THREE: PlayerSetup[] = [
  { name: 'Ann', isBot: false },
  { name: 'Bot A', isBot: true },
  { name: 'Bot B', isBot: true },
]

// Phase 10: a set of 5 plus a set of 3.
const phaseTen = () => [...nums(5, 5, 5, 5, 5, 4, 4, 4), num(1)]

/** A tie between player 0 and player 1 on the same score, both having finished Phase 10 this round. */
function humanTie(setups: PlayerSetup[] = HUMAN_AND_BOT, mode: GameMode = 'classic'): GameState {
  const hand = phaseTen()
  const t = craftedGame(hand, { setups, phase: 9, mode })
  for (const p of t.players) p.score = 50
  const other = t.players[1]
  other.done = other.done.map((_, k) => k !== other.route[9])
  other.laid = other.route[9]
  other.hand = []
  if (t.players[2]) t.players[2].score = 200
  const groups = [ids(hand.slice(0, 5)), ids(hand.slice(5, 8))]
  const laid = run(t, mode === 'yousee' ? { type: 'layDown', groups, phase: 9 } : { type: 'layDown', groups })
  return run(laid, { type: 'discard', cardId: hand[8].id })
}

describe('a tie between computer players only', () => {
  it('is a coin toss: no tiebreaker round, and the same seed draws the same winner', () => {
    const a = humanTie(TWO_BOTS)
    expect(a.status).toBe('gameOver')
    expect(a.winners).toHaveLength(1)
    expect(a.tieNext).toBeNull()
    expect(a.roundResult?.tie).toEqual({ players: [0, 1], how: 'coin' })
    expect(humanTie(TWO_BOTS).winners).toEqual(a.winners)
  })

  it('can go either way', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 60; seed++) {
      const hand = phaseTen()
      const t = craftedGame(hand, { setups: TWO_BOTS, phase: 9, seed })
      for (const p of t.players) p.score = 50
      t.players[1].done = t.players[1].done.map((_, k) => k < 9)
      t.players[1].laid = 9
      t.players[1].hand = []
      const laid = run(t, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 8))] })
      seen.add(run(laid, { type: 'discard', cardId: hand[8].id }).winners[0])
    }
    expect(seen.size).toBe(2)
  })
})

describe('tiebreaker round', () => {
  it('is announced when a person is tied, without ending the game', () => {
    const s = humanTie()
    expect(s.status).toBe('roundOver')
    expect(s.winners).toEqual([])
    expect(s.tieNext?.map((e) => e.player)).toEqual([0, 1])
    expect(s.roundResult?.tie).toEqual({ players: [0, 1], how: 'round' })
  })

  it('deals only the tied players, each needing their final phase again, and is not a numbered round', () => {
    const before = humanTie(THREE)
    const s = nextRound(before)
    expect(s.status).toBe('playing')
    expect(s.round).toBe(before.round)
    expect(s.tiebreak?.map((e) => e.player)).toEqual([0, 1])
    expect(s.tieNext).toBeNull()
    expect(s.scoreHistory).toHaveLength(before.scoreHistory.length)
    expect(s.players[0].hand).toHaveLength(HAND_SIZE)
    expect(s.players[1].hand).toHaveLength(HAND_SIZE)
    expect(s.players[2].hand).toHaveLength(0)
    expect(isSittingOut(s, 2)).toBe(true)
    expect(isSittingOut(s, 0)).toBe(false)
    expect(targetPhase(s, 0)).toBe(9)
    expect(targetPhase(s, 1)).toBe(9)
    expect(s.current).not.toBe(2)
  })

  it('first player out wins, and no points or history are added', () => {
    let s = nextRound(humanTie(THREE))
    const scores = s.players.map((p) => p.score)
    const history = s.scoreHistory.length
    s.current = 0
    s.stage = 'play'
    const hand = phaseTen()
    s.players[0].hand = hand
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 8))] })
    s = run(s, { type: 'discard', cardId: hand[8].id })
    expect(s.status).toBe('gameOver')
    expect(s.winners).toEqual([0])
    expect(s.players.map((p) => p.score)).toEqual(scores)
    expect(s.scoreHistory).toHaveLength(history)
    expect(s.roundResult?.tie).toEqual({ players: [0, 1], how: 'round' })
    expect(doneCount(s.players[0])).toBe(10)
    expect(doneCount(s.players[1])).toBe(10)
  })

  it('a player sitting out is never given a turn, and a Skip never targets them', () => {
    let s = nextRound(humanTie(THREE))
    s.current = 0
    s.stage = 'play'
    s.players[0].hand = [skip(), num(3)]
    s = run(s, { type: 'discard', cardId: s.players[0].hand[0].id }) // two players: auto target
    expect(s.players[1].skipsPending).toBe(0) // skipped on the spot, so the turn came back around
    expect(s.players[2].skipsPending).toBe(0)
    expect(s.current).toBe(0)
    expect(s.events.some((e) => e.kind === 'skipped' && e.player === 2)).toBe(false)
    expect(s.events.some((e) => e.kind === 'skip' && e.target === 1)).toBe(true)
  })

  it('refuses a Skip aimed at a player who is sitting out', () => {
    const s = nextRound(humanTie(THREE))
    s.current = 0
    s.stage = 'play'
    s.players[0].hand = [skip(), num(3)]
    // With only two seated players the target is chosen automatically, so a bad target is simply ignored.
    const r = applyAction(s, { type: 'discard', cardId: s.players[0].hand[0].id, skipTarget: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.players[2].skipsPending).toBe(0)
  })

  it('a bot never skips a player who is sitting out', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = nextRound(humanTie(THREE))
      s.rngSeed = seed
      s.current = 1
      s.stage = 'play'
      s.players[1].hand = [skip(), num(3), num(4)]
      const bot = createBot('expert')
      const action = bot.chooseAction(s)
      if (action.type === 'discard') expect(action.skipTarget === undefined || action.skipTarget !== 2).toBe(true)
    }
  })

  /** A finished round where both players just completed their last phase and are tied. */
  function tiedAfterRound(mode: GameMode): GameState {
    const s = structuredClone(createGame(HUMAN_AND_BOT, 11, mode))
    s.status = 'roundOver'
    s.tieNext = []
    for (const [i, p] of s.players.entries()) {
      const last = mode === 'yousee' ? 3 + i : p.route[9]
      p.done = p.done.map(() => true)
      p.score = 40
      s.tieNext.push({ player: i, phase: last })
    }
    return s
  }

  it('works in modes with another final phase', () => {
    for (const mode of ['random', 'reverse'] as const) {
      const before = tiedAfterRound(mode)
      const s = nextRound(before)
      for (const [i, p] of s.players.entries()) {
        expect(targetPhase(s, i)).toBe(before.tieNext![i].phase)
        // The tiebreaker changes nobody's progress: they have finished, and stay finished.
        expect(p.done.every(Boolean)).toBe(true)
        expect(p.route).toEqual(before.players[i].route)
      }
    }
  })

  it('in YouSee the only phase open is the final one', () => {
    const before = tiedAfterRound('yousee')
    const s = nextRound(before)
    for (const [i, p] of s.players.entries()) {
      expect(openPhases(s, i)).toEqual([before.tieNext![i].phase])
      expect(targetPhase(s, i)).toBe(before.tieNext![i].phase)
      expect(p.done.every(Boolean)).toBe(true)
    }
  })

  it('bots can play a tiebreaker to the end, with a player sitting out', () => {
    for (let seed = 1; seed <= 15; seed++) {
      let s = nextRound(humanTie(THREE))
      s.rngSeed = seed
      const bot = createBot('expert', () => 0.5)
      let steps = 0
      while (s.status === 'playing' && steps++ < 3000) {
        expect(isSittingOut(s, s.current)).toBe(false)
        const result = applyAction(s, bot.chooseAction(s))
        if (!result.ok) throw new Error(result.error)
        s = result.state
      }
      expect(s.status).toBe('gameOver')
      expect([0, 1]).toContain(s.winners[0])
      expect(s.winners).toHaveLength(1)
    }
  })
})

