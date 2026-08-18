"use client";

import LightningFS from "@isomorphic-git/lightning-fs";

export const REPO_ROOT = "/repo";
export const DECKS_DIR = `${REPO_ROOT}/decks`;

let _fs: LightningFS | null = null;

export function getFS(): LightningFS {
  if (typeof window === "undefined") {
    throw new Error("getFS() must run in the browser");
  }
  if (!_fs) {
    _fs = new LightningFS("flashcards-fs");
  }
  return _fs;
}

export function getPfs() {
  return getFS().promises;
}

export async function ensureDir(path: string): Promise<void> {
  const pfs = getPfs();
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      await pfs.mkdir(current);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code !== "EEXIST") throw e;
    }
  }
}

export async function exists(path: string): Promise<boolean> {
  const pfs = getPfs();
  try {
    await pfs.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string): Promise<T> {
  const pfs = getPfs();
  const data = await pfs.readFile(path, "utf8");
  return JSON.parse(data as string) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const pfs = getPfs();
  const text = JSON.stringify(value, null, 2);
  await pfs.writeFile(path, text, "utf8");
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  const pfs = getPfs();
  await pfs.writeFile(path, bytes);
}

export async function readBytes(path: string): Promise<Uint8Array> {
  const pfs = getPfs();
  const data = await pfs.readFile(path);
  return data as Uint8Array;
}

export async function listDir(path: string): Promise<string[]> {
  const pfs = getPfs();
  try {
    return (await pfs.readdir(path)) as string[];
  } catch {
    return [];
  }
}

export async function removePath(path: string): Promise<void> {
  const pfs = getPfs();
  try {
    const stat = await pfs.stat(path);
    if (stat.isDirectory()) {
      const entries = await pfs.readdir(path);
      for (const entry of entries) {
        await removePath(`${path}/${entry}`);
      }
      await pfs.rmdir(path);
    } else {
      await pfs.unlink(path);
    }
  } catch {
    // ignore
  }
}

/**
 * Каталог `decks/` относится к формату 1 и больше не создаётся: структуру формата 2
 * готовит store.ensureSkeleton(), а `DECKS_DIR` остаётся только для миграции.
 */
export async function ensureRepoSkeleton(): Promise<void> {
  await ensureDir(REPO_ROOT);
}

/**
 * Принудительная запись дерева файлов на диск.
 *
 * Хранилище пишет содержимое файла сразу, а само дерево каталогов — с задержкой
 * в полсекунды. Если за это время страница успевает перезагрузиться (а переход
 * в редактор карточки в собранном приложении это делает), запись файла остаётся,
 * а запись «такой файл существует» пропадает — карточка выглядит потерянной.
 */
/**
 * Отладочный доступ к хранилищу — только в режиме разработки.
 * Нужен, чтобы измерять поведение записи, а не рассуждать о нём.
 */
export function exposeFsDebug(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
  const pfs = getPfs();
  (window as unknown as { __fsDebug?: unknown }).__fsDebug = {
    fsKeys: () => Object.keys(getFS() as unknown as Record<string, unknown>),
    fsShape: () => {
      const fs = getFS() as unknown as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(fs)) out[k] = Object.prototype.toString.call(v);
      return out;
    },
    backend: () => (getFS() as unknown as { _backend?: unknown })._backend,
    hasFlush: () => typeof (getPfs() as unknown as { flush?: unknown }).flush === "function",
    async writeMany(dir: string, count: number, sizeKb: number, flush: boolean) {
      await ensureDir(dir);
      const chunk = new Uint8Array(sizeKb * 1024).fill(7);
      for (let i = 0; i < count; i++) {
        await pfs.writeFile(`${dir}/f${i}.bin`, chunk);
      }
      if (flush) await flushFs();
      return { written: count, flushed: flush };
    },
    async count(dir: string) {
      try {
        return ((await pfs.readdir(dir)) as string[]).length;
      } catch {
        return -1;
      }
    },
    async wipe(dir: string) {
      await removePath(dir);
      await flushFs();
    },
  };
}

export async function flushFs(): Promise<void> {
  const pfs = getPfs() as unknown as { flush?: () => Promise<void> };
  if (typeof pfs.flush === "function") {
    await pfs.flush();
    return;
  }
  // Библиотека изменилась — ждём по времени, но говорим об этом вслух,
  // потому что молчаливая деградация уже однажды стоила потерянных данных.
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.warn("flushFs: метод flush недоступен, использован запас по времени");
}

export async function bytesToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
