// The lists of phases a game can use, and lookups into them.

import { decodeGroups, encodeGroups, nameGroups } from './codes'
import { color, colorRun, evens, odds, pureRun, rainbow, run, set } from './spec'
import type { GroupSpec } from './spec'

/**
 * Which list of ten phases a game uses. 'single:<code>' is a single round: all ten slots hold the one phase
 * that the code describes (see encodeGroups), so a game can be saved and restored from the string alone.
 */
export type PhaseSet = 'classic' | 'alternate' | `single:${string}`

export interface PhaseDef {
  number: number
  groups: readonly GroupSpec[]
  description: string
}

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
  { number: 0, groups: [pureRun(6)], description: '1 run of 6 (no wilds)' },
  { number: 0, groups: [pureRun(7)], description: '1 run of 7 (no wilds)' },
  { number: 0, groups: [pureRun(8)], description: '1 run of 8 (no wilds)' },
  { number: 0, groups: [pureRun(9)], description: '1 run of 9 (no wilds)' },
  { number: 0, groups: [color(6), set(3)], description: '6 of one color + 1 set of 3' },
  { number: 0, groups: [color(6), set(2)], description: '6 of one color + 1 set of 2' },
  { number: 0, groups: [color(4), color(4)], description: '2 groups of 4 of one color' },
  { number: 0, groups: [color(3), color(3)], description: '2 groups of 3 of one color' },
  { number: 0, groups: [color(5), color(4)], description: '1 group of 5 + 1 group of 4 of one color' },
  { number: 0, groups: [set(4), set(3), set(2)], description: '1 set of 4 + 1 set of 3 + 1 set of 2' },
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
  '2 sets of 3 + 1 set of 2',
  '2 color runs of 3',
  '1 run of 5 evens + 1 set of 3',
  '1 rainbow run of 8',
  '1 run of 6 odds + 1 set of 3',
  '3 sets of 3',
  '1 run of 6 (no wilds)',
  '1 rainbow run of 4 + 1 set of 4',
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

const KNOWN: ReadonlyMap<string, string> = new Map(
  [...PHASES, ...ALTERNATE_CANDIDATES].map((d) => [encodeGroups(d.groups), d.description]),
)

/** Plain-English name for a phase, such as "2 sets of 3 + 1 set of 2". Phases on the lists keep their list names. */
export function describeGroups(groups: readonly GroupSpec[]): string {
  return KNOWN.get(encodeGroups(groups)) ?? nameGroups(groups)
}

const singleCache = new Map<string, readonly PhaseDef[]>()

/** The ten identical slots of a single round game, or null if the code is not a valid phase. */
function singleDefs(code: string): readonly PhaseDef[] | null {
  const cached = singleCache.get(code)
  if (cached) return cached
  const groups = decodeGroups(code)
  if (!groups) return null
  const description = describeGroups(groups)
  const defs = Array.from({ length: PHASE_COUNT }, (_, i): PhaseDef => ({ number: i + 1, groups, description }))
  singleCache.set(code, defs)
  return defs
}

export function defsOf(set: string): readonly PhaseDef[] {
  if (set.startsWith('single:')) return singleDefs(set.slice(7)) ?? PHASES
  return PHASE_SETS[set] ?? PHASES
}

/** True when the set string is a valid phase set for a game (a known list, or a single round with a good code). */
export function isPhaseSet(set: string): set is PhaseSet {
  return set === 'classic' || set === 'alternate' || (set.startsWith('single:') && singleDefs(set.slice(7)) !== null)
}

export function phasesOf(set: PhaseSet): readonly PhaseDef[] {
  return defsOf(set)
}

/** Whether Wilds can help lay this phase down. False when every group is a run with no Wilds. */
export function allowsWilds(phaseIdx: number, set: PhaseSet = 'classic'): boolean {
  return !(defsOf(set)[phaseIdx]?.groups ?? []).every((g) => g.noWild)
}

/** How many cards the phase asks for in total. */
export function phaseSize(phaseIdx: number, set: PhaseSet = 'classic'): number {
  return (defsOf(set)[phaseIdx]?.groups ?? []).reduce((sum, g) => sum + g.size, 0)
}

export function phaseDescription(phaseIdx: number, set: PhaseSet = 'classic'): string {
  return defsOf(set)[phaseIdx]?.description ?? ''
}
