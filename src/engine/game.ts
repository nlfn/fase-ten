// Game state and turn rules. Every function here is pure: applyAction clones
// the state, so callers (UI or bots) can hold on to earlier states safely.
// Use $state.raw (not deep $state) when keeping a GameState in Svelte.

import {
  HAND_SIZE,
  buildDeck,
  cardLabel,
  handPoints,
  randomSeed,
  shuffleWithSeed,
} from './cards'
import type { Card } from './cards'
import { PHASE_COUNT, canHit, hitMeld, matchPhase, phaseDescription, runEndsFor } from './phases'
import type { Meld, RunEnd } from './phases'

/**
 * classic: you work through the ten phases in order.
 * yousee: when you lay down, you choose which of the phases you have not done yet.
 * random: like classic, but each player gets their own secret random order for the ten phases.
 */
export type GameMode = 'classic' | 'yousee' | 'random' | 'reverse'

export interface Player {
  name: string
  isBot: boolean
  hand: Card[]
  phase: number // classic: index 0..9 of the phase being attempted. Always the number of phases completed; 10 means all done
  order: number[] // the order this player works through the phases (0..9). 1 to 10 in classic, secretly shuffled in random
  done: boolean[] // which of the ten phases this player has completed
  laidPhase: number | null // the phase laid down this round (counts as done when the round ends)
  laidDown: boolean // has laid down this round
  skipsPending: number // how many of their upcoming turns they will lose; each Skip played on them adds one
  score: number // lower is better
}

export interface RoundResult {
  winner: number | null // index of the player who went out
  points: number[] // points added to each player's score this round
  completed: boolean[] // who completed their phase (and so advances)
}

/** The scores at the end of one round, kept for the scoreboard. */
export interface RoundRecord {
  round: number // 1-based
  winner: number | null // who went out
  points: number[] // points each player was given this round
  totals: number[] // each player's total score after this round
  laid?: boolean[] // who had laid down their phase (missing in rounds recorded by older versions)
  shutOut?: boolean[] // who was caught without ever drawing a card, for example skipped until the round ended
}

export type Stage = 'draw' | 'play'
export type Status = 'playing' | 'roundOver' | 'gameOver'

/** A card that was added to a group on the table, and the turn it happened on. */
export interface HitMark {
  cardId: number
  turn: number
}

/** One thing that happened, kept so the table can show a readable history of plays. */
export type PlayEvent =
  | { player: number; kind: 'draw' } // drew from the deck (the card stays private)
  | { player: number; kind: 'pickup'; card: Card } // took the top discard
  | { player: number; kind: 'discard'; card: Card }
  | { player: number; kind: 'skip'; card: Card; target: number } // played a Skip on someone
  | { player: number; kind: 'skipped' } // lost their turn to a Skip
  | { player: number; kind: 'laydown'; phase: number }
  | { player: number; kind: 'hit'; card: Card; owner: number } // added to a group on the table

export interface GameState {
  mode: GameMode
  players: Player[]
  drawPile: Card[] // last element is the top
  discardPile: Card[] // last element is the top
  melds: Meld[]
  current: number
  stage: Stage
  status: Status
  round: number // 1-based
  nextMeldId: number
  rngSeed: number
  roundResult: RoundResult | null
  winners: number[] // set when status is gameOver
  log: string[]
  turnCount: number // counts every seat the turn passes to, including skipped seats
  hits: HitMark[] // recent additions to groups, used to highlight them
  events: PlayEvent[] // recent plays this round, oldest first
  scoreHistory: RoundRecord[] // one entry per finished round, oldest first
  drew: boolean[] // who has taken a draw so far this round
}

export type Action =
  | { type: 'drawDeck' }
  | { type: 'drawDiscard' }
  | { type: 'layDown'; groups: number[][]; phase?: number } // card ids, one array per group; phase is required in yousee mode
  | { type: 'hit'; cardId: number; meldId: number; end?: RunEnd }
  | { type: 'discard'; cardId: number; skipTarget?: number }

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string }

export interface PlayerSetup {
  name: string
  isBot: boolean
}

const MAX_LOG = 80
const MAX_EVENTS = 40

function addEvent(state: GameState, event: PlayEvent): void {
  state.events.push(event)
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS)
}

function addLog(state: GameState, message: string): void {
  state.log.push(message)
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG)
}

