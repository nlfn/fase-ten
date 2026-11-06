// Turns the flat list of plays into one entry per turn, so the history reads
// "Robo took 10, then discarded 11" instead of one line per action.

import type { Card, PlayEvent } from '../engine'

export type Step =
  | { kind: 'draw' }
  | { kind: 'pickup'; card: Card }
  | { kind: 'laydown'; phase: number }
  | { kind: 'hit'; cards: Card[]; owner: number }
  | { kind: 'discard'; card: Card }
  | { kind: 'skip'; card: Card; target: number }

export type Turn =
  | { skipped: false; player: number; steps: Step[] }
  | { skipped: true; player: number } // lost this turn to a Skip

/** Oldest first, like the events they come from. */
export function groupTurns(events: readonly PlayEvent[]): Turn[] {
  const turns: Turn[] = []
  type Open = { skipped: false; player: number; steps: Step[] }
  let open: Open | undefined

  for (const e of events) {
    if (e.kind === 'skipped') {
      open = undefined
      turns.push({ skipped: true, player: e.player })
      continue
    }

    // A draw or pickup always begins a turn. Anything else belongs to the turn in progress.
    let turn: Open
    if (e.kind === 'draw' || e.kind === 'pickup' || !open || open.player !== e.player) {
      turn = { skipped: false, player: e.player, steps: [] }
      turns.push(turn)
      open = turn
    } else {
      turn = open
    }

    switch (e.kind) {
      case 'draw':
        turn.steps.push({ kind: 'draw' })
        break
      case 'pickup':
        turn.steps.push({ kind: 'pickup', card: e.card })
        break
      case 'laydown':
        turn.steps.push({ kind: 'laydown', phase: e.phase })
        break
      case 'hit': {
        // Several cards added in a row to the same player's groups share one step.
        const last = turn.steps[turn.steps.length - 1]
        if (last && last.kind === 'hit' && last.owner === e.owner) last.cards.push(e.card)
        else turn.steps.push({ kind: 'hit', cards: [e.card], owner: e.owner })
        break
      }
      case 'discard':
        turn.steps.push({ kind: 'discard', card: e.card })
        break
      case 'skip':
        turn.steps.push({ kind: 'skip', card: e.card, target: e.target })
        break
    }
  }
  return turns
}
