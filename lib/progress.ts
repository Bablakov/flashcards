"use client";

/**
 * Прогресс запоминания выводится из журнала событий, а не хранится файлом (§5.3),
 * а расписание повторов считает FSRS (§4).
 *
 * FSRS оценивает три величины: сложность карточки, стабильность памяти (сколько
 * дней знание держится) и вероятность вспомнить сейчас. По сравнению с SM-2 он
 * даёт ту же удерживаемость за заметно меньшее число повторов и не загоняет
 * карточку в «ease hell» после серии ошибок.
 *
 * Наружу отдаются привычные 5 уровней — они вычисляются из стабильности и нужны
 * только для отображения (цвета, проценты, фильтры).
 */

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from "ts-fsrs";
import { JournalEvent } from "./model";
import { readJournal, readSettings } from "./store";
import { Box, Rating } from "./types";

export type CardState = "new" | "learning" | "review" | "relearning";

export interface CardProgress {
  box: Box;
  stability: number;
  difficulty: number;
  /** Когда карточка «созреет» для повтора. null — ни разу не показывалась. */
  due: string | null;
  state: CardState;
  goodCount: number;
  badCount: number;
  reviewCount: number;
  lastReviewedAt: string | null;
}

export const EMPTY_PROGRESS: CardProgress = {
  box: 1,
  stability: 0,
  difficulty: 0,
  due: null,
  state: "new",
  goodCount: 0,
  badCount: 0,
  reviewCount: 0,
  lastReviewedAt: null,
};

/** Три кнопки интерфейса → три оценки FSRS. Четвёртая (Easy) не используется. */
const RATING_MAP: Record<Rating, Grade> = {
  bad: FsrsRating.Again,
  neutral: FsrsRating.Hard,
  good: FsrsRating.Good,
};

/** Уровень 1–5 из стабильности памяти (в днях). Только для отображения. */
export function boxFromStability(stability: number): Box {
  if (stability < 1) return 1;
  if (stability < 3) return 2;
  if (stability < 7) return 3;
  if (stability < 21) return 4;
  return 5;
}

/** Обратное преобразование — нужно при миграции старых уровней и ручной установке. */
export function stabilityFromBox(box: number): number {
  switch (Math.min(5, Math.max(1, Math.round(box)))) {
    case 1:
      return 0.5;
    case 2:
      return 2;
    case 3:
      return 5;
    case 4:
      return 14;
    default:
      return 30;
  }
}

function stateName(state: State): CardState {
  switch (state) {
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    case State.Relearning:
      return "relearning";
    default:
      return "new";
  }
}

function toProgress(card: FsrsCard, counts: Omit<CardProgress, "box" | "stability" | "difficulty" | "due" | "state">): CardProgress {
  return {
    box: boxFromStability(card.stability),
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due ? new Date(card.due).toISOString() : null,
    state: stateName(card.state),
    ...counts,
  };
}

/** Проигрывание журнала в состояние карточек. */
export function replay(events: JournalEvent[], retention = 0.9): Map<string, CardProgress> {
  const scheduler: FSRS = fsrs(generatorParameters({ request_retention: retention }));
  const cards = new Map<string, FsrsCard>();
  const counts = new Map<string, { goodCount: number; badCount: number; reviewCount: number; lastReviewedAt: string | null }>();

  for (const ev of events) {
    const when = new Date(ev.t);
    if (Number.isNaN(when.getTime())) continue;
    const current: FsrsCard = cards.get(ev.card) ?? createEmptyCard<FsrsCard>(when);
    const c = counts.get(ev.card) ?? {
      goodCount: 0,
      badCount: 0,
      reviewCount: 0,
      lastReviewedAt: null as string | null,
    };

    if (ev.k === "set") {
      // Прямая установка уровня: миграция со старого формата, импорт, редактор карточки.
      const stability = stabilityFromBox(ev.box ?? boxFromStability(current.stability));
      const due = new Date(when.getTime() + stability * 24 * 3600 * 1000);
      cards.set(ev.card, {
        ...current,
        stability,
        difficulty: current.difficulty || 5,
        due,
        last_review: when,
        state: State.Review,
        reps: ev.rev ?? current.reps,
      } as FsrsCard);
      counts.set(ev.card, {
        goodCount: ev.good ?? c.goodCount,
        badCount: ev.bad ?? c.badCount,
        reviewCount: ev.rev ?? c.reviewCount,
        lastReviewedAt: c.lastReviewedAt,
      });
      continue;
    }

    const rating = RATING_MAP[(ev.rating ?? "neutral") as Rating] ?? FsrsRating.Hard;
    const next = scheduler.next(current, when, rating);
    cards.set(ev.card, next.card);
    counts.set(ev.card, {
      goodCount: c.goodCount + (ev.rating === "good" ? 1 : 0),
      badCount: c.badCount + (ev.rating === "bad" ? 1 : 0),
      reviewCount: c.reviewCount + 1,
      lastReviewedAt: ev.t,
    });
  }

  const out = new Map<string, CardProgress>();
  for (const [id, card] of cards) {
    out.set(
      id,
      toProgress(card, counts.get(id) ?? {
        goodCount: 0,
        badCount: 0,
        reviewCount: 0,
        lastReviewedAt: null,
      }),
    );
  }
  return out;
}

let cache: Map<string, CardProgress> | null = null;
let cachePromise: Promise<Map<string, CardProgress>> | null = null;

/** Сброс кэша — после записи в журнал и после pull/clone. */
export function invalidateProgress(): void {
  cache = null;
  cachePromise = null;
}

export async function getProgressMap(): Promise<Map<string, CardProgress>> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = (async () => {
      const [events, settings] = await Promise.all([readJournal(), readSettings()]);
      cache = replay(events, settings.retention);
      return cache;
    })();
  }
  return await cachePromise;
}

export async function getProgress(cardId: string): Promise<CardProgress> {
  const map = await getProgressMap();
  return map.get(cardId) ?? { ...EMPTY_PROGRESS };
}

/** Карточка «созрела» — время повтора наступило. */
export function isDue(progress: CardProgress, now = new Date()): boolean {
  if (!progress.due) return false;
  return new Date(progress.due).getTime() <= now.getTime();
}

export function isNew(progress: CardProgress): boolean {
  return progress.reviewCount === 0 && progress.state === "new";
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

/** Лучшая серия за всю историю. */
export function bestStreak(byDay: Record<string, number>): number {
  const days = Object.keys(byDay).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const date = new Date(`${d}T00:00:00Z`);
    if (prev && (date.getTime() - prev.getTime()) / 86400000 === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** Прогноз нагрузки: сколько карточек созреет в каждый из ближайших дней. */
export function forecast(progress: Iterable<CardProgress>, days = 7, from = new Date()): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    out[d.toISOString().slice(0, 10)] = 0;
  }
  const limit = new Date(from);
  limit.setDate(limit.getDate() + days);
  for (const p of progress) {
    if (!p.due) continue;
    const due = new Date(p.due);
    const key = (due < from ? from : due).toISOString().slice(0, 10);
    if (due < limit && key in out) out[key] += 1;
  }
  return out;
}
