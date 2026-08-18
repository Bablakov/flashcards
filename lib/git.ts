"use client";

import * as git from "isomorphic-git";
import { gitHttp, isDesktopApp } from "./git-http";
import { Buffer } from "buffer";
import { getFS, REPO_ROOT, ensureRepoSkeleton, exists, flushFs, removePath } from "./fs";
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

/**
 * Есть ли на устройстве локальные данные, которых нет в репозитории.
 * Клонирование поверх них падает с «Your local changes would be overwritten»,
 * поэтому этот случай нужно ловить заранее и спрашивать пользователя.
 */
export async function hasLocalData(): Promise<boolean> {
  if (await isInitialized()) return false;
  return await exists(`${REPO_ROOT}/meta.json`);
}

/**
 * Подключение устройства к репозиторию: локальная копия заменяется тем,
 * что лежит в репозитории. Именно этого ждут от кнопки «Клонировать»,
 * и только так можно избежать конфликта checkout при первом подключении.
 */
export async function cloneFresh(cfg: GitConfig, onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.("Очищаем локальную копию...");
  await removePath(REPO_ROOT);
  await clone(cfg, onProgress);
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
  await flushFs();
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
  // Объекты git пишутся в то же хранилище с отложенной записью дерева.
  // Без сброса перезагрузка страницы теряет их, и индекс начинает ссылаться
  // на несуществующий объект — «Could not find <хеш>».
  await flushFs();
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

/**
 * Повторно добавляет в индекс все файлы рабочего каталога.
 *
 * Нужно, когда индекс ссылается на объект, которого нет на диске
 * («Could not find <хеш>»): git.add пересчитывает и записывает объект заново,
 * поэтому потерянный файл-объект восстанавливается из содержимого, которое
 * никуда не девалось.
 */
async function repairIndex(): Promise<void> {
  const fs = fsRef();
  const matrix = await git.statusMatrix({ fs, dir: REPO_ROOT });
  for (const [filepath, , work] of matrix) {
    if (filepath.startsWith(".git")) continue;
    if (work === 0) continue;
    try {
      await git.add({ fs, dir: REPO_ROOT, filepath });
    } catch {
      // отдельный файл не должен мешать восстановлению остальных
    }
  }
  await flushFs();
}

/**
 * Пересборка локального репозитория без потери данных.
 *
 * Служебная папка .git удаляется целиком и собирается заново из удалённого
 * репозитория, а рабочие файлы (карточки, группы, медиа, журнал) остаются
 * на месте и попадают в первый же коммит. Это лечит «Could not find <хеш>»
 * и любое другое повреждение локального хранилища — в отличие от
 * «Подключить и заменить данные», которое забирает версию из репозитория
 * и выбрасывает несинхронизированное.
 */
export async function rebuildLocalRepo(
  cfg: GitConfig,
  onProgress?: (m: string) => void,
): Promise<void> {
  const fs = fsRef();
  const branch = cfg.branch || "main";
  onProgress?.("Пересобираем локальный репозиторий...");

  await removePath(`${REPO_ROOT}/.git`);
  await git.init({ fs, dir: REPO_ROOT, defaultBranch: branch });
  await ensureRemote(cfg);
  await configureIdentity(cfg);

  await git.fetch({
    fs,
    http: gitHttp,
    dir: REPO_ROOT,
    url: cfg.remoteUrl,
    corsProxy: corsProxyFor(cfg),
    ref: branch,
    singleBranch: true,
    depth: 1,
    onAuth: () => authFor(cfg) ?? {},
    onMessage: (m) => onProgress?.(m),
  });

  // Ставим локальную ветку на удалённую, НЕ трогая рабочие файлы: они и есть
  // актуальные данные, их нужно закоммитить сверху.
  const remoteOid = await git.resolveRef({ fs, dir: REPO_ROOT, ref: `refs/remotes/origin/${branch}` });
  await git.writeRef({ fs, dir: REPO_ROOT, ref: `refs/heads/${branch}`, value: remoteOid, force: true });
  await git.writeRef({
    fs,
    dir: REPO_ROOT,
    ref: "HEAD",
    value: `refs/heads/${branch}`,
    force: true,
    symbolic: true,
  });
  await flushFs();
  onProgress?.("Локальный репозиторий пересобран");
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
  await flushFs();
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
  await flushFs();
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

/**
 * Ошибки isomorphic-git приходят как «HTTP Error: 403 Forbidden» без объяснения,
 * что именно не так. Здесь код превращается в понятную причину — почти всегда
 * дело в правах токена, а не в самом репозитории.
 */
export function explainGitError(e: unknown): string {
  const err = e as { code?: string; data?: { statusCode?: number; response?: string }; message?: string };
  const status = err?.data?.statusCode;
  const raw = err?.message ?? String(e);

  if (status === 401) {
    return "401: GitHub не принял токен. Он неверный, истёк или скопирован не полностью — выпустите новый.";
  }
  if (status === 403) {
    return (
      "403: токен принят, но у него нет права записи в этот репозиторий. " +
      "Проверьте на GitHub: Settings → Developer settings → Fine-grained tokens → ваш токен → " +
      "Repository access должен включать нужный репозиторий, а Permissions → Contents → Read and write."
    );
  }
  if (status === 404) {
    return "404: репозиторий не найден. Проверьте адрес (должен заканчиваться на .git) и что токен выпущен именно на него.";
  }
  if (/could not find [0-9a-f]{7,40}/i.test(raw)) {
    return (
      "Локальная копия репозитория повреждена: потерян служебный файл git. " +
      "Данные в самом репозитории целы. Нажмите «Подключить и заменить данные» — " +
      "локальная копия соберётся заново. Если на этом устройстве есть несохранённые " +
      "карточки, сначала выгрузите их через Экспорт .fcdeck."
    );
  }
  if (/would be overwritten by checkout|local changes/i.test(raw)) {
    return (
      "На устройстве уже есть свои карточки, а репозиторий подключается впервые — " +
      "git не станет затирать их молча. Нажмите «Подключить и заменить данные»: " +
      "локальная копия заменится содержимым репозитория. Если локальные карточки нужны, " +
      "сначала сохраните их через Экспорт .fcdeck."
    );
  }
  if (/timeout|timed out/i.test(raw)) {
    return "Превышено время ожидания сети. Проверьте интернет и попробуйте ещё раз.";
  }
  return raw;
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

  let stage = "подготовка";
  try {
    if (!(await isInitialized())) {
      if (await hasLocalData()) {
        throw new Error(
          "Репозиторий ещё не подключён, а на устройстве есть свои карточки. " +
            "Откройте Настройки и нажмите «Подключить и заменить данные».",
        );
      }
      stage = "клонирование";
      await clone(cfg, onProgress);
      pulled = true;
    }
    await ensureRemote(cfg);
    await configureIdentity(cfg);

    stage = "коммит";
    try {
      committedSha = await commit(cfg, message);
    } catch (e: unknown) {
      // Потерянный объект восстанавливаем сами и пробуем ещё раз — пользователю
      // не за что тут отвечать.
      if (!/could not find [0-9a-f]{7,40}/i.test((e as Error).message ?? "")) throw e;
      onProgress?.("Восстанавливаем локальный индекс...");
      try {
        await repairIndex();
        committedSha = await commit(cfg, message);
      } catch {
        // Индекс не спасти — собираем служебную часть заново.
        // Рабочие файлы не трогаем, поэтому ничего не теряется.
        await rebuildLocalRepo(cfg, onProgress);
        committedSha = await commit(cfg, message);
      }
    }

    // Сначала pull с 3-way merge (наш mergeDriver сливает cards.json по id).
    // Только после успешного слияния пушим — иначе можно затереть чужие правки.
    // Если remote ещё пуст (первый push) — pull кинет ошибку про отсутствие ветки,
    // это нормально, продолжаем к push.
    try {
      stage = "получение изменений (pull)";
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

    stage = "отправка (push)";
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
    // Этап в тексте ошибки — чтобы по одному сообщению было видно, где рвётся:
    // на чтении, на отправке или ещё на подключении.
    const explained = `Этап «${stage}». ${explainGitError(e)}`;
    saveSyncStatus({ ...status, lastError: explained });
    throw new Error(explained);
  }
}

export interface AccessReport {
  read: { ok: boolean; status: number };
  write: { ok: boolean; status: number };
  summary: string;
}

/**
 * Проверка доступа без изменения данных: спрашиваем у GitHub, пустит ли токен
 * на чтение (git-upload-pack) и на запись (git-receive-pack). Это единственный
 * способ отличить «токен без права записи» от «неверный адрес» до синхронизации.
 */
export async function checkAccess(cfg: GitConfig): Promise<AccessReport> {
  if (!cfg.remoteUrl) throw new Error("Не задан адрес репозитория");
  const base = cfg.remoteUrl.replace(/\.git$/, "");
  const auth = cfg.token
    ? "Basic " + btoa(`${cfg.username || "x-access-token"}:${cfg.token}`)
    : "";

  async function probe(service: string): Promise<number> {
    const res = await gitHttp.request({
      url: `${base}.git/info/refs?service=${service}`,
      method: "GET",
      headers: {
        accept: `application/x-${service}-advertisement`,
        "user-agent": "git/isomorphic-git",
        ...(auth ? { authorization: auth } : {}),
      },
    });
    return res.statusCode;
  }

  const readStatus = await probe("git-upload-pack");
  const writeStatus = await probe("git-receive-pack");
  const read = { ok: readStatus === 200, status: readStatus };
  const write = { ok: writeStatus === 200, status: writeStatus };

  let summary: string;
  if (read.ok && write.ok) {
    summary = "Доступ есть: чтение и запись работают.";
  } else if (read.ok && !write.ok) {
    summary =
      `Чтение работает, запись — нет (${write.status}). У токена не хватает права ` +
      "Permissions → Contents → Read and write.";
  } else if (readStatus === 401 || writeStatus === 401) {
    summary = "GitHub не принял токен (401). Скорее всего он истёк или скопирован не полностью.";
  } else if (readStatus === 404) {
    summary =
      "Репозиторий не найден (404). Проверьте адрес и что токен выпущен именно на этот репозиторий.";
  } else {
    summary = `Нет доступа: чтение ${read.status}, запись ${write.status}.`;
  }
  return { read, write, summary };
}
