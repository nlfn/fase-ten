import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, parseSaveVersion, updateRisk } from './saveVersion'

describe('what an update does to a game in progress', () => {
  it('is safe with no game, whatever the new version is', () => {
    expect(updateRisk(false, 1, 2)).toBe('none')
    expect(updateRisk(false, 1, null)).toBe('none')
  })
  it('is safe when the new version reads the same saved games', () => {
    expect(updateRisk(true, 1, 1)).toBe('none')
  })
  it('ends the game when the save version changed', () => {
    expect(updateRisk(true, 1, 2)).toBe('ends')
    expect(updateRisk(true, 2, 1)).toBe('ends')
  })
  it('is unknown when the new version could not be asked', () => {
    expect(updateRisk(true, 1, null)).toBe('unknown')
  })
  it('reads version.json and ignores anything else', () => {
    expect(parseSaveVersion(JSON.stringify({ save: SAVE_VERSION }))).toBe(SAVE_VERSION)
    expect(parseSaveVersion('{"save":2}')).toBe(2)
    expect(parseSaveVersion('{"save":"2"}')).toBeNull()
    expect(parseSaveVersion('{"save":0}')).toBeNull()
    expect(parseSaveVersion('{}')).toBeNull()
    expect(parseSaveVersion('<!doctype html>')).toBeNull()
  })
})
