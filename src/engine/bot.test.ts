import { describe, expect, it } from 'vitest'
import { DECK_SIZE, nextRandom } from './cards'
import { createBot, recall } from './bot'
import type { Bot, BotLevel } from './bot'
import { applyAction, createGame, doneCount, nextRound } from './game'
import type { GameMode, GameState, PlayEvent, PlayerSetup } from './game'
import { THREE_PLAYERS, advance, craftedGame, ids, markLaid, num, nums, skip, wild } from './testUtils'

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
        for (const w of state.winners) expect(doneCount(state.players[w])).toBe(10)
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
          expect(doneCount(state.players[w])).toBe(10)
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
        expect(doneCount(state.players[w])).toBe(10)
      }
    }
  }, 60_000)
})

describe('full Net Esaf games between bots', () => {
  it('8 games finish with legal moves, and every winner has completed all ten phases', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const levels: BotLevel[] = seed % 2 ? ['expert', 'expert'] : ['expert', 'easy', 'medium']
      const { state } = playGame(levels, seed, 'reverse')
      expect(state.status).toBe('gameOver')
      for (const w of state.winners) {
        expect(state.players[w].done.every(Boolean)).toBe(true)
        expect(doneCount(state.players[w])).toBe(10)
      }
    }
  }, 60_000)
})

