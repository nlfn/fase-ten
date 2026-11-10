// Looks ahead over the cards a player could add to groups on the table, so the best sequence is
// chosen instead of the best single card. The important case is bridging with Wilds: with a run on
// the table and 2, 3 and two Wilds in hand, the Wilds have to go on the run first (as 5 and 4) so
// that the 3 and the 2 can follow. Putting them on someone else's set instead strands both cards.

import { cardPoints } from './cards'
import type { Card } from './cards'
import { canHit, runEndsFor } from './phases'
import type { MeldBody, RunEnd } from './phases'

const NODE_LIMIT = 40_000

const cardSig = (c: Card): string => (c.kind === 'number' ? `n${c.value}${c.color}` : c.kind)

function meldSig(m: MeldBody): string {
  if (m.kind === 'set') return `s${m.value}`
  if (m.kind === 'color') return `c${m.color}`
  return `r${m.start}-${m.end}${m.step ? 'e' : ''}${m.color ?? ''}`
}

/** A copy of a group that only keeps what decides which cards fit. */
export function lite(m: MeldBody): MeldBody {
  if (m.kind === 'run') return { kind: 'run', start: m.start, end: m.end, cards: [], step: m.step, color: m.color }
  if (m.kind === 'set') return { kind: 'set', value: m.value, cards: [] }
  return { kind: 'color', color: m.color, cards: [] }
}

/** The groups after one card is added at the given end of a run (the end is ignored for other groups). */
export function withHit(melds: readonly MeldBody[], index: number, end: RunEnd | undefined): MeldBody[] {
  return melds.map((m, i) => {
    if (i !== index || m.kind !== 'run') return m
    const step = m.step ?? 1
    return end === 'high'
      ? { kind: 'run', start: m.start, end: m.end + step, cards: [], step: m.step, color: m.color }
      : { kind: 'run', start: m.start - step, end: m.end, cards: [], step: m.step, color: m.color }
  })
}

/**
 * What stays in hand once play stops, counting the best discard as free. So a hand that empties,
 * or has one card left to throw, scores 0.
 */
export function leftoverPoints(hand: readonly Card[]): number {
  let sum = 0
  let max = 0
  for (const c of hand) {
    const p = cardPoints(c)
    sum += p
    if (p > max) max = p
  }
  return sum - max
}

export interface HitPlanner {
  /** The lowest leftover points reachable from this hand and these groups by adding cards. */
  best(hand: readonly Card[], melds: readonly MeldBody[]): number
}

export function createHitPlanner(): HitPlanner {
  const memo = new Map<string, number>()
  let nodes = 0

  const go = (hand: Card[], melds: MeldBody[]): number => {
    const key = `${hand.map(cardSig).sort().join(',')}|${melds.map(meldSig).sort().join(',')}`
    const known = memo.get(key)
    if (known !== undefined) return known

    let best = leftoverPoints(hand)
    if (best > 0 && nodes++ < NODE_LIMIT) {
      const tried = new Set<string>()
      search: for (let i = 0; i < hand.length; i++) {
        const card = hand[i]
        if (card.kind === 'skip') continue
        const sig = cardSig(card)
        if (tried.has(sig)) continue
        tried.add(sig)
        const rest = hand.filter((_, k) => k !== i)
        for (let j = 0; j < melds.length; j++) {
          const meld = melds[j]
          if (!canHit(meld, card)) continue
          const ends: (RunEnd | undefined)[] = meld.kind === 'run' ? runEndsFor(meld, card) : [undefined]
          for (const end of ends) {
            best = Math.min(best, go(rest, withHit(melds, j, end)))
            if (best === 0) break search
          }
        }
      }
    }
    memo.set(key, best)
    return best
  }

  return { best: (hand, melds) => go(hand.slice(), melds.slice()) }
}
