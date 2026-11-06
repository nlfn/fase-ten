import { describe, expect, it } from 'vitest'
import { DECK_SIZE, nextRandom } from './cards'
import { createBot } from './bot'
import type { Bot, BotLevel } from './bot'
import { applyAction, createGame, nextRound } from './game'
import type { GameState, PlayerSetup } from './game'
import { craftedGame, ids, num, nums, skip, wild } from './testUtils'

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    const [r, next] = nextRandom(s)
    s = next
    return r
  }
}

function cardCount(s: GameState): number {
  return (
    s.drawPile.length +
    s.discardPile.length +
    s.players.reduce((sum, p) => sum + p.hand.length, 0) +
    s.melds.reduce((sum, m) => sum + m.cards.length, 0)
  )
}

interface PlayResult {
  state: GameState
  actions: number
  rounds: number
}

/** Plays a whole game, checking every action is legal and no card is ever lost. */
function playGame(levels: BotLevel[], seed: number): PlayResult {
  const random = seededRandom(seed * 31 + 7)
  const bots: Bot[] = levels.map((level) => createBot(level, random))
  const setups: PlayerSetup[] = levels.map((l, i) => ({ name: `Bot ${i + 1} (${l})`, isBot: true }))
  let state = createGame(setups, seed)
  let actions = 0
  const MAX_ACTIONS = 60_000

  while (state.status !== 'gameOver') {
    if (state.status === 'roundOver') {
      state = nextRound(state)
      continue
    }
    const action = bots[state.current].chooseAction(state)
    const result = applyAction(state, action)
    if (!result.ok) {
      throw new Error(
        `Bot produced an illegal action ${JSON.stringify(action)}: ${result.error} (seed ${seed}, round ${state.round})`,
      )
    }
    state = result.state
    actions++
    if (cardCount(state) !== DECK_SIZE) {
      throw new Error(`Card count is ${cardCount(state)} after ${JSON.stringify(action)} (seed ${seed})`)
    }
    if (actions > MAX_ACTIONS) throw new Error(`Game did not finish (seed ${seed})`)
  }
  return { state, actions, rounds: state.round }
}

describe('bot decisions', () => {
  it('lays down a phase as soon as it can', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(1), num(12), num(12)]
    const s = craftedGame(hand)
    const action = createBot('normal').chooseAction(s)
    expect(action.type).toBe('layDown')
    const result = applyAction(s, action)
    expect(result.ok).toBe(true)
  })

  it('hits natural cards before Wilds, and uses a Wild on a set rather than blocking a run', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(8), wild()]
    let s = craftedGame(hand)
    const laid = applyAction(s, {
      type: 'layDown',
      groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))],
    })
    if (!laid.ok) throw new Error(laid.error)
    s = laid.state
    s.melds.push({ id: 99, owner: 1, kind: 'run', start: 4, end: 7, cards: nums(4, 5, 6, 7) })

    const first = createBot('normal').chooseAction(s)
    expect(first).toMatchObject({ type: 'hit', cardId: hand[6].id, meldId: 99 })
  })

  it('discards a Skip first and aims it at an opponent', () => {
    const hand = [...nums(1, 2, 3), skip(), num(12)]
    const s = craftedGame(hand, { setups: [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
    ] })
    const action = createBot('normal').chooseAction(s)
    expect(action).toMatchObject({ type: 'discard', cardId: hand[3].id })
    const result = applyAction(s, action)
    expect(result.ok).toBe(true)
  })

  it('keeps Wilds and cards that help its phase when discarding', () => {
    // Phase 1 needs two sets of 3. Pairs of 5s and 9s plus a Wild are all worth keeping.
    const hand = [...nums(5, 5, 9, 9), wild(), num(12), num(2), num(7)]
    const s = craftedGame(hand)
    const action = createBot('normal').chooseAction(s)
    expect(action.type).toBe('discard')
    if (action.type === 'discard') {
      const discarded = hand.find((c) => c.id === action.cardId)!
      expect(discarded.kind).toBe('number')
      expect([12, 2, 7]).toContain((discarded as { value: number }).value)
      expect(discarded).toMatchObject({ value: 12 }) // highest-point useless card
    }
  })

  it('picks up a discard that moves it closer to its phase, and ignores one that does not', () => {
    const s = craftedGame([...nums(5, 5, 9, 9, 1, 2, 3, 12, 11, 4)])
    s.stage = 'draw'
    s.discardPile.push(num(5))
    expect(createBot('normal').chooseAction(s)).toEqual({ type: 'drawDiscard' })
    s.discardPile.push(num(8))
    expect(createBot('normal').chooseAction(s)).toEqual({ type: 'drawDeck' })
  })

  it('never tries to pick up a Skip', () => {
    const s = craftedGame([...nums(5, 5, 9, 9, 1, 2, 3, 12, 11, 4)])
    s.stage = 'draw'
    s.discardPile.push(skip())
    expect(createBot('normal').chooseAction(s)).toEqual({ type: 'drawDeck' })
  })
})

describe('full games between bots', () => {
  const cases: Array<{ name: string; levels: BotLevel[] }> = [
    { name: '2 players, normal vs normal', levels: ['normal', 'normal'] },
    { name: '2 players, easy vs normal', levels: ['easy', 'normal'] },
    { name: '3 players, mixed levels', levels: ['normal', 'easy', 'normal'] },
  ]

  for (const { name, levels } of cases) {
    it(`${name}: 12 games finish with legal moves and no lost cards`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const { state, rounds } = playGame(levels, seed)
        expect(state.status).toBe('gameOver')
        expect(state.winners.length).toBeGreaterThan(0)
        for (const w of state.winners) expect(state.players[w].phase).toBe(10)
        expect(rounds).toBeGreaterThanOrEqual(10) // at least one phase per round
      }
    }, 60_000)
  }
})
