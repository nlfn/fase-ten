import { describe, expect, it } from 'vitest'
import { DECK_SIZE, nextRandom } from './cards'
import { createBot, recall } from './bot'
import type { Bot, BotLevel } from './bot'
import { applyAction, createGame, nextRound } from './game'
import type { GameMode, GameState, PlayEvent, PlayerSetup } from './game'
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
function playGame(levels: BotLevel[], seed: number, mode: GameMode = 'classic'): PlayResult {
  const random = seededRandom(seed * 31 + 7)
  const bots: Bot[] = levels.map((level) => createBot(level, random))
  const setups: PlayerSetup[] = levels.map((l, i) => ({ name: `Bot ${i + 1} (${l})`, isBot: true }))
  let state = createGame(setups, seed, mode)
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
    const action = createBot('expert').chooseAction(s)
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

    const first = createBot('expert').chooseAction(s)
    expect(first).toMatchObject({ type: 'hit', cardId: hand[6].id, meldId: 99 })
  })

  it('discards a Skip first and aims it at an opponent', () => {
    const hand = [...nums(1, 2, 3), skip(), num(12)]
    const s = craftedGame(hand, { setups: [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
    ] })
    const action = createBot('expert').chooseAction(s)
    expect(action).toMatchObject({ type: 'discard', cardId: hand[3].id })
    const result = applyAction(s, action)
    expect(result.ok).toBe(true)
  })

  it('keeps Wilds and cards that help its phase when discarding', () => {
    // Phase 1 needs two sets of 3. Pairs of 5s and 9s plus a Wild are all worth keeping.
    const hand = [...nums(5, 5, 9, 9), wild(), num(12), num(2), num(7)]
    const s = craftedGame(hand)
    const action = createBot('expert').chooseAction(s)
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
    expect(createBot('expert').chooseAction(s)).toEqual({ type: 'drawDiscard' })
    s.discardPile.push(num(8))
    expect(createBot('expert').chooseAction(s)).toEqual({ type: 'drawDeck' })
  })

  it('never tries to pick up a Skip', () => {
    const s = craftedGame([...nums(5, 5, 9, 9, 1, 2, 3, 12, 11, 4)])
    s.stage = 'draw'
    s.discardPile.push(skip())
    expect(createBot('expert').chooseAction(s)).toEqual({ type: 'drawDeck' })
  })
})

describe('full games between bots', () => {
  const cases: Array<{ name: string; levels: BotLevel[] }> = [
    { name: '2 players, expert vs expert', levels: ['expert', 'expert'] },
    { name: '2 players, easy vs expert', levels: ['easy', 'expert'] },
    { name: '3 players, mixed levels', levels: ['expert', 'easy', 'expert'] },
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

describe('full YouSee games between bots', () => {
  const cases: Array<{ name: string; levels: BotLevel[] }> = [
    { name: '2 players', levels: ['expert', 'expert'] },
    { name: '3 players, mixed levels', levels: ['expert', 'easy', 'expert'] },
  ]

  for (const { name, levels } of cases) {
    it(`${name}: 12 games finish with legal moves, no lost cards, and every winner has all ten phases`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const { state, rounds } = playGame(levels, seed, 'yousee')
        expect(state.status).toBe('gameOver')
        expect(state.winners.length).toBeGreaterThan(0)
        for (const w of state.winners) {
          expect(state.players[w].done.every(Boolean)).toBe(true)
          expect(state.players[w].phase).toBe(10)
        }
        expect(rounds).toBeGreaterThanOrEqual(10)
      }
    }, 60_000)
  }

  it('lays down the biggest phase the hand can make', () => {
    // Five 5s and two 3s can make Phase 9 (7 cards) or Phase 1 (6 cards): the bigger one is chosen.
    const hand = [...nums(5, 5, 5, 5, 5), num(3, 'blue'), num(3, 'green'), num(1), num(2)]
    const s = craftedGame(hand, { mode: 'yousee' })
    const action = createBot('expert').chooseAction(s)
    expect(action.type).toBe('layDown')
    if (action.type === 'layDown') expect(action.phase).toBe(8)
  })

  it('never picks a phase it has already completed', () => {
    const hand = [...nums(5, 5, 5, 5, 5), num(3, 'blue'), num(3, 'green'), num(1), num(2)]
    const s = craftedGame(hand, { mode: 'yousee' })
    s.players[0].done[8] = true
    const action = createBot('expert').chooseAction(s)
    if (action.type === 'layDown') expect(action.phase).not.toBe(8)
  })
})

describe('full Random games between bots', () => {
  it('12 games finish with legal moves, and every winner has completed all ten phases', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const levels: BotLevel[] = seed % 2 ? ['expert', 'expert'] : ['expert', 'easy', 'expert']
      const { state } = playGame(levels, seed, 'random')
      expect(state.status).toBe('gameOver')
      for (const w of state.winners) {
        expect(state.players[w].done.every(Boolean)).toBe(true)
        expect(state.players[w].phase).toBe(10)
      }
    }
  }, 60_000)
})

