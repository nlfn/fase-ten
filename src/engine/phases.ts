// Phase definitions, meld validation, hitting rules, and phase solvers.
// Pure TypeScript with no UI dependencies.
//
// House rule worth knowing: every group (set, run, or color group) must
// contain at least one natural (non-Wild) card. A group made only of Wilds
// is not allowed, because its value would be undefined.

import { COLORS, MAX_VALUE, MIN_VALUE, handPoints } from './cards'
import type { Card, Color, NumberCard } from './cards'

/**
 * set: same number. run: consecutive numbers. color: any numbers, all one color.
 * parity: a run that only uses even or odd numbers, stepping by two (a "run of six evens" is 2, 4, 6, 8, 10, 12).
 * colorRun: a run where every card is the same color.
 * rainbow: a run with the same number of cards of each color (size / 4). Once laid it is a plain run.
 * pureRun: a run made only of number cards. No Wilds can be used to lay it down (they can still be added afterwards).
 */
export type GroupKind = 'set' | 'run' | 'color' | 'parity' | 'colorRun' | 'rainbow' | 'pureRun'

export type Parity = 'even' | 'odd'

export interface GroupSpec {
  kind: GroupKind
  size: number
  parity?: Parity
}

/** Which list of ten phases a game uses. */
export type PhaseSet = 'classic' | 'alternate'

export interface PhaseDef {
  number: number
  groups: readonly GroupSpec[]
  description: string
}

const set = (size: number): GroupSpec => ({ kind: 'set', size })
const run = (size: number): GroupSpec => ({ kind: 'run', size })
const color = (size: number): GroupSpec => ({ kind: 'color', size })
const evens = (size: number): GroupSpec => ({ kind: 'parity', size, parity: 'even' })
const odds = (size: number): GroupSpec => ({ kind: 'parity', size, parity: 'odd' })
const colorRun = (size: number): GroupSpec => ({ kind: 'colorRun', size })
const rainbow = (size: number): GroupSpec => ({ kind: 'rainbow', size })
const pureRun = (size: number): GroupSpec => ({ kind: 'pureRun', size })

export const PHASES: readonly PhaseDef[] = [
  { number: 1, groups: [set(3), set(3)], description: '2 sets of 3' },
  { number: 2, groups: [set(3), run(4)], description: '1 set of 3 + 1 run of 4' },
  { number: 3, groups: [set(4), run(4)], description: '1 set of 4 + 1 run of 4' },
  { number: 4, groups: [run(7)], description: '1 run of 7' },
  { number: 5, groups: [run(8)], description: '1 run of 8' },
  { number: 6, groups: [run(9)], description: '1 run of 9' },
  { number: 7, groups: [set(4), set(4)], description: '2 sets of 4' },
  { number: 8, groups: [color(7)], description: '7 cards of one color' },
  { number: 9, groups: [set(5), set(2)], description: '1 set of 5 + 1 set of 2' },
  { number: 10, groups: [set(5), set(3)], description: '1 set of 5 + 1 set of 3' },
]

export const PHASE_COUNT = PHASES.length

