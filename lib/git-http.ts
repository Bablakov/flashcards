"use client";

/**
 * HTTP-клиент для isomorphic-git, выбирающий транспорт по платформе (§10, §11).
 *
 *  - ПК (Electron): запрос уходит по IPC в главный процесс и выполняется обычным
 *    сетевым стеком Node. Браузерного CORS там нет — сторонний прокси не нужен,
 *    токен не покидает устройство;
 *  - Android (Capacitor): нативный HTTP-плагин патчит fetch, запрос тоже идёт
 *    мимо CORS;
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

export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const bridge = desktop();
    if (!bridge) {
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
