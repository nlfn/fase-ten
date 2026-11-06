import { describe, expect, it } from 'vitest'
import { DECK_SIZE, HAND_SIZE, handPoints } from './cards'
import type { Card } from './cards'
import {
  applyAction,
  canPickUpDiscard,
  createGame,
  hitTargets,
  nextRound,
  recentHitIds,
  topDiscard,
  upgradeSavedState,
} from './game'
import type { Action, GameState } from './game'
import { THREE_PLAYERS, TWO_PLAYERS, craftedGame, ids, num, nums, skip, wild } from './testUtils'

function run(state: GameState, action: Action): GameState {
  const result = applyAction(state, action)
  if (!result.ok) throw new Error(`Expected action to succeed: ${result.error}`)
  return result.state
}

function error(state: GameState, action: Action): string {
  const result = applyAction(state, action)
  if (result.ok) throw new Error('Expected action to fail')
  return result.error
}

function cardCount(s: GameState): number {
  return (
    s.drawPile.length +
    s.discardPile.length +
    s.players.reduce((sum, p) => sum + p.hand.length, 0) +
    s.melds.reduce((sum, m) => sum + m.cards.length, 0)
  )
}

describe('createGame', () => {
  it('deals 10 cards each and one starter card on the discard pile', () => {
    const s = createGame(THREE_PLAYERS, 42)
    for (const p of s.players) expect(p.hand).toHaveLength(HAND_SIZE)
    expect(s.discardPile).toHaveLength(1)
    expect(cardCount(s)).toBe(DECK_SIZE)
    const allIds = [...s.drawPile, ...s.discardPile, ...s.players.flatMap((p) => p.hand)].map((c) => c.id)
    expect(new Set(allIds).size).toBe(DECK_SIZE)
  })

  it('is repeatable from the same seed and different for another seed', () => {
    const a = createGame(TWO_PLAYERS, 7)
    const b = createGame(TWO_PLAYERS, 7)
    const c = createGame(TWO_PLAYERS, 8)
    expect(ids(a.players[0].hand)).toEqual(ids(b.players[0].hand))
    expect(ids(a.players[0].hand)).not.toEqual(ids(c.players[0].hand))
  })

  it('needs 2 to 6 players', () => {
    expect(() => createGame([{ name: 'Solo', isBot: false }])).toThrow()
  })

  it('skips the first player when the starter card is a Skip', () => {
    for (let seed = 1; seed < 2000; seed++) {
      const s = createGame(TWO_PLAYERS, seed)
      if (topDiscard(s)?.kind === 'skip') {
        expect(s.current).toBe(1)
        expect(s.players[0].skipped).toBe(false)
        return
      }
    }
    throw new Error('No seed produced a Skip starter card')
  })
})

describe('drawing and discarding', () => {
  it('draw, then discard, passes the turn', () => {
    let s = createGame(TWO_PLAYERS, 3)
    // Start from a state where nobody is skipped.
    const first = s.current
    s = run(s, { type: 'drawDeck' })
    expect(s.players[first].hand).toHaveLength(HAND_SIZE + 1)
    const card = s.players[first].hand[0]
    s = run(s, { type: 'discard', cardId: card.id })
    // A discarded Skip would send the turn straight back, so only check the common case.
    if (card.kind !== 'skip') expect(s.current).toBe((first + 1) % 2)
    expect(s.players[first].hand).toHaveLength(HAND_SIZE)
    expect(cardCount(s)).toBe(DECK_SIZE)
  })

  it('enforces the order of a turn', () => {
    const s = createGame(TWO_PLAYERS, 3)
    const card = s.players[s.current].hand[0]
    expect(error(s, { type: 'discard', cardId: card.id })).toMatch(/draw/i)
    const drew = run(s, { type: 'drawDeck' })
    expect(error(drew, { type: 'drawDeck' })).toMatch(/already drew/i)
    expect(error(drew, { type: 'drawDiscard' })).toMatch(/already drew/i)
  })

  it('picking up the discard takes the top card', () => {
    const s = createGame(TWO_PLAYERS, 3)
    const top = topDiscard(s)!
    if (top.kind === 'skip') return
    const after = run(s, { type: 'drawDiscard' })
    expect(after.players[after.current].hand.map((c) => c.id)).toContain(top.id)
    expect(after.discardPile).toHaveLength(0)
  })

  it('a Skip on the discard pile cannot be picked up', () => {
    const s = structuredClone(createGame(TWO_PLAYERS, 3))
    s.discardPile.push(skip())
    s.stage = 'draw'
    expect(canPickUpDiscard(s)).toBe(false)
    expect(error(s, { type: 'drawDiscard' })).toMatch(/skip/i)
  })

  it('cannot discard a card you do not hold', () => {
    const s = craftedGame(nums(1, 2, 3))
    expect(error(s, { type: 'discard', cardId: 999_999 })).toMatch(/not in your hand/i)
  })

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const s = structuredClone(createGame(TWO_PLAYERS, 3))
    s.stage = 'draw'
    s.discardPile = [num(1), num(2), num(3), num(4)]
    s.drawPile = []
    const after = run(s, { type: 'drawDeck' })
    expect(after.discardPile).toHaveLength(1)
    expect(after.discardPile[0].id).toBe(s.discardPile[3].id)
    expect(after.drawPile).toHaveLength(2) // 3 reshuffled, 1 drawn
  })
})

