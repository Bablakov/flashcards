/**
 * Модель данных формата 2 (спецификация docs/2026-08-18-scope-reset.md, §5).
 *
 * Три принципа, ради которых формат переделан:
 *  1. Один объект — один файл. Добавление карточек на двух устройствах без
 *     синхронизации создаёт разные файлы, git сливает их без конфликта.
 *  2. Удаление мягкое (`deleted: true`). Физическое удаление файла на одном
 *     устройстве и правка на другом — единственный конфликт, который git не
 *     решает сам, поэтому мы его не создаём.
 *  3. Все схемы `passthrough`: если репозиторий трогала более новая версия
 *     приложения, незнакомые поля не отбрасываются при записи (§6.2).
 */

import { z } from "zod";
import { RatingSchema } from "./types";

/** Версия формата данных, которую понимает эта сборка. */
export const FORMAT_VERSION = 2;

export const RepoMetaSchema = z
  .object({
    formatVersion: z.number().int().positive().default(FORMAT_VERSION),
    createdAt: z.string().default(() => new Date().toISOString()),
    updatedAt: z.string().default(() => new Date().toISOString()),
  })
  .passthrough();
export type RepoMeta = z.infer<typeof RepoMetaSchema>;

/** Сторона карточки: текст + картинка. Поле audio может присутствовать в старых файлах. */
export const SideSchema = z
  .object({
    text: z.string().default(""),
    image: z.string().nullable().default(null),
  })
  .passthrough();
export type Side = z.infer<typeof SideSchema>;

/** Настройки группы (языки сторон и тайминги показа). */
export const GroupSettingsSchema = z
  .object({
    frontLanguage: z.string().default("ru"),
    backLanguage: z.string().default("en"),
    flipDelay: z.number().min(0).default(0),
    nextDelay: z.number().min(0).default(0),
  })
  .passthrough();
export type GroupSettings = z.infer<typeof GroupSettingsSchema>;

/**
 * Группа. Иерархия хранится ссылкой на родителя, а не вложенными папками:
 * перенос ветки = правка одного файла вместо массового переименования,
 * которое гарантированно конфликтовало бы при работе с двух устройств.
 */
export const GroupSchema = z
  .object({
    id: z.string(),
    name: z.string().default("Без названия"),
    parentId: z.string().nullable().default(null),
    color: z.string().default("#e36b6b"),
    /** Имя файла обложки в media/ (по хешу содержимого). */
    cover: z.string().nullable().default(null),
    description: z.string().default(""),
    order: z.number().default(0),
    settings: GroupSettingsSchema.default({} as GroupSettings),
    deleted: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Group = z.infer<typeof GroupSchema>;

/** Карточка — только содержимое. Прогресс живёт в журнале (§5.3). */
export const CardContentSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    front: SideSchema.default({} as Side),
    back: SideSchema.default({} as Side),
    tags: z.array(z.string()).default([]),
    deleted: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type CardContent = z.infer<typeof CardContentSchema>;

/**
 * Событие журнала. Файл журнала свой у каждого устройства и только дописывается,
 * поэтому git-конфликт по нему невозможен даже после долгого офлайна.
 *
 * k = "rate" — обычный ответ в сессии;
 * k = "set"  — прямая установка уровня (редактор карточки, импорт, миграция).
 */
export const JournalEventSchema = z
  .object({
    k: z.enum(["rate", "set"]).default("rate"),
    t: z.string(),
    card: z.string(),
    group: z.string().optional(),
    rating: RatingSchema.optional(),
    box: z.number().int().min(1).max(5).optional(),
    good: z.number().int().nonnegative().optional(),
    bad: z.number().int().nonnegative().optional(),
    rev: z.number().int().nonnegative().optional(),
    dev: z.string().optional(),
  })
  .passthrough();
export type JournalEvent = z.infer<typeof JournalEventSchema>;

/** Расписание «день недели → время» (`{"mon":"08:00"}`); отсутствующий день выключен. */
export const WeekScheduleSchema = z
  .object({
    enabled: z.boolean().default(false),
    days: z.record(z.string()).default({}),
  })
  .passthrough();
export type WeekSchedule = z.infer<typeof WeekScheduleSchema>;

/** Настройки, которые переезжают между устройствами через репозиторий (§5.5). */
export const AppSettingsSchema = z
  .object({
    dailyNewLimit: z.number().int().positive().default(20),
    dailyReviewLimit: z.number().int().positive().default(100),
    retention: z.number().min(0.7).max(0.99).default(0.9),
    strictOffline: z.boolean().default(false),
    notifications: WeekScheduleSchema.default({} as WeekSchedule),
    syncOnStart: z.boolean().default(true),
    syncOnChange: z.boolean().default(true),
    syncOnExit: z.boolean().default(true),
    syncSchedule: WeekScheduleSchema.default({} as WeekSchedule),
    updatedAt: z.string().default(() => new Date().toISOString()),
  })
  .passthrough();
export type AppSettings = z.infer<typeof AppSettingsSchema>;