/** Every alternate phase being considered, in no particular order. The game uses ten of them (see ALTERNATE_PHASES). */
export const ALTERNATE_CANDIDATES: readonly PhaseDef[] = [
  { number: 0, groups: [set(2), set(2), set(2), set(2)], description: '4 sets of 2' },
  { number: 0, groups: [set(3), set(3), set(3)], description: '3 sets of 3' },
  { number: 0, groups: [run(4), run(4)], description: '2 runs of 4' },
  { number: 0, groups: [run(3), run(3), run(3)], description: '3 runs of 3' },
  { number: 0, groups: [color(5), set(3)], description: '5 of one color + 1 set of 3' },
  { number: 0, groups: [evens(6), set(2)], description: '1 run of 6 evens + 1 set of 2' },
  { number: 0, groups: [odds(6), set(3)], description: '1 run of 6 odds + 1 set of 3' },
  { number: 0, groups: [colorRun(6)], description: '1 color run of 6' },
  { number: 0, groups: [rainbow(8)], description: '1 rainbow run of 8' },
  { number: 0, groups: [run(10)], description: '1 run of 10' },
  { number: 0, groups: [evens(5), set(4)], description: '1 run of 5 evens + 1 set of 4' },
  { number: 0, groups: [odds(5), set(3)], description: '1 run of 5 odds + 1 set of 3' },
  { number: 0, groups: [evens(5), set(2)], description: '1 run of 5 evens + 1 set of 2' },
  { number: 0, groups: [set(4), run(5)], description: '1 set of 4 + 1 run of 5' },
  { number: 0, groups: [set(3), run(6)], description: '1 set of 3 + 1 run of 6' },
  { number: 0, groups: [run(5), run(4)], description: '1 run of 5 + 1 run of 4' },
  { number: 0, groups: [colorRun(5), set(2)], description: '1 run of 5 in one color + 1 set of 2' },
  { number: 0, groups: [colorRun(4), set(3)], description: '1 color run of 4 + 1 set of 3' },
  { number: 0, groups: [rainbow(4), set(3)], description: '1 rainbow run of 4 + 1 set of 3' },
  { number: 0, groups: [set(3), set(3), set(2)], description: '2 sets of 3 + 1 set of 2' },
  { number: 0, groups: [set(4), set(2), set(2)], description: '1 set of 4 + 2 sets of 2' },
  { number: 0, groups: [evens(5), set(3)], description: '1 run of 5 evens + 1 set of 3' },
  { number: 0, groups: [rainbow(4), set(4)], description: '1 rainbow run of 4 + 1 set of 4' },
  { number: 0, groups: [colorRun(3), colorRun(3)], description: '2 color runs of 3' },
  { number: 0, groups: [colorRun(3), colorRun(3), colorRun(3)], description: '3 color runs of 3' },
  { number: 0, groups: [pureRun(6)], description: '1 run of 6, no Wilds' },
  { number: 0, groups: [pureRun(7)], description: '1 run of 7, no Wilds' },
  { number: 0, groups: [pureRun(8)], description: '1 run of 8, no Wilds' },
  { number: 0, groups: [pureRun(9)], description: '1 run of 9, no Wilds' },
]

/**
 * The ten alternate phases, easiest first. The order comes from simulated games: the bots played thousands
 * of rounds at a table where everyone is on a random phase, and the phases are ranked by how often a player
 * managed to lay down before the round ended (Expert, 3 players). The list climbs evenly from about 80% to
 * about 50%, with no early phase that ends the round within two or three turns, and nothing but the run of
 * ten uses all ten cards in a hand. The last two are deliberate: whoever lays down the run of ten goes out at
 * once, and the run of six in one color (about 37%) is the capstone, where only one player can go out.
 */
const ALTERNATE_ORDER = [
  '5 of one color + 1 set of 3',
  '1 rainbow run of 4 + 1 set of 3',
  '2 sets of 3 + 1 set of 2',
  '1 set of 4 + 2 sets of 2',
  '1 run of 6 evens + 1 set of 2',
  '1 run of 5 odds + 1 set of 3',
  '1 color run of 4 + 1 set of 3',
  '1 rainbow run of 8',
  '1 run of 10',
  '1 color run of 6',
]

export const ALTERNATE_PHASES: readonly PhaseDef[] = ALTERNATE_ORDER.map((description, i) => {
  const found = ALTERNATE_CANDIDATES.find((p) => p.description === description)
  if (!found) throw new Error(`Unknown alternate phase: ${description}`)
  return { ...found, number: i + 1 }
})

export const PHASE_SETS: Record<string, readonly PhaseDef[]> = {
  classic: PHASES,
  alternate: ALTERNATE_PHASES,
}

function defsOf(set: string): readonly PhaseDef[] {
  return PHASE_SETS[set] ?? PHASES
}

export function phasesOf(set: PhaseSet): readonly PhaseDef[] {
  return defsOf(set)
}

