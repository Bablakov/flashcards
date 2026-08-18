"use client";

import * as git from "isomorphic-git";
import { gitHttp, isDesktopApp } from "./git-http";
import { Buffer } from "buffer";
import { getFS, REPO_ROOT, ensureRepoSkeleton, exists } from "./fs";
import { GitConfig } from "./types";
import { loadSyncStatus, saveSyncStatus } from "./settings";
import { flashcardsMergeDriver } from "./merge";
import { invalidateReady } from "./migrate";
import { invalidateRepositoryCache } from "./repository";

/** После clone/pull содержимое на диске изменилось: сбрасываем кэши и повторяем проверку формата. */
function repoContentChanged() {
  invalidateReady();
  invalidateRepositoryCache();
}

if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

function fsRef() {
  return getFS();
}

function authFor(cfg: GitConfig): { username: string; password: string } | undefined {
  if (!cfg.token) return undefined;
  return { username: cfg.username || "x-access-token", password: cfg.token };
}

/**
 * CORS-прокси (вариант B). Без него запросы isomorphic-git к github.com из браузера/
 * Android WebView блокируются CORS. Пустая строка → undefined (прямое соединение).
 */
function corsProxyFor(cfg: GitConfig): string | undefined {
  // В ПК-приложении и в Android-сборке запрос идёт мимо браузерного CORS,
  // поэтому прокси не нужен даже если он указан в настройках.
  if (isDesktopApp()) return undefined;
  return cfg.corsProxy?.trim() ? cfg.corsProxy.trim() : undefined;
}

export async function isInitialized(): Promise<boolean> {
  return await exists(`${REPO_ROOT}/.git`);
}

export async function initRepo(cfg: GitConfig): Promise<void> {
  await ensureRepoSkeleton();
  if (await isInitialized()) return;
  await git.init({ fs: fsRef(), dir: REPO_ROOT, defaultBranch: cfg.branch || "main" });
}

export async function clone(cfg: GitConfig, onProgress?: (msg: string) => void): Promise<void> {
  if (!cfg.remoteUrl) throw new Error("Не задан Git URL");
  await ensureRepoSkeleton();
  onProgress?.("Клонируем репозиторий...");
  await git.clone({
    fs: fsRef(),
    http: gitHttp,
    dir: REPO_ROOT,
    url: cfg.remoteUrl,
    corsProxy: corsProxyFor(cfg),
    ref: cfg.branch || "main",
    singleBranch: true,
    depth: 1,
    onAuth: () => authFor(cfg) ?? {},
    onMessage: (m) => onProgress?.(m),
  });
  repoContentChanged();
  onProgress?.("Готово");
}

export async function configureIdentity(cfg: GitConfig): Promise<void> {
  if (cfg.username) {
    await git.setConfig({ fs: fsRef(), dir: REPO_ROOT, path: "user.name", value: cfg.username });
  }
  if (cfg.email) {
    await git.setConfig({ fs: fsRef(), dir: REPO_ROOT, path: "user.email", value: cfg.email });
  }
}

export async function stageAll(): Promise<{ added: number; modified: number; deleted: number }> {
  const fs = fsRef();
  const matrix = await git.statusMatrix({ fs, dir: REPO_ROOT });
  let added = 0;
  let modified = 0;
  let deleted = 0;
  for (const [filepath, head, work, stage] of matrix) {
    if (filepath.startsWith(".git")) continue;
    if (work === 0) {
      await git.remove({ fs, dir: REPO_ROOT, filepath });
      deleted++;
    } else if (head === 0 && stage !== 2) {
      await git.add({ fs, dir: REPO_ROOT, filepath });
      added++;
    } else if (work === 2 && stage !== 2) {
      await git.add({ fs, dir: REPO_ROOT, filepath });
      modified++;
    }
  }
  return { added, modified, deleted };
}

export async function pendingChangesCount(): Promise<number> {
  if (!(await isInitialized())) return 0;
  const matrix = await git.statusMatrix({ fs: fsRef(), dir: REPO_ROOT });
  let count = 0;
  for (const [filepath, head, work, stage] of matrix) {
    if (filepath.startsWith(".git")) continue;
    if (head !== work || work !== stage) count++;
  }
  return count;
}