describe('Skip cards', () => {
  it('with two players, the other player loses a turn', () => {
    const s = craftedGame([skip(), ...nums(1, 2, 3)])
    const sk = s.players[0].hand[0]
    const after = run(s, { type: 'discard', cardId: sk.id })
    expect(after.current).toBe(0)
    expect(after.stage).toBe('draw')
    expect(after.players[1].skipped).toBe(false)
    expect(topDiscard(after)?.kind).toBe('skip')
  })

  it('with three players, the discarder picks who is skipped', () => {
    const s = craftedGame([skip(), ...nums(1, 2, 3)], { setups: THREE_PLAYERS })
    const sk = s.players[0].hand[0]
    expect(error(s, { type: 'discard', cardId: sk.id })).toMatch(/choose/i)
    expect(error(s, { type: 'discard', cardId: sk.id, skipTarget: 0 })).toMatch(/choose/i)

    const skipFirst = run(s, { type: 'discard', cardId: sk.id, skipTarget: 1 })
    expect(skipFirst.current).toBe(2)

    const skipSecond = run(s, { type: 'discard', cardId: sk.id, skipTarget: 2 })
    expect(skipSecond.current).toBe(1)
    expect(skipSecond.players[2].skipped).toBe(true)
  })
})

describe('laying down a phase', () => {
  const handFor1 = () => [...nums(5, 5, 5, 9, 9, 9), num(1), num(12), num(12)]

  it('puts the groups on the table and marks the player as laid down', () => {
    const hand = handFor1()
    const s = craftedGame(hand)
    const after = run(s, {
      type: 'layDown',
      groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))],
    })
    expect(after.melds).toHaveLength(2)
    expect(after.melds.every((m) => m.owner === 0)).toBe(true)
    expect(after.players[0].laidDown).toBe(true)
    expect(after.players[0].hand).toHaveLength(3)
  })

  it('rejects cards that do not make the phase', () => {
    const hand = handFor1()
    const s = craftedGame(hand)
    const msg = error(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(5, 8))] })
    expect(msg).toMatch(/do not make Phase 1/i)
  })

  it('rejects cards used twice, missing cards, and laying down twice', () => {
    const hand = handFor1()
    const s = craftedGame(hand)
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(0, 3))] })).toMatch(/more than once/i)
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), [1, 2, 3]] })).toMatch(/not in your hand/i)
    const after = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    expect(error(after, { type: 'layDown', groups: [[], []] })).toMatch(/already/i)
  })

  it('cannot lay down before drawing', () => {
    const hand = handFor1()
    const s = craftedGame(hand)
    s.stage = 'draw'
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })).toMatch(/draw/i)
  })

  it('checks against the player\'s own phase, not Phase 1', () => {
    const hand = [...nums(1, 2, 3, 4, 5, 6, 7), num(12), num(12)]
    const phase4 = craftedGame(hand, { phase: 3 })
    const after = run(phase4, { type: 'layDown', groups: [ids(hand.slice(0, 7))] })
    expect(after.melds).toHaveLength(1)
    const phase1 = craftedGame(hand, { phase: 0 })
    expect(error(phase1, { type: 'layDown', groups: [ids(hand.slice(0, 7))] })).toMatch(/do not make/i)
  })
})

