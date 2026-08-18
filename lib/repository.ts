"use client";

/**
 * Прикладной слой над хранилищем формата 2 (lib/store.ts).
 *
 * Наружу отдаётся привычная модель «колода + карточка с уровнем»: колода — это
 * группа верхнего уровня, а уровень карточки собирается из журнала (lib/progress.ts).
 * Благодаря этому интерфейс фазы 1 не переписывается, а дерево групп и FSRS
 * подключаются в следующих фазах через те же функции.
 */

import { nanoid } from "nanoid";
import { Card, Deck, DeckSettings, DeckSettingsSchema, DeckSummary, Rating } from "./types";
import { CardContent, Group, GroupSettings } from "./model";
import type { StudyItem } from "./session";
import { recordChange, recordReview } from "./autosync";
import { ensureReady } from "./migrate";
import { bytesToDataUrl } from "./fs";
import { getProgress, getProgressMap, invalidateProgress, EMPTY_PROGRESS } from "./progress";
import {
  appendJournal,
  canReparent,
  childrenOf,
  descendantIds,
  pathTo,
  getCard as storeGetCard,
  getGroup,
  guessMime,
  listCards,
  listGroups,
  loadMediaBytes,
  nowIso,
  saveMediaBytes,
  writeCard,
  writeGroup,
} from "./store";

/* --------------------------------------------------------------- кэш ---- */
/* Файл на объект — это много мелких чтений из IndexedDB, поэтому список
   групп и карточек держим в памяти и сбрасываем при любой записи. */

let groupsCache: Group[] | null = null;
let cardsCache: CardContent[] | null = null;

function invalidateCache() {
  groupsCache = null;
  cardsCache = null;
}

export function invalidateRepositoryCache() {
  invalidateCache();
  invalidateProgress();
}

async function allGroups(): Promise<Group[]> {
  await ensureReady();
  if (!groupsCache) groupsCache = await listGroups();
  return groupsCache;
}

async function allCards(): Promise<CardContent[]> {
  await ensureReady();
  if (!cardsCache) cardsCache = await listCards();
  return cardsCache;
}

/* ------------------------------------------------------------ маппинг --- */

