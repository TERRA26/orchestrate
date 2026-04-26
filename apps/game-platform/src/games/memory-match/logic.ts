/**
 * Pure game logic for Memory Match.
 * No React, no side effects — fully testable in isolation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Card {
  /** Unique index within the deck (0–15). */
  readonly id: number;
  /** The emoji symbol on this card. */
  readonly symbol: string;
  /** Whether the card is currently face-up. */
  readonly flipped: boolean;
  /** Whether this card has been permanently matched. */
  readonly matched: boolean;
}

export interface MemoryGameState {
  readonly cards: readonly Card[];
  /**
   * Indices (into `cards`) of cards that are currently face-up but not yet
   * matched (at most 2 at a time).
   */
  readonly flippedIndices: readonly number[];
  /** Total number of flip-pair attempts. */
  readonly moves: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 8 emoji symbols used for the 16-card deck (8 pairs). */
export const SYMBOLS: readonly string[] = [
  "🎮",
  "🎲",
  "🎯",
  "🎪",
  "🎨",
  "🎭",
  "🎰",
  "🎸",
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an unshuffled deck of 16 cards (8 pairs).
 * Cards are in pairs: [sym0, sym0, sym1, sym1, …, sym7, sym7].
 */
export function createDeck(): Card[] {
  return [...SYMBOLS, ...SYMBOLS].map((symbol, id) => ({
    id,
    symbol,
    flipped: false,
    matched: false,
  }));
}

/**
 * Return a new array with the cards shuffled.
 *
 * @param deck  The original deck (not mutated).
 * @param rng   Optional deterministic RNG — defaults to `Math.random`.
 *              Must return a number in [0, 1).
 */
export function shuffle(deck: readonly Card[], rng: () => number = Math.random): Card[] {
  const result = deck.map((card, id) => ({ ...card, id }));
  // Fisher-Yates
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  // Re-assign ids to reflect new positions
  return result.map((card, id) => ({ ...card, id }));
}

/**
 * Flip the card at `index` face-up.
 *
 * Rules:
 * - Ignores the flip if the card is already matched.
 * - Ignores the flip if 2 unmatched cards are already face-up (caller must
 *   call `checkMatch` or `resetFlipped` first).
 * - Ignores the flip if the card is already face-up.
 */
export function flipCard(state: MemoryGameState, index: number): MemoryGameState {
  const card = state.cards[index];
  if (!card) return state;
  if (card.matched) return state;
  if (card.flipped) return state;
  if (state.flippedIndices.length >= 2) return state;

  const newCards = state.cards.map((c, i) => (i === index ? { ...c, flipped: true } : c));
  const newFlipped = [...state.flippedIndices, index];

  return {
    ...state,
    cards: newCards,
    flippedIndices: newFlipped,
  };
}

/**
 * Check whether the two currently face-up cards form a match.
 *
 * - If they match: mark both as `matched`, clear `flippedIndices`, increment
 *   `moves`.
 * - If they don't match: flip both face-down, clear `flippedIndices`,
 *   increment `moves`.
 * - If fewer than 2 cards are face-up: return state unchanged (no-op).
 */
export function checkMatch(state: MemoryGameState): MemoryGameState {
  if (state.flippedIndices.length !== 2) return state;

  const [i, j] = state.flippedIndices as [number, number];
  const cardA = state.cards[i];
  const cardB = state.cards[j];

  if (!cardA || !cardB) return state;

  const isMatch = cardA.symbol === cardB.symbol;

  const newCards = state.cards.map((card, idx) => {
    if (idx !== i && idx !== j) return card;
    if (isMatch) return { ...card, matched: true, flipped: true };
    return { ...card, flipped: false };
  });

  return {
    ...state,
    cards: newCards,
    flippedIndices: [],
    moves: state.moves + 1,
  };
}

/**
 * Returns `true` when all cards have been matched (game complete).
 */
export function isWon(state: MemoryGameState): boolean {
  return state.cards.every((c) => c.matched);
}

/**
 * Create the initial game state from a (pre-shuffled) deck.
 */
export function createInitialState(deck: readonly Card[]): MemoryGameState {
  return {
    cards: deck.map((card) => ({ ...card, flipped: false, matched: false })),
    flippedIndices: [],
    moves: 0,
  };
}
