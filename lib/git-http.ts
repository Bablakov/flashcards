"use client";

/**
 * HTTP-клиент для isomorphic-git, выбирающий транспорт по платформе (§10, §11).
 *
 *  - ПК (Electron): запрос уходит по IPC в главный процесс и выполняется обычным
 *    сетевым стеком Node. Браузерного CORS там нет — сторонний прокси не нужен,
 *    токен не покидает устройство;
 *  - Android (Capacitor): запрос уходит через нативный HTTP-плагин ЯВНЫМ вызовом.
 *    Глобальный патч fetch для этого не годится: нативный слой принимает только
 *    строку или JSON, а git гоняет двоичные пакеты — их нужно передавать base64
 *    с `dataType: "file"`. Плюс патч перехватывал вообще все запросы приложения
 *    и ломал загрузку страниц;
 *  - обычный браузер: штатный веб-клиент isomorphic-git. Здесь CORS никуда не
 *    девается, поэтому нужен свой прокси (поле в настройках).
 */

import webHttp from "isomorphic-git/http/web";
import type { GitHttpRequest, GitHttpResponse, HttpClient } from "isomorphic-git";

interface DesktopBridge {
  isDesktop: boolean;
  gitRequest: (req: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  }) => Promise<{
    url: string;
    method: string;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: Uint8Array;
  }>;
}

/* ------------------------------------------------------ base64 <-> байты */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // посимвольный вызов на больших пакетах переполняет стек
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function textToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Нативный слой отдаёт тело по-разному: двоичный ответ приходит base64, а
 * текстовый (например, первый ответ git с перечнем веток) — обычной строкой.
 * Слепой вызов atob на такой строке падал с «not correctly encoded» и валил
 * клонирование, поэтому формат определяется, а не предполагается.
 */
function looksLikeGitPayload(raw: string): boolean {
  // Ответы git начинаются либо с пакета «PACK», либо со строки pkt-line:
  // четыре шестнадцатеричные цифры с длиной блока. Это надёжнее, чем гадать
  // по алфавиту: строка «0000» (пустой пакет git) сама по себе выглядит как base64.
  if (raw.startsWith("PACK") || raw.startsWith("#")) return true;
  const head = raw.slice(0, 4);
  if (!/^[0-9a-f]{4}$/.test(head)) return false;
  const declared = parseInt(head, 16);
  return declared === 0 || (declared >= 4 && declared <= raw.length);
}

export function decodeNativeBody(data: unknown): Uint8Array {
  if (data == null) return new Uint8Array(0);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof data !== "string") return textToBytes(JSON.stringify(data));
  if (looksLikeGitPayload(data)) return textToBytes(data);

  // Пробелы и переводы строк вставляет сам кодировщик Android; URL-safe вариант
  // (- и _) atob не понимает, поэтому приводим к обычному алфавиту.
  const cleaned = data.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const looksBase64 =
    cleaned.length > 0 && cleaned.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(cleaned);
  if (looksBase64) {
    try {
      return base64ToBytes(cleaned);
    } catch {
      // не base64, несмотря на вид — падаем в текстовую ветку
    }
  }
  return textToBytes(data);
}

function desktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { desktop?: DesktopBridge }).desktop;
  return bridge?.isDesktop ? bridge : null;
}

export function isDesktopApp(): boolean {
  return desktop() !== null;
}

async function* single(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

/**
 * Тайм-аут на сетевой запрос. Без него запрос, который «повис» (типичная беда
 * WebView на Android), оставлял бы приложение в бесконечной загрузке без всякого
 * объяснения. Лучше честная ошибка через минуту, чем вечный спиннер.
 */
const NETWORK_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Сеть не ответила за 60 секунд: ${url}`));
    }, NETWORK_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function collectBody(body: GitHttpRequest["body"]): Promise<Uint8Array | undefined> {
  if (!body) return undefined;
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

let nativeChecked = false;
let isNative = false;

/** Capacitor есть только в APK; в браузере и в ПК-сборке ветка не используется. */
async function nativePlatform(): Promise<boolean> {
  if (nativeChecked) return isNative;
  nativeChecked = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    isNative = Capacitor.isNativePlatform();
  } catch {
    isNative = false;
  }
  return isNative;
}

/**
 * Android: явный вызов нативного HTTP. Тело запроса уходит base64 с
 * `dataType: "file"` (иначе двоичный пакет git испортится при конвертации
 * в строку), ответ забираем как arraybuffer — плагин отдаёт его тоже base64.
 */
async function nativeRequest(req: GitHttpRequest): Promise<GitHttpResponse> {
  const { CapacitorHttp } = await import("@capacitor/core");
  const bodyBytes = await collectBody(req.body);
  const res = await CapacitorHttp.request({
    url: req.url,
    method: req.method ?? "GET",
    headers: (req.headers ?? {}) as Record<string, string>,
    responseType: "arraybuffer",
    connectTimeout: 30_000,
    readTimeout: NETWORK_TIMEOUT_MS,
    ...(bodyBytes ? { data: bytesToBase64(bodyBytes), dataType: "file" as const } : {}),
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers ?? {})) headers[k.toLowerCase()] = String(v);
  return {
    url: res.url || req.url,
    method: req.method ?? "GET",
    statusCode: res.status,
    statusMessage: String(res.status),
    headers,
    body: single(decodeNativeBody(res.data)),
  };
}

export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const bridge = desktop();
    if (!bridge) {
      if (await nativePlatform()) {
        return await withTimeout(nativeRequest(req), req.url);
      }
      return await withTimeout((webHttp as HttpClient).request(req), req.url);
    }
    const body = await collectBody(req.body);
    const res = await withTimeout(
      bridge.gitRequest({
        url: req.url,
        method: req.method ?? "GET",
        headers: req.headers ?? {},
        body,
      }),
      req.url,
    );
    return {
      url: res.url,
      method: res.method,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: res.headers,
      body: single(new Uint8Array(res.body)),
    };
  },
};
