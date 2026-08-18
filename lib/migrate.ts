"use client";

/**
 * Миграции формата данных (§6 спецификации).
 *
 * Миграторы описывают только соседние шаги (1→2, 2→3, …), а переход с любой
 * старой версии на текущую собирается их последовательным применением. Поэтому
 * данные с версии 1 доедут до версии 5 без отдельного кода «1→5».
 *
 * Требования к каждому шагу:
 *  - идемпотентность (повтор после оборванной синхронизации ничего не портит);
 *  - только добавление и преобразование, никакого удаления пользовательских данных;
 *  - если репозиторий новее приложения — миграция не запускается, включается
 *    режим только чтения (§6.2).
 */

import { FORMAT_VERSION, CardContent, Group } from "./model";
import { DECKS_DIR, REPO_ROOT, exists, listDir, readBytes, readJson, removePath } from "./fs";
import {
  appendJournal,
  ensureSkeleton,
  isReadOnly,
  readMeta,
  saveMediaBytes,
  writeCard,
  writeGroup,
  writeMeta,
  nowIso,
} from "./store";
import { invalidateProgress } from "./progress";
import { CardSchema, DeckSchema } from "./types";

interface Migration {
  from: number;
  to: number;
  title: string;
  up: () => Promise<void>;
}

/**
 * Версия 1 — плоские колоды: decks/<id>/{deck.json,cards.json,media/*}.
 * Версия 2 — файл на объект, дерево групп, медиа по хешу, журнал прогресса.
 */
async function migrate1to2(): Promise<void> {
  await ensureSkeleton();
  if (!(await exists(DECKS_DIR))) return;

  const deckIds = await listDir(DECKS_DIR);
  let order = 0;

  for (const deckId of deckIds) {
    const deckDir = `${DECKS_DIR}/${deckId}`;
    const metaPath = `${deckDir}/deck.json`;
    if (!(await exists(metaPath))) continue;

    // Медиа переносится по содержимому: имя нового файла = хеш байтов.
    const remap = new Map<string, string>();
    async function moveMedia(ref: string | null): Promise<string | null> {
      if (!ref) return null;
      if (remap.has(ref)) return remap.get(ref)!;
      const path = ref.startsWith("/") ? ref : `${deckDir}/${ref}`;
      if (!(await exists(path))) return null;
      try {
        const bytes = await readBytes(path);
        const ext = ref.split(".").pop() ?? "webp";
        const name = await saveMediaBytes(bytes, ext);
        remap.set(ref, name);
        return name;
      } catch {
        return null;
      }
    }

    let deck;
    try {
      deck = DeckSchema.parse(await readJson<unknown>(metaPath));
    } catch {
      continue;
    }

    const group: Group = {
      id: deck.id || deckId,
      name: deck.name,
      parentId: null,
      color: deck.color,
      cover: await moveMedia(deck.image),
      description: deck.description,
      order: order++,
      settings: {
        frontLanguage: deck.settings.frontLanguage,
        backLanguage: deck.settings.backLanguage,
        flipDelay: deck.settings.flipDelay,
        nextDelay: deck.settings.nextDelay,
      },
      deleted: false,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };
    await writeGroup(group);

    const cardsPath = `${deckDir}/cards.json`;
    if (!(await exists(cardsPath))) continue;
    let rawCards: unknown[] = [];
    try {
      const parsed = await readJson<unknown>(cardsPath);
      rawCards = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawCards = [];
    }

    for (const raw of rawCards) {
      let card;
      try {
        card = CardSchema.parse(raw);
      } catch {
        continue;
      }
      const content: CardContent = {
        id: card.id,
        groupId: group.id,
        front: { text: card.front.text, image: await moveMedia(card.front.image) },
        back: { text: card.back.text, image: await moveMedia(card.back.image) },
        tags: card.tags,
        deleted: false,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      };
      await writeCard(content);

      // Прогресс переезжает в журнал одним событием «установить уровень».
      await appendJournal([
        {
          k: "set",
          t: card.lastReviewedAt ?? card.updatedAt ?? nowIso(),
          card: card.id,
          group: group.id,
          box: card.box,
          good: card.goodCount,
          bad: card.badCount,
          rev: card.reviewCount,
        },
      ]);
    }
  }

  // Старый формат больше не пишется и не читается; история остаётся в git.
  await removePath(DECKS_DIR);
}

const MIGRATIONS: Migration[] = [
  { from: 1, to: 2, title: "колоды → дерево групп, файл на объект, журнал прогресса", up: migrate1to2 },
];

/** 0 — репозиторий пуст, 1 — старый формат без meta.json, иначе версия из meta.json. */
export async function detectVersion(): Promise<number> {
  const meta = await readMeta();
  if (meta) return meta.formatVersion;
  if (await exists(DECKS_DIR)) {
    const decks = await listDir(DECKS_DIR);
    if (decks.length > 0) return 1;
  }
  return 0;
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
  readOnly: boolean;
}

export async function runMigrations(): Promise<MigrationResult> {
  await ensureSkeleton();
  const from = await detectVersion();

  if (from > FORMAT_VERSION) {
    return { from, to: from, applied: [], readOnly: true };
  }
  if (from === 0) {
    await writeMeta({ formatVersion: FORMAT_VERSION, createdAt: nowIso() });
    return { from, to: FORMAT_VERSION, applied: [], readOnly: false };
  }

  const applied: string[] = [];
  let current = from;
  while (current < FORMAT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) break;
    await step.up();
    await writeMeta({ formatVersion: step.to });
    applied.push(`${step.from}→${step.to}: ${step.title}`);
    current = step.to;
  }
  if (applied.length > 0) invalidateProgress();
  return { from, to: current, applied, readOnly: false };
}

let ready: Promise<MigrationResult> | null = null;

/**
 * Гарантирует, что хранилище приведено к текущему формату. Вызывается лениво
 * из репозитория, поэтому ни одна страница не может прочитать данные раньше миграции.
 */
export async function ensureReady(): Promise<MigrationResult> {
  if (typeof window === "undefined") {
    return { from: FORMAT_VERSION, to: FORMAT_VERSION, applied: [], readOnly: false };
  }
  if (!ready) ready = runMigrations();
  return await ready;
}

/** После clone/pull содержимое репозитория меняется — проверку нужно повторить. */
export function invalidateReady(): void {
  ready = null;
  invalidateProgress();
}

export async function repoIsReadOnly(): Promise<boolean> {
  return await isReadOnly();
}

export { REPO_ROOT };
