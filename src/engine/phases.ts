// Phase definitions, meld validation, hitting rules, and phase solvers.
// Pure TypeScript with no UI dependencies.
//
// House rule worth knowing: every group (set, run, or color group) must
// contain at least one natural (non-Wild) card. A group made only of Wilds
// is not allowed, because its value would be undefined.

import { COLORS, MAX_VALUE, MIN_VALUE, handPoints } from './cards'
import type { Card, Color, NumberCard } from './cards'

export type GroupKind = 'set' | 'run' | 'color'

export interface GroupSpec {
  kind: GroupKind
  size: number
}

export interface PhaseDef {
  number: number
  groups: readonly GroupSpec[]
  description: string
}

const set = (size: number): GroupSpec => ({ kind: 'set', size })
const run = (size: number): GroupSpec => ({ kind: 'run', size })
const color = (size: number): GroupSpec => ({ kind: 'color', size })

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

export function phaseDescription(phaseIdx: number): string {
  return PHASES[phaseIdx]?.description ?? ''
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

/**
 * Consecutive numbers (no wrap-around, colors ignored). Wilds fill gaps and
 * any extra Wilds extend the run upward first, then downward if the top is 12.
 */
export function buildRun(cards: readonly Card[], minSize: number): RunBody | null {
  const n = cards.length
  if (n < minSize || n > MAX_VALUE) return null
  const naturals: NumberCard[] = []
  const wilds: Card[] = []
  for (const c of cards) {
    if (c.kind === 'skip') return null
    if (c.kind === 'number') naturals.push(c)
    else wilds.push(c)
  }
  if (naturals.length === 0) return null

  const seen = new Set<number>()
  let vmin = Infinity
  let vmax = -Infinity
  for (const c of naturals) {
    if (seen.has(c.value)) return null
    seen.add(c.value)
    if (c.value < vmin) vmin = c.value
    if (c.value > vmax) vmax = c.value
  }
  if (vmax - vmin + 1 > n) return null

  const startLow = Math.max(MIN_VALUE, vmax - n + 1)
  const startHigh = Math.min(vmin, MAX_VALUE - n + 1)
  if (startLow > startHigh) return null
  const start = startHigh

  const ordered: Array<Card | undefined> = new Array<Card | undefined>(n).fill(undefined)
  for (const c of naturals) ordered[c.value - start] = c
  let w = 0
  for (let i = 0; i < n; i++) {
    if (!ordered[i]) ordered[i] = wilds[w++]
  }
  return { kind: 'run', start, end: start + n - 1, cards: ordered as Card[] }
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
): MeldBody[] | null {
  const specs = PHASES[phaseIdx]?.groups
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
  const canHigh = meld.end < MAX_VALUE
  const canLow = meld.start > MIN_VALUE
  if (card.kind === 'wild') {
    if (canHigh) ends.push('high')
    if (canLow) ends.push('low')
    return ends
  }
  if (canHigh && card.value === meld.end + 1) ends.push('high')
  if (canLow && card.value === meld.start - 1) ends.push('low')
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
    if (useEnd === 'high') {
      meld.cards.push(card)
      meld.end += 1
    } else {
      meld.cards.unshift(card)
      meld.start -= 1
    }
  } else {
    meld.cards.push(card)
  }
  return true
}

// ---------------------------------------------------------------------------
// Solvers (used by the computer players and the "auto lay down" button)
// ---------------------------------------------------------------------------

/**
 * Splits a player's selected cards into the groups the phase asks for, in
 * whichever way works. Returns null if the selection cannot make the phase.
 * Used when a person picks the cards to lay down by hand.
 */
export function arrangeSelection(cards: readonly Card[], phaseIdx: number): Card[][] | null {
  const specs = PHASES[phaseIdx]?.groups
  if (!specs || cards.length === 0) return null
  if (specs.length === 1) {
    return matchPhase(phaseIdx, [cards]) ? [cards.slice()] : null
  }
  if (specs.length !== 2 || cards.length > 16) return null
  const full = (1 << cards.length) - 1
  // The first card always goes in group A, which avoids testing mirror images.
  for (let mask = 1; mask < full; mask += 2) {
    const a: Card[] = []
    const b: Card[] = []
    cards.forEach((c, i) => ((mask >> i) & 1 ? a : b).push(c))
    if (matchPhase(phaseIdx, [a, b])) return [a, b]
  }
  return null
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
  wilds: number
  leftover: number
}

