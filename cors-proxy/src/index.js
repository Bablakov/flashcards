/**
 * Flashcards — собственный CORS-прокси для Git-синхронизации (вариант B).
 *
 * Зачем: GitHub/GitLab НЕ отдают CORS-заголовки на git-smart-HTTP, поэтому
 * isomorphic-git из браузера и Android WebView не может напрямую делать
 * clone/pull/push. Этот прокси туннелирует запросы к git-хосту и добавляет
 * CORS-заголовки. Запускается на ТВОЁМ Cloudflare-аккаунте, поэтому токен
 * проходит только через твою инфраструктуру (privacy-first).
 *
 * Протокол совместим с опцией `corsProxy` isomorphic-git:
 *   запрос приходит как  /<host>/<path...>?<query>
 *   например             /github.com/user/flashcards.git/info/refs?service=git-upload-pack
 *
 * Деплой:  npx wrangler deploy   (см. ../README.md)
 */

// Разрешённые git-хосты — чтобы прокси не превратился в открытый релей.
// Добавь свой хост (GitLab/Gitea), если нужно.
const ALLOW_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
]);

// Заголовки запроса, которые пробрасываем дальше (как в @isomorphic-git/cors-proxy).
const ALLOW_REQUEST_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "dnt",
  "git-protocol",
  "pragma",
  "range",
  "user-agent",
  "x-http-method-override",
  "x-requested-with",
];

// Заголовки ответа, которые показываем браузеру.
const EXPOSE_RESPONSE_HEADERS = [
  "accept-ranges",
  "age",
  "cache-control",
  "content-length",
  "content-language",
  "content-type",
  "date",
  "etag",
  "expires",
  "last-modified",
  "location",
  "pragma",
  "server",
  "transfer-encoding",
  "vary",
  "x-github-request-id",
  "x-redirected-url",
  "www-authenticate",
  "content-encoding",
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": ALLOW_REQUEST_HEADERS.join(", ") + ", x-authorization",
    "Access-Control-Expose-Headers": EXPOSE_RESPONSE_HEADERS.join(", "),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "*";

    // Префлайт
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");

    // Корень — health-check
    if (!path) {
      return new Response("flashcards cors-proxy: ok", {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const slash = path.indexOf("/");
    if (slash < 0) {
      return new Response("Bad proxy path", { status: 400, headers: corsHeaders(origin) });
    }
    const targetHost = path.slice(0, slash);
    const targetPath = path.slice(slash + 1);

    if (!ALLOW_HOSTS.has(targetHost)) {
      return new Response(`Host not allowed: ${targetHost}`, {
        status: 403,
        headers: corsHeaders(origin),
      });
    }

    const targetUrl = `https://${targetHost}/${targetPath}${url.search}`;

    // Пробрасываем только разрешённые заголовки; x-authorization → authorization.
    const fwd = new Headers();
    for (const [k, v] of request.headers) {
      const lk = k.toLowerCase();
      if (lk === "x-authorization") {
        fwd.set("authorization", v);
      } else if (ALLOW_REQUEST_HEADERS.includes(lk)) {
        fwd.set(k, v);
      }
    }

    // Тело буферизуем (надёжнее, чем стримить; git-negotiation/packfile невелики).
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();

    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        method: request.method,
        headers: fwd,
        body,
        redirect: "follow",
      });
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e}`, {
        status: 502,
        headers: corsHeaders(origin),
      });
    }

    const outHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) outHeaders.set(k, v);
    // Сообщаем клиенту финальный URL после возможных редиректов.
    if (upstream.url && upstream.url !== targetUrl) {
      outHeaders.set("x-redirected-url", upstream.url);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};
