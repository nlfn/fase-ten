// The words the game screen shows for a game state: titles, progress lines and the round summary.
// Plain functions of the state, so they can be tested without a browser.

import { doneCount, isSingleRound, phaseDescription, phasesOf, targetPhase } from '../engine'
import type { Card, GameState, Meld } from '../engine'

/** The seat of the person playing. The computer players take the others. */
export const HUMAN = 0

export type SortMode = 'number' | 'color'

/** A hand in display order: by number or by color, with Wilds and then Skips at the end. */
export function sortHand(hand: readonly Card[], mode: SortMode): Card[] {
  const colorRank = { red: 0, blue: 1, green: 2, yellow: 3 }
  const key = (c: Card): number => {
    if (c.kind === 'wild') return 10_000
    if (c.kind === 'skip') return 10_001
    return mode === 'number' ? c.value * 10 + colorRank[c.color] : colorRank[c.color] * 100 + c.value
  }
  return hand.slice().sort((a, b) => key(a) - key(b) || a.id - b.id)
}

/** The caption over a group on the table, such as "Set of 7s" or "Red run 3 to 6". */
export function meldTitle(m: Meld): string {
  switch (m.kind) {
    case 'set':
      return m.color ? `${m.color[0].toUpperCase()}${m.color.slice(1)} set of ${m.value}s` : `Set of ${m.value}s`
    case 'run': {
      const tint = m.color ? `${m.color[0].toUpperCase()}${m.color.slice(1)} ` : ''
      if (m.step) return `${tint}${m.start % 2 === 0 ? (tint ? 'even' : 'Even') : tint ? 'odd' : 'Odd'} run ${m.start} to ${m.end}`
      if (m.color) return `${tint}run ${m.start} to ${m.end}`
      return `Run ${m.start} to ${m.end}`
    }
    case 'color':
      return `${m.color[0].toUpperCase()}${m.color.slice(1)} cards`
  }
}

/** "Phase 4", or "All phases done" for an index past the end of the list. */
export function phaseLabel(game: GameState, phase: number): string {
  return phase >= phasesOf(game.phaseSet).length ? 'All phases done' : `Phase ${phase + 1}`
}

/** The short progress line shown in a player's panel. */
export function progressLine(game: GameState, who: number): string {
  const count = phasesOf(game.phaseSet).length
  if (isSingleRound(game)) return 'Single round'
  if (game.mode === 'yousee') return `${doneCount(game.players[who])} of ${count} done`
  const label = phaseLabel(game, targetPhase(game, who) ?? count)
  // Once a round is over, a player who finished their phase has already moved on to the next one.
  return game.status === 'roundOver' ? `Next: ${label}` : label
}

/** What a player is after right now, shown under their stats. Empty when there is nothing to say. */
export function goalLine(game: GameState, who: number): string {
  const p = game.players[who]
  if (p.laid !== null) {
    if (isSingleRound(game)) return `Laid down: ${phaseDescription(p.laid, game.phaseSet)}`
    return `Laid down Phase ${p.laid + 1}: ${phaseDescription(p.laid, game.phaseSet)}`
  }
  if (game.mode === 'yousee') return ''
  const target = targetPhase(game, who)
  return target === null ? '' : phaseDescription(target, game.phaseSet)
}

/** The tied players of the round that just ended, as "You and Bot A". */
export function tiedNames(game: GameState): string {
  return (game.roundResult?.tie?.players ?? []).map((i) => (i === HUMAN ? 'You' : game.players[i].name)).join(' and ')
}

/** The heading of the round summary. */
export function resultTitle(game: GameState): string {
  if (game.status === 'gameOver') {
    const names = game.winners.map((i) => game.players[i].name)
    if (game.winners.length === 1) {
      const how = game.roundResult?.tie?.how
      const you = game.winners[0] === HUMAN
      if (how === 'round') return you ? 'You win the tiebreaker' : `${names[0]} wins the tiebreaker`
      if (how === 'coin') return you ? 'You win the coin toss' : `${names[0]} wins the coin toss`
      return you ? 'You win the game' : `${names[0]} wins the game`
    }
    return `${names.join(' and ')} tie for the win`
  }
  if (game.tieNext) return `${tiedNames(game)} are tied`
  const winner = game.roundResult?.winner
  if (winner === null || winner === undefined) return 'Round over'
  return winner === HUMAN ? 'You went out' : `${game.players[winner].name} went out`
}

/** Explains a tie at the end of a round, if there was one. */
export function tieNote(game: GameState): string {
  const tie = game.roundResult?.tie
  if (!tie) return ''
  const names = tiedNames(game)
  const score = game.players[tie.players[0] ?? 0].score
  const sitting = game.players.length > tie.players.length
  if (game.tieNext) {
    return (
      `${names} tied on ${score} points. Each of them repeats their final phase, and the first to go out wins.` +
      (sitting ? ' Everyone else sits this one out.' : '')
    )
  }
  if (tie.how === 'coin') {
    return `${names} tied on ${score} points. Only computer players were tied, so the winner was drawn at random.`
  }
  return ''
}

/** The label of the button that leaves the round summary. */
export function nextLabel(game: GameState): string {
  return game.tieNext ? 'Play tiebreaker' : 'Next round'
}
