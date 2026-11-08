// Works out which changelog entries a player has not seen yet, and remembers the newest one they have.

import type { ChangeEntry } from './changelog'

export const SEEN_KEY = 'fase-ten:last-seen-change:v1'

/**
 * The entries to show, newest first. `stored` is the newest entry number this browser has seen.
 * A browser that has never recorded one is either brand new (nothing to catch up on) or has played
 * before this screen existed, in which case it sees everything.
 */
export function unseenEntries(entries: ChangeEntry[], stored: string | null, hasSavedData: boolean): ChangeEntry[] {
  const seen = stored === null ? NaN : Number(stored)
  if (!Number.isFinite(seen)) return hasSavedData ? entries : []
  return entries.filter((e) => e.id > seen)
}

/** Groups entries that share a date, keeping their order. */
export function groupByDate(entries: ChangeEntry[]): { date: string; items: ChangeEntry[] }[] {
  const groups: { date: string; items: ChangeEntry[] }[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last.date === entry.date) last.items.push(entry)
    else groups.push({ date: entry.date, items: [entry] })
  }
  return groups
}
