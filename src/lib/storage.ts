// Saves the game in the browser so a refresh or a closed tab does not lose it.

import { decodeGroups, upgradeSavedState } from '../engine'
import type { BotLevel, GameMode, GameState, PhaseSet } from '../engine'

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
  phaseSet: PhaseSet
  /** Single round chosen on the welcome screen. mode and phaseSet keep the settings for the normal game. */
  single: boolean
  /** Phase code (see encodeGroups) for the single round. */
  singlePhase: string
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
  if (r.mode === 'classic' || r.mode === 'yousee' || r.mode === 'random' || r.mode === 'reverse') out.mode = r.mode
  if (r.phaseSet === 'classic' || r.phaseSet === 'alternate') out.phaseSet = r.phaseSet
  if (typeof r.single === 'boolean') out.single = r.single
  if (typeof r.singlePhase === 'string' && decodeGroups(r.singlePhase)) out.singlePhase = r.singlePhase
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

// ---------------------------------------------------------------------------
// Phases the player has designed: a named list, and the phase last picked for a single round.
// ---------------------------------------------------------------------------

export interface SavedPhase {
  id: string
  name: string
  /** The phase as a code (see encodeGroups). */
  code: string
}

const PHASES_KEY = 'fase-ten:custom-phases:v1'
const DESIGN_KEY = 'fase-ten:design:v1'
export const MAX_SAVED_PHASES = 40

export function loadSavedPhases(): SavedPhase[] {
  try {
    const raw = localStorage.getItem(PHASES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: SavedPhase[] = []
    for (const item of parsed) {
      const r = item as Record<string, unknown>
      if (typeof r?.id === 'string' && typeof r.name === 'string' && typeof r.code === 'string' && decodeGroups(r.code)) {
        out.push({ id: r.id, name: r.name.slice(0, 60), code: r.code })
      }
    }
    return out.slice(0, MAX_SAVED_PHASES)
  } catch {
    return []
  }
}

export function saveSavedPhases(list: readonly SavedPhase[]): void {
  try {
    localStorage.setItem(PHASES_KEY, JSON.stringify(list))
  } catch {
    // Not being able to remember a design is not worth interrupting anything.
  }
}

/** The phase last chosen for a single round, so a design is still there tomorrow. */
export function loadDesign(): string | null {
  try {
    const raw = localStorage.getItem(DESIGN_KEY)
    return raw && decodeGroups(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveDesign(code: string): void {
  try {
    localStorage.setItem(DESIGN_KEY, code)
  } catch {
    // Same as above.
  }
}
