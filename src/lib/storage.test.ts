import { describe, expect, it } from 'vitest'
import { parseSettings } from './storage'

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
