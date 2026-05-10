import { Box, Card, Rating } from "./types";

const BOX_WEIGHT: Record<Box, number> = {
  1: 8,
  2: 4,
  3: 2,
  4: 1,
  5: 0.25,
};

export function applyRating(card: Card, rating: Rating, now = new Date().toISOString()): Card {
  let nextBox: Box = card.box;
  let goodCount = card.goodCount;
  let badCount = card.badCount;

  if (rating === "good") {
    nextBox = (Math.min(5, card.box + 1) as Box);
    goodCount += 1;
  } else if (rating === "bad") {
    nextBox = 1;
    badCount += 1;
  }

  return {
    ...card,
    box: nextBox,
    goodCount,
    badCount,
    reviewCount: card.reviewCount + 1,
    lastReviewedAt: now,
    updatedAt: now,
  };
}

export function isLearned(card: Card): boolean {
  return card.box >= 5;
}

export function deckProgress(cards: Card[]): { learned: number; percent: number } {
  if (cards.length === 0) return { learned: 0, percent: 0 };
  const learned = cards.filter(isLearned).length;
  return { learned, percent: Math.round((learned / cards.length) * 100) };
}

function pickWeighted<T>(items: { item: T; weight: number }[], rng: () => number): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)].item;
  let r = rng() * total;
  for (const x of items) {
    r -= x.weight;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

export interface SelectOptions {
  count?: number;
  boxes?: Box[];
  shuffle?: boolean;
  prioritizeWeak?: boolean;
  preserveOrder?: boolean;
}

export function selectStudyDeck(cards: Card[], opts: SelectOptions = {}): Card[] {
  let pool = [...cards];
  if (opts.boxes && opts.boxes.length > 0) {
    pool = pool.filter((c) => opts.boxes!.includes(c.box));
  }
  if (pool.length === 0) return [];

  const limit = opts.count && opts.count > 0 ? Math.min(opts.count, pool.length) : pool.length;

  if (opts.preserveOrder) {
    return pool.slice(0, limit);
  }

  if (!opts.prioritizeWeak) {
    if (opts.shuffle !== false) {
      pool = pool
        .map((c) => ({ c, k: Math.random() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.c);
    }
    return pool.slice(0, limit);
  }

  const result: Card[] = [];
  const remaining = pool.map((c) => ({ item: c, weight: BOX_WEIGHT[c.box] }));
  const rng = Math.random;
  while (result.length < limit && remaining.length > 0) {
    const picked = pickWeighted(remaining, rng);
    result.push(picked);
    const idx = remaining.findIndex((x) => x.item === picked);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return result;
}

export const BOX_COLORS: Record<Box, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#06b6d4",
};

export const BOX_LABEL: Record<Box, string> = {
  1: "Новая",
  2: "Учу",
  3: "Закрепляю",
  4: "Знаю",
  5: "Выучено",
};
