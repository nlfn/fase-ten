// What a phase asks for. A phase is a list of groups, and every group is one of three kinds with
// optional switches. Pure TypeScript with no UI dependencies.
//
// House rule worth knowing: every group must contain at least one natural (non-Wild) card. A group
// made only of Wilds is not allowed, because its value would be undefined.

import { MAX_VALUE, MIN_VALUE } from '../cards'

/**
 * set: same number. run: consecutive numbers. color: any numbers, all one color.
 * These are the same three kinds a group has once it is on the table (see MeldBody).
 */
export type GroupKind = 'set' | 'run' | 'color'

export type Parity = 'even' | 'odd'

export interface GroupSpec {
  kind: GroupKind
  size: number
  /** Run only: it uses only even or odd numbers, stepping by two (a "run of six evens" is 2, 4, 6, 8, 10, 12). */
  parity?: Parity
  /** Run only: the same number of cards of each color (size / 4). Once laid it is a plain run. */
  rainbow?: boolean
  /**
   * Set or run: every natural card is the same color. A set then holds at most the 2 copies a color has
   * of a number, so more than 2 needs Wilds. A color group is one color by nature and never carries this.
   */
  oneColor?: boolean
  /** No Wilds may be used to lay this group down (they can still be added afterwards). */
  noWild?: boolean
}

export const set = (size: number): GroupSpec => ({ kind: 'set', size })
export const run = (size: number): GroupSpec => ({ kind: 'run', size })
export const color = (size: number): GroupSpec => ({ kind: 'color', size })
export const evens = (size: number): GroupSpec => ({ kind: 'run', size, parity: 'even' })
export const odds = (size: number): GroupSpec => ({ kind: 'run', size, parity: 'odd' })
export const colorRun = (size: number): GroupSpec => ({ kind: 'run', size, oneColor: true })
export const rainbow = (size: number): GroupSpec => ({ kind: 'run', size, rainbow: true })
export const pureRun = (size: number): GroupSpec => ({ kind: 'run', size, noWild: true })

/** True when two groups ask for exactly the same thing. */
export function sameSpec(a: GroupSpec, b: GroupSpec): boolean {
  return (
    a.kind === b.kind &&
    a.size === b.size &&
    a.parity === b.parity &&
    !!a.rainbow === !!b.rainbow &&
    !!a.oneColor === !!b.oneColor &&
    !!a.noWild === !!b.noWild
  )
}

/** The most cards a phase can ask for: one hand. */
export const HAND_LIMIT = 10
export const MAX_GROUPS = 5

const RUN_LIMIT = MAX_VALUE - MIN_VALUE + 1

/** Why a list of groups cannot be a phase, or null when it can. */
export function groupsProblem(groups: readonly GroupSpec[]): string | null {
  if (groups.length === 0) return 'Add at least one group'
  if (groups.length > MAX_GROUPS) return `A phase can have at most ${MAX_GROUPS} groups`
  let total = 0
  for (const g of groups) {
    total += g.size
    if (!Number.isInteger(g.size) || g.size < 2) return 'Every group needs at least 2 cards'
    if (g.kind === 'set') {
      if (g.oneColor && g.noWild && g.size > 2) return 'A one-color set with no Wilds can be at most 2 cards (there are 2 of each card)'
      if (g.noWild && g.size > 8) return 'A set with no Wilds can be at most 8 cards (there are 8 of each number)'
    } else if (g.kind === 'run') {
      if (g.rainbow) {
        if (g.oneColor) return 'A rainbow run cannot be one color'
        if (g.parity) return 'A rainbow run cannot be evens or odds'
        if (g.size % 4 !== 0) return 'A rainbow run needs a multiple of 4 cards (the same number of each color)'
        if (g.size > RUN_LIMIT) return `A run can be at most ${RUN_LIMIT} cards`
      } else if (g.parity) {
        if (g.size > 6) return 'A run of evens or odds can be at most 6 cards'
      } else if (g.size > RUN_LIMIT) {
        return `A run can be at most ${RUN_LIMIT} cards`
      }
    }
  }
  if (total > HAND_LIMIT) return `A hand is only ${HAND_LIMIT} cards, so a phase can ask for at most ${HAND_LIMIT}`
  return null
}
