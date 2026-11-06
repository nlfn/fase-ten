// Small helpers for building cards and crafted game states in tests.

import type { Card, Color, NumberCard, SkipCard, WildCard } from './cards'
import { createGame } from './game'
import type { GameMode, GameState, PlayerSetup } from './game'

let nextTestId = 10_000

export const num = (value: number, color: Color = 'red'): NumberCard => ({
  id: nextTestId++,
  kind: 'number',
  color,
  value,
})
export const wild = (): WildCard => ({ id: nextTestId++, kind: 'wild' })
export const skip = (): SkipCard => ({ id: nextTestId++, kind: 'skip' })

/** Several numbers at once: nums(1, 2, 3) gives red 1, 2, 3. */
export const nums = (...values: number[]): NumberCard[] => values.map((v) => num(v))

export const ids = (cards: readonly Card[]): number[] => cards.map((c) => c.id)

export const TWO_PLAYERS: PlayerSetup[] = [
  { name: 'Ann', isBot: false },
  { name: 'Bot', isBot: true },
]
export const THREE_PLAYERS: PlayerSetup[] = [
  { name: 'Ann', isBot: false },
  { name: 'Bot A', isBot: true },
  { name: 'Bot B', isBot: true },
]

/**
 * A fresh game with the current player's hand replaced and the turn put in the
 * 'play' stage (as if they had already drawn). Other hands are left as dealt.
 */
export function craftedGame(
  hand: Card[],
  options: { setups?: PlayerSetup[]; player?: number; phase?: number; seed?: number; mode?: GameMode } = {},
): GameState {
  const { setups = TWO_PLAYERS, player = 0, phase = 0, seed = 1, mode = 'classic' } = options
  const s = structuredClone(createGame(setups, seed, mode))
  s.current = player
  s.stage = 'play'
  for (const p of s.players) p.skipped = false
  s.players[player].hand = hand
  s.players[player].phase = phase
  // In classic mode the earlier phases are done. In yousee, tests set `done` themselves.
  if (mode === 'classic') s.players[player].done = s.players[player].done.map((_, i) => i < phase)
  return s
}