describe('hitting', () => {
  it('is only allowed after laying down', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(9, 'blue'), num(1)]
    const s = craftedGame(hand)
    const withMeld = structuredClone(s)
    withMeld.melds.push({ id: 99, owner: 1, kind: 'set', value: 9, cards: nums(9, 9, 9) })
    expect(error(withMeld, { type: 'hit', cardId: hand[6].id, meldId: 99 })).toMatch(/lay down/i)
  })

  it('adds to any group on the table, including an opponent\'s', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(9, 'blue'), num(1), num(2)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    s.melds.push({ id: 99, owner: 1, kind: 'run', start: 3, end: 6, cards: nums(3, 4, 5, 6) })

    // 9 fits the player's own set of 9s.
    const nineSet = s.melds.find((m) => m.kind === 'set' && m.value === 9)!
    expect(hitTargets(s, hand[6]).map((t) => t.meldId)).toContain(nineSet.id)
    const afterNine = run(s, { type: 'hit', cardId: hand[6].id, meldId: nineSet.id })
    expect(afterNine.melds.find((m) => m.id === nineSet.id)!.cards).toHaveLength(4)

    // 2 extends the opponent's run downward.
    const afterTwo = run(s, { type: 'hit', cardId: hand[8].id, meldId: 99 })
    expect(afterTwo.melds.find((m) => m.id === 99)).toMatchObject({ start: 2, end: 6 })
  })

  it('rejects a card that does not fit', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(1)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    const fiveSet = s.melds.find((m) => m.kind === 'set' && m.value === 5)!
    expect(error(s, { type: 'hit', cardId: hand[6].id, meldId: fiveSet.id })).toMatch(/does not fit/i)
  })

  it('lets a Wild choose which end of a run to extend', () => {
    const w = wild()
    const hand = [...nums(5, 5, 5, 9, 9, 9), w, num(1)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    s.melds.push({ id: 99, owner: 1, kind: 'run', start: 4, end: 7, cards: nums(4, 5, 6, 7) })
    const low = run(s, { type: 'hit', cardId: w.id, meldId: 99, end: 'low' })
    expect(low.melds.find((m) => m.id === 99)).toMatchObject({ start: 3, end: 7 })
    const high = run(s, { type: 'hit', cardId: w.id, meldId: 99, end: 'high' })
    expect(high.melds.find((m) => m.id === 99)).toMatchObject({ start: 4, end: 8 })
  })
})

describe('play history', () => {
  it('records draws, pickups and discards with the cards that are public', () => {
    let s = craftedGame(nums(1, 2, 3))
    s.stage = 'draw'
    const top = topDiscard(s)!
    if (top.kind === 'skip') s.discardPile.push(num(4, 'blue'))
    const shown = topDiscard(s)!
    s = run(s, { type: 'drawDiscard' })
    s = run(s, { type: 'discard', cardId: s.players[0].hand[0].id })
    s = run(s, { type: 'drawDeck' })
    expect(s.events.map((e) => e.kind)).toEqual(['pickup', 'discard', 'draw'])
    expect(s.events[0]).toMatchObject({ player: 0, card: { id: shown.id } })
    expect('card' in s.events[2]).toBe(false) // a deck draw does not reveal the card
    expect(s.events[2].player).toBe(1)
  })

  it('records a Skip and the player who loses the turn', () => {
    const sk = skip()
    let s = craftedGame([sk, ...nums(1, 2, 3)], { setups: THREE_PLAYERS })
    s = run(s, { type: 'discard', cardId: sk.id, skipTarget: 1 })
    expect(s.events.at(-2)).toMatchObject({ kind: 'skip', player: 0, target: 1 })
    expect(s.events.at(-1)).toMatchObject({ kind: 'skipped', player: 1 })
  })

  it('records laying down and hitting', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(9, 'blue'), num(1), num(2)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    const nineSet = s.melds.find((m) => m.kind === 'set' && m.value === 9)!
    s = run(s, { type: 'hit', cardId: hand[6].id, meldId: nineSet.id })
    expect(s.events.map((e) => e.kind)).toEqual(['laydown', 'hit'])
  })

  it('is cleared when a new round starts', () => {
    let s = craftedGame(nums(1, 2, 3))
    s = run(s, { type: 'discard', cardId: s.players[0].hand[0].id })
    s.status = 'roundOver'
    // Nothing from the old round remains; a new round can only start with a lost turn.
    expect(nextRound(s).events.every((e) => e.kind === 'skipped')).toBe(true)
  })
})