const fail = (error: string): ActionResult => ({ ok: false, error })
const succeed = (state: GameState): ActionResult => ({ ok: true, state })

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(
  setups: readonly PlayerSetup[],
  seed: number = randomSeed(),
  mode: GameMode = 'classic',
): GameState {
  if (setups.length < 2 || setups.length > 6) {
    throw new Error('Phase games need between 2 and 6 players')
  }
  const state: GameState = {
    mode,
    players: setups.map((p) => ({
      name: p.name,
      isBot: p.isBot,
      hand: [],
      phase: 0,
      order: Array.from({ length: PHASE_COUNT }, (_, i) => i),
      done: Array.from({ length: PHASE_COUNT }, () => false),
      laidPhase: null,
      laidDown: false,
      skipsPending: 0,
      score: 0,
    })),
    drawPile: [],
    discardPile: [],
    melds: [],
    current: 0,
    stage: 'draw',
    status: 'playing',
    round: 1,
    nextMeldId: 1,
    rngSeed: seed >>> 0,
    roundResult: null,
    winners: [],
    log: [],
    turnCount: 0,
    hits: [],
    events: [],
    scoreHistory: [],
    drew: [],
  }
  if (mode === 'random') {
    // Each player gets their own order. It is never shown, only the phase they are on.
    for (const p of state.players) {
      const shuffled = shuffleWithSeed(p.order, state.rngSeed)
      state.rngSeed = shuffled.seed
      p.order = shuffled.items
    }
  }
  if (mode === 'reverse') {
    // Net Esaf: everyone starts at Phase 10 and works down to Phase 1.
    for (const p of state.players) p.order = p.order.slice().reverse()
  }
  dealRound(state)
  return state
}

/**
 * The phase this player has to lay down this round, as an index 0..9. Null in YouSee
 * (they choose) and once they have completed everything.
 */
export function targetPhase(state: Pick<GameState, 'mode'>, player: Player): number | null {
  if (state.mode === 'yousee') return null
  return player.phase < PHASE_COUNT ? player.order[player.phase] : null
}

/** Starts the next round after a round has ended. Returns the same state if the round is not over. */
export function nextRound(state: GameState): GameState {
  if (state.status !== 'roundOver') return state
  const s = structuredClone(state)
  s.round += 1
  dealRound(s)
  return s
}

function dealRound(state: GameState): void {
  const shuffled = shuffleWithSeed(buildDeck(), state.rngSeed)
  state.rngSeed = shuffled.seed
  const deck = shuffled.items

  for (const p of state.players) {
    p.hand = deck.splice(0, HAND_SIZE)
    p.laidDown = false
    p.laidPhase = null
    p.skipsPending = 0
  }
  const starter = deck.pop() as Card
  state.discardPile = [starter]
  state.drawPile = deck
  state.melds = []
  state.hits = []
  state.events = []
  state.drew = state.players.map(() => false)
  state.roundResult = null
  state.status = 'playing'

  addLog(state, `Round ${state.round} begins`)
  const first = (state.round - 1) % state.players.length
  if (starter.kind === 'skip') state.players[first].skipsPending = 1
  beginTurn(state, first)
}

/** Moves play to the given player, passing over anyone who is skipped. */
function beginTurn(state: GameState, index: number): void {
  const n = state.players.length
  let i = index
  state.turnCount += 1
  for (let guard = 0; guard < n && state.players[i].skipsPending > 0; guard++) {
    state.players[i].skipsPending -= 1
    addLog(state, `${state.players[i].name} is skipped`)
    addEvent(state, { player: i, kind: 'skipped' })
    i = (i + 1) % n
    state.turnCount += 1 // a skipped seat still counts, so one lap is always one full round
  }
  state.current = i
  state.stage = 'draw'
}

function ensureDrawPile(state: GameState): boolean {
  if (state.drawPile.length > 0) return true
  if (state.discardPile.length <= 1) return false
  const top = state.discardPile.pop() as Card
  const shuffled = shuffleWithSeed(state.discardPile, state.rngSeed)
  state.rngSeed = shuffled.seed
  state.drawPile = shuffled.items
  state.discardPile = [top]
  addLog(state, 'The discard pile was shuffled to make a new draw pile')
  return true
}