/** Whether Wilds can help lay this phase down. False when every group is a run with no Wilds. */
export function allowsWilds(phaseIdx: number, set: PhaseSet = 'classic'): boolean {
  return !(defsOf(set)[phaseIdx]?.groups ?? []).every((g) => g.kind === 'pureRun')
}

/** How many cards the phase asks for in total. */
export function phaseSize(phaseIdx: number, set: PhaseSet = 'classic'): number {
  return (defsOf(set)[phaseIdx]?.groups ?? []).reduce((sum, g) => sum + g.size, 0)
}

export function phaseDescription(phaseIdx: number, set: PhaseSet = 'classic'): string {
  return defsOf(set)[phaseIdx]?.description ?? ''
}

// ---------------------------------------------------------------------------
// Melds
// ---------------------------------------------------------------------------

export type RunEnd = 'low' | 'high'

export interface SetBody {
  kind: 'set'
  value: number
  cards: Card[]
}
export interface RunBody {
  kind: 'run'
  start: number // lowest number the run covers
  end: number // highest number the run covers
  cards: Card[] // ordered low to high, Wilds sit in the position they stand for
  step?: 2 // a run of evens or odds goes up in twos. Missing means the usual steps of one
  color?: Color // a run in one color: only cards of that color (and Wilds) can be added
}
export interface ColorBody {
  kind: 'color'
  color: Color
  cards: Card[]
}
export type MeldBody = SetBody | RunBody | ColorBody
export type Meld = MeldBody & { id: number; owner: number }

/** Cards of the same number. Wilds may stand in. Needs at least `minSize` cards. */
export function buildSet(cards: readonly Card[], minSize: number): SetBody | null {
  if (cards.length < minSize) return null
  let value = 0
  for (const c of cards) {
    if (c.kind === 'skip') return null
    if (c.kind === 'number') {
      if (value === 0) value = c.value
      else if (c.value !== value) return null
    }
  }
  if (value === 0) return null
  return { kind: 'set', value, cards: cards.slice() }
}

const ALL_VALUES = Array.from({ length: MAX_VALUE - MIN_VALUE + 1 }, (_, i) => MIN_VALUE + i)
const EVEN_VALUES = ALL_VALUES.filter((v) => v % 2 === 0)
const ODD_VALUES = ALL_VALUES.filter((v) => v % 2 === 1)

/** The numbers a run steps through: everything, or only the evens or odds. */
function valuesFor(parity?: Parity): number[] {
  return parity === 'even' ? EVEN_VALUES : parity === 'odd' ? ODD_VALUES : ALL_VALUES
}

export interface RunOptions {
  parity?: Parity // only even or odd numbers, stepping by two
  sameColor?: boolean // every natural card must be the same color
}

/**
 * Consecutive numbers (no wrap-around, colors ignored unless asked). Wilds fill gaps and
 * any extra Wilds extend the run upward first, then downward if the top is reached.
 */
export function buildRun(cards: readonly Card[], minSize: number, options: RunOptions = {}): RunBody | null {
  const n = cards.length
  const line = valuesFor(options.parity)
  if (n < minSize || n > line.length) return null
  const naturals: NumberCard[] = []
  const wilds: Card[] = []
  for (const c of cards) {
    if (c.kind === 'skip') return null
    if (c.kind === 'number') naturals.push(c)
    else wilds.push(c)
  }
  if (naturals.length === 0) return null
  if (options.sameColor && naturals.some((c) => c.color !== naturals[0].color)) return null

  const seen = new Set<number>()
  let imin = Infinity
  let imax = -Infinity
  for (const c of naturals) {
    const at = line.indexOf(c.value)
    if (at < 0) return null // an odd number in a run of evens
    if (seen.has(at)) return null
    seen.add(at)
    if (at < imin) imin = at
    if (at > imax) imax = at
  }
  if (imax - imin + 1 > n) return null

  const startLow = Math.max(0, imax - n + 1)
  const startHigh = Math.min(imin, line.length - n)
  if (startLow > startHigh) return null
  const start = startHigh

  const ordered: Array<Card | undefined> = new Array<Card | undefined>(n).fill(undefined)
  for (const c of naturals) ordered[line.indexOf(c.value) - start] = c
  let w = 0
  for (let i = 0; i < n; i++) {
    if (!ordered[i]) ordered[i] = wilds[w++]
  }
  const body: RunBody = { kind: 'run', start: line[start], end: line[start + n - 1], cards: ordered as Card[] }
  if (options.parity) body.step = 2
  if (options.sameColor) body.color = (naturals[0] as NumberCard).color
  return body
}

