// Laying a phase down: splitting chosen cards into groups, and finding the best layout in a hand.
// How far a hand is from a phase is in missing.ts.

import { COLORS, handPoints } from '../cards'
import type { Card, NumberCard } from '../cards'
import { defsOf } from './lists'
import type { PhaseSet } from './lists'
import { buildGroup, canHit, hitMeld, matchPhase } from './melds'
import type { Meld, MeldBody } from './melds'
import { sameSpec } from './spec'
import type { GroupSpec } from './spec'

/** Could these cards still end up in a group of this kind? Used to cut off hopeless splits early. */
function mayJoin(spec: GroupSpec, cards: readonly Card[]): boolean {
  if (spec.noWild && cards.some((c) => c.kind === 'wild')) return false
  const naturals = cards.filter((c): c is NumberCard => c.kind === 'number')
  const oneColor = naturals.every((c) => c.color === naturals[0].color)
  if (spec.kind === 'color') return oneColor
  if (spec.oneColor && !oneColor) return false
  if (spec.kind === 'set') return naturals.every((c) => c.value === naturals[0].value)
  if (spec.parity && naturals.some((c) => (c.value % 2 === 0) !== (spec.parity === 'even'))) return false
  if (spec.rainbow) {
    const each = Math.floor(spec.size / 4)
    for (const col of COLORS) if (naturals.filter((c) => c.color === col).length > each) return false
  }
  // Every run needs different numbers.
  return new Set(naturals.map((c) => c.value)).size === naturals.length
}

/**
 * Splits a player's selected cards into the groups the phase asks for, in
 * whichever way works. Returns null if the selection cannot make the phase.
 * Used when a person picks the cards to lay down by hand.
 */
export function arrangeSelection(
  cards: readonly Card[],
  phaseIdx: number,
  set: PhaseSet = 'classic',
): Card[][] | null {
  const specs = defsOf(set)[phaseIdx]?.groups
  if (!specs || cards.length === 0) return null
  if (specs.length === 1) {
    return matchPhase(phaseIdx, [cards], set) ? [cards.slice()] : null
  }
  if (cards.length > 16) return null
  // Try every way of dealing the cards into the groups. A card that cannot go in a group
  // (a different number in a set, say) ends that branch at once, so this stays quick.
  const groups: Card[][] = specs.map(() => [])
  const place = (i: number): boolean => {
    if (i === cards.length) {
      return groups.every((g) => g.length > 0) && matchPhase(phaseIdx, groups, set) !== null
    }
    for (let k = 0; k < groups.length; k++) {
      // The first card always goes in the first group that is still empty, which skips mirror images.
      if (groups[k].length === 0 && groups.slice(0, k).some((g) => g.length === 0)) break
      groups[k].push(cards[i])
      // Groups are matched to the phase in any order, so test against the loosest rule they might get.
      const fits = specs.some((sp) => mayJoin(sp, groups[k]))
      if (fits && place(i + 1)) return true
      groups[k].pop()
    }
    return false
  }
  return place(0) ? groups.map((g) => g.slice()) : null
}

export function* combinations<T>(items: readonly T[], k: number): Generator<T[]> {
  const n = items.length
  if (k > n || k < 0) return
  const idx = Array.from({ length: k }, (_, i) => i)
  while (true) {
    yield idx.map((i) => items[i])
    let i = k - 1
    while (i >= 0 && idx[i] === n - k + i) i--
    if (i < 0) return
    idx[i]++
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1
  }
}

interface Layout {
  groups: Card[][]
  stuck: number // cards that could not be played onto any group afterwards
  wilds: number
  points: number // points left in hand after the follow-up plays
}

/**
 * Counts what would still be in hand after laying down and then adding every
 * card that fits onto the new groups (and the groups already on the table).
 * Naturals go first so a Wild is only spent where nothing else fits.
 */
function afterPlays(
  bodies: readonly MeldBody[],
  rest: readonly Card[],
  table: readonly Meld[],
): { stuck: number; points: number } {
  const melds: MeldBody[] = [...bodies, ...table].map((m) => ({ ...m, cards: m.cards.slice() }))
  let left = rest.filter((c) => c.kind !== 'skip')
  const fixed = rest.filter((c) => c.kind === 'skip')

  const place = (cards: Card[]): boolean => {
    let placed = false
    for (const c of cards) {
      const target = melds.find((m) => canHit(m, c))
      if (target && hitMeld(target as Meld, c)) {
        left = left.filter((x) => x.id !== c.id)
        placed = true
      }
    }
    return placed
  }

  while (place(left.filter((c) => c.kind === 'number'))) {
    // keep going: one added card can open the way for another (runs)
  }
  place(left.filter((c) => c.kind === 'wild'))
  while (place(left.filter((c) => c.kind === 'number'))) {
    // a Wild may have extended a run far enough to take more naturals
  }

  const remaining = [...left, ...fixed]
  return { stuck: remaining.length, points: handPoints(remaining) }
}

/**
 * Finds a way to lay down the phase using exactly the minimum cards for each
 * group. Among the possible layouts it prefers the one that leaves the most
 * cards playable afterwards (added onto the new groups or those already on the
 * table), then the one that spends the fewest Wilds, then the fewest points
 * left in hand. Returns null when the hand cannot make the phase.
 */
export function findPhaseLayout(
  hand: readonly Card[],
  phaseIdx: number,
  table: readonly Meld[] = [],
  set: PhaseSet = 'classic',
): Card[][] | null {
  const specs = defsOf(set)[phaseIdx]?.groups
  if (!specs) return null
  const playable = hand.filter((c) => c.kind !== 'skip')
  const place = new Map(playable.map((c, i) => [c.id, i]))
  const search: { best: Layout | null } = { best: null }
  const chosen: Card[][] = []

  const recurse = (specIdx: number, remaining: Card[]) => {
    if (specIdx === specs.length) {
      const bodies = matchPhase(phaseIdx, chosen, set)
      if (!bodies) return
      const used = new Set(chosen.flat().map((c) => c.id))
      const rest = hand.filter((c) => !used.has(c.id))
      const wilds = chosen.flat().filter((c) => c.kind === 'wild').length
      const { stuck, points } = afterPlays(bodies, rest, table)
      const best = search.best
      const better =
        !best ||
        stuck < best.stuck ||
        (stuck === best.stuck &&
          (wilds < best.wilds || (wilds === best.wilds && points < best.points)))
      if (better) search.best = { groups: chosen.map((g) => g.slice()), stuck, wilds, points }
      return
    }
    const spec = specs[specIdx]
    // Two groups of the same kind are interchangeable, so only look at them in one order.
    const prev = specIdx > 0 ? specs[specIdx - 1] : null
    const twin = prev !== null && sameSpec(prev, spec)
    const floor = twin ? (place.get(chosen[specIdx - 1][0].id) ?? -1) : -1
    for (const combo of combinations(remaining, spec.size)) {
      if (twin && (place.get(combo[0].id) ?? -1) < floor) continue
      if (!buildGroup(spec, combo)) continue
      chosen.push(combo)
      const ids = new Set(combo.map((c) => c.id))
      recurse(
        specIdx + 1,
        remaining.filter((c) => !ids.has(c.id)),
      )
      chosen.pop()
    }
  }

  recurse(0, playable)
  return search.best ? search.best.groups : null
}