function endRound(state: GameState, winner: number | null): void {
  const points = state.players.map((p, i) => (i === winner ? 0 : handPoints(p.hand)))
  const completed = state.players.map((p) => p.laidDown)
  state.players.forEach((p, i) => {
    p.score += points[i]
    if (p.laidDown) {
      // In classic mode the phase laid down is always the current one.
      p.done[p.laidPhase ?? targetPhase(state, p) ?? 0] = true
      p.phase = p.done.filter(Boolean).length
    }
  })
  state.roundResult = { winner, points, completed }
  state.scoreHistory.push({
    round: state.round,
    winner,
    points,
    totals: state.players.map((p) => p.score),
    laid: completed,
    shutOut: state.players.map((p, i) => i !== winner && !p.laidDown && !state.drew[i]),
  })

  if (winner !== null) addLog(state, `${state.players[winner].name} went out`)

  const finishers = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.phase >= PHASE_COUNT)
    .map(({ i }) => i)

  if (finishers.length > 0) {
    const lowest = Math.min(...finishers.map((i) => state.players[i].score))
    state.winners = finishers.filter((i) => state.players[i].score === lowest)
    state.status = 'gameOver'
  } else {
    state.status = 'roundOver'
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.status !== 'playing') return fail('The round is not in progress')
  const s = structuredClone(state)
  const player = s.players[s.current]
  const n = s.players.length

  switch (action.type) {
    case 'drawDeck': {
      if (s.stage !== 'draw') return fail('You already drew a card this turn')
      if (!ensureDrawPile(s)) return fail('There are no cards left to draw')
      player.hand.push(s.drawPile.pop() as Card)
      s.drew[s.current] = true
      s.stage = 'play'
      addLog(s, `${player.name} drew from the deck`)
      addEvent(s, { player: s.current, kind: 'draw' })
      return succeed(s)
    }

    case 'drawDiscard': {
      if (s.stage !== 'draw') return fail('You already drew a card this turn')
      const top = s.discardPile[s.discardPile.length - 1]
      if (!top) return fail('The discard pile is empty')
      if (top.kind === 'skip') return fail('A Skip card cannot be picked up')
      s.discardPile.pop()
      player.hand.push(top)
      s.drew[s.current] = true
      s.stage = 'play'
      addLog(s, `${player.name} picked up ${cardLabel(top)}`)
      addEvent(s, { player: s.current, kind: 'pickup', card: top })
      return succeed(s)
    }

    case 'layDown': {
      if (s.stage !== 'play') return fail('Draw a card first')
      if (player.laidDown) return fail('You already laid down your phase this round')
      const used = new Set<number>()
      const groups: Card[][] = []
      for (const ids of action.groups) {
        const cards: Card[] = []
        for (const id of ids) {
          if (used.has(id)) return fail('A card was used more than once')
          used.add(id)
          const card = player.hand.find((c) => c.id === id)
          if (!card) return fail('One of those cards is not in your hand')
          cards.push(card)
        }
        groups.push(cards)
      }
      let phaseIdx: number
      if (s.mode !== 'yousee') {
        const target = targetPhase(s, player)
        if (target === null) return fail('You have already completed every phase')
        phaseIdx = target
      } else {
        const chosen = action.phase
        if (chosen === undefined || !Number.isInteger(chosen) || chosen < 0 || chosen >= PHASE_COUNT) {
          return fail('Choose which phase you are laying down')
        }
        if (player.done[chosen]) return fail(`You already completed Phase ${chosen + 1}`)
        phaseIdx = chosen
      }
      const bodies = matchPhase(phaseIdx, groups)
      if (!bodies) {
        return fail(`Those cards do not make Phase ${phaseIdx + 1} (${phaseDescription(phaseIdx)})`)
      }
      player.hand = player.hand.filter((c) => !used.has(c.id))
      for (const body of bodies) {
        s.melds.push({ ...body, id: s.nextMeldId++, owner: s.current } as Meld)
      }
      player.laidDown = true
      player.laidPhase = phaseIdx
      addLog(s, `${player.name} laid down Phase ${phaseIdx + 1}`)
      addEvent(s, { player: s.current, kind: 'laydown', phase: phaseIdx })
      if (player.hand.length === 0) endRound(s, s.current)
      return succeed(s)
    }

    case 'hit': {
      if (s.stage !== 'play') return fail('Draw a card first')
      if (!player.laidDown) return fail('Lay down your phase before hitting')
      const card = player.hand.find((c) => c.id === action.cardId)
      if (!card) return fail('That card is not in your hand')
      const meld = s.melds.find((m) => m.id === action.meldId)
      if (!meld) return fail('That group is not on the table')
      if (!hitMeld(meld, card, action.end)) return fail('That card does not fit there')
      player.hand = player.hand.filter((c) => c.id !== card.id)
      s.hits.push({ cardId: card.id, turn: s.turnCount })
      s.hits = s.hits.filter((h) => s.turnCount - h.turn < n)
      const whose = meld.owner === s.current ? 'their own group' : `${s.players[meld.owner].name}'s group`
      addLog(s, `${player.name} hit ${whose} with ${cardLabel(card)}`)
      addEvent(s, { player: s.current, kind: 'hit', card, owner: meld.owner })
      if (player.hand.length === 0) endRound(s, s.current)
      return succeed(s)
    }

    case 'discard': {
      if (s.stage !== 'play') return fail('Draw a card first')
      const idx = player.hand.findIndex((c) => c.id === action.cardId)
      if (idx < 0) return fail('That card is not in your hand')
      const card = player.hand[idx]

      let target: number | null = null
      if (card.kind === 'skip') {
        if (n === 2) {
          target = (s.current + 1) % 2
        } else {
          const t = action.skipTarget
          if (t === undefined || t === s.current || !s.players[t]) {
            return fail('Choose which player to skip')
          }
          target = t
        }
      }

      player.hand.splice(idx, 1)
      s.discardPile.push(card)
      if (target !== null) {
        s.players[target].skipsPending += 1
        addLog(s, `${player.name} played Skip on ${s.players[target].name}`)
        addEvent(s, { player: s.current, kind: 'skip', card, target })
      } else {
        addLog(s, `${player.name} discarded ${cardLabel(card)}`)
        addEvent(s, { player: s.current, kind: 'discard', card })
      }

      if (player.hand.length === 0) {
        endRound(s, s.current)
        return succeed(s)
      }
      beginTurn(s, (s.current + 1) % n)
      return succeed(s)
    }
  }
}