describe('recent hits', () => {
  function afterHit(setups = TWO_PLAYERS) {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(9, 'blue'), num(1), num(2)]
    let s = craftedGame(hand, { setups })
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    const nineSet = s.melds.find((m) => m.kind === 'set' && m.value === 9)!
    s = run(s, { type: 'hit', cardId: hand[6].id, meldId: nineSet.id })
    return { s, hit: hand[6], spare: hand[7] }
  }

  /** Plays out the current bot's turn: draw, then discard a card that is not a Skip. */
  function botTurn(s: GameState): GameState {
    let t = run(s, { type: 'drawDeck' })
    const cur = t.players[t.current]
    const card = cur.hand.find((c) => c.kind !== 'skip')!
    t = run(t, { type: 'discard', cardId: card.id })
    return t
  }

  it('marks a card as soon as it is added', () => {
    const { s, hit } = afterHit()
    expect(recentHitIds(s).has(hit.id)).toBe(true)
  })

  it('stays marked through the other players\' turns and clears when the hitter\'s turn returns', () => {
    const { s, hit, spare } = afterHit()
    let t = run(s, { type: 'discard', cardId: spare.id })
    expect(t.current).toBe(1)
    expect(recentHitIds(t).has(hit.id)).toBe(true)
    t = botTurn(t)
    expect(t.current).toBe(0)
    expect(recentHitIds(t).has(hit.id)).toBe(false)
  })

  it('lasts a full lap with three players', () => {
    const { s, hit, spare } = afterHit(THREE_PLAYERS)
    let t = run(s, { type: 'discard', cardId: spare.id })
    t = botTurn(t)
    expect(t.current).toBe(2)
    expect(recentHitIds(t).has(hit.id)).toBe(true)
    t = botTurn(t)
    expect(t.current).toBe(0)
    expect(recentHitIds(t).has(hit.id)).toBe(false)
  })

  it('is empty at the start of a new round', () => {
    const { s } = afterHit()
    s.hits.push({ cardId: 1, turn: s.turnCount })
    s.status = 'roundOver'
    expect(recentHitIds(nextRound(s)).size).toBe(0)
  })

  it('copes with a saved game that has no hit history', () => {
    const { s } = afterHit()
    const old = structuredClone(s) as Partial<GameState>
    delete old.hits
    expect(recentHitIds(old as GameState).size).toBe(0)
  })
})