/**
 * Finds a way to lay down the phase using exactly the minimum cards for each
 * group. Prefers layouts that spend the fewest Wilds, then leave the fewest
 * points in hand. Returns null when the hand cannot make the phase.
 */
export function findPhaseLayout(hand: readonly Card[], phaseIdx: number): Card[][] | null {
  const specs = PHASES[phaseIdx]?.groups
  if (!specs) return null
  const playable = hand.filter((c) => c.kind !== 'skip')
  const total = handPoints(hand)
  const search: { best: Layout | null } = { best: null }
  const chosen: Card[][] = []

  const recurse = (specIdx: number, remaining: Card[]) => {
    if (specIdx === specs.length) {
      const used = chosen.flat()
      const wilds = used.filter((c) => c.kind === 'wild').length
      const leftover = total - handPoints(used)
      const best = search.best
      if (!best || wilds < best.wilds || (wilds === best.wilds && leftover < best.leftover)) {
        search.best = { groups: chosen.map((g) => g.slice()), wilds, leftover }
      }
      return
    }
    const spec = specs[specIdx]
    for (const combo of combinations(remaining, spec.size)) {
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

/**
 * Cheap estimate of how many more cards are needed to complete the phase
 * (0 means the hand can lay down now). Wilds count as fillers for any gap.
 * This is a heuristic used for draw and discard decisions.
 */
export function phaseMissing(hand: readonly Card[], phaseIdx: number): number {
  const specs = PHASES[phaseIdx]?.groups
  if (!specs) return 0
  const total = specs.reduce((sum, g) => sum + g.size, 0)

  const count = new Array<number>(MAX_VALUE + 1).fill(0)
  const colorCount: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 }
  let wilds = 0
  for (const c of hand) {
    if (c.kind === 'wild') wilds++
    else if (c.kind === 'number') {
      count[c.value]++
      colorCount[c.color]++
    }
  }

  let best = total
  const consider = (naturals: number) => {
    best = Math.min(best, Math.max(0, total - naturals - wilds))
  }

  const setSpecs = specs.filter((g) => g.kind === 'set')
  const runSpec = specs.find((g) => g.kind === 'run')
  const colorSpec = specs.find((g) => g.kind === 'color')

  if (colorSpec) {
    for (const c of COLORS) {
      if (colorCount[c] < 1) continue
      consider(Math.min(colorCount[c], colorSpec.size))
    }
  } else if (runSpec && setSpecs.length === 0) {
    const n = runSpec.size
    for (let s = MIN_VALUE; s + n - 1 <= MAX_VALUE; s++) {
      let covered = 0
      for (let v = s; v < s + n; v++) if (count[v] > 0) covered++
      if (covered >= 1) consider(covered)
    }
  } else if (runSpec && setSpecs.length === 1) {
    const k = setSpecs[0].size
    const n = runSpec.size
    for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
      if (count[v] < 1) continue
      const setCovered = Math.min(count[v], k)
      for (let s = MIN_VALUE; s + n - 1 <= MAX_VALUE; s++) {
        let runCovered = 0
        for (let x = s; x < s + n; x++) {
          const remaining = count[x] - (x === v ? setCovered : 0)
          if (remaining > 0) runCovered++
        }
        if (runCovered >= 1) consider(setCovered + runCovered)
      }
    }
  } else if (setSpecs.length === 2) {
    const [a, b] = setSpecs
    for (let v1 = MIN_VALUE; v1 <= MAX_VALUE; v1++) {
      for (let v2 = MIN_VALUE; v2 <= MAX_VALUE; v2++) {
        if (v1 === v2) {
          if (count[v1] < 2) continue
          consider(Math.min(count[v1], a.size + b.size))
        } else {
          if (count[v1] < 1 || count[v2] < 1) continue
          consider(Math.min(count[v1], a.size) + Math.min(count[v2], b.size))
        }
      }
    }
  }

  return best
}
