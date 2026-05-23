import { describe, expect, it } from "vitest";

import {
  SYMBOLS,
  checkMatch,
  createDeck,
  createInitialState,
  flipCard,
  isWon,
  shuffle,
} from "./logic";

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

describe("createDeck", () => {
  it("produces 16 cards (8 pairs)", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(16);
  });

  it("contains exactly 2 copies of each symbol", () => {
    const deck = createDeck();
    for (const symbol of SYMBOLS) {
      const count = deck.filter((c) => c.symbol === symbol).length;
      expect(count).toBe(2);
    }
  });

  it("all cards start face-down and unmatched", () => {
    const deck = createDeck();
    for (const card of deck) {
      expect(card.flipped).toBe(false);
      expect(card.matched).toBe(false);
    }
  });

  it("uses all 8 symbols from SYMBOLS", () => {
    const deck = createDeck();
    const uniqueSymbols = new Set(deck.map((c) => c.symbol));
    expect(uniqueSymbols.size).toBe(8);
    for (const symbol of SYMBOLS) {
      expect(uniqueSymbols.has(symbol)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// shuffle
// ---------------------------------------------------------------------------

describe("shuffle", () => {
  /** A simple seeded LCG for deterministic tests. */
  function makeLcg(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0x100000000;
    };
  }

  it("preserves the same 16 cards", () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, makeLcg(42));
    expect(shuffled).toHaveLength(16);
    // Every symbol still appears exactly twice
    for (const symbol of SYMBOLS) {
      expect(shuffled.filter((c) => c.symbol === symbol)).toHaveLength(2);
    }
  });

  it("is deterministic when given the same RNG seed", () => {
    const deck = createDeck();
    const shuffled1 = shuffle(deck, makeLcg(99));
    const shuffled2 = shuffle(deck, makeLcg(99));
    expect(shuffled1.map((c) => c.symbol)).toEqual(shuffled2.map((c) => c.symbol));
  });

  it("does not mutate the original deck", () => {
    const deck = createDeck();
    const originalSymbols = deck.map((c) => c.symbol);
    shuffle(deck, makeLcg(7));
    expect(deck.map((c) => c.symbol)).toEqual(originalSymbols);
  });
});

// ---------------------------------------------------------------------------
// flipCard
// ---------------------------------------------------------------------------

describe("flipCard", () => {
  it("flips a face-down card face-up", () => {
    const state = createInitialState(createDeck());
    const next = flipCard(state, 0);
    expect(next.cards[0]?.flipped).toBe(true);
    expect(next.flippedIndices).toEqual([0]);
  });

  it("does not flip an already-flipped card a second time", () => {
    const state = createInitialState(createDeck());
    const after1 = flipCard(state, 0);
    const after2 = flipCard(after1, 0);
    expect(after2.flippedIndices).toHaveLength(1);
  });

  it("does not flip a matched card", () => {
    const state = createInitialState(createDeck());
    // Manually mark card 0 as matched
    const matchedState = {
      ...state,
      cards: state.cards.map((c, i) => (i === 0 ? { ...c, matched: true } : c)),
    };
    const next = flipCard(matchedState, 0);
    expect(next.flippedIndices).toHaveLength(0);
  });

  it("does not flip a third card when 2 are already face-up", () => {
    const state = createInitialState(createDeck());
    const s1 = flipCard(state, 0);
    const s2 = flipCard(s1, 2);
    const s3 = flipCard(s2, 4);
    // Should still have only 2 flipped indices
    expect(s3.flippedIndices).toHaveLength(2);
    expect(s3.cards[4]?.flipped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMatch
// ---------------------------------------------------------------------------

describe("checkMatch", () => {
  it("is a no-op when fewer than 2 cards are face-up", () => {
    const state = createInitialState(createDeck());
    const s1 = flipCard(state, 0);
    const result = checkMatch(s1);
    expect(result).toBe(s1); // same reference
  });

  it("marks both cards as matched when symbols match", () => {
    // createDeck places pairs at indices 0&8, 1&9, ..., 7&15 (first half + second half)
    const deck = createDeck();
    const state = createInitialState(deck);
    // Cards 0 and 8 share symbol SYMBOLS[0]
    const s1 = flipCard(state, 0);
    const s2 = flipCard(s1, 8);
    const result = checkMatch(s2);
    expect(result.cards[0]?.matched).toBe(true);
    expect(result.cards[8]?.matched).toBe(true);
    expect(result.flippedIndices).toHaveLength(0);
    expect(result.moves).toBe(1);
  });

  it("flips both cards back down when symbols don't match", () => {
    const deck = createDeck();
    const state = createInitialState(deck);
    // Cards 0 (SYMBOLS[0]) and 1 (SYMBOLS[1]) don't match
    const s1 = flipCard(state, 0);
    const s2 = flipCard(s1, 1);
    const result = checkMatch(s2);
    expect(result.cards[0]?.flipped).toBe(false);
    expect(result.cards[1]?.flipped).toBe(false);
    expect(result.cards[0]?.matched).toBe(false);
    expect(result.flippedIndices).toHaveLength(0);
    expect(result.moves).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------

describe("isWon", () => {
  it("returns false on an unstarted game", () => {
    expect(isWon(createInitialState(createDeck()))).toBe(false);
  });

  it("returns false when some cards are unmatched", () => {
    const deck = createDeck();
    const state = createInitialState(deck);
    const s1 = flipCard(state, 0);
    const s2 = flipCard(s1, 8);
    const matched = checkMatch(s2);
    expect(isWon(matched)).toBe(false);
  });

  it("returns true when all 16 cards are matched", () => {
    const deck = createDeck();
    let state = createInitialState(deck);
    // Match every pair: card i pairs with card i+8 (createDeck layout)
    for (let i = 0; i < 8; i++) {
      state = flipCard(state, i);
      state = flipCard(state, i + 8);
      state = checkMatch(state);
    }
    expect(isWon(state)).toBe(true);
  });
});
