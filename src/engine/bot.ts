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
// Levels:
//  - easy:   makes deliberate mistakes some of the time and remembers nothing about the others.
//  - medium: plays cleanly but only remembers each opponent's last pickup and last two discards.
//  - expert: plays cleanly and remembers every pickup and discard this round.
//
// Defense: once any opponent has laid down they can add cards to the groups on the table, so a
// discard that fits a group is a gift. If a laid-down opponent is down to two cards or fewer, the
// bot never discards a card the table can use when it has any other choice, and it aims Skips at
// that player first.
//
// Memory is used when choosing a discard: a card an opponent has been picking up is kept back
// when the choice is otherwise even, and a number an opponent has thrown away is safe to throw.

import { cardPoints } from './cards'
import type { Card } from './cards'
import { PHASE_COUNT, canHit, findPhaseLayout, phaseMissing, phaseSize } from './phases'
import type { RunEnd } from './phases'
import { createHitPlanner, lite, withHit } from './hitPlan'
import { currentPlayer, hitTargets, topDiscard } from './game'
import { targetPhase } from './game'
import type { Action, GameState, Player } from './game'

export type BotLevel = 'easy' | 'medium' | 'expert'

export interface Bot {
  level: BotLevel
  chooseAction(state: GameState): Action
}

/**
 * What separates the levels apart from memory (below).
 *  - mistakeRate: how often the bot deliberately plays a weaker move.
 *  - lookAhead:   plans the order of its hits (so Wilds bridge a run) instead of hitting greedily.
 *  - defense:     watches the table, never feeding a nearly-out opponent and Skipping them first.
 * Medium is tuned so Expert beats it about three games in four, and it beats Easy about three in four.
 */
const RULES: Record<BotLevel, { mistakeRate: number; lookAhead: boolean; defense: boolean }> = {
  easy: { mistakeRate: 0.35, lookAhead: true, defense: true },
  medium: { mistakeRate: 0.08, lookAhead: false, defense: false },
  expert: { mistakeRate: 0, lookAhead: true, defense: true },
}

/** How much of each opponent's recent play a level can recall. */
const MEMORY: Record<BotLevel, { pickups: number; discards: number }> = {
  easy: { pickups: 0, discards: 0 },
  medium: { pickups: 1, discards: 2 },
  expert: { pickups: Infinity, discards: Infinity },
}

export interface Recall {
  picked: Card[] // cards the opponent took from the discard pile, oldest first
  discarded: Card[] // cards the opponent threw away, oldest first
}

/** What a bot of this level remembers about each other player, from this round's plays. */
export function recall(state: GameState, me: number, level: BotLevel): Map<number, Recall> {
  const limit = MEMORY[level]
  const memory = new Map<number, Recall>()
  state.players.forEach((_, i) => {
    if (i !== me) memory.set(i, { picked: [], discarded: [] })
  })
  for (const e of state.events) {
    const entry = memory.get(e.player)
    if (!entry) continue
    if (e.kind === 'pickup') entry.picked.push(e.card)
    else if (e.kind === 'discard' || e.kind === 'skip') entry.discarded.push(e.card)
  }
  for (const entry of memory.values()) {
    entry.picked = limit.pickups === 0 ? [] : entry.picked.slice(-limit.pickups)
    entry.discarded = limit.discards === 0 ? [] : entry.discarded.slice(-limit.discards)
  }
  return memory
}

/**
 * How much giving this card away could help someone who has not laid down yet. A number an
 * opponent picked up is wanted (same number for a set, a neighbor for a run); a number they threw
 * away is not.
 */
export function discardDanger(state: GameState, memory: Map<number, Recall>, card: Card): number {
  if (card.kind !== 'number') return 0
  let danger = 0
  for (const [index, entry] of memory) {
    if (state.players[index].laidDown) continue
    let mine = 0
    for (const w of entry.picked) {
      if (w.kind !== 'number') continue
      if (w.value === card.value) mine += 3
      else if (Math.abs(w.value - card.value) <= 2) mine += 1
    }
    for (const d of entry.discarded) {
      if (d.kind === 'number' && d.value === card.value) mine -= 2
    }
    danger += Math.max(0, mine)
  }
  return danger
}

