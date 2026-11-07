import { describe, expect, it } from 'vitest'
import { SNOOZE_MS, isSnoozed, snoozeUntil } from './snooze'

describe('snooze', () => {
  const now = 1_000_000_000_000

  it('is not snoozed when nothing is stored or the value is junk', () => {
    expect(isSnoozed(null, now)).toBe(false)
    expect(isSnoozed('', now)).toBe(false)
    expect(isSnoozed('soon', now)).toBe(false)
  })

  it('hides the banner for a day, then shows it again', () => {
    const until = String(snoozeUntil(now))
    expect(isSnoozed(until, now)).toBe(true)
    expect(isSnoozed(until, now + SNOOZE_MS - 1)).toBe(true)
    expect(isSnoozed(until, now + SNOOZE_MS)).toBe(false)
    expect(isSnoozed(until, now + SNOOZE_MS * 3)).toBe(false)
  })

  it('ignores a snooze set further ahead than a day (the clock was changed)', () => {
    expect(isSnoozed(String(now + SNOOZE_MS * 30), now)).toBe(false)
  })
})
