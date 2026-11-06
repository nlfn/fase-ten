import { describe, expect, it } from 'vitest'
import type { Card, PlayEvent } from '../engine'
import { groupTurns } from './turns'

const card = (id: number, value = 5): Card => ({ id, kind: 'number', color: 'red', value })

describe('groupTurns', () => {
  it('puts a whole turn on one row: take, lay down, add cards, discard', () => {
    const events: PlayEvent[] = [
      { player: 0, kind: 'pickup', card: card(1) },
      { player: 0, kind: 'laydown', phase: 0 },
      { player: 0, kind: 'hit', card: card(2), owner: 0 },
      { player: 0, kind: 'hit', card: card(3), owner: 0 },
      { player: 0, kind: 'discard', card: card(4) },
    ]
    const turns = groupTurns(events)
    expect(turns).toHaveLength(1)
    const t = turns[0]
    expect(t.skipped).toBe(false)
    if (!t.skipped) expect(t.steps.map((s) => s.kind)).toEqual(['pickup', 'laydown', 'hit', 'discard'])
    if (!t.skipped) expect(t.steps[2]).toMatchObject({ kind: 'hit', owner: 0, cards: [{ id: 2 }, { id: 3 }] })
  })

  it('keeps additions to different players\' groups as separate steps', () => {
    const turns = groupTurns([
      { player: 1, kind: 'draw' },
      { player: 1, kind: 'hit', card: card(2), owner: 0 },
      { player: 1, kind: 'hit', card: card(3), owner: 1 },
      { player: 1, kind: 'discard', card: card(4) },
    ])
    const t = turns[0]
    if (t.skipped) throw new Error('unexpected')
    expect(t.steps.filter((s) => s.kind === 'hit')).toHaveLength(2)
  })

  it('makes one row per player turn, in order', () => {
    const turns = groupTurns([
      { player: 0, kind: 'draw' },
      { player: 0, kind: 'discard', card: card(1) },
      { player: 1, kind: 'pickup', card: card(1) },
      { player: 1, kind: 'discard', card: card(2) },
    ])
    expect(turns.map((t) => t.player)).toEqual([0, 1])
  })

  it('shows a lost turn as its own row and starts a fresh turn after it', () => {
    // Player 0 skips player 1, then plays again right away in a two player game.
    const turns = groupTurns([
      { player: 0, kind: 'draw' },
      { player: 0, kind: 'skip', card: { id: 9, kind: 'skip' }, target: 1 },
      { player: 1, kind: 'skipped' },
      { player: 0, kind: 'draw' },
      { player: 0, kind: 'discard', card: card(5) },
    ])
    expect(turns.map((t) => (t.skipped ? `${t.player}:skipped` : `${t.player}:turn`))).toEqual([
      '0:turn',
      '1:skipped',
      '0:turn',
    ])
  })

  it('separates back to back turns by the same player even without a lost turn between', () => {
    const turns = groupTurns([
      { player: 0, kind: 'draw' },
      { player: 0, kind: 'discard', card: card(1) },
      { player: 0, kind: 'draw' },
      { player: 0, kind: 'discard', card: card(2) },
    ])
    expect(turns).toHaveLength(2)
  })

  it('shows a turn that is still in progress', () => {
    const turns = groupTurns([{ player: 2, kind: 'draw' }])
    expect(turns).toHaveLength(1)
    const t = turns[0]
    if (!t.skipped) expect(t.steps).toEqual([{ kind: 'draw' }])
  })

  it('handles no events', () => {
    expect(groupTurns([])).toEqual([])
  })
})
