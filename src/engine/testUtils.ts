import type { GroupSpec } from './phases'
// Small helpers for building cards and crafted game states in tests.

import type { Card, Color, NumberCard, SkipCard, WildCard } from './cards'
import { createGame, targetPhase } from './game'
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
  for (const p of s.players) p.skipsPending = 0
  s.players[player].hand = hand
  // The earlier phases on the player's route are done. In yousee, tests set `done` themselves.
  advance(s, player, phase)
  return s
}

/** Marks the first `count` phases on a player's route as done, and the rest as not done. */
export function advance(s: GameState, who: number, count: number): void {
  const p = s.players[who]
  const finished = p.route.slice(0, count)
  p.done = p.done.map((_, i) => finished.includes(i))
}

/** Marks a player as having laid down this round: the phase given, or the one they are on. */
export function markLaid(s: GameState, who: number, phase?: number): void {
  s.players[who].laid = phase ?? targetPhase(s, who) ?? 0
}

/** The group names the tests use ('parity', 'colorRun' and 'rainbow' are runs with a switch on). */
export type GroupName = 'set' | 'run' | 'color' | 'parity' | 'colorRun' | 'rainbow'

export function group(name: GroupName, size: number, extra: Partial<GroupSpec> = {}): GroupSpec {
  if (name === 'colorRun') return { kind: 'run', size, oneColor: true, ...extra }
  if (name === 'rainbow') return { kind: 'run', size, rainbow: true, ...extra }
  if (name === 'parity') return { kind: 'run', size, ...extra }
  return { kind: name, size, ...extra }
}
