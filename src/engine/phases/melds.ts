// Groups on the table (melds): building them from cards, checking a phase, and adding cards afterwards.

import { MAX_VALUE, MIN_VALUE } from '../cards'
import type { Card, Color, NumberCard } from '../cards'
import { defsOf } from './lists'
import type { PhaseSet } from './lists'
import type { GroupSpec, Parity } from './spec'

// ---------------------------------------------------------------------------
// Melds
// ---------------------------------------------------------------------------

export type RunEnd = 'low' | 'high'

export interface SetBody {
  kind: 'set'
  value: number
  cards: Card[]
  color?: Color // a set in one color: only cards of that color (and Wilds) can be added
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
export function buildSet(cards: readonly Card[], minSize: number, sameColor = false): SetBody | null {
  if (cards.length < minSize) return null
  let value = 0
  let color: Color | null = null
  for (const c of cards) {
    if (c.kind === 'skip') return null
    if (c.kind === 'number') {
      if (value === 0) value = c.value
      else if (c.value !== value) return null
      if (sameColor) {
        if (color === null) color = c.color
        else if (c.color !== color) return null
      }
    }
  }
  if (value === 0) return null
  return sameColor && color ? { kind: 'set', value, cards: cards.slice(), color } : { kind: 'set', value, cards: cards.slice() }
}

export const ALL_VALUES = Array.from({ length: MAX_VALUE - MIN_VALUE + 1 }, (_, i) => MIN_VALUE + i)
const EVEN_VALUES = ALL_VALUES.filter((v) => v % 2 === 0)
const ODD_VALUES = ALL_VALUES.filter((v) => v % 2 === 1)

/** The numbers a run steps through: everything, or only the evens or odds. */
export function valuesFor(parity?: Parity): number[] {
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
  if (spec.noWild && cards.some((c) => c.kind === 'wild')) return null
  switch (spec.kind) {
    case 'set':
      return buildSet(cards, spec.size, !!spec.oneColor)
    case 'color':
      return buildColor(cards, spec.size)
    case 'run':
      if (spec.rainbow) return buildRainbow(cards, spec.size)
      return buildRun(cards, spec.size, { parity: spec.parity, sameColor: !!spec.oneColor })
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
      return card.kind === 'wild' || (card.value === meld.value && (!meld.color || card.color === meld.color))
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
