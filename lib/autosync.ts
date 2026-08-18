"use client";

/**
 * Коммиты и синхронизация (§7 спецификации).
 *
 * Правило пользователя — «создал карточку, сразу коммит». Поэтому:
 *  - изменения содержимого (карточка, группа, настройки) коммитятся сразу,
 *    с человекочитаемым сообщением;
 *  - ответы в сессии копятся пачкой (30 секунд или конец сессии): конфликтов
 *    в журнале нет по устройству формата, а сотня коммитов за сессию превратила
 *    бы историю в мусор;
 *  - push идёт через 3 секунды тишины, чтобы не долбить сеть при серийном
 *    редактировании.
 *
 * Офлайн: коммиты делаются всегда, push просто откладывается до сети.
 */

import { loadGitConfig } from "./settings";
import { toast } from "@/components/Toaster";

const PUSH_IDLE_MS = 3000;
const JOURNAL_BATCH_MS = 30_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let journalTimer: ReturnType<typeof setTimeout> | null = null;
let commitQueue: string[] = [];
let journalPending = false;
let running = false;
// Одновременно идущие синхронизации на телефоне съедают память и подвешивают
// интерфейс: запуск при старте, после правки и по кнопке легко накладываются.
let syncing = false;
let pendingListeners: ((count: number) => void)[] = [];
let syncListeners: ((busy: boolean) => void)[] = [];

/** Подписка на «идёт синхронизация» — интерфейс гасит кнопки на это время. */
export function onSyncStateChange(listener: (busy: boolean) => void): () => void {
  syncListeners.push(listener);
  listener(syncing);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function setSyncing(value: boolean): void {
  syncing = value;
  for (const listener of syncListeners) listener(value);
}

function gitConfigured(): boolean {
  const cfg = loadGitConfig();
  return !!(cfg.remoteUrl && cfg.token);
}

export function onPendingChange(listener: (count: number) => void): () => void {
  pendingListeners.push(listener);
  return () => {
    pendingListeners = pendingListeners.filter((l) => l !== listener);
  };
}

async function notifyPending() {
  if (pendingListeners.length === 0) return;
  try {
    const { pendingChangesCount } = await import("./git");
    const count = await pendingChangesCount();
    for (const l of pendingListeners) l(count);
  } catch {
    // до инициализации репозитория считать нечего
  }
}

/**
 * Изменение содержимого: коммитим сразу, push — через паузу.
 * `message` попадает в историю git как есть.
 */
export function recordChange(message: string): void {
  if (typeof window === "undefined") return;
  commitQueue.push(message);
  void commitNow();
  schedulePush();
}

/** Ответ в сессии: копим пачкой. */
export function recordReview(): void {
  if (typeof window === "undefined") return;
  journalPending = true;
  if (journalTimer) return;
  journalTimer = setTimeout(() => {
    journalTimer = null;
    void flushJournal();
  }, JOURNAL_BATCH_MS);
}

/** Немедленно зафиксировать накопленные ответы — конец сессии, уход со страницы. */
export async function flushJournal(): Promise<void> {
  if (!journalPending) return;
  journalPending = false;
  commitQueue.push("review session");
  await commitNow();
  schedulePush();
}

function schedulePush(): void {
  if (!gitConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, PUSH_IDLE_MS);
}

function describe(messages: string[]): string {
  if (messages.length === 0) return "Update flashcards";
  if (messages.length === 1) return messages[0];
  const head = messages[0];
  return `${head} (+${messages.length - 1})`;
}

/** Локальный коммит без сети — работает и в офлайне. */
export async function commitNow(): Promise<void> {
  if (commitQueue.length === 0 || running) return;
  const messages = commitQueue;
  commitQueue = [];
  running = true;
  try {
    const { commit, isInitialized } = await import("./git");
    if (!(await isInitialized())) return;
    await commit(loadGitConfig(), describe(messages));
  } catch (e: unknown) {
    // коммит не должен ломать работу с карточками
    console.warn("commit failed", (e as Error).message);
  } finally {
    running = false;
    void notifyPending();
  }
}

async function pushNow(): Promise<void> {
  if (!gitConfigured() || syncing) return;
  setSyncing(true);
  try {
    const { syncAll } = await import("./git");
    await syncAll(loadGitConfig(), "Sync flashcards");
    void notifyPending();
  } catch {
    // нет сети — изменения останутся в локальных коммитах и уйдут позже
  } finally {
    setSyncing(false);
  }
}

/** Ручная синхронизация («Синхронизировать сейчас»). */
export async function syncNow(onProgress?: (m: string) => void): Promise<void> {
  if (syncing) throw new Error("Синхронизация уже идёт — дождитесь её завершения");
  const cfg = loadGitConfig();
  if (!cfg.remoteUrl) throw new Error("Не задан адрес репозитория в настройках");
  setSyncing(true);
  try {
    await flushJournal();
    await commitNow();
    const { syncAll } = await import("./git");
    await syncAll(cfg, "Sync flashcards", onProgress);
    void notifyPending();
  } finally {
    setSyncing(false);
  }
}

export function isSyncing(): boolean {
  return syncing;
}

/* --------------------------------------------------- расписание запуска */

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastScheduledRun = "";

/**
 * Политика синхронизации из настроек (§7.2): при запуске, по расписанию
 * (день недели + время), после изменений и при выходе. Варианты комбинируются.
 */
export async function startSyncScheduler(): Promise<void> {
  if (typeof window === "undefined" || schedulerTimer) return;
  const { readSettings } = await import("./store");

  const settings = await readSettings();
  if (settings.syncOnStart && gitConfigured()) {
    void pushNow();
  }

  schedulerTimer = setInterval(async () => {
    try {
      const s = await readSettings();
      if (!s.syncSchedule.enabled || !gitConfigured()) return;
      const now = new Date();
      const day = WEEKDAYS[now.getDay()];
      const time = s.syncSchedule.days[day];
      if (!time) return;
      const [h, m] = time.split(":").map((x) => parseInt(x, 10));
      if (now.getHours() !== h || now.getMinutes() !== m) return;
      const stamp = `${now.toDateString()} ${time}`;
      if (lastScheduledRun === stamp) return;
      lastScheduledRun = stamp;
      await pushNow();
    } catch {
      // расписание не должно ронять приложение
    }
  }, 30_000);

  window.addEventListener("pagehide", () => {
    void flushJournal();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushJournal();
  });
}

/**
 * Совместимость: старое имя вызывается из репозитория для изменений,
 * у которых нет отдельного описания.
 */
export function scheduleAutoSync(): void {
  recordChange("Update flashcards");
}

export function notifySyncError(message: string): void {
  toast(`Синхронизация: ${message}`, "error");
}