/** A run with exactly size / 4 cards of each color. Wilds stand in for whatever is missing. */
export function buildRainbow(cards: readonly Card[], size: number): RunBody | null {
  const each = Math.floor(size / 4)
  const used: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 }
  for (const c of cards) if (c.kind === 'number' && ++used[c.color] > each) return null
  return buildRun(cards, size)
}

/** Cards that are all one color. Wilds may stand in. */
export function buildColor(cards: readonly Card[], minSize: number): ColorBody | null {
  if (cards.length < minSize) return null
  let found: Color | null = null
  for (const c of cards) {
    if (c.kind === 'skip') return null
    if (c.kind === 'number') {
      if (found === null) found = c.color
      else if (c.color !== found) return null
    }
  }
  if (found === null) return null
  return { kind: 'color', color: found, cards: cards.slice() }
}

export function buildGroup(spec: GroupSpec, cards: readonly Card[]): MeldBody | null {
  switch (spec.kind) {
    case 'set':
      return buildSet(cards, spec.size)
    case 'run':
      return buildRun(cards, spec.size)
    case 'color':
      return buildColor(cards, spec.size)
    case 'parity':
      return buildRun(cards, spec.size, { parity: spec.parity })
    case 'colorRun':
      return buildRun(cards, spec.size, { sameColor: true })
    case 'rainbow':
      return buildRainbow(cards, spec.size)
    case 'pureRun':
      return cards.some((c) => c.kind === 'wild') ? null : buildRun(cards, spec.size)
  }
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)]
  const out: number[][] = []
  const rec = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) {
      out.push(prefix)
      return
    }
    for (let i = 0; i < rest.length; i++) {
      rec([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
    }
  }
  rec(
    [],
    Array.from({ length: n }, (_, i) => i),
  )
  return out
}

/**
 * Checks that the supplied groups satisfy the phase, in whichever order the
 * player supplied them. Returns the resulting meld bodies (same order as the
 * input groups) or null when the cards do not make the phase.
 */
export function matchPhase(
  phaseIdx: number,
  groups: ReadonlyArray<readonly Card[]>,
  set: PhaseSet = 'classic',
): MeldBody[] | null {
  const specs = defsOf(set)[phaseIdx]?.groups
  if (!specs || groups.length !== specs.length) return null
  for (const perm of permutations(specs.length)) {
    const bodies: MeldBody[] = []
    let ok = true
    for (let g = 0; g < groups.length; g++) {
      const body = buildGroup(specs[perm[g]], groups[g])
      if (!body) {
        ok = false
        break
      }
      bodies.push(body)
    }
    if (ok) return bodies
  }
  return null
}

// ---------------------------------------------------------------------------
// Hitting (adding a card to a meld that is already on the table)
// ---------------------------------------------------------------------------

/** Which ends of a run the card could extend. Empty when it cannot hit the run. */
export function runEndsFor(meld: RunBody, card: Card): RunEnd[] {
  const ends: RunEnd[] = []
  if (card.kind === 'skip') return ends
  const step = meld.step ?? 1
  const canHigh = meld.end + step <= MAX_VALUE
  const canLow = meld.start - step >= MIN_VALUE
  if (card.kind === 'wild') {
    if (canHigh) ends.push('high')
    if (canLow) ends.push('low')
    return ends
  }
  if (meld.color && card.color !== meld.color) return ends
  if (canHigh && card.value === meld.end + step) ends.push('high')
  if (canLow && card.value === meld.start - step) ends.push('low')
  return ends
}