/**
 * Once a player has laid down and played down to a single card, that card can only be discarded, and
 * discarding it ends the round. This does that discard for them. It changes nothing in any other
 * situation, so it is safe to call after any of the player's plays.
 */
export function discardLastCard(state: GameState, who: number): GameState {
  const player = state.players[who]
  if (state.status !== 'playing' || state.stage !== 'play' || state.current !== who) return state
  if (!player || !player.laidDown || player.hand.length !== 1) return state
  const card = player.hand[0]
  // A Skip needs a target even though the round is about to end; any other player will do.
  const target = state.players.findIndex((_, i) => i !== who)
  const result = applyAction(state, {
    type: 'discard',
    cardId: card.id,
    skipTarget: card.kind === 'skip' ? target : undefined,
  })
  return result.ok ? result.state : state
}

/** Fills in fields that games saved by earlier versions do not have. */
export function upgradeSavedState(state: GameState): GameState {
  state.turnCount ??= 0
  state.hits ??= []
  state.events ??= []
  state.scoreHistory ??= []
  // A round that was already under way cannot say who has drawn, so nobody counts as shut out.
  state.drew ??= state.players.map(() => true)
  state.mode ??= 'classic'
  for (const p of state.players) {
    p.order ??= Array.from({ length: PHASE_COUNT }, (_, i) => i)
    p.done ??= Array.from({ length: PHASE_COUNT }, (_, i) => i < p.phase)
    p.laidPhase ??= p.laidDown ? Math.min(p.phase, PHASE_COUNT - 1) : null
    // Older saves kept a yes/no flag called `skipped`.
    const legacy = p as unknown as { skipped?: boolean }
    p.skipsPending ??= legacy.skipped ? 1 : 0
    delete legacy.skipped
  }
  return state
}

// ---------------------------------------------------------------------------
// Read-only helpers for the UI and bots
// ---------------------------------------------------------------------------

export function currentPlayer(state: GameState): Player {
  return state.players[state.current]
}

export function topDiscard(state: GameState): Card | null {
  return state.discardPile[state.discardPile.length - 1] ?? null
}

export function canPickUpDiscard(state: GameState): boolean {
  const top = topDiscard(state)
  return state.status === 'playing' && state.stage === 'draw' && top !== null && top.kind !== 'skip'
}

export interface HitTarget {
  meldId: number
  ends: RunEnd[] // for runs, which ends the card could go on; empty for sets and color groups
}

/** Every meld on the table the current player could add this card to. */
export function hitTargets(state: GameState, card: Card): HitTarget[] {
  if (!currentPlayer(state).laidDown) return []
  const targets: HitTarget[] = []
  for (const meld of state.melds) {
    if (!canHit(meld, card)) continue
    targets.push({ meldId: meld.id, ends: meld.kind === 'run' ? runEndsFor(meld, card) : [] })
  }
  return targets
}

/**
 * Ids of cards that were added to a group within the last full lap of the table.
 * A card stays on this list until its player's next turn comes around.
 */
export function recentHitIds(state: GameState): Set<number> {
  const n = state.players.length
  const ids = (state.hits ?? [])
    .filter((h) => state.turnCount - h.turn < n)
    .map((h) => h.cardId)
  return new Set(ids)
}

export function meldsOf(state: GameState, owner: number): Meld[] {
  return state.melds.filter((m) => m.owner === owner)
}
