import { describe, expect, it } from 'vitest'
import { parseLevel, parseSettings } from './storage'

describe('parseSettings', () => {
  it('keeps valid values', () => {
    expect(parseSettings({ name: ' Karla ', opponents: 2, level: 'easy', mode: 'yousee' })).toEqual({
      name: 'Karla',
      opponents: 2,
      level: 'easy',
      mode: 'yousee',
    })
  })

  it('drops anything it does not recognize, keeping the good fields', () => {
    expect(parseSettings({ name: '   ', opponents: 3, level: 'hard', mode: 'yousee' })).toEqual({ mode: 'yousee' })
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