describe('ending a round', () => {
  it('going out by hitting your last card ends the round and scores the others', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(9, 'blue')]
    let s = craftedGame(hand)
    s.players[1].hand = [skip(), wild(), num(12), num(3)] // 15 + 25 + 10 + 5 = 55
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    const nineSet = s.melds.find((m) => m.kind === 'set' && m.value === 9)!
    s = run(s, { type: 'hit', cardId: hand[6].id, meldId: nineSet.id })

    expect(s.status).toBe('roundOver')
    expect(s.roundResult).toMatchObject({ winner: 0, points: [0, 55], completed: [true, false] })
    expect(s.players[0].score).toBe(0)
    expect(s.players[1].score).toBe(55)
    expect(error(s, { type: 'drawDeck' })).toMatch(/not in progress/i)
  })

  it('going out by discarding the last card also ends the round', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(1)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    s = run(s, { type: 'discard', cardId: hand[6].id })
    expect(s.status).toBe('roundOver')
    expect(s.roundResult?.winner).toBe(0)
  })

  it('card values: 1-9 are 5, 10-12 are 10, Skip 15, Wild 25', () => {
    expect(handPoints([num(1), num(9), num(10), num(12), skip(), wild()])).toBe(5 + 5 + 10 + 10 + 15 + 25)
  })

  it('only players who laid down advance to the next phase', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(1)]
    let s = craftedGame(hand)
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    s = run(s, { type: 'discard', cardId: hand[6].id })
    expect(s.players[0].phase).toBe(1)
    expect(s.players[1].phase).toBe(0)
  })

  it('nextRound deals a fresh round and keeps phases and scores', () => {
    const hand = [...nums(5, 5, 5, 9, 9, 9), num(1)]
    let s = craftedGame(hand)
    s.players[1].hand = [num(12), num(12)]
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })
    s = run(s, { type: 'discard', cardId: hand[6].id })
    const next = nextRound(s)
    expect(next.status).toBe('playing')
    expect(next.round).toBe(2)
    expect(next.players[0].phase).toBe(1)
    expect(next.players[1].score).toBe(20)
    expect(next.players[0].laidDown).toBe(false)
    expect(next.melds).toHaveLength(0)
    for (const p of next.players) expect(p.hand).toHaveLength(HAND_SIZE)
    expect(cardCount(next)).toBe(DECK_SIZE)
    // The other player starts round 2 (unless a Skip starter card passes them over).
    if (topDiscard(next)?.kind !== 'skip') expect(next.current).toBe(1)
  })

  it('nextRound does nothing while a round is in progress', () => {
    const s = createGame(TWO_PLAYERS, 5)
    expect(nextRound(s)).toBe(s)
  })
})

describe('winning the game', () => {
  function finalRound(scores: [number, number], loserHand: Card[]): GameState {
    const hand = [...nums(5, 5, 5, 5, 5, 4, 4, 4), num(1)] // Phase 10: set of 5 + set of 3
    let s = craftedGame(hand, { phase: 9 })
    s.players[0].score = scores[0]
    s.players[1].score = scores[1]
    s.players[1].phase = 9
    s.players[1].done = s.players[1].done.map((_, i) => i < 9)
    s.players[1].laidPhase = 9
    s.players[1].laidDown = true // the other player also finished Phase 10 this round
    s.players[1].hand = loserHand
    s = run(s, {
      type: 'layDown',
      groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 8))],
    })
    return run(s, { type: 'discard', cardId: hand[8].id })
  }

  it('finishing Phase 10 and going out wins the game', () => {
    const s = craftedGame([...nums(5, 5, 5, 5, 5, 4, 4, 4), num(1)], { phase: 9 })
    const hand = s.players[0].hand
    const laid = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 8))] })
    expect(laid.melds).toHaveLength(2)
    const done = run(laid, { type: 'discard', cardId: hand[8].id })
    expect(done.status).toBe('gameOver')
    expect(done.winners).toEqual([0])
  })

  it('when both finish Phase 10 in one round, the lowest score wins', () => {
    // Player 0 goes out (adds 0) but has a worse total than player 1 (50 + 10 = 60 vs 100).
    const s = finalRound([100, 50], [num(12)])
    expect(s.status).toBe('gameOver')
    expect(s.winners).toEqual([1])
  })

  it('a tie on score shares the win', () => {
    const s = finalRound([60, 50], [num(12)])
    expect(s.status).toBe('gameOver')
    expect(s.winners).toEqual([0, 1])
  })
})