export function createBot(level: BotLevel = 'expert', random: () => number = Math.random): Bot {
  const { mistakeRate, lookAhead, defense } = RULES[level]
  const mistake = () => random() < mistakeRate

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
      left?: number
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

    // Look ahead: prefer the card that leaves the least behind once everything that can be played has
    // been (so Wilds bridge a gap to a card in hand instead of going on someone else's set). The
    // simple ranking above only decides between plays that are equally good.
    if (lookAhead) {
      const planner = createHitPlanner()
      const bodies = state.melds.map(lite)
      for (const o of options) {
        const index = state.melds.findIndex((m) => m.id === o.meldId)
        const rest = me.hand.filter((c) => c.id !== o.card.id)
        o.left = planner.best(rest, withHit(bodies, index, o.end))
      }
    }
    options.sort((a, b) => (a.left ?? 0) - (b.left ?? 0) || b.rank - a.rank)
    const best = options[0]
    return { type: 'hit', cardId: best.card.id, meldId: best.meldId, end: best.end }
  }

  function chooseSkipTarget(state: GameState): number {
    let tied: number[] = []
    let bestScore = -Infinity
    let bestPoints = Infinity
    state.players.forEach((p, i) => {
      if (i === state.current) return
      // Someone who has laid down and is nearly out is the one to stop. This outweighs everything else,
      // even a pending Skip, since a second Skip costs them another turn.
      const nearOut = p.laidDown && p.hand.length <= 2
      const closing = p.laidDown && p.hand.length <= 4
      // Anyone closing in on the end of the game is the one to stop, at every level: a player on their
      // last phase can finish the whole game, and one a phase or two behind that is about to be.
      const remaining = PHASE_COUNT - p.phase
      const endgame = remaining <= 1 ? 400 : remaining === 2 ? 350 : remaining === 3 ? 60 : 0
      const score =
        (p.laidDown ? 50 : 0) +
        p.phase * 3 +
        (11 - p.hand.length) +
        (defense ? (nearOut ? 300 : closing ? 40 : 0) : 0) +
        endgame -
        (p.skipsPending > 0 ? 100 : 0)
      // Equal targets: the lowest total score is the likeliest winner, so stop that one. If score cannot
      // separate them either, pick at random so no seat (the human in seat one) is the default victim.
      if (score > bestScore || (score === bestScore && p.score < bestPoints)) {
        bestScore = score
        bestPoints = p.score
        tied = [i]
      } else if (score === bestScore && p.score === bestPoints) {
        tied.push(i)
      }
    })
    return tied.length === 1 ? tied[0] : tied[Math.floor(random() * tied.length)]
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

    // An opponent who has laid down can add cards to any group on the table.
    const others = state.players.filter((_, i) => i !== state.current)
    const exposed = others.some((p) => p.laidDown)
    const usable = (c: Card) => exposed && state.melds.some((m) => canHit(m, c))
    // When one of them is almost out, do not hand them a card they can play, unless every choice is playable.
    if (defense && others.some((p) => p.laidDown && p.hand.length <= 2) && !mistake()) {
      const safe = candidates.filter((c) => !usable(c))
      if (safe.length > 0) candidates = safe
    }

    // Highest points first, so ties go to the card that is riskiest to hold. Cards that would help
    // an opponent are kept back when everything else is even.
    const memory = recall(state, state.current, level)
    const danger = new Map(
      candidates.map((c) => [c.id, discardDanger(state, memory, c) + (defense && usable(c) ? 2 : 0)]),
    )
    candidates.sort((a, b) => cardPoints(b) - cardPoints(a) || danger.get(a.id)! - danger.get(b.id)!)

    if (me.laidDown || mistake()) {
      return { type: 'discard', cardId: candidates[0].id }
    }

    // Before laying down: throw the card whose loss hurts the phase least.
    let best = candidates[0]
    let bestMissing = Infinity
    let bestDanger = Infinity
    for (const c of candidates) {
      const rest = hand.filter((h) => h.id !== c.id)
      const missing = missingFor(state, me, rest)
      const risk = danger.get(c.id)!
      if (missing < bestMissing || (missing === bestMissing && risk < bestDanger)) {
        bestMissing = missing
        bestDanger = risk
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
