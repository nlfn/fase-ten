// Picks names for the computer players.
//
// Friends and family get computer opponents named after each other. The
// player's own name is never used for a computer, and a few pairs are kept apart.

const FRIENDS = ['Ned', 'Karla', 'Kael', 'Dirk', 'John', 'Raynor', 'dva']
const FRIEND_BOT_NAMES = ['Ned', 'Karla', 'Kael', 'Dirk', 'Raynor']
const DEFAULT_BOT_NAMES = ['Robo', 'Chip', 'Bolt']

// Computer names that must not appear when this player is at the table.
const EXCLUDED: Record<string, string[]> = {
  john: ['Raynor'],
  dva: ['Dirk'],
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function pickBotNames(
  playerName: string,
  count: number,
  random: () => number = Math.random,
): string[] {
  const key = playerName.trim().toLowerCase()
  const isFriend = FRIENDS.some((f) => same(f, playerName))
  const banned = EXCLUDED[key] ?? []

  const pool = (isFriend ? FRIEND_BOT_NAMES : DEFAULT_BOT_NAMES).filter(
    (name) => !same(name, playerName) && !banned.some((b) => same(b, name)),
  )

  if (!isFriend) return pool.slice(0, count)

  // Shuffle so the friends who show up as computers vary from game to game.
  const names = pool.slice()
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  return names.slice(0, count)
}
