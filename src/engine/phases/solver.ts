// Solvers, used by the computer players and the "auto lay down" button.

import { COLORS, MAX_VALUE, MIN_VALUE, handPoints } from '../cards'
import type { Card, NumberCard } from '../cards'
import { defsOf } from './lists'
import type { PhaseSet } from './lists'
import { ALL_VALUES, buildGroup, canHit, hitMeld, matchPhase, valuesFor } from './melds'
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

/** The starting positions a run of this kind could have: every window of the right length in its line of numbers. */
function runWindows(spec: GroupSpec): number[][] {
  const line = valuesFor(spec.parity)
  const out: number[][] = []
  for (let s = 0; s + spec.size <= line.length; s++) out.push(line.slice(s, s + spec.size))
  return out
}

type Counts = number[][] // counts[value][colorIndex]

/** Takes up to `want` cards of this number, from the colors it has the most of. Returns how many it took. */
function takeNumber(counts: Counts, value: number, want: number, spare?: number): number {
  const row = counts[value]
  let took = 0
  // `spare` is a color the caller would rather keep, so take from the other colors first.
  const order = [0, 1, 2, 3].sort((a, b) => (a === spare ? 1 : 0) - (b === spare ? 1 : 0) || row[b] - row[a])
  for (const k of order) {
    while (took < want && row[k] > 0) {
      row[k]--
      took++
    }
  }
  return took
}

/** How many cards of the window this hand has, one per number, using up the cards it counts. */
function takeRun(counts: Counts, spec: GroupSpec, window: readonly number[], onlyColor?: number): number {
  if (spec.rainbow) return takeRainbow(counts, window, Math.floor(spec.size / 4))
  let covered = 0
  for (const v of window) {
    const row = counts[v]
    let pick = -1
    for (let k = 0; k < 4; k++) {
      if (row[k] <= 0) continue
      if (onlyColor !== undefined && k !== onlyColor) continue
      if (pick < 0 || row[k] > row[pick]) pick = k
    }
    if (pick < 0) continue
    row[pick]--
    covered++
  }
  return covered
}

/**
 * For a run with the same number of cards of every color: how many numbers of the window can be
 * covered by a card when no color may be used more than `cap` times. That is a matching problem,
 * solved by trying to move an earlier choice aside whenever a color is full.
 */
function takeRainbow(counts: Counts, window: readonly number[], cap: number): number {
  const owner: number[][] = [[], [], [], []] // for each color, the window positions using it
  const tryPlace = (pos: number, seen: boolean[]): boolean => {
    const row = counts[window[pos]]
    for (let k = 0; k < 4; k++) {
      if (row[k] <= 0 || seen[k]) continue
      seen[k] = true
      if (owner[k].length < cap) {
        owner[k].push(pos)
        return true
      }
      for (let m = 0; m < owner[k].length; m++) {
        const other = owner[k][m]
        owner[k].splice(m, 1)
        if (tryPlace(other, seen)) {
          owner[k].push(pos)
          return true
        }
        owner[k].splice(m, 0, other)
      }
    }
    return false
  }
  let covered = 0
  for (let pos = 0; pos < window.length; pos++) if (tryPlace(pos, [false, false, false, false])) covered++
  for (let k = 0; k < 4; k++) for (const pos of owner[k]) counts[window[pos]][k]--
  return covered
}

const cloneCounts = (c: Counts): Counts => c.map((row) => row.slice())

interface Option {
  got: number
  left: Counts
}

