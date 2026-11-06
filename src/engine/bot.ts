// Computer players. A bot looks at the whole game state and returns the next
// single action for the current player. Call it again after each action until
// the turn passes to someone else.
//
// Strategy in short:
//  - Draw: take the discard if it moves the hand closer to the current phase
//    (or can be hit onto a group that is already on the table).
//  - Play: lay down the phase as soon as possible, then hit every card it can
//    (natural cards first, Wilds last), then discard.
//  - Discard: Skip cards first (aimed at the most dangerous opponent), then
//    the highest-point card that does not hurt the phase. Wilds are kept.
//
// The 'easy' level makes deliberate mistakes some of the time.

import { cardPoints } from './cards'
import type { Card } from './cards'
import { PHASE_COUNT, canHit, findPhaseLayout, phaseMissing, phaseSize } from './phases'
import type { RunEnd } from './phases'
import { currentPlayer, hitTargets, topDiscard } from './game'
import { targetPhase } from './game'
import type { Action, GameState, Player } from './game'

export type BotLevel = 'easy' | 'normal'

export interface Bot {
  level: BotLevel
  chooseAction(state: GameState): Action
}

const MISTAKE_RATE: Record<BotLevel, number> = { easy: 0.35, normal: 0 }

export function createBot(level: BotLevel = 'normal', random: () => number = Math.random): Bot {
  const mistake = () => random() < MISTAKE_RATE[level]

  /** The phases this player could still lay down this round. */
  function openPhases(state: GameState, me: Player): number[] {
    if (state.mode !== 'yousee') {
      const target = targetPhase(state, me)
      return target === null ? [] : [target]
    }
    return me.done.map((done, i) => (done ? -1 : i)).filter((i) => i >= 0)
  }

  /** How many cards short the hand is of the closest phase the player is still free to lay down. */
  function missingFor(state: GameState, me: Player, hand: readonly Card[]): number {
    const open = openPhases(state, me)
    if (open.length === 0) return 0
    return Math.min(...open.map((i) => phaseMissing(hand, i)))
  }

  function chooseDraw(state: GameState): Action {
    const me = currentPlayer(state)
    const top = topDiscard(state)
    if (!top || top.kind === 'skip') return { type: 'drawDeck' }

    let wanted: boolean
    if (me.laidDown) {
      wanted = state.melds.some((m) => canHit(m, top))
    } else {
      wanted = missingFor(state, me, [...me.hand, top]) < missingFor(state, me, me.hand)
    }
    if (wanted && !mistake()) return { type: 'drawDiscard' }
    return { type: 'drawDeck' }
  }

  function choosePlay(state: GameState): Action {
    const me = currentPlayer(state)

    if (!me.laidDown) {
      // In YouSee any unfinished phase will do. Take the biggest one the hand can make, since
      // the small ones are easy to pick up later.
      const ready = openPhases(state, me)
        .filter((i) => phaseMissing(me.hand, i) === 0)
        .sort((a, b) => phaseSize(b) - phaseSize(a) || b - a)
      for (const phase of ready) {
        const layout = findPhaseLayout(me.hand, phase, state.melds)
        if (layout) {
          return { type: 'layDown', groups: layout.map((g) => g.map((c) => c.id)), phase }
        }
      }
    } else if (!mistake()) {
      const hit = chooseHit(state)
      if (hit) return hit
    }
    return chooseDiscard(state)
  }

  function chooseHit(state: GameState): Action | null {
    const me = currentPlayer(state)
    interface Option {
      card: Card
      meldId: number
      end?: RunEnd
      rank: number
    }
    const options: Option[] = []

    for (const card of me.hand) {
      if (card.kind === 'skip') continue
      for (const target of hitTargets(state, card)) {
        const meld = state.melds.find((m) => m.id === target.meldId)
        if (!meld) continue
        if (card.kind === 'number') {
          // Natural cards go first, highest points first.
          options.push({ card, meldId: meld.id, rank: 1000 + cardPoints(card) })
        } else if (meld.kind === 'run') {
          // Wilds go last. On a run, pick the end that lets another card of ours follow it.
          for (const end of target.ends) {
            const follow = end === 'high' ? meld.end + 2 : meld.start - 2
            const helps = me.hand.some((c) => c.kind === 'number' && c.value === follow)
            options.push({ card, meldId: meld.id, end, rank: helps ? 20 : 10 })
          }
        } else {
          // A Wild on a set or color group never blocks anything.
          options.push({ card, meldId: meld.id, rank: 30 })
        }
      }
    }
    if (options.length === 0) return null
    options.sort((a, b) => b.rank - a.rank)
    const best = options[0]
    return { type: 'hit', cardId: best.card.id, meldId: best.meldId, end: best.end }
  }

  function chooseSkipTarget(state: GameState): number {
    let best = -1
    let bestScore = -Infinity
    state.players.forEach((p, i) => {
      if (i === state.current) return
      const score =
        (p.laidDown ? 50 : 0) + p.phase * 3 + (11 - p.hand.length) - (p.skipsPending > 0 ? 100 : 0)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  function chooseDiscard(state: GameState): Action {
    const me = currentPlayer(state)
    const hand = me.hand

    const skipCard = hand.find((c) => c.kind === 'skip')
    if (skipCard) {
      return { type: 'discard', cardId: skipCard.id, skipTarget: chooseSkipTarget(state) }
    }

    // Keep Wilds unless there is nothing else to throw.
    let candidates: Card[] = hand.filter((c) => c.kind !== 'wild')
    if (candidates.length === 0) candidates = hand.slice()

    // Highest points first, so ties go to the card that is riskiest to hold.
    candidates.sort((a, b) => cardPoints(b) - cardPoints(a))

    if (me.laidDown || mistake()) {
      return { type: 'discard', cardId: candidates[0].id }
    }

    // Before laying down: throw the card whose loss hurts the phase least.
    let best = candidates[0]
    let bestMissing = Infinity
    for (const c of candidates) {
      const rest = hand.filter((h) => h.id !== c.id)
      const missing = missingFor(state, me, rest)
      if (missing < bestMissing) {
        bestMissing = missing
        best = c
      }
    }
    return { type: 'discard', cardId: best.id }
  }

  return {
    level,
    chooseAction(state: GameState): Action {
      return state.stage === 'draw' ? chooseDraw(state) : choosePlay(state)
    },
  }
}
