// Saves the game in the browser so a refresh or a closed tab does not lose it.

import { upgradeSavedState } from '../engine'
import type { BotLevel, GameMode, GameState } from '../engine'

const KEY = 'fase-ten:session:v1'

/** Reads a stored level. Games saved before the levels were renamed called today's expert "normal". */
export function parseLevel(raw: unknown): BotLevel | undefined {
  if (raw === 'normal') return 'expert'
  return raw === 'easy' || raw === 'medium' || raw === 'expert' ? raw : undefined
}

export interface Session {
  state: GameState
  level: BotLevel
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    const state = parsed.state
    if (
      !state ||
      !Array.isArray(state.players) ||
      state.players.length < 2 ||
      !Array.isArray(state.drawPile) ||
      parseLevel(parsed.level) === undefined
    ) {
      return null
    }
    if (state.status === 'gameOver') return null
    // Games saved by an earlier version are missing newer fields.
    upgradeSavedState(state)
    return { state, level: parseLevel(parsed.level)! }
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage may be full or blocked (private mode). The game still works.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}

// The name and options from the last game started, so the next one starts with the same choices.

const SETTINGS_KEY = 'fase-ten:settings:v1'

export interface Settings {
  name: string
  opponents: 1 | 2 | 3
  level: BotLevel
  mode: GameMode
}

/** Checks a stored value field by field; anything missing or odd is left out. */
export function parseSettings(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (typeof r.name === 'string' && r.name.trim() !== '') out.name = r.name.trim().slice(0, 16)
  if (r.opponents === 1 || r.opponents === 2 || r.opponents === 3) out.opponents = r.opponents
  const level = parseLevel(r.level)
  if (level) out.level = level
  if (r.mode === 'classic' || r.mode === 'yousee' || r.mode === 'random') out.mode = r.mode
  return out
}

export function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? parseSettings(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Not being able to remember the choices is not worth interrupting the game.
  }
}
