"use client";

/**
 * Проверка обновлений приложения (§9).
 *
 * Релизы лежат в публичном репозитории кода, данные — в приватном. Поэтому
 * проверка идёт без токена: обычный запрос к GitHub API. Без интернета просто
 * молча пропускается — приложение работает офлайн.
 *
 * ПК обновляется сам через electron-updater, здесь — Android и веб: показываем
 * плашку и ведём на скачивание APK.
 */

const RELEASES_API = "https://api.github.com/repos/Bablakov/flashcards/releases/latest";
const LAST_CHECK_KEY = "flashcards.update.lastCheck";
const CHECK_INTERVAL_MS = 24 * 3600 * 1000;

export interface UpdateInfo {
  version: string;
  url: string;
  apkUrl: string | null;
  notes: string;
}

export function currentVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
}

/** Сравнение версий вида 1.2.3; возвращает true, если a новее b. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

/**
 * Скачивание APK с показом процента и запуск установки (§9.4).
 *
 * На Android файл кладётся в кэш приложения и открывается системным
 * установщиком — пользователю остаётся подтвердить установку. В остальных
 * случаях просто открываем ссылку: там обновление ставится иначе.
 */
export async function downloadAndInstall(
  update: UpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<"installing" | "opened"> {
  const url = update.apkUrl ?? update.url;
  let native = false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }
  if (!native || !update.apkUrl) {
    window.open(url, "_blank");
    return "opened";
  }

  const response = await fetch(update.apkUrl);
  if (!response.ok) throw new Error(`Не удалось скачать: HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length") ?? "0");

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) onProgress?.(Math.round((received / total) * 100));
      }
    }
  } else {
    chunks.push(new Uint8Array(await response.arrayBuffer()));
    onProgress?.(100);
  }

  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const fileName = `flashcards-${update.version}.apk`;
  await Filesystem.writeFile({
    path: fileName,
    data: btoa(binary),
    directory: Directory.Cache,
  });
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });

  const { FileOpener } = await import("@capacitor-community/file-opener");
  await FileOpener.open({
    filePath: uri,
    contentType: "application/vnd.android.package-archive",
  });
  return "installing";
}

export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (typeof window === "undefined") return null;
  if (!force) {
    const last = Number(window.localStorage.getItem(LAST_CHECK_KEY) ?? "0");
    if (Date.now() - last < CHECK_INTERVAL_MS) return null;
  }
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    window.localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    if (!res.ok) return null;
    const release = (await res.json()) as GithubRelease;
    const tag = release.tag_name ?? "";
    if (!tag || !isNewer(tag, currentVersion())) return null;
    const apk = release.assets?.find((a) => (a.name ?? "").toLowerCase().endsWith(".apk"));
    return {
      version: tag.replace(/^v/, ""),
      url: release.html_url ?? "",
      apkUrl: apk?.browser_download_url ?? null,
      notes: (release.body ?? "").slice(0, 400),
    };
  } catch {
    // нет сети — не проблема, проверим в следующий раз
    return null;
  }
}
