import { describe, expect, it } from 'vitest'
import { pickBotNames } from './botNames'

const FRIEND_NAMES = ['Ned', 'Karla', 'Kael', 'Dirk', 'John', 'Raynor', 'dva']

describe('pickBotNames', () => {
  it('uses the friends list for computers when the player is one of the friends', () => {
    for (const player of FRIEND_NAMES) {
      for (let i = 0; i < 50; i++) {
        const names = pickBotNames(player, 2)
        expect(names).toHaveLength(2)
        expect(new Set(names).size).toBe(2)
        for (const n of names) expect(['Ned', 'Karla', 'Kael', 'Dirk', 'Raynor']).toContain(n)
      }
    }
  })

  it('never names a computer after the player, ignoring case and spaces', () => {
    for (const player of ['Ned', 'ned', '  KARLA ', 'Kael', 'Dirk', 'Raynor']) {
      for (let i = 0; i < 50; i++) {
        for (const n of pickBotNames(player, 2)) {
          expect(n.toLowerCase()).not.toBe(player.trim().toLowerCase())
        }
      }
    }
  })

  it('keeps Raynor away from John and Dirk away from dva', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickBotNames('John', 2)).not.toContain('Raynor')
      expect(pickBotNames('dva', 2)).not.toContain('Dirk')
      expect(pickBotNames('DVA', 2)).not.toContain('Dirk')
    }
  })

  it('still allows Raynor for others and Dirk for John', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) pickBotNames('Karla', 2).forEach((n) => seen.add(n))
    expect(seen.has('Raynor')).toBe(true)
    const johnSeen = new Set<string>()
    for (let i = 0; i < 300; i++) pickBotNames('John', 2).forEach((n) => johnSeen.add(n))
    expect(johnSeen.has('Dirk')).toBe(true)
  })

  it('uses the usual computer names for anyone else', () => {
    expect(pickBotNames('Sam', 1)).toEqual(['Robo'])
    expect(pickBotNames('Sam', 2)).toEqual(['Robo', 'Chip'])
    expect(pickBotNames('Robo', 2)).not.toContain('Robo')
  })
})