function groupToDeck(group: Group, cardCount: number): Deck {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    image: group.cover,
    description: group.description,
    settings: DeckSettingsSchema.parse(group.settings),
    cardCount,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function cardLabel(content: CardContent): string {
  const text = (content.front.text || content.back.text || "без текста").trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function contentToCard(content: CardContent, progress = EMPTY_PROGRESS): Card {
  return {
    id: content.id,
    front: { text: content.front.text, image: content.front.image, audio: null },
    back: { text: content.back.text, image: content.back.image, audio: null },
    box: progress.box,
    goodCount: progress.goodCount,
    badCount: progress.badCount,
    reviewCount: progress.reviewCount,
    lastReviewedAt: progress.lastReviewedAt,
    tags: content.tags,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

/* ------------------------------------------------------------- группы --- */

export async function listGroupTree(): Promise<Group[]> {
  return await allGroups();
}

export async function listChildGroups(parentId: string | null): Promise<Group[]> {
  return childrenOf(await allGroups(), parentId);
}

export async function listDeckIds(): Promise<string[]> {
  return childrenOf(await allGroups(), null).map((g) => g.id);
}

export async function getDeck(deckId: string): Promise<Deck | null> {
  await ensureReady();
  const group = groupsCache?.find((g) => g.id === deckId) ?? (await getGroup(deckId));
  if (!group) return null;
  const cards = await allCards();
  const ids = new Set(descendantIds(await allGroups(), deckId));
  const count = cards.filter((c) => ids.has(c.groupId)).length;
  return groupToDeck(group, count);
}

export async function listDeckSummaries(): Promise<DeckSummary[]> {
  return await listGroupSummaries(null);
}

/** Сводка по прямым потомкам группы; счётчики учитывают все вложенные подгруппы. */
export async function listGroupSummaries(parentId: string | null): Promise<DeckSummary[]> {
  const groups = await allGroups();
  const cards = await allCards();
  const progress = await getProgressMap();
  const out: DeckSummary[] = [];

  for (const group of childrenOf(groups, parentId)) {
    const ids = new Set(descendantIds(groups, group.id));
    const own = cards.filter((c) => ids.has(c.groupId));
    const learned = own.filter((c) => (progress.get(c.id) ?? EMPTY_PROGRESS).box >= 4).length;
    out.push({
      ...groupToDeck(group, own.length),
      progress: own.length === 0 ? 0 : Math.round((learned / own.length) * 100),
      learnedCount: learned,
    });
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Путь от корня до группы — для хлебных крошек. */
export async function getBreadcrumbs(groupId: string): Promise<{ id: string; name: string }[]> {
  return pathTo(await allGroups(), groupId).map((g) => ({ id: g.id, name: g.name }));
}

export interface GroupOption {
  id: string;
  label: string;
  depth: number;
}

/**
 * Плоский список групп для выпадающих списков («куда переместить»).
 * `excludeSubtreeOf` убирает саму группу и всех её потомков — внутрь себя не переносят.
 */
export async function listGroupOptions(excludeSubtreeOf?: string): Promise<GroupOption[]> {
  const groups = await allGroups();
  const excluded = excludeSubtreeOf ? new Set(descendantIds(groups, excludeSubtreeOf)) : new Set<string>();
  const out: GroupOption[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const g of childrenOf(groups, parentId)) {
      if (excluded.has(g.id)) continue;
      out.push({ id: g.id, label: `${"— ".repeat(depth)}${g.name}`, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Перенос ветки. Внутрь собственного потомка перенести нельзя — иначе появится цикл. */
export async function moveGroup(groupId: string, newParentId: string | null): Promise<boolean> {
  await ensureReady();
  const groups = await allGroups();
  if (!canReparent(groups, groupId, newParentId)) return false;
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;
  await writeGroup({ ...group, parentId: newParentId });
  invalidateCache();
  recordChange(`перенесена группа «${group.name}»`);
  return true;
}

/** Перенос карточки в другую группу. */
export async function moveCard(cardId: string, newGroupId: string): Promise<boolean> {
  await ensureReady();
  const content = await storeGetCard(cardId);
  const target = await getGroup(newGroupId);
  if (!content || !target) return false;
  await writeCard({ ...content, groupId: newGroupId });
  invalidateCache();
  recordChange(`карточка перенесена в «${target.name}»`);
  return true;
}

export interface CreateDeckInput {
  name: string;
  color?: string;
  image?: string | null;
  description?: string;
  frontLanguage?: string;
  backLanguage?: string;
  parentId?: string | null;
}

export async function createDeck(
  input: CreateDeckInput | string,
  color = "#e36b6b",
): Promise<Deck> {
  await ensureReady();
  const params: CreateDeckInput = typeof input === "string" ? { name: input, color } : input;
  const now = nowIso();
  const siblings = childrenOf(await allGroups(), params.parentId ?? null);
  const group: Group = {
    id: nanoid(10),
    name: params.name.trim() || "Без названия",
    parentId: params.parentId ?? null,
    color: params.color ?? color,
    cover: params.image ?? null,
    description: params.description ?? "",
    order: siblings.length,
    settings: {
      frontLanguage: params.frontLanguage ?? "ru",
      backLanguage: params.backLanguage ?? "en",
      flipDelay: 0,
      nextDelay: 0,
    },
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeGroup(group);
  invalidateCache();
  recordChange(`создана группа «${saved.name}»`);
  return groupToDeck(saved, 0);
}

export async function updateDeck(
  deckId: string,
  patch: Partial<Omit<Deck, "id" | "createdAt">> & { parentId?: string | null },
): Promise<Deck | null> {
  await ensureReady();
  const group = await getGroup(deckId);
  if (!group) return null;
  const next: Group = {
    ...group,
    name: patch.name ?? group.name,
    color: patch.color ?? group.color,
    cover: patch.image !== undefined ? patch.image : group.cover,
    description: patch.description ?? group.description,
    parentId: patch.parentId !== undefined ? patch.parentId : group.parentId,
    settings: patch.settings
      ? ({ ...group.settings, ...patch.settings } as GroupSettings)
      : group.settings,
  };
  const saved = await writeGroup(next);
  invalidateCache();
  recordChange(`изменена группа «${saved.name}»`);
  return await getDeck(saved.id);
}

export async function renameDeck(deckId: string, name: string): Promise<Deck | null> {
  return await updateDeck(deckId, { name: name.trim() || undefined });
}

export async function setDeckColor(deckId: string, color: string): Promise<Deck | null> {
  return await updateDeck(deckId, { color });
}

export async function setDeckSettings(
  deckId: string,
  settings: Partial<DeckSettings>,
): Promise<Deck | null> {
  return await updateDeck(deckId, { settings: settings as DeckSettings });
}

/**
 * Удаление мягкое: файл остаётся, в нём поднимается флаг `deleted`.
 * Физическое удаление файла на одном устройстве и правка на другом — конфликт,
 * который git не решает сам, поэтому мы его не создаём (§5.2).
 */
export async function deleteDeck(deckId: string): Promise<void> {
  await ensureReady();
  const groups = await allGroups();
  const ids = new Set(descendantIds(groups, deckId));
  for (const group of groups) {
    if (!ids.has(group.id)) continue;
    await writeGroup({ ...group, deleted: true });
  }
  for (const card of await allCards()) {
    if (!ids.has(card.groupId)) continue;
    await writeCard({ ...card, deleted: true });
  }
  invalidateCache();
  recordChange(`удалена группа «${groups.find((g) => g.id === deckId)?.name ?? deckId}»`);
}

/* ----------------------------------------------------------- карточки --- */

export async function getCards(deckId: string): Promise<Card[]> {
  const cards = (await allCards()).filter((c) => c.groupId === deckId);
  const progress = await getProgressMap();
  return cards.map((c) => contentToCard(c, progress.get(c.id) ?? EMPTY_PROGRESS));
}

/**
 * Пул для самопроверки. `groupIds === null` — все группы; иначе указанные вместе
 * со всеми их подгруппами. Возвращает карточку вместе с состоянием FSRS.
 */
export async function getStudyPool(groupIds: string[] | null): Promise<StudyItem[]> {
  const groups = await allGroups();
  const scope = groupIds
    ? new Set(groupIds.flatMap((id) => descendantIds(groups, id)))
    : null;
  const progress = await getProgressMap();
  return (await allCards())
    .filter((c) => !scope || scope.has(c.groupId))
    .map((c) => {
      const p = progress.get(c.id) ?? EMPTY_PROGRESS;
      return { card: contentToCard(c, p), groupId: c.groupId, progress: p };
    });
}

/** Карточки группы вместе со всеми вложенными подгруппами. */
export async function getCardsDeep(groupId: string): Promise<Card[]> {
  const ids = new Set(descendantIds(await allGroups(), groupId));
  const progress = await getProgressMap();
  return (await allCards())
    .filter((c) => ids.has(c.groupId))
    .map((c) => contentToCard(c, progress.get(c.id) ?? EMPTY_PROGRESS));
}

export async function addCard(
  deckId: string,
  front: Partial<Card["front"]>,
  back: Partial<Card["back"]>,
): Promise<Card> {
  await ensureReady();
  const group = await getGroup(deckId);
  if (!group) throw new Error("Группа не найдена");
  const now = nowIso();
  const content: CardContent = {
    id: nanoid(10),
    groupId: deckId,
    front: { text: front.text ?? "", image: front.image ?? null },
    back: { text: back.text ?? "", image: back.image ?? null },
    tags: [],
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeCard(content);
  invalidateCache();
  recordChange(`добавлена карточка → «${group.name}»`);
  return contentToCard(saved);
}

export async function updateCard(
  deckId: string,
  cardId: string,
  patch: Partial<Card> & { groupId?: string },
): Promise<Card | null> {
  await ensureReady();
  const content = await storeGetCard(cardId);
  if (!content) return null;

  const touchesContent =
    patch.front !== undefined ||
    patch.back !== undefined ||
    patch.tags !== undefined ||
    patch.groupId !== undefined;

  let saved = content;
  if (touchesContent) {
    saved = await writeCard({
      ...content,
      groupId: patch.groupId ?? content.groupId,
      front: patch.front
        ? { ...content.front, text: patch.front.text ?? content.front.text, image: patch.front.image ?? null }
        : content.front,
      back: patch.back
        ? { ...content.back, text: patch.back.text ?? content.back.text, image: patch.back.image ?? null }
        : content.back,
      tags: patch.tags ?? content.tags,
    });
    invalidateCache();
  }

  // Уровень и счётчики — это не содержимое, а прогресс: он живёт в журнале.
  const touchesProgress =
    patch.box !== undefined ||
    patch.goodCount !== undefined ||
    patch.badCount !== undefined ||
    patch.reviewCount !== undefined;

  if (touchesProgress) {
    await appendJournal([
      {
        k: "set",
        t: nowIso(),
        card: cardId,
        group: saved.groupId,
        box: patch.box,
        good: patch.goodCount,
        bad: patch.badCount,
        rev: patch.reviewCount,
      },
    ]);
    invalidateProgress();
  }

  recordChange(`изменена карточка «${cardLabel(saved)}»`);
  return contentToCard(saved, await getProgress(cardId));
}

/** Ответ в сессии: пишется событием в журнал, файл карточки не трогается. */
export async function rateCard(cardId: string, rating: Rating): Promise<Card | null> {
  await ensureReady();
  const content = await storeGetCard(cardId);
  if (!content) return null;
  await appendJournal([
    { k: "rate", t: nowIso(), card: cardId, group: content.groupId, rating },
  ]);
  invalidateProgress();
  recordReview();
  return contentToCard(content, await getProgress(cardId));
}

export async function deleteCard(deckId: string, cardId: string): Promise<void> {
  await ensureReady();
  const content = await storeGetCard(cardId);
  if (!content) return;
  await writeCard({ ...content, deleted: true });
  invalidateCache();
  recordChange(`удалена карточка «${cardLabel(content)}»`);
}

/* -------------------------------------------------------------- медиа --- */

/**
 * Медиа сохраняется по хешу содержимого. Аргументы `cardId`/`side`/`kind`
 * остались ради совместимости вызовов и на имя файла больше не влияют.
 */
export async function saveMedia(
  _deckId: string,
  _cardId: string,
  _side: "front" | "back" | "deck",
  _kind: "image" | "audio",
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  await ensureReady();
  const name = await saveMediaBytes(bytes, ext);
  return name;
}

export async function loadMediaDataUrl(_deckId: string, ref: string): Promise<string | null> {
  await ensureReady();
  const bytes = await loadMediaBytes(ref);
  if (!bytes) return null;
  return await bytesToDataUrl(bytes, guessMime(ref));
}
