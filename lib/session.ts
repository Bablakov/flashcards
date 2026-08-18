"use client";

/**
 * Сборка сессии самопроверки (§4.4 спецификации).
 *
 * Область (все группы / выбранные / одна с подгруппами) задаётся снаружи —
 * сюда приходит уже готовый пул карточек. Здесь только режим, фильтры,
 * дневные лимиты и порядок показа.
 */

import { CardProgress, isDue, isNew } from "./progress";
import { Box, Card } from "./types";

export type SessionMode = "review" | "new" | "training" | "exam";
export type SessionOrder = "random" | "sequential" | "weak";
export type SessionDirection = "front" | "back" | "mixed";

export interface StudyItem {
  card: Card;
  groupId: string;
  progress: CardProgress;
}

export interface SessionOptions {
  mode: SessionMode;
  levels?: Box[];
  onlyErrors?: boolean;
  count?: number;
  order?: SessionOrder;
  newLimit?: number;
  reviewLimit?: number;
}

/** Режимы «тренировка» и «экзамен» не влияют на прогресс — ответы не записываются. */
export function affectsProgress(mode: SessionMode): boolean {
  return mode === "review" || mode === "new";
}

function shuffle<T>(list: T[]): T[] {
  return list
    .map((item) => ({ item, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

export function buildSession(
  pool: StudyItem[],
  opts: SessionOptions,
  now = new Date(),
): StudyItem[] {
  let items = [...pool];

  if (opts.levels && opts.levels.length > 0) {
    items = items.filter((i) => opts.levels!.includes(i.progress.box));
  }
  if (opts.onlyErrors) {
    items = items.filter((i) => i.progress.badCount > 0);
  }

  switch (opts.mode) {
    case "review":
      // Только «созревшие» карточки, самые просроченные первыми.
      items = items
        .filter((i) => !isNew(i.progress) && isDue(i.progress, now))
        .sort((a, b) => (a.progress.due ?? "").localeCompare(b.progress.due ?? ""));
      if (opts.reviewLimit && opts.reviewLimit > 0) items = items.slice(0, opts.reviewLimit);
      break;
    case "new":
      items = items.filter((i) => isNew(i.progress));
      if (opts.newLimit && opts.newLimit > 0) items = items.slice(0, opts.newLimit);
      break;
    case "training":
    case "exam":
      break;
  }

  if (opts.order === "sequential") {
    items.sort((a, b) => a.card.createdAt.localeCompare(b.card.createdAt));
  } else if (opts.order === "weak") {
    // Слабые вперёд: сначала низкая стабильность, при равенстве — больше ошибок.
    items.sort(
      (a, b) =>
        a.progress.stability - b.progress.stability || b.progress.badCount - a.progress.badCount,
    );
  } else if (opts.mode !== "review") {
    items = shuffle(items);
  }

  if (opts.count && opts.count > 0) items = items.slice(0, opts.count);
  return items;
}

/** Сколько карточек созрело и сколько новых — для подписей на экране настройки. */
export function poolStats(pool: StudyItem[], now = new Date()) {
  let due = 0;
  let fresh = 0;
  let learned = 0;
  for (const i of pool) {
    if (isNew(i.progress)) fresh++;
    else if (isDue(i.progress, now)) due++;
    if (i.progress.box >= 4) learned++;
  }
  return { total: pool.length, due, new: fresh, learned };
}

/** Какую сторону показывать первой в конкретной карточке. */
export function firstSide(direction: SessionDirection, index: number): "front" | "back" {
  if (direction === "front") return "front";
  if (direction === "back") return "back";
  return index % 2 === 0 ? "front" : "back";
}
