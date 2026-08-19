import { z } from "zod";

export const RatingSchema = z.union([
  z.literal("bad"),
  z.literal("neutral"),
  z.literal("good"),
]);
export type Rating = z.infer<typeof RatingSchema>;

export const BoxSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type Box = z.infer<typeof BoxSchema>;

export const CardSideSchema = z.object({
  text: z.string().default(""),
  image: z.string().nullable().default(null),
  /**
   * Голосовые функции удалены (решение 2026-08-18), но поле сохранено:
   * старые карточки не должны терять ссылку на медиа до миграции формата 1→2.
   */
  audio: z.string().nullable().default(null),
});
export type CardSide = z.infer<typeof CardSideSchema>;

const RawCardSchema = z.object({
  id: z.string(),
  front: CardSideSchema,
  back: CardSideSchema,
  box: BoxSchema.default(1),
  goodCount: z.number().int().nonnegative().default(0),
  badCount: z.number().int().nonnegative().default(0),
  reviewCount: z.number().int().nonnegative().default(0),
  lastReviewedAt: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CardSchema = z.preprocess((val) => {
  if (!val || typeof val !== "object") return val;
  const v = val as Record<string, unknown>;
  if (!("box" in v) && "level" in v) {
    const level = typeof v.level === "number" ? v.level : 0;
    const box = level >= 5 ? 5 : level >= 4 ? 4 : level >= 3 ? 3 : level >= 2 ? 2 : 1;
    return { ...v, box };
  }
  return v;
}, RawCardSchema);
export type Card = z.infer<typeof RawCardSchema>;

export const DeckSettingsSchema = z.object({
  frontLanguage: z.string().default("ru"),
  backLanguage: z.string().default("en"),
  flipDelay: z.number().min(0).default(0),
  nextDelay: z.number().min(0).default(0),
});
export type DeckSettings = z.infer<typeof DeckSettingsSchema>;

export const DeckSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().default("#e36b6b"),
  image: z.string().nullable().default(null),
  description: z.string().default(""),
  settings: DeckSettingsSchema.default({} as DeckSettings),
  cardCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deck = z.infer<typeof DeckSchema>;

export interface DeckSummary extends Deck {
  progress: number;
  learnedCount: number;
  /** Прямых подгрупп внутри — чтобы строка списка сразу говорила, что группа не пустая. */
  subgroupCount: number;
  /** Карточек, созревших к повторению (вместе со всеми подгруппами). */
  dueCount: number;
}

export const GitConfigSchema = z.object({
  remoteUrl: z.string().default(""),
  branch: z.string().default("main"),
  username: z.string().default(""),
  email: z.string().default(""),
  token: z.string().default(""),
  /**
   * URL собственного CORS-прокси (вариант B). GitHub не отдаёт CORS на git-smart-HTTP,
   * поэтому push/pull из браузера и Android WebView идут через свой прокси.
   * Пусто = прямое соединение (работает только из нативного git/CapacitorHttp).
   */
  corsProxy: z.string().default(""),
  autoSync: z.boolean().default(false),
});
export type GitConfig = z.infer<typeof GitConfigSchema>;

export const SyncStatusSchema = z.object({
  lastSyncAt: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  pendingChanges: z.number().int().default(0),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const StudyModeSchema = z.union([
  z.literal("review"),
  z.literal("self"),
  z.literal("custom"),
]);
export type StudyMode = z.infer<typeof StudyModeSchema>;

export const LANGUAGES: { code: string; name: string; flag: string }[] = [
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "uk", name: "Українська", flag: "🇺🇦" },
];

export function languageInfo(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? { code, name: code.toUpperCase(), flag: "🌐" };
}
