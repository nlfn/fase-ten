// Phase definitions, meld validation, hitting rules, and phase solvers.
// The pieces live in ./phases/: what a phase asks for (spec), phases as text (codes), the lists of
// phases (lists), groups on the table (melds), and the solvers the bots use (solver).

export { HAND_LIMIT, MAX_GROUPS, groupsProblem } from './phases/spec'
export type { GroupKind, GroupSpec, Parity } from './phases/spec'
export { decodeGroups, encodeGroups } from './phases/codes'
export * from './phases/lists'
export * from './phases/melds'
export * from './phases/solver'
