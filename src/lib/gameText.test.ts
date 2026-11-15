import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import type { Card, GameState, Meld, PhaseSet } from '../engine'
import { goalLine, meldTitle, nextLabel, phaseLabel, progressLine, resultTitle, sortHand, tieNote, tiedNames } from './gameText'

const players = [
  { name: 'Ann', isBot: false },
  { name: 'Bot A', isBot: true },
  { name: 'Bot B', isBot: true },
]
const n = (id: number, value: number, color: 'red' | 'blue' | 'green' | 'yellow'): Card => ({ id, kind: 'number', value, color })
const meld = (body: Partial<Meld>): Meld => ({ id: 1, owner: 0, cards: [], ...body }) as Meld

describe('sortHand', () => {
  const hand: Card[] = [{ id: 1, kind: 'skip' }, n(2, 9, 'blue'), { id: 3, kind: 'wild' }, n(4, 3, 'yellow'), n(5, 9, 'red'), n(6, 3, 'red')]
  it('sorts by number, then color, with Wilds and Skips last', () => {
    expect(sortHand(hand, 'number').map((c) => c.id)).toEqual([6, 4, 5, 2, 3, 1])
  })
  it('sorts by color, then number', () => {
    expect(sortHand(hand, 'color').map((c) => c.id)).toEqual([6, 5, 2, 4, 3, 1])
  })
  it('leaves the hand it was given alone', () => {
    sortHand(hand, 'number')
    expect(hand[0].id).toBe(1)
  })
})

describe('meldTitle', () => {
  it('names every kind of group', () => {
    expect(meldTitle(meld({ kind: 'set', value: 7 }))).toBe('Set of 7s')
    expect(meldTitle(meld({ kind: 'set', value: 7, color: 'red' }))).toBe('Red set of 7s')
    expect(meldTitle(meld({ kind: 'run', start: 3, end: 6 }))).toBe('Run 3 to 6')
    expect(meldTitle(meld({ kind: 'run', start: 3, end: 6, color: 'blue' }))).toBe('Blue run 3 to 6')
    expect(meldTitle(meld({ kind: 'run', start: 2, end: 10, step: 2 }))).toBe('Even run 2 to 10')
    expect(meldTitle(meld({ kind: 'run', start: 1, end: 9, step: 2 }))).toBe('Odd run 1 to 9')
    expect(meldTitle(meld({ kind: 'run', start: 2, end: 8, step: 2, color: 'green' }))).toBe('Green even run 2 to 8')
    expect(meldTitle(meld({ kind: 'color', color: 'yellow' }))).toBe('Yellow cards')
  })
})

describe('progress and goals', () => {
  it('classic: the phase you are on, and "Next" once the round is over', () => {
    const s = createGame(players, 3)
    expect(progressLine(s, 0)).toBe('Phase 1')
    expect(goalLine(s, 0)).toBe('2 sets of 3')
    expect(progressLine({ ...s, status: 'roundOver' }, 0)).toBe('Next: Phase 1')
    expect(phaseLabel(s, 3)).toBe('Phase 4')
    expect(phaseLabel(s, 10)).toBe('All phases done')
  })
  it('a finished player has all phases done', () => {
    const s = createGame(players, 3)
    s.players[1].done = s.players[1].done.map(() => true)
    expect(progressLine(s, 1)).toBe('All phases done')
    expect(goalLine(s, 1)).toBe('')
  })
  it('says what was laid down', () => {
    const s = createGame(players, 3)
    s.players[0].laid = 0
    expect(goalLine(s, 0)).toBe('Laid down Phase 1: 2 sets of 3')
  })
  it('You Pick counts phases and names no goal', () => {
    const s = createGame(players, 3, 'yousee')
    s.players[0].done[4] = true
    expect(progressLine(s, 0)).toBe('1 of 10 done')
    expect(goalLine(s, 0)).toBe('')
  })
  it('a single round says so', () => {
    const s = createGame(players, 3, 'classic', 'single:r7' as PhaseSet)
    expect(progressLine(s, 0)).toBe('Single round')
    expect(goalLine(s, 0)).toBe('1 run of 7')
    s.players[0].laid = 0
    expect(goalLine(s, 0)).toBe('Laid down: 1 run of 7')
  })
  it('counts a list of any length', () => {
    const s = createGame(players, 3, 'yousee', 'list:s3-s3,r7,c7' as PhaseSet)
    expect(progressLine(s, 0)).toBe('0 of 3 done')
    expect(phaseLabel(s, 3)).toBe('All phases done')
  })
})

describe('the round summary', () => {
  const base = (): GameState => ({ ...createGame(players, 3), status: 'roundOver' })
  const result = (extra: Partial<NonNullable<GameState['roundResult']>>) =>
    ({ winner: null, points: [0, 0, 0], completed: [false, false, false], ...extra }) as GameState['roundResult']

  it('says who went out', () => {
    expect(resultTitle({ ...base(), roundResult: result({ winner: 0 }) })).toBe('You went out')
    expect(resultTitle({ ...base(), roundResult: result({ winner: 2 }) })).toBe('Bot B went out')
    expect(resultTitle({ ...base(), roundResult: result({}) })).toBe('Round over')
    expect(nextLabel(base())).toBe('Next round')
  })
  it('says who won the game', () => {
    const over = { ...base(), status: 'gameOver' as const }
    expect(resultTitle({ ...over, winners: [0], roundResult: result({ winner: 0 }) })).toBe('You win the game')
    expect(resultTitle({ ...over, winners: [1], roundResult: result({ winner: 1 }) })).toBe('Bot A wins the game')
    expect(resultTitle({ ...over, winners: [1, 2], roundResult: result({}) })).toBe('Bot A and Bot B tie for the win')
    expect(resultTitle({ ...over, winners: [0], roundResult: result({ tie: { players: [0, 1], how: 'round' } }) })).toBe('You win the tiebreaker')
    expect(resultTitle({ ...over, winners: [2], roundResult: result({ tie: { players: [1, 2], how: 'coin' } }) })).toBe('Bot B wins the coin toss')
  })
  it('explains a tie that goes to a tiebreaker', () => {
    const s = { ...base(), tieNext: [{ player: 0, phase: 9 }, { player: 2, phase: 9 }], roundResult: result({ tie: { players: [0, 2], how: 'round' } }) }
    s.players[0].score = 45
    expect(tiedNames(s)).toBe('You and Bot B')
    expect(resultTitle(s)).toBe('You and Bot B are tied')
    expect(nextLabel(s)).toBe('Play tiebreaker')
    expect(tieNote(s)).toBe('You and Bot B tied on 45 points. Each of them repeats their final phase, and the first to go out wins. Everyone else sits this one out.')
  })
  it('explains a coin toss, and says nothing when there was no tie', () => {
    const s = { ...base(), status: 'gameOver' as const, winners: [1], roundResult: result({ tie: { players: [1, 2], how: 'coin' } }) }
    s.players[1].score = 80
    expect(tieNote(s)).toBe('Bot A and Bot B tied on 80 points. Only computer players were tied, so the winner was drawn at random.')
    expect(tieNote({ ...base(), roundResult: result({ winner: 1 }) })).toBe('')
    expect(tieNote(base())).toBe('')
  })
})