export function canHit(meld: MeldBody, card: Card, end?: RunEnd): boolean {
  if (card.kind === 'skip') return false
  switch (meld.kind) {
    case 'set':
      return card.kind === 'wild' || card.value === meld.value
    case 'color':
      return card.kind === 'wild' || card.color === meld.color
    case 'run': {
      const ends = runEndsFor(meld, card)
      return end ? ends.includes(end) : ends.length > 0
    }
  }
}

/** Adds the card to the meld in place. Returns false (and changes nothing) if illegal. */
export function hitMeld(meld: Meld, card: Card, end?: RunEnd): boolean {
  if (!canHit(meld, card, end)) return false
  if (meld.kind === 'run') {
    const useEnd = end ?? runEndsFor(meld, card)[0]
    const step = meld.step ?? 1
    if (useEnd === 'high') {
      meld.cards.push(card)
      meld.end += step
    } else {
      meld.cards.unshift(card)
      meld.start -= step
    }
  } else {
    meld.cards.push(card)
  }
  return true
}

// ---------------------------------------------------------------------------
// Solvers (used by the computer players and the "auto lay down" button)
// ---------------------------------------------------------------------------

/** Could these cards still end up in a group of this kind? Used to cut off hopeless splits early. */
function mayJoin(spec: GroupSpec, cards: readonly Card[]): boolean {
  const naturals = cards.filter((c): c is NumberCard => c.kind === 'number')
  switch (spec.kind) {
    case 'set':
      return naturals.every((c) => c.value === naturals[0].value)
    case 'color':
      return naturals.every((c) => c.color === naturals[0].color)
    case 'pureRun':
      if (cards.some((c) => c.kind === 'wild')) return false
      break
    case 'colorRun':
      if (!naturals.every((c) => c.color === naturals[0].color)) return false
      break
    case 'parity':
      if (naturals.some((c) => (c.value % 2 === 0) !== (spec.parity === 'even'))) return false
      break
    case 'rainbow': {
      const each = Math.floor(spec.size / 4)
      for (const col of COLORS) if (naturals.filter((c) => c.color === col).length > each) return false
      break
    }
  }
  // Every run kind needs different numbers.
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
    const twin = prev !== null && prev.kind === spec.kind && prev.size === spec.size && prev.parity === spec.parity
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
  const line = valuesFor(spec.kind === 'parity' ? spec.parity : undefined)
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
  if (spec.kind === 'rainbow') return takeRainbow(counts, window, Math.floor(spec.size / 4))
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
function optionsFor(spec: GroupSpec, counts: Counts): Option[] {
  const out: Option[] = []
  switch (spec.kind) {
    case 'set':
      for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
        const left = cloneCounts(counts)
        out.push({ got: takeNumber(left, v, spec.size), left })
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
    case 'colorRun':
      for (const w of runWindows(spec)) {
        for (let k = 0; k < 4; k++) {
          const left = cloneCounts(counts)
          out.push({ got: takeRun(left, spec, w, k), left })
        }
      }
      break
    default:
      for (const w of runWindows(spec)) {
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
function most(specs: readonly GroupSpec[], counts: Counts): number {
  if (specs.length === 0) return 0
  const [first, ...rest] = specs
  const options = optionsFor(first, counts)
  if (specs.length <= 2) {
    let best = 0
    for (const o of options) best = Math.max(best, o.got + most(rest, o.left))
    return best
  }
  let pick = options[0]
  for (const o of options) if (o.got > pick.got) pick = o
  return pick.got + most(rest, pick.left)
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
  const needed = specs.reduce((sum, g) => sum + g.size, 0)

  const counts: Counts = Array.from({ length: MAX_VALUE + 1 }, () => [0, 0, 0, 0])
  let wilds = 0
  for (const c of hand) {
    if (c.kind === 'wild') wilds++
    else if (c.kind === 'number') counts[c.value][COLORS.indexOf(c.color)]++
  }

  const got = most(specs.slice().sort((x, y) => y.size - x.size), counts)
  // Wilds only help with groups that allow them.
  const fillers = specs.every((g) => g.kind === 'pureRun') ? 0 : wilds
  return Math.max(0, needed - got - fillers)
}