describe('YouSee mode', () => {
  // Phase 9 (index 8) is a set of 5 plus a set of 2.
  const nines = () => [...nums(5, 5, 5, 5, 5), num(9, 'blue'), num(9, 'green'), num(1), num(2)]

  it('lets you lay down any phase you have not done, in any order', () => {
    const hand = nines()
    const s = craftedGame(hand, { mode: 'yousee' })
    const laid = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 8 })
    expect(laid.players[0].laidPhase).toBe(8)
    expect(laid.melds).toHaveLength(2)
    expect(laid.log.at(-1)).toMatch(/Phase 9/)
  })

  it('needs you to say which phase', () => {
    const hand = nines()
    const s = craftedGame(hand, { mode: 'yousee' })
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))] })).toMatch(/choose which phase/i)
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 12 })).toMatch(/choose which phase/i)
  })

  it('checks the cards against the phase you chose, not another one', () => {
    const hand = nines()
    const s = craftedGame(hand, { mode: 'yousee' })
    // The same cards do not make Phase 7 (two sets of 4).
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 6 })).toMatch(/do not make Phase 7/i)
  })

  it('does not let you complete the same phase twice', () => {
    const hand = nines()
    const s = craftedGame(hand, { mode: 'yousee' })
    s.players[0].done[8] = true
    expect(error(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 8 })).toMatch(/already completed Phase 9/i)
  })

  it('counts the chosen phase as done when the round ends, and the rest stay open', () => {
    const hand = nines()
    let s = craftedGame(hand, { mode: 'yousee' })
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 8 })
    // Not done until the round is over.
    expect(s.players[0].done[8]).toBe(false)
    s.players[0].hand = [num(1)]
    s = run(s, { type: 'discard', cardId: s.players[0].hand[0].id })
    expect(s.status).toBe('roundOver')
    expect(s.players[0].done.map((d, i) => (d ? i : -1)).filter((i) => i >= 0)).toEqual([8])
    expect(s.players[0].phase).toBe(1)
    // The next round starts with nothing laid down and the phase still recorded as done.
    const n = nextRound(s)
    expect(n.players[0].laidPhase).toBeNull()
    expect(n.players[0].done[8]).toBe(true)
  })

  it('does not advance a player who did not lay down', () => {
    const hand = nines()
    let s = craftedGame(hand, { mode: 'yousee' })
    s.players[1].hand = [num(1)]
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 8 })
    s.players[0].hand = [num(1)]
    s.players[1].hand = [num(12)]
    s = run(s, { type: 'discard', cardId: s.players[0].hand[0].id })
    expect(s.players[1].phase).toBe(0)
    expect(s.players[1].done.some(Boolean)).toBe(false)
  })

  it('ends the game when a player completes their last open phase and goes out', () => {
    const hand = [...nums(5, 5, 5, 5, 5), num(9, 'blue'), num(9, 'green')]
    let s = craftedGame(hand, { mode: 'yousee' })
    s.players[0].done = s.players[0].done.map((_, i) => i !== 8)
    s.players[0].phase = 9
    s = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 5)), ids(hand.slice(5, 7))], phase: 8 })
    expect(s.status).toBe('gameOver')
    expect(s.winners).toEqual([0])
    expect(s.players[0].done.every(Boolean)).toBe(true)
  })

  it('classic mode ignores any phase that is passed in', () => {
    const hand = [...nums(1, 1, 1, 2, 2, 2), num(7)]
    const s = craftedGame(hand)
    const laid = run(s, { type: 'layDown', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))], phase: 8 })
    expect(laid.players[0].laidPhase).toBe(0)
  })
})

describe('upgradeSavedState', () => {
  it('fills in the fields an older save is missing', () => {
    const s = createGame(TWO_PLAYERS, 3) as Partial<GameState> & GameState
    const old = structuredClone(s) as unknown as Record<string, unknown>
    delete old.mode
    delete old.events
    delete old.hits
    delete old.turnCount
    const players = old.players as Array<Record<string, unknown>>
    players[0].phase = 3
    players[0].laidDown = true
    for (const p of players) {
      delete p.done
      delete p.laidPhase
    }
    const up = upgradeSavedState(old as unknown as GameState)
    expect(up.mode).toBe('classic')
    expect(up.events).toEqual([])
    expect(up.players[0].done.filter(Boolean)).toHaveLength(3)
    expect(up.players[0].laidPhase).toBe(3)
    expect(up.players[1].laidPhase).toBeNull()
  })
})
