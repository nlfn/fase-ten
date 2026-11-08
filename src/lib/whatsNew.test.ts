import { describe, expect, it } from 'vitest'
import { CHANGELOG, LATEST_CHANGE_ID } from './changelog'
import { groupByDate, unseenEntries } from './whatsNew'

const ids = (list: { id: number }[]) => list.map((e) => e.id)

describe('unseenEntries', () => {
  it('shows nothing to a brand new player', () => {
    expect(unseenEntries(CHANGELOG, null, false)).toEqual([])
  })

  it('shows everything to a returning player who has never seen this screen', () => {
    expect(unseenEntries(CHANGELOG, null, true)).toEqual(CHANGELOG)
  })

  it('shows only what is newer than the last one seen', () => {
    expect(ids(unseenEntries(CHANGELOG, String(LATEST_CHANGE_ID - 2), true))).toEqual([LATEST_CHANGE_ID, LATEST_CHANGE_ID - 1])
  })

  it('shows nothing once the newest has been seen', () => {
    expect(unseenEntries(CHANGELOG, String(LATEST_CHANGE_ID), true)).toEqual([])
  })

  it('treats an unreadable marker like a missing one', () => {
    expect(unseenEntries(CHANGELOG, 'oops', true)).toEqual(CHANGELOG)
    expect(unseenEntries(CHANGELOG, 'oops', false)).toEqual([])
  })
})

describe('groupByDate', () => {
  it('keeps order and puts same-day entries together', () => {
    const groups = groupByDate(CHANGELOG)
    expect(groups.flatMap((g) => g.items)).toEqual(CHANGELOG)
    expect(new Set(groups.map((g) => g.date)).size).toBe(groups.length)
  })
})

describe('the changelog itself', () => {
  it('counts down by one from the newest, with no gaps', () => {
    CHANGELOG.forEach((e, i) => expect(e.id).toBe(CHANGELOG.length - i))
  })

  it('is newest first and uses real dates', () => {
    for (const e of CHANGELOG) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const dates = CHANGELOG.map((e) => e.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('has no em dashes', () => {
    for (const e of CHANGELOG) expect(`${e.title} ${e.body}`).not.toContain('—')
  })
})
