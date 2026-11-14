// The shape of a saved game. It goes up by one whenever a new version can no longer read the games
// saved by the one before, which means updating ends a game in progress.
//
// The build writes this number to version.json next to the app. Before updating, the version that is
// running reads that file from the server to see whether the new version still reads its saved game.

export const SAVE_VERSION = 1

/** none: safe to update. ends: the game in progress will be lost. unknown: could not find out. */
export type UpdateRisk = 'none' | 'ends' | 'unknown'

/**
 * What updating does to a game in progress. `theirs` is the save version of the new app, or null when
 * it could not be read (offline, for example).
 */
export function updateRisk(gameInProgress: boolean, mine: number, theirs: number | null): UpdateRisk {
  if (!gameInProgress) return 'none'
  if (theirs === null) return 'unknown'
  return theirs === mine ? 'none' : 'ends'
}

/** Reads the save version out of the text of version.json. Null for anything that is not one. */
export function parseSaveVersion(text: string): number | null {
  try {
    const save = (JSON.parse(text) as { save?: unknown }).save
    return typeof save === 'number' && Number.isInteger(save) && save > 0 ? save : null
  } catch {
    return null
  }
}
