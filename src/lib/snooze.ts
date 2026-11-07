// The "new version" banner can be hidden for a day. This is the bookkeeping for that.

export const SNOOZE_KEY = 'fase-ten:update-snooze:v1'
export const SNOOZE_MS = 24 * 60 * 60 * 1000

/** The time (in ms) the banner stays hidden until, if hidden now. */
export function snoozeUntil(now: number): number {
  return now + SNOOZE_MS
}

/**
 * Whether a stored snooze is still in effect. Anything missing, unreadable, or further away than a
 * snooze could ever be (a clock that was changed) counts as not snoozed.
 */
export function isSnoozed(stored: string | null, now: number): boolean {
  if (stored === null) return false
  const until = Number(stored)
  return Number.isFinite(until) && until > now && until - now <= SNOOZE_MS
}