describe('four players', () => {
  it('a classic game with four bots finishes with legal moves and no lost cards', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = playGame(['expert', 'medium', 'easy', 'expert'], seed)
      expect(state.status).toBe('gameOver')
      expect(state.winners.length).toBeGreaterThan(0)
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
      const card = discarded(createBot(level, () => 0.99).chooseAction(s), s)
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
    const medium = discarded(createBot('medium', () => 0.99).chooseAction(s), s)
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

describe('bridging a run with Wilds', () => {
  // Ned has laid down a run 6 to 12 and holds two Wilds, a 3 and a 2. The Wilds must stand in as 5 and
  // 4 so that the 3 and 2 can follow, which goes out. Putting the Wilds on Dirk's set of 10s would
  // leave the 3 and 2 stuck.
  it('plays the Wilds on the run so the rest of the hand can follow, and goes out', () => {
    const s = craftedGame([wild(), wild(), ...nums(3, 2)], { setups: THREE_PLAYERS })
    s.players[0].laid = 3
    s.melds.push({ id: 90, owner: 0, kind: 'run', start: 6, end: 12, cards: nums(6, 7, 8, 9, 10, 11, 12) })
    s.melds.push({ id: 91, owner: 1, kind: 'set', value: 10, cards: nums(10, 10, 10) })
    const bot = createBot('expert')
    let state = s
    for (let i = 0; i < 6 && state.status === 'playing'; i++) {
      const a = bot.chooseAction(state)
      if (a.type !== 'hit') break
      const r = applyAction(state, a)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    expect(state.status).toBe('roundOver')
    expect(state.roundResult?.winner).toBe(0)
    expect(state.melds.find((m) => m.id === 90)).toMatchObject({ start: 2, end: 12 })
  })

  it('Medium hits greedily and sends the Wilds to the set, stranding the 3 and 2', () => {
    const s = craftedGame([wild(), wild(), ...nums(3, 2)], { setups: THREE_PLAYERS })
    s.players[0].laid = 3
    s.melds.push({ id: 90, owner: 0, kind: 'run', start: 6, end: 12, cards: nums(6, 7, 8, 9, 10, 11, 12) })
    s.melds.push({ id: 91, owner: 1, kind: 'set', value: 10, cards: nums(10, 10, 10) })
    const a = createBot('medium', () => 0.99).chooseAction(s)
    expect(a).toMatchObject({ type: 'hit', meldId: 91 })
  })

  it('still puts spare Wilds on a set when there is nothing to bridge to', () => {
    const s = craftedGame([wild(), ...nums(1)], { setups: THREE_PLAYERS })
    markLaid(s, 0)
    s.melds.push({ id: 90, owner: 0, kind: 'run', start: 6, end: 12, cards: nums(6, 7, 8, 9, 10, 11, 12) })
    s.melds.push({ id: 91, owner: 1, kind: 'set', value: 10, cards: nums(10, 10, 10) })
    const a = createBot('expert').chooseAction(s)
    expect(a).toMatchObject({ type: 'hit' })
  })

  it('never leaves a card behind that a better order would have played', () => {
    // Wilds and naturals mixed on several groups: whatever order is chosen, every card gets played.
    const s = craftedGame([wild(), ...nums(5, 4, 3, 13 - 2)], { setups: THREE_PLAYERS })
    markLaid(s, 0)
    s.melds.push({ id: 90, owner: 0, kind: 'run', start: 7, end: 9, cards: nums(7, 8, 9) })
    s.melds.push({ id: 91, owner: 1, kind: 'set', value: 11, cards: nums(11, 11, 11) })
    const bot = createBot('expert')
    let state = s
    for (let i = 0; i < 8 && state.status === 'playing'; i++) {
      const a = bot.chooseAction(state)
      if (a.type !== 'hit') break
      const r = applyAction(state, a)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    // 5,4,3 can't reach the run at 7 without a 6, so the Wild goes there as the 6 and all of 5, 4, 3 follow;
    // the 11 goes on the set. The round is over.
    expect(state.status).toBe('roundOver')
  })
})

describe('defense against an opponent who is nearly out', () => {
  // The human (player 0) has laid down with one card left. A run 9 to 11 is on the table, so a 12 or an
  // 8 would let them play. The bot (player 1) needs one more 7 for its phase, and its 12 is its
  // highest card, so it would normally throw that.
  const setup = (opponentCards: number, laidDown = true) => {
    const hand = [...nums(5, 5, 5, 7, 7, 12, 4)]
    const s = craftedGame(hand, { player: 1 })
    s.players[0].laid = laidDown ? 0 : null
    s.players[0].hand = nums(...Array(opponentCards).fill(1))
    s.melds.push({ id: 99, owner: 0, kind: 'run', start: 9, end: 11, cards: nums(9, 10, 11) })
    return s
  }
  const thrown = (s: GameState, level: BotLevel) => {
    const a = createBot(level, () => 0.99).chooseAction(s)
    expect(a.type).toBe('discard')
    return a.type === 'discard' ? s.players[1].hand.find((c) => c.id === a.cardId) : undefined
  }

  it('throws the 12 when nobody can use it', () => {
    expect(thrown(setup(1, false), 'expert')).toMatchObject({ value: 12 })
  })

  it('leans away from a playable card even when the laid-down opponent has a big hand', () => {
    expect(thrown(setup(6), 'expert')).toMatchObject({ value: 4 })
  })

  it('keeps the 12 when a laid-down opponent has one or two cards left', () => {
    for (const level of ['easy', 'medium', 'expert'] as const) {
      for (const cards of [1, 2]) {
        const card = thrown(setup(cards), level)
        expect(card).toBeDefined()
        expect(card).not.toMatchObject({ value: 12 })
        // It still throws the card that costs its own phase the least.
        expect(card).toMatchObject({ value: 4 })
      }
    }
  })

  it('still throws a playable card when everything it holds is playable', () => {
    const s = setup(1)
    s.players[1].hand = nums(12, 8)
    const card = thrown(s, 'expert')
    expect(card).toBeDefined()
  })

  it('aims a Skip at the nearly out player even over a stronger looking opponent', () => {
    const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
    markLaid(s, 0)
    s.players[0].hand = nums(1)
    markLaid(s, 2)
    advance(s, 2, 5)
    s.players[2].hand = nums(1, 2, 3, 4, 5, 6, 7, 8)
    const a = createBot('expert').chooseAction(s)
    expect(a).toMatchObject({ type: 'discard', skipTarget: 0 })
    expect(createBot('medium', () => 0.99).chooseAction(s)).toMatchObject({ type: 'discard', skipTarget: 0 })
  })

  it('never Skips a player who is already losing a turn', () => {
    const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
    markLaid(s, 0)
    s.players[0].hand = nums(1)
    s.players[0].skipsPending = 1
    for (const level of ['expert', 'medium', 'easy'] as const) {
      expect(createBot(level, () => 0.99).chooseAction(s)).toMatchObject({ type: 'discard', skipTarget: 2 })
    }
  })
  it('breaks a tie between equal Skip targets by aiming at the lowest score', () => {
    for (const lowest of [0, 2]) {
      const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
      s.players[0].score = lowest === 0 ? 40 : 90
      s.players[2].score = lowest === 2 ? 40 : 90
      for (const level of ['expert', 'medium'] as const) {
        const a = createBot(level, () => 0.99).chooseAction(s)
        expect(a).toMatchObject({ type: 'discard', skipTarget: lowest })
      }
    }
  })

  it('stops a player on their final phase before a nearly out opponent, at every level', () => {
    const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
    markLaid(s, 0)
    s.players[0].hand = nums(1)
    advance(s, 2, 9)
    s.players[2].hand = nums(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    for (const level of ['expert', 'medium', 'easy'] as const) {
      expect(createBot(level, () => 0.99).chooseAction(s)).toMatchObject({ type: 'discard', skipTarget: 2 })
    }
  })

  it('warns early: a player with 8 phases done outranks one with 5 and a laid down hand', () => {
    const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
    advance(s, 0, 5)
    markLaid(s, 0)
    s.players[0].hand = nums(1, 2, 3, 4, 5)
    advance(s, 2, 8)
    s.players[2].hand = nums(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    expect(createBot('medium', () => 0.99).chooseAction(s)).toMatchObject({ skipTarget: 2 })
  })

  it('picks at random when score and standing cannot separate the targets', () => {
    const s = craftedGame([...nums(5, 5, 5, 7, 7, 4), skip()], { player: 1, setups: THREE_PLAYERS })
    const picks = new Set<number>()
    for (const r of [0.1, 0.9]) {
      const a = createBot('expert', () => r).chooseAction(s)
      if (a.type === 'discard') picks.add(a.skipTarget as number)
    }
    expect([...picks].sort()).toEqual([0, 2])
  })
})
