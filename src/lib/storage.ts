// Saves the game in the browser so a refresh or a closed tab does not lose it.

import type { BotLevel, GameState } from '../engine'

const KEY = 'fase-ten:session:v1'

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
      (parsed.level !== 'easy' && parsed.level !== 'normal')
    ) {
      return null
    }
    if (state.status === 'gameOver') return null
    // Games saved by an earlier version have no hit history yet.
    state.turnCount ??= 0
    state.hits ??= []
    state.events ??= []
    return { state, level: parsed.level }
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
