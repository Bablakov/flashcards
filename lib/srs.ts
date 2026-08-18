/**
 * Отображение уровней запоминания. Само расписание повторов считает FSRS
 * (см. lib/progress.ts) — здесь остались только подписи и цвета, общие для
 * всего интерфейса: список карточек, редактор, сессия, отчёт.
 */

import { Box, Card } from "./types";

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

/** Карточка считается усвоенной начиная с 4-го уровня (стабильность ≥ 7 дней). */
export function isLearned(card: { box: Box }): boolean {
  return card.box >= 4;
}

export function deckProgress(cards: Card[]): { learned: number; percent: number } {
  if (cards.length === 0) return { learned: 0, percent: 0 };
  const learned = cards.filter(isLearned).length;
  return { learned, percent: Math.round((learned / cards.length) * 100) };
}
