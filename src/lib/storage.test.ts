import { describe, expect, it, vi } from 'vitest'
import { createGame } from '../engine'
import { SAVE_VERSION } from './saveVersion'
import { loadSession, parseLevel, parseSettings, saveSession } from './storage'

describe('parseSettings', () => {
  it('keeps a valid phase set and drops an unknown one', () => {
    expect(parseSettings({ phaseSet: 'alternate' })).toEqual({ phaseSet: 'alternate' })
    expect(parseSettings({ phaseSet: 'classic' })).toEqual({ phaseSet: 'classic' })
    expect(parseSettings({ phaseSet: 'wild' })).toEqual({})
  })

  it('keeps valid values', () => {
    expect(parseSettings({ name: ' Karla ', opponents: 2, level: 'easy', mode: 'yousee' })).toEqual({
      name: 'Karla',
      opponents: 2,
      level: 'easy',
      mode: 'yousee',
    })
  })

  it('drops anything it does not recognize, keeping the good fields', () => {
    expect(parseSettings({ name: '   ', opponents: 4, level: 'hard', mode: 'yousee' })).toEqual({ mode: 'yousee' })
  })

  it('copes with junk', () => {
    expect(parseSettings(null)).toEqual({})
    expect(parseSettings('text')).toEqual({})
    expect(parseSettings(42)).toEqual({})
  })

  it('limits very long names', () => {
    expect(parseSettings({ name: 'x'.repeat(200) }).name).toHaveLength(16)
  })
})

describe('parseSettings modes', () => {
  it('knows all four game styles', () => {
    for (const mode of ['classic', 'yousee', 'random', 'reverse']) {
      expect(parseSettings({ mode })).toEqual({ mode })
    }
  })
})

describe('parseLevel', () => {
  it('accepts the three levels', () => {
    expect(parseLevel('easy')).toBe('easy')
    expect(parseLevel('medium')).toBe('medium')
    expect(parseLevel('expert')).toBe('expert')
  })

  it('treats the old "normal" level as expert', () => {
    expect(parseLevel('normal')).toBe('expert')
    expect(parseSettings({ level: 'normal' })).toEqual({ level: 'expert' })
  })

  it('rejects anything else', () => {
    expect(parseLevel('hard')).toBeUndefined()
    expect(parseLevel(undefined)).toBeUndefined()
  })
})

describe('saved games', () => {
  function fakeStorage(): Map<string, string> {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    })
    return data
  }
  const players = [
    { name: 'Ann', isBot: false },
    { name: 'Bot', isBot: true },
  ]

  it('saves under the current save version and reads the game back', () => {
    const data = fakeStorage()
    const state = createGame(players, 4, 'random', 'alternate')
    saveSession({ state, level: 'medium' })
    expect([...data.keys()]).toEqual([`fase-ten:session:v${SAVE_VERSION}`])
    expect(loadSession()).toEqual({ state, level: 'medium' })
    vi.unstubAllGlobals()
  })

  it('does not open a game saved by an earlier version, and clears it away', () => {
    const data = fakeStorage()
    // What version 1 stored: players had phase, order, laidPhase and laidDown instead of route and laid.
    const old = structuredClone(createGame(players, 4)) as unknown as { players: Array<Record<string, unknown>> }
    for (const p of old.players) {
      p.order = p.route
      p.phase = 0
      p.laidPhase = null
      p.laidDown = false
      delete p.route
      delete p.laid
    }
    data.set('fase-ten:session:v1', JSON.stringify({ state: old, level: 'expert' }))
    expect(loadSession()).toBeNull()
    expect(data.has('fase-ten:session:v1')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('treats a game of the wrong shape as no game', () => {
    const data = fakeStorage()
    const key = `fase-ten:session:v${SAVE_VERSION}`
    const good = createGame(players, 4)
    const noRoute = structuredClone(good) as unknown as { players: Array<Record<string, unknown>> }
    delete noRoute.players[0].route
    data.set(key, JSON.stringify({ state: noRoute, level: 'easy' }))
    expect(loadSession()).toBeNull()
    data.set(key, JSON.stringify({ state: { ...good, phaseSet: 'single:x9' }, level: 'easy' }))
    expect(loadSession()).toBeNull()
    const short = structuredClone(good)
    short.players[1].done = [false]
    data.set(key, JSON.stringify({ state: short, level: 'easy' }))
    expect(loadSession()).toBeNull()
    data.set(key, 'not json')
    expect(loadSession()).toBeNull()
    data.set(key, JSON.stringify({ state: good, level: 'easy' }))
    expect(loadSession()).not.toBeNull()
    vi.unstubAllGlobals()
  })
})
