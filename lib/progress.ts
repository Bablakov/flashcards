"use client";

/**
 * Прогресс запоминания выводится из журнала событий, а не хранится файлом (§5.3).
 * Проигрывание журнала даёт текущее состояние карточки; кэш живёт в памяти и
 * сбрасывается при любой записи.
 *
 * Сейчас правила — Leitner (как было): «хорошо» поднимает уровень, «плохо»
 * возвращает в первый, «нейтрально» оставляет на месте. В фазе 3 этот модуль
 * заменяется на FSRS, интерфейс `CardProgress` при этом сохраняется.
 */

import { JournalEvent } from "./model";
import { readJournal } from "./store";
import { Box } from "./types";

export interface CardProgress {
  box: Box;
  goodCount: number;
  badCount: number;
  reviewCount: number;
  lastReviewedAt: string | null;
}

export const EMPTY_PROGRESS: CardProgress = {
  box: 1,
  goodCount: 0,
  badCount: 0,
  reviewCount: 0,
  lastReviewedAt: null,
};

function clampBox(n: number): Box {
  const v = Math.min(5, Math.max(1, Math.round(n)));
  return v as Box;
}

/** Проигрывание событий в состояние карточек. */
export function replay(events: JournalEvent[]): Map<string, CardProgress> {
  const state = new Map<string, CardProgress>();
  for (const ev of events) {
    const prev = state.get(ev.card) ?? { ...EMPTY_PROGRESS };
    if (ev.k === "set") {
      state.set(ev.card, {
        box: ev.box ? clampBox(ev.box) : prev.box,
        goodCount: ev.good ?? prev.goodCount,
        badCount: ev.bad ?? prev.badCount,
        reviewCount: ev.rev ?? prev.reviewCount,
        lastReviewedAt: prev.lastReviewedAt,
      });
      continue;
    }
    const next: CardProgress = {
      box: prev.box,
      goodCount: prev.goodCount,
      badCount: prev.badCount,
      reviewCount: prev.reviewCount + 1,
      lastReviewedAt: ev.t,
    };
    if (ev.rating === "good") {
      next.box = clampBox(prev.box + 1);
      next.goodCount += 1;
    } else if (ev.rating === "bad") {
      next.box = 1;
      next.badCount += 1;
    }
    state.set(ev.card, next);
  }
  return state;
}

let cache: Map<string, CardProgress> | null = null;
let cachePromise: Promise<Map<string, CardProgress>> | null = null;

/** Сброс кэша — вызывается после записи в журнал и после pull/clone. */
export function invalidateProgress(): void {
  cache = null;
  cachePromise = null;
}

export async function getProgressMap(): Promise<Map<string, CardProgress>> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = readJournal().then((events) => {
      cache = replay(events);
      return cache;
    });
  }
  return await cachePromise;
}

export async function getProgress(cardId: string): Promise<CardProgress> {
  const map = await getProgressMap();
  return map.get(cardId) ?? { ...EMPTY_PROGRESS };
}

/* ------------------------------------------------------- статистика (§8) */

/** Количество ответов по дням: `{"2026-08-18": 34}`. */
export function reviewsByDay(events: JournalEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of events) {
    if (ev.k !== "rate") continue;
    const day = ev.t.slice(0, 10);
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

/** Серия: сколько дней подряд (включая сегодня или вчера) были повторы. */
export function currentStreak(byDay: Record<string, number>, today = new Date()): number {
  const day = new Date(today);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  if (!byDay[key(day)]) {
    day.setDate(day.getDate() - 1);
    if (!byDay[key(day)]) return 0;
  }
  let streak = 0;
  while (byDay[key(day)]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