describe('memory', () => {
  // Phase 1 needs two sets of 3. This hand is one 9 short, and every single card is equally useless,
  // so without any memory the bot throws the highest-point card, the 12.
  const hand = () => [...nums(5, 5, 5, 9, 9, 12, 1, 2, 3, 4, 7)]
  const pickup = (value: number, id: number): PlayEvent => ({
    player: 1,
    kind: 'pickup',
    card: { id, kind: 'number', color: 'red', value },
  })
  const discarded = (action: ReturnType<Bot['chooseAction']>, s: GameState) =>
    action.type === 'discard' ? s.players[0].hand.find((c) => c.id === action.cardId) : undefined

  it('throws the highest card when it remembers nothing', () => {
    const s = craftedGame(hand())
    const card = discarded(createBot('expert').chooseAction(s), s)
    expect(card).toMatchObject({ kind: 'number', value: 12 })
  })

  it('keeps back a card the opponent picked up', () => {
    const s = craftedGame(hand())
    s.events = [pickup(12, 900)]
    for (const level of ['medium', 'expert'] as const) {
      const card = discarded(createBot(level).chooseAction(s), s)
      expect(card).toMatchObject({ kind: 'number' })
      expect(card && card.kind === 'number' && card.value).not.toBe(12)
    }
  })

  it('easy bots remember nothing, so they still throw the 12', () => {
    const s = craftedGame(hand())
    s.events = [pickup(12, 900)]
    const bot = createBot('easy', () => 0.99) // never makes a mistake
    const card = discarded(bot.chooseAction(s), s)
    expect(card).toMatchObject({ kind: 'number', value: 12 })
  })

  it('medium forgets an older pickup, expert does not', () => {
    const s = craftedGame(hand())
    s.events = [pickup(12, 900), pickup(3, 901)]
    const medium = discarded(createBot('medium').chooseAction(s), s)
    const expert = discarded(createBot('expert').chooseAction(s), s)
    expect(medium).toMatchObject({ kind: 'number', value: 12 })
    expect(expert && expert.kind === 'number' && expert.value).not.toBe(12)
  })

  it('treats a number an opponent threw away as safe to throw', () => {
    const s = craftedGame(hand())
    // A 10 picked up makes a 12 slightly risky (a run could use it)...
    s.events = [pickup(10, 900)]
    const kept = discarded(createBot('expert').chooseAction(s), s)
    expect(kept && kept.kind === 'number' && kept.value).not.toBe(12)
    // ...but they also threw a 12 away, so they clearly do not want one.
    s.events.push({ player: 1, kind: 'discard', card: { id: 901, kind: 'number', color: 'blue', value: 12 } })
    const card = discarded(createBot('expert').chooseAction(s), s)
    expect(card).toMatchObject({ kind: 'number', value: 12 })
  })

  it('recall keeps one pickup and two discards per opponent for medium, everything for expert', () => {
    const s = craftedGame(hand())
    const d = (id: number): PlayEvent => ({
      player: 1,
      kind: 'discard',
      card: { id, kind: 'number', color: 'red', value: 5 },
    })
    s.events = [pickup(1, 900), pickup(2, 901), d(902), d(903), d(904)]
    const medium = recall(s, 0, 'medium').get(1)!
    expect(medium.picked.map((c) => c.id)).toEqual([901])
    expect(medium.discarded.map((c) => c.id)).toEqual([903, 904])
    const expert = recall(s, 0, 'expert').get(1)!
    expect(expert.picked).toHaveLength(2)
    expect(expert.discarded).toHaveLength(3)
    expect(recall(s, 0, 'easy').get(1)).toEqual({ picked: [], discarded: [] })
    expect(recall(s, 0, 'expert').has(0)).toBe(false)
  })
})