/** Every way one group could be filled from these counts: how many cards it uses, and what is left. */
function optionsFor(spec: GroupSpec, counts: Counts, sparing: boolean): Option[] {
  const out: Option[] = []
  switch (spec.kind) {
    case 'set':
      for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
        if (spec.oneColor) {
          // All one color: only the copies of this number in a single color count.
          for (let k = 0; k < 4; k++) {
            const left = cloneCounts(counts)
            const got = Math.min(spec.size, left[v][k])
            left[v][k] -= got
            out.push({ got, left })
          }
          continue
        }
        // Which colors a set takes matters when another group wants a color of this number (a pair in one
        // color, say), so also try leaving each color for last.
        for (let spare = -1; spare < (sparing ? 4 : 0); spare++) {
          const left = cloneCounts(counts)
          out.push({ got: takeNumber(left, v, spec.size, spare < 0 ? undefined : spare), left })
        }
      }
      break
    case 'color':
      // Which cards of the color to take matters when another group wants some of them, so also try
      // leaving each number for last.
      for (let k = 0; k < 4; k++) {
        for (let keep = 0; keep <= MAX_VALUE; keep++) {
          const left = cloneCounts(counts)
          let got = 0
          const order = ALL_VALUES.slice().sort((x, y) => (x === keep ? 1 : 0) - (y === keep ? 1 : 0) || x - y)
          for (const v of order) {
            while (got < spec.size && left[v][k] > 0) {
              left[v][k]--
              got++
            }
          }
          out.push({ got, left })
        }
      }
      break
    case 'run':
      for (const w of runWindows(spec)) {
        if (spec.oneColor) {
          // All one color: try the window in each color.
          for (let k = 0; k < 4; k++) {
            const left = cloneCounts(counts)
            out.push({ got: takeRun(left, spec, w, k), left })
          }
          continue
        }
        const left = cloneCounts(counts)
        out.push({ got: takeRun(left, spec, w), left })
      }
  }
  return out
}

/**
 * The most cards the groups can use between them. With one or two groups every choice is tried, so
 * a set and a run that want the same card are sorted out properly. With more, each group in turn
 * takes the most it can (biggest groups first), which is close enough for an estimate.
 */
function most(specs: readonly GroupSpec[], counts: Counts, sparing: boolean): number {
  if (specs.length === 0) return 0
  const [first, ...rest] = specs
  const options = optionsFor(first, counts, sparing)
  if (specs.length <= 2) {
    let best = 0
    for (const o of options) best = Math.max(best, o.got + most(rest, o.left, sparing))
    return best
  }
  let pick = options[0]
  for (const o of options) if (o.got > pick.got) pick = o
  return pick.got + most(rest, pick.left, sparing)
}

/**
 * Cheap estimate of how many more cards are needed to complete the phase
 * (0 means the hand can lay down now). Wilds count as fillers for any gap.
 * This is a heuristic used for draw and discard decisions: the groups are
 * filled one at a time, biggest first, each taking the most the hand can give it.
 * A set that shares a number with a run (or colors with a color group) is
 * tried in every combination, so the answer is not thrown off by order.
 */
export function phaseMissing(hand: readonly Card[], phaseIdx: number, set: PhaseSet = 'classic'): number {
  const specs = defsOf(set)[phaseIdx]?.groups
  if (!specs) return 0
  const estimate = estimateMissing(hand, specs)
  // The estimate is exact for one or two groups but greedy for three or more, and with many groups it can say
  // a card is missing when the hand is already complete. When it says short and the hand is big enough to hold
  // the whole phase, the solver has the final word.
  if (estimate > 0 && specs.length >= 3 && hand.length >= specs.reduce((sum, g) => sum + g.size, 0)) {
    if (findPhaseLayout(hand, phaseIdx, [], set)) return 0
  }
  return estimate
}

function estimateMissing(hand: readonly Card[], specs: readonly GroupSpec[]): number {
  const needed = specs.reduce((sum, g) => sum + g.size, 0)

  const counts: Counts = Array.from({ length: MAX_VALUE + 1 }, () => [0, 0, 0, 0])
  let wilds = 0
  for (const c of hand) {
    if (c.kind === 'wild') wilds++
    else if (c.kind === 'number') counts[c.value][COLORS.indexOf(c.color)]++
  }

  // Another group that wants one color of a number is why a set has to try leaving each color for last.
  const sparing = specs.some((g) => g.oneColor)
  const got = most(specs.slice().sort((x, y) => y.size - x.size), counts, sparing)
  // Wilds only help with groups that allow them. The groups that do not are counted first, as if they get
  // first pick of the naturals, and whatever they are still short of is a gap no Wild can close.
  const strict = specs.filter((g) => g.noWild)
  if (strict.length === 0) return Math.max(0, needed - got - wilds)
  const strictSize = strict.reduce((sum, g) => sum + g.size, 0)
  const strictGap = Math.min(needed - got, strictSize - most(strict.slice().sort((x, y) => y.size - x.size), counts, sparing))
  return Math.max(0, strictGap + Math.max(0, needed - got - strictGap - wilds))
}
