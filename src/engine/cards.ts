// Card model, deck construction, scoring values, and a seedable shuffle.
// Pure TypeScript with no UI dependencies.

export type Color = 'red' | 'blue' | 'green' | 'yellow'
export const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow']

export interface NumberCard {
  id: number
  kind: 'number'
  color: Color
  value: number // 1..12
}
export interface WildCard {
  id: number
  kind: 'wild'
}
export interface SkipCard {
  id: number
  kind: 'skip'
}
export type Card = NumberCard | WildCard | SkipCard

export const MIN_VALUE = 1
export const MAX_VALUE = 12
export const HAND_SIZE = 10
export const DECK_SIZE = 108

export function isNumber(card: Card): card is NumberCard {
  return card.kind === 'number'
}

/**
 * Standard deck: 2 copies of 1..12 in each of 4 colors (96),
 * plus 8 Wild cards and 4 Skip cards = 108 cards. Ids are 0..107.
 */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const color of COLORS) {
    for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
      for (let copy = 0; copy < 2; copy++) {
        deck.push({ id: id++, kind: 'number', color, value })
      }
    }
  }
  for (let i = 0; i < 8; i++) deck.push({ id: id++, kind: 'wild' })
  for (let i = 0; i < 4; i++) deck.push({ id: id++, kind: 'skip' })
  return deck
}

/** Points a card is worth when left in a hand at the end of a round. */
export function cardPoints(card: Card): number {
  switch (card.kind) {
    case 'skip':
      return 15
    case 'wild':
      return 25
    case 'number':
      return card.value >= 10 ? 10 : 5
  }
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card), 0)
}

export function cardLabel(card: Card): string {
  switch (card.kind) {
    case 'skip':
      return 'Skip'
    case 'wild':
      return 'Wild'
    case 'number': {
      const color = card.color[0].toUpperCase() + card.color.slice(1)
      return `${color} ${card.value}`
    }
  }
}

// ---------------------------------------------------------------------------
// Seedable random numbers (mulberry32). The generator state is a plain uint32
// so it can live inside serializable game state.
// ---------------------------------------------------------------------------

/** Returns [random number in [0,1), next seed]. */
export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** Fisher-Yates shuffle driven by the seed. Returns a new array and the next seed. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice()
  let s = seed >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(s)
    s = next
    const j = Math.floor(r * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return { items: out, seed: s }
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0
}