export async function commit(cfg: GitConfig, message: string): Promise<string | null> {
  const fs = fsRef();
  const stats = await stageAll();
  if (stats.added + stats.modified + stats.deleted === 0) return null;
  const sha = await git.commit({
    fs,
    dir: REPO_ROOT,
    message,
    author: {
      name: cfg.username || "Flashcards Editor",
      email: cfg.email || "flashcards@local",
    },
  });
  return sha;
}

export async function pull(cfg: GitConfig, onProgress?: (m: string) => void): Promise<void> {
  onProgress?.("Pull...");
  // mergeDriver поддерживается рантаймом isomorphic-git 1.37+, но отсутствует в типах
  // pull — поэтому точечный каст. Драйвер сливает cards.json по id (lib/merge.ts),
  // чтобы fastForward падал в настоящий 3-way merge без потери правок двух устройств.
  const opts = {
    fs: fsRef(),
    http: gitHttp,
    dir: REPO_ROOT,
    corsProxy: corsProxyFor(cfg),
    ref: cfg.branch || "main",
    singleBranch: true,
    fastForward: true,
    mergeDriver: flashcardsMergeDriver,
    author: {
      name: cfg.username || "Flashcards Editor",
      email: cfg.email || "flashcards@local",
    },
    onAuth: () => authFor(cfg) ?? {},
    onMessage: (m: string) => onProgress?.(m),
  };
  await git.pull(opts as unknown as Parameters<typeof git.pull>[0]);
  repoContentChanged();
}

export async function push(cfg: GitConfig, onProgress?: (m: string) => void): Promise<void> {
  onProgress?.("Push...");
  await git.push({
    fs: fsRef(),
    http: gitHttp,
    dir: REPO_ROOT,
    corsProxy: corsProxyFor(cfg),
    remote: "origin",
    ref: cfg.branch || "main",
    onAuth: () => authFor(cfg) ?? {},
    onMessage: (m) => onProgress?.(m),
  });
}

export async function ensureRemote(cfg: GitConfig): Promise<void> {
  const remotes = await git.listRemotes({ fs: fsRef(), dir: REPO_ROOT });
  if (!remotes.find((r) => r.remote === "origin")) {
    if (cfg.remoteUrl) {
      await git.addRemote({ fs: fsRef(), dir: REPO_ROOT, remote: "origin", url: cfg.remoteUrl });
    }
  }
}

export interface SyncReport {
  pulled: boolean;
  committed: string | null;
  pushed: boolean;
  message: string;
}

export async function syncAll(
  cfg: GitConfig,
  message = "Update flashcards",
  onProgress?: (m: string) => void,
): Promise<SyncReport> {
  if (!cfg.remoteUrl) throw new Error("Не задан Git URL в настройках");
  await ensureRepoSkeleton();
  const status = loadSyncStatus();
  let pulled = false;
  let pushed = false;
  let committedSha: string | null = null;

  try {
    if (!(await isInitialized())) {
      await clone(cfg, onProgress);
      pulled = true;
    }
    await ensureRemote(cfg);
    await configureIdentity(cfg);

    committedSha = await commit(cfg, message);

    // Сначала pull с 3-way merge (наш mergeDriver сливает cards.json по id).
    // Только после успешного слияния пушим — иначе можно затереть чужие правки.
    // Если remote ещё пуст (первый push) — pull кинет ошибку про отсутствие ветки,
    // это нормально, продолжаем к push.
    try {
      await pull(cfg, onProgress);
      pulled = true;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const benign =
        err.code === "ResolveRefError" || // ветки ещё нет на remote (пустой репозиторий)
        /not found|couldn't find|remote does not have/i.test(err.message ?? "");
      if (!benign) throw e; // настоящую ошибку слияния НЕ глотаем, чтобы не потерять данные
      onProgress?.("Remote пуст — первый push");
    }

    await push(cfg, onProgress);
    pushed = true;

    saveSyncStatus({
      ...status,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      pendingChanges: 0,
    });
    return { pulled, committed: committedSha, pushed, message: "Синхронизация завершена" };
  } catch (e: unknown) {
    const err = e as Error;
    saveSyncStatus({ ...status, lastError: err.message ?? String(e) });
    throw e;
  }
}
