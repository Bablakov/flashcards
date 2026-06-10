"use client";

import { loadGitConfig } from "./settings";
import { toast } from "@/components/Toaster";

/**
 * Авто-синхронизация (требование «всё работает через Git, ничего не теряется»).
 *
 * После любого изменения колоды/карты вызывается scheduleAutoSync(); с дебаунсом
 * запускается полный syncAll (commit → pull+merge → push). Merge безопасен —
 * cards.json сливается по id (lib/merge.ts), правки двух устройств не затираются.
 *
 * Включается флагом cfg.autoSync (Настройки). Без CORS-прокси/токена тихо ничего
 * не делает. Опционально, по умолчанию выключено.
 */

const DEBOUNCE_MS = 4000;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function ready(): boolean {
  const cfg = loadGitConfig();
  return !!(cfg.autoSync && cfg.remoteUrl && cfg.token);
}

export function scheduleAutoSync(): void {
  if (typeof window === "undefined") return;
  if (!ready()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runAutoSync();
  }, DEBOUNCE_MS);
}

async function runAutoSync(): Promise<void> {
  if (running) {
    // во время идущей синхронизации просто перезапланируем
    scheduleAutoSync();
    return;
  }
  if (!ready()) return;
  running = true;
  try {
    const cfg = loadGitConfig();
    // Ленивый импорт: git тянет isomorphic-git (~180 кБ) — грузим только когда
    // авто-sync реально сработал, чтобы не раздувать бандл каждой страницы.
    const { syncAll } = await import("./git");
    await syncAll(cfg, "Auto-sync");
  } catch (e: unknown) {
    toast(`Авто-синхронизация: ${(e as Error).message}`, "error");
  } finally {
    running = false;
  }
}
