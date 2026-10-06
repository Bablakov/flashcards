/**
 * Сборка сайта для GitHub Pages: `npm run build:web` → папка out/.
 *
 * Отличия от обычной сборки:
 *  - всё лежит в подпапке /flashcards (адрес https://bablakov.github.io/flashcards/);
 *  - рядом кладётся sw.js — service worker со списком всех файлов сборки.
 *    Он делает сайт приложением, которое открывается без интернета.
 *
 * Стратегия кэша:
 *  - /_next/static — имена с хешем, не меняются: сразу из кэша;
 *  - страницы и остальное — из сети (свежая версия), а при плохой связи
 *    через 4 секунды или без сети — из кэша.
 * Новая сборка = новый sw.js: браузер сам скачает новые файлы и удалит старые.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const base = process.env.WEB_BASE_PATH ?? "/flashcards";
const out = "out";

const build = spawnSync("npx next build", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: base },
});
if (build.status !== 0) process.exit(build.status ?? 1);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const urls = new Set();
for (const file of walk(out)) {
  const rel = relative(out, file).split(sep).join("/");
  if (rel === "sw.js" || rel === "404.html" || rel.startsWith(".")) continue;
  if (rel === "index.html") urls.add(`${base}/`);
  else if (rel.endsWith(".html")) urls.add(`${base}/${rel.slice(0, -5)}`);
  else urls.add(`${base}/${rel}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = `${pkg.version}-${Date.now().toString(36)}`;

const sw = `// Сгенерировано scripts/build-web.mjs — не править руками.
const CACHE = "flashcards-${version}";
const BASE = ${JSON.stringify(base)};
const PRECACHE = ${JSON.stringify([...urls].sort(), null, 0)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("flashcards-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** /flashcards/deck.html и /flashcards/deck — одна страница. */
function cacheKey(url) {
  let path = url.pathname;
  if (path === BASE) path = BASE + "/";
  if (path.endsWith(".html")) path = path === BASE + "/index.html" ? BASE + "/" : path.slice(0, -5);
  return path;
}

async function fromCache(url) {
  return caches.match(cacheKey(url), { ignoreSearch: true, ignoreVary: true });
}

async function networkFirst(request, url) {
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE);
      await cache.put(cacheKey(url), response.clone());
    }
    return response;
  });
  network.catch(() => {}); // ответ уже отдан из кэша — поздняя ошибка сети не важна
  const slow = new Promise((resolve) => setTimeout(resolve, 4000, "slow"));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    const cached = await fromCache(url);
    return cached || (await network);
  } catch {
    const cached = await fromCache(url);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await caches.match(BASE + "/");
      if (home) return home;
    }
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // GitHub API и всё чужое — мимо кэша: данные всегда живые.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.startsWith(BASE + "/_next/static/")) {
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith(networkFirst(request, url));
});
`;

writeFileSync(join(out, "sw.js"), sw);
// Без этого файла Jekyll на GitHub Pages выбросил бы папку _next.
writeFileSync(join(out, ".nojekyll"), "");
console.log(`build:web — ${urls.size} файлов в кэше приложения, база ${base}, версия ${version}`);
