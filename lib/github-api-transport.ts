/**
 * Git поверх GitHub API — транспорт веб-версии (сайт на GitHub Pages, Safari на iPhone).
 *
 * Браузер не пускает приложение на github.com: сервер git не отдаёт CORS-заголовки.
 * Зато их отдаёт api.github.com. Этот модуль притворяется git-сервером для
 * isomorphic-git: принимает те же запросы протокола smart HTTP и отвечает теми же
 * байтами, а данные берёт и пишет через REST и GraphQL API. Остальной код
 * (clone, pull со слиянием, push) не знает, что сервер ненастоящий.
 *
 * Объекты git восстанавливаются бит в бит — иначе не сойдутся хеши:
 *  - файлы и папки однозначно собираются из ответа API;
 *  - коммит — из полей GraphQL: только там дата хранит часовой пояс автора,
 *    REST приводит её к UTC;
 *  - при отправке GitHub создаёт коммит из тех же полей, и хеш совпадает.
 * Каждый объект проверяется по хешу. Расхождение — ошибка, а не тихая порча:
 * ветка на GitHub сдвигается только после того, как совпали все объекты.
 *
 * Проверено 2026-10-06 на репозитории данных: 98 из 98 коммитов собраны точно,
 * коммит, созданный через API с поясом +03:00, совпал с локальным хешем.
 */

import pako from "pako";
import type { GitHttpRequest, GitHttpResponse } from "isomorphic-git";

const API = "https://api.github.com";
const ZERO = "0".repeat(40);
const AGENT = "agent=flashcards-github-api";
/** Сколько файлов качаем одновременно. Больше — упираемся в лимиты Safari и GitHub. */
const PARALLEL = 6;
/** Предел истории за один pull. Дальше история обрезается, как при clone --depth. */
const MAX_COMMITS = 300;
const REQUEST_TIMEOUT_MS = 60_000;

export interface GithubTransportDeps {
  fetch: typeof fetch;
  /** Есть ли объект в локальном репозитории — то, что уже есть, не качаем. */
  hasObject: (oid: string) => Promise<boolean>;
  onProgress?: (message: string) => void;
}

interface Target {
  owner: string;
  repo: string;
  action: "upload-ad" | "receive-ad" | "upload" | "receive";
}

/* ------------------------------------------------------------ байты */

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function sha1(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", bytes as BufferSource));
}

type ObjType = "commit" | "tree" | "blob" | "tag";

/** Хеш объекта git: sha1("<тип> <длина>\0" + содержимое). */
export async function objectId(type: ObjType, content: Uint8Array): Promise<string> {
  return bytesToHex(await sha1(concat([enc.encode(`${type} ${content.length}\0`), content])));
}

/* --------------------------------------------------------- pkt-line */

function pkt(data: string | Uint8Array): Uint8Array {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return concat([enc.encode((bytes.length + 4).toString(16).padStart(4, "0")), bytes]);
}

const FLUSH = enc.encode("0000");

/** Разбор pkt-line; null — flush. Возвращает строки и смещение, где они кончились. */
function readPktLines(
  buf: Uint8Array,
  stopAtFirstFlush: boolean,
): { lines: (Uint8Array | null)[]; end: number } {
  const lines: (Uint8Array | null)[] = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const head = dec.decode(buf.subarray(pos, pos + 4));
    if (!/^[0-9a-f]{4}$/i.test(head)) break;
    const len = parseInt(head, 16);
    pos += 4;
    if (len === 0) {
      lines.push(null);
      if (stopAtFirstFlush) break;
      continue;
    }
    if (len < 4) continue;
    lines.push(buf.subarray(pos, pos + len - 4));
    pos += len - 4;
  }
  return { lines, end: pos };
}

/** Данные в канале 1 протокола side-band-64k — только так их читает isomorphic-git. */
function sideBand(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  const MAX = 65515;
  for (let i = 0; i < data.length; i += MAX) {
    parts.push(pkt(concat([new Uint8Array([1]), data.subarray(i, i + MAX)])));
  }
  parts.push(FLUSH);
  return concat(parts);
}

/* ------------------------------------------------------------ packfile */

const PACK_TYPE: Record<ObjType, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };
const PACK_NAME: Record<number, ObjType> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };

interface GitObject {
  oid: string;
  type: ObjType;
  data: Uint8Array;
}

async function buildPack(objects: GitObject[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [enc.encode("PACK"), new Uint8Array([0, 0, 0, 2])];
  const n = objects.length;
  parts.push(new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]));
  for (const obj of objects) {
    let size = obj.data.length;
    const header: number[] = [];
    let byte = (PACK_TYPE[obj.type] << 4) | (size & 15);
    size = Math.floor(size / 16);
    while (size > 0) {
      header.push(byte | 0x80);
      byte = size & 0x7f;
      size = Math.floor(size / 128);
    }
    header.push(byte);
    parts.push(new Uint8Array(header), pako.deflate(obj.data));
  }
  const body = concat(parts);
  return concat([body, await sha1(body)]);
}

/** Пакет от isomorphic-git: объекты целиком, без дельт (так он их и пишет). */
export async function parsePack(buf: Uint8Array): Promise<GitObject[]> {
  if (buf.length < 12 || dec.decode(buf.subarray(0, 4)) !== "PACK") return [];
  const count = ((buf[8] << 24) | (buf[9] << 16) | (buf[10] << 8) | buf[11]) >>> 0;
  const out: GitObject[] = [];
  let pos = 12;
  for (let i = 0; i < count; i++) {
    let byte = buf[pos++];
    const typeNum = (byte >> 4) & 7;
    let size = byte & 15;
    let mul = 16;
    while (byte & 0x80) {
      byte = buf[pos++];
      size += (byte & 0x7f) * mul;
      mul *= 128;
    }
    const type = PACK_NAME[typeNum];
    if (!type) throw new Error(`Пакет git содержит дельту (тип ${typeNum}) — такого не ожидалось`);
    const inflator = new pako.Inflate();
    inflator.push(buf.subarray(pos), false);
    if (inflator.err || !(inflator.result instanceof Uint8Array)) {
      throw new Error(`Пакет git повреждён: ${inflator.msg || "не распаковался"}`);
    }
    const data = inflator.result;
    if (data.length !== size) throw new Error("Пакет git повреждён: не сходится размер объекта");
    pos = buf.length - inflator.strm.avail_in;
    out.push({ oid: await objectId(type, data), type, data });
  }
  return out;
}

/* ---------------------------------------------------------- деревья */

interface TreeEntry {
  mode: string; // как в объекте git: 100644, 100755, 40000, 120000, 160000
  name: string;
  oid: string;
}

/** Порядок git: имена сравниваются побайтно, у папки как будто есть «/» на конце. */
function treeSortKey(e: TreeEntry): Uint8Array {
  return enc.encode(e.mode === "40000" ? `${e.name}/` : e.name);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function renderTree(entries: TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => compareBytes(treeSortKey(a), treeSortKey(b)));
  const parts: Uint8Array[] = [];
  for (const e of sorted) {
    parts.push(enc.encode(`${e.mode} ${e.name}\0`), hexToBytes(e.oid));
  }
  return concat(parts);
}

function parseTree(data: Uint8Array): TreeEntry[] {
  const out: TreeEntry[] = [];
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    const nul = data.indexOf(0, space);
    const mode = dec.decode(data.subarray(pos, space));
    const name = dec.decode(data.subarray(space + 1, nul));
    const oid = bytesToHex(data.subarray(nul + 1, nul + 21));
    out.push({ mode, name, oid });
    pos = nul + 21;
  }
  return out;
}

/* ---------------------------------------------------------- коммиты */

interface GqlActor {
  name: string;
  email: string;
  date: string;
}

interface GqlCommit {
  oid: string;
  message: string;
  tree: { oid: string };
  parents: { nodes: { oid: string }[] };
  author: GqlActor;
  committer: GqlActor;
  signature: { payload: string; signature: string } | null;
}

/** «2026-10-03T23:13:33+03:00» → «1759522413 +0300», как в объекте git. */
function actorLine(a: GqlActor): string {
  const m = a.date.match(/([+-])(\d\d):?(\d\d)$/);
  const tz = m ? `${m[1]}${m[2]}${m[3]}` : "+0000";
  const ts = Math.floor(new Date(a.date).getTime() / 1000);
  return `${a.name} <${a.email}> ${ts} ${tz}`;
}

/** «1759522413 +0300» → «2026-10-03T23:13:33+03:00» — так GitHub сохранит пояс. */
function isoWithOffset(ts: number, tz: string): string {
  const sign = tz[0] === "-" ? -1 : 1;
  const minutes = sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10));
  const local = new Date((ts + minutes * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  return `${local}${tz.slice(0, 3)}:${tz.slice(3, 5)}`;
}

async function rebuildCommit(c: GqlCommit): Promise<Uint8Array> {
  const candidates: string[] = [];
  if (c.signature?.payload) {
    // Подписанный коммит: payload — это сам объект без строки подписи.
    const p = c.signature.payload;
    const cut = p.indexOf("\n\n");
    const sig = c.signature.signature.replace(/\n$/, "").split("\n").join("\n ");
    candidates.push(`${p.slice(0, cut)}\ngpgsig ${sig}\n${p.slice(cut + 1)}`);
  } else {
    let head = `tree ${c.tree.oid}\n`;
    for (const p of c.parents.nodes) head += `parent ${p.oid}\n`;
    head += `author ${actorLine(c.author)}\ncommitter ${actorLine(c.committer)}\n\n`;
    const msg = c.message;
    candidates.push(head + msg + "\n", head + msg, head + msg.replace(/\n+$/, "") + "\n");
  }
  for (const text of candidates) {
    const bytes = enc.encode(text);
    if ((await objectId("commit", bytes)) === c.oid) return bytes;
  }
  throw new Error(
    `Коммит ${c.oid.slice(0, 7)} не удаётся воспроизвести через GitHub API ` +
      "(необычный формат). Синхронизируйте с ПК или телефона, на сайте это пока не поддерживается.",
  );
}

interface LocalCommit {
  tree: string;
  parents: string[];
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  message: string;
}

function parseLocalCommit(data: Uint8Array, oid: string): LocalCommit {
  const text = dec.decode(data);
  const cut = text.indexOf("\n\n");
  const head = cut >= 0 ? text.slice(0, cut) : text;
  const message = cut >= 0 ? text.slice(cut + 2) : "";
  const parents: string[] = [];
  let tree = "";
  let author: LocalCommit["author"] | null = null;
  let committer: LocalCommit["committer"] | null = null;
  for (const line of head.split("\n")) {
    const space = line.indexOf(" ");
    const key = line.slice(0, space);
    const value = line.slice(space + 1);
    if (key === "tree") tree = value;
    else if (key === "parent") parents.push(value);
    else if (key === "author" || key === "committer") {
      const m = value.match(/^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/);
      if (!m) throw new Error(`Коммит ${oid.slice(0, 7)}: не разобрать строку ${key}`);
      const actor = { name: m[1], email: m[2], date: isoWithOffset(parseInt(m[3], 10), m[4]) };
      if (key === "author") author = actor;
      else committer = actor;
    } else {
      // Подпись, кодировка и прочие заголовки API не умеет воспроизвести.
      throw new Error(`Коммит ${oid.slice(0, 7)} содержит заголовок «${key}», через API его не отправить`);
    }
  }
  if (!tree || !author || !committer) throw new Error(`Коммит ${oid.slice(0, 7)} не разобрать`);
  return { tree, parents, author, committer, message };
}

/* --------------------------------------------------------------- API */

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseTarget(url: string): Target | null {
  const m = url.match(
    /^https:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?]+?)(?:\.git)?\/(info\/refs\?service=git-(upload|receive)-pack|git-(upload|receive)-pack)$/,
  );
  if (!m) return null;
  const [, owner, repo, , adKind, postKind] = m;
  const action = adKind
    ? adKind === "upload"
      ? "upload-ad"
      : "receive-ad"
    : postKind === "upload"
      ? "upload"
      : "receive";
  return { owner, repo, action };
}

export function isGithubGitUrl(url: string): boolean {
  return parseTarget(url) !== null;
}

function tokenFrom(headers: Record<string, string> | undefined): string | null {
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() !== "authorization") continue;
    const m = String(v).match(/^Basic\s+(.+)$/i);
    if (!m) continue;
    const decoded = atob(m[1]);
    const password = decoded.slice(decoded.indexOf(":") + 1);
    return password || null;
  }
  return null;
}

async function collectBody(body: GitHttpRequest["body"]): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return concat(chunks);
}

async function* single(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

function reply(req: GitHttpRequest, status: number, body: Uint8Array | string, type?: string): GitHttpResponse {
  return {
    url: req.url,
    method: req.method ?? "GET",
    statusCode: status,
    statusMessage: status === 200 ? "OK" : String(status),
    headers: type ? { "content-type": type } : {},
    body: single(typeof body === "string" ? enc.encode(body) : body),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ограничение параллельности: GitHub не любит десятки запросов разом. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

const COMMIT_FIELDS =
  "oid message tree { oid } parents(first: 20) { nodes { oid } } " +
  "author { name email date } committer { name email date } signature { payload signature }";

class Session {
  private readonly base: string;

  constructor(
    private readonly deps: GithubTransportDeps,
    private readonly t: Target,
    private readonly token: string | null,
  ) {
    this.base = `${API}/repos/${t.owner}/${t.repo}`;
  }

  async call(
    path: string,
    init: { method?: string; body?: unknown; accept?: string; fresh?: boolean } = {},
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.base}${path}`;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await this.deps.fetch(url, {
          method: init.method ?? "GET",
          headers: {
            Accept: init.accept ?? "application/vnd.github+json",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          // Ссылки на ветки должны быть свежими: браузер иначе отдаёт ответ
          // минутной давности, и push упирается в «не fast-forward».
          cache: init.fresh ? "no-store" : "default",
          signal: controller.signal,
        });
      } catch (e: unknown) {
        const aborted = (e as Error).name === "AbortError";
        throw new Error(
          aborted
            ? "GitHub не ответил за 60 секунд. Проверьте интернет и попробуйте ещё раз."
            : `Нет связи с GitHub (api.github.com): ${(e as Error).message}`,
        );
      } finally {
        clearTimeout(timer);
      }
      if ((res.status === 403 || res.status === 429) && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "0");
        const remaining = res.headers.get("x-ratelimit-remaining");
        if (remaining === "0") {
          const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0") * 1000;
          const when = reset ? new Date(reset).toLocaleTimeString("ru-RU") : "через час";
          throw new Error(`GitHub API: исчерпан часовой лимит запросов. Попробуйте после ${when}.`);
        }
        if (retryAfter > 0 || res.status === 429) {
          // Вторичный лимит на частые записи — GitHub сам говорит, сколько ждать.
          this.deps.onProgress?.("GitHub просит подождать, повторяем...");
          await sleep(Math.min(Math.max(retryAfter, 5), 90) * 1000);
          continue;
        }
      }
      return res;
    }
  }

  async json<T>(path: string, init: Parameters<Session["call"]>[1] = {}): Promise<T> {
    const res = await this.call(path, init);
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        // тело ошибки не JSON — обойдёмся кодом
      }
      throw new ApiError(res.status, detail || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.json<{ data?: T; errors?: { type?: string; message: string }[] }>(
      `${API}/graphql`,
      { method: "POST", body: { query, variables } },
    );
    if (res.errors?.length) {
      const notFound = res.errors.some((e) => e.type === "NOT_FOUND");
      throw new ApiError(notFound ? 404 : 400, res.errors.map((e) => e.message).join("; "));
    }
    return res.data as T;
  }

  /* ---------------------------------------------- объявление веток */

  async advertise(service: "git-upload-pack" | "git-receive-pack"): Promise<Uint8Array> {
    const info = await this.json<{ default_branch?: string }>("", { fresh: true });
    let heads: { ref: string; object: { sha: string } }[] = [];
    try {
      heads = await this.json("/git/matching-refs/heads", { fresh: true });
    } catch (e) {
      // 409 — пустой репозиторий: веток ещё нет
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
    if (service === "git-receive-pack" && heads.length > 0) {
      // Проверка права записи без следа: пустой файл GitHub создаст один раз
      // и дальше будет только узнавать. Без права — 403/404, как у git-сервера.
      await this.json("/git/blobs", { method: "POST", body: { content: "", encoding: "utf-8" } });
    }
    const defaultRef = `refs/heads/${info.default_branch ?? "main"}`;
    const caps =
      service === "git-upload-pack"
        ? ["side-band-64k", "shallow", `symref=HEAD:${defaultRef}`, AGENT]
        : ["report-status", "side-band-64k", AGENT];
    const lines: string[] = [];
    const head = heads.find((h) => h.ref === defaultRef);
    if (service === "git-upload-pack" && head) lines.push(`${head.object.sha} HEAD`);
    for (const h of heads) lines.push(`${h.object.sha} ${h.ref}`);
    if (lines.length === 0) lines.push(`${ZERO} capabilities^{}`);
    const parts = [pkt(`# service=${service}\n`), FLUSH];
    lines.forEach((line, i) => parts.push(pkt(i === 0 ? `${line}\0${caps.join(" ")}\n` : `${line}\n`)));
    parts.push(FLUSH);
    return concat(parts);
  }

  /* ------------------------------------------------- скачивание */

  private known = new Map<string, Promise<boolean>>();
  private commits = new Map<string, GqlCommit>();
  private trees = new Map<string, { mode: string; name: string; oid: string; type: string }[]>();

  private hasLocal(oid: string): Promise<boolean> {
    let p = this.known.get(oid);
    if (!p) {
      p = this.deps.hasObject(oid).catch(() => false);
      this.known.set(oid, p);
    }
    return p;
  }

  private async commit(oid: string, batch: number): Promise<GqlCommit> {
    const cached = this.commits.get(oid);
    if (cached) return cached;
    const data = await this.graphql<{
      repository: { object: { history?: { nodes: GqlCommit[] } } | null } | null;
    }>(
      `query($owner: String!, $name: String!, $oid: GitObjectID!, $n: Int!) {
        repository(owner: $owner, name: $name) {
          object(oid: $oid) { ... on Commit { history(first: $n) { nodes { ${COMMIT_FIELDS} } } } }
        }
      }`,
      { owner: this.t.owner, name: this.t.repo, oid, n: batch },
    );
    for (const c of data.repository?.object?.history?.nodes ?? []) this.commits.set(c.oid, c);
    const found = this.commits.get(oid);
    if (!found) throw new ApiError(404, `Коммит ${oid.slice(0, 7)} не найден на GitHub`);
    return found;
  }

  /** Записи папки. Корень берём рекурсивно — одним запросом сразу все вложенные. */
  private async treeEntries(oid: string): Promise<{ mode: string; name: string; oid: string; type: string }[]> {
    const cached = this.trees.get(oid);
    if (cached) return cached;
    type Listing = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };
    let res = await this.json<Listing>(`/git/trees/${oid}?recursive=1`);
    const recursive = !res.truncated;
    // Огромное дерево GitHub обрезает — тогда по одной папке за запрос.
    if (!recursive) res = await this.json<Listing>(`/git/trees/${oid}`);
    const dirs = new Map<string, string>([["", oid]]);
    if (recursive) for (const e of res.tree) if (e.type === "tree") dirs.set(e.path, e.sha);
    const byDir = new Map<string, { mode: string; name: string; oid: string; type: string }[]>();
    for (const e of res.tree) {
      const slash = e.path.lastIndexOf("/");
      const dir = slash >= 0 ? e.path.slice(0, slash) : "";
      if (!dirs.has(dir)) continue;
      const list = byDir.get(dir) ?? [];
      list.push({ mode: e.mode.replace(/^0+/, ""), name: e.path.slice(slash + 1), oid: e.sha, type: e.type });
      byDir.set(dir, list);
    }
    for (const [dir, sha] of dirs) this.trees.set(sha, byDir.get(dir) ?? []);
    return this.trees.get(oid) ?? [];
  }

  private async blob(oid: string): Promise<Uint8Array> {
    const res = await this.call(`/git/blobs/${oid}`, { accept: "application/vnd.github.raw+json" });
    if (!res.ok) throw new ApiError(res.status, `Файл ${oid.slice(0, 7)}: HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json") && !type.includes("raw")) {
      const json = (await res.json()) as { content?: string; encoding?: string };
      return json.encoding === "base64" ? base64ToBytes(json.content ?? "") : enc.encode(json.content ?? "");
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async uploadPack(body: Uint8Array): Promise<Uint8Array> {
    const wants: string[] = [];
    let depth: number | null = null;
    for (const line of readPktLines(body, false).lines) {
      if (!line) continue;
      const text = dec.decode(line).trim();
      if (text.startsWith("want ")) wants.push(text.slice(5, 45));
      else if (text.startsWith("deepen ")) depth = parseInt(text.slice(7), 10);
    }

    // 1. Коммиты: от запрошенного вниз, пока не дойдём до того, что уже есть.
    const send = new Map<string, GqlCommit>();
    const shallow: string[] = [];
    const seen = new Set<string>();
    const queue = wants.map((oid) => ({ oid, level: 1 }));
    const batch = depth === 1 ? 1 : 50;
    while (queue.length > 0) {
      const { oid, level } = queue.shift()!;
      if (seen.has(oid)) continue;
      seen.add(oid);
      if (await this.hasLocal(oid)) continue;
      const c = await this.commit(oid, batch);
      send.set(oid, c);
      const parents = c.parents.nodes.map((p) => p.oid);
      const cut = (depth !== null && level >= depth) || send.size >= MAX_COMMITS;
      if (cut) {
        if (parents.length > 0) shallow.push(oid);
        continue;
      }
      for (const p of parents) queue.push({ oid: p, level: level + 1 });
    }

    // 2. Папки и файлы этих коммитов, которых нет на устройстве.
    const objects: GitObject[] = [];
    const queuedTrees = new Set<string>();
    const blobs = new Set<string>();
    const addTree = async (oid: string): Promise<void> => {
      if (queuedTrees.has(oid)) return;
      queuedTrees.add(oid);
      if (await this.hasLocal(oid)) return;
      const entries = await this.treeEntries(oid);
      const data = renderTree(entries);
      if ((await objectId("tree", data)) !== oid) {
        throw new Error(`Папка ${oid.slice(0, 7)} не совпала по хешу — загрузка остановлена`);
      }
      objects.push({ oid, type: "tree", data });
      for (const e of entries) {
        if (e.type === "tree") await addTree(e.oid);
        else if (e.type === "blob" && !blobs.has(e.oid) && !(await this.hasLocal(e.oid))) blobs.add(e.oid);
      }
    };
    for (const c of send.values()) {
      objects.push({ oid: c.oid, type: "commit", data: await rebuildCommit(c) });
      await addTree(c.tree.oid);
    }

    // 3. Содержимое файлов — параллельно, с проверкой хеша каждого.
    const list = [...blobs];
    let done = 0;
    if (list.length > 0) this.deps.onProgress?.(`GitHub: скачиваем файлов — ${list.length}`);
    await pool(list, PARALLEL, async (oid) => {
      const data = await this.blob(oid);
      if ((await objectId("blob", data)) !== oid) {
        throw new Error(`Файл ${oid.slice(0, 7)} пришёл повреждённым — загрузка остановлена`);
      }
      objects.push({ oid, type: "blob", data });
      done++;
    });
    if (done !== list.length) throw new Error("Скачаны не все файлы");

    const parts: Uint8Array[] = [];
    for (const oid of shallow) parts.push(pkt(`shallow ${oid}\n`));
    if (depth !== null) parts.push(FLUSH);
    parts.push(pkt("NAK\n"));
    parts.push(sideBand(await buildPack(objects)));
    return concat(parts);
  }

  /* --------------------------------------------------- отправка */

  async receivePack(body: Uint8Array): Promise<Uint8Array> {
    const { lines, end } = readPktLines(body, true);
    const commands: { old: string; next: string; ref: string }[] = [];
    for (const line of lines) {
      if (!line) continue;
      const text = dec.decode(line).split("\0")[0].trim();
      const [old, next, ref] = text.split(" ");
      commands.push({ old, next, ref });
    }
    const objects = await parsePack(body.subarray(end));
    const byOid = new Map(objects.map((o) => [o.oid, o]));

    // Порядок важен: GitHub принимает папку, только если её содержимое уже
    // загружено, а коммит — только если есть его папка и родители.
    const order: GitObject[] = [];
    const placed = new Set<string>();
    const place = (oid: string) => {
      const obj = byOid.get(oid);
      if (!obj || placed.has(oid)) return;
      placed.add(oid);
      if (obj.type === "tree") for (const e of parseTree(obj.data)) place(e.oid);
      if (obj.type === "commit") {
        const c = parseLocalCommit(obj.data, oid);
        place(c.tree);
        for (const p of c.parents) place(p);
      }
      if (obj.type === "tag") throw new Error("Отправка тегов через API не поддерживается");
      order.push(obj);
    };
    for (const o of objects) if (o.type === "blob") place(o.oid);
    for (const o of objects) place(o.oid);

    if (order.length > 0) this.deps.onProgress?.(`GitHub: отправляем объектов — ${order.length}`);
    const check = (kind: string, oid: string, got: string) => {
      if (got !== oid) {
        throw new Error(
          `GitHub сохранил ${kind} ${oid.slice(0, 7)} иначе (${got.slice(0, 7)}). ` +
            "Отправка остановлена, ветка на GitHub не тронута.",
        );
      }
    };
    const blobsFirst = order.filter((o) => o.type === "blob");
    await pool(blobsFirst, 3, async (o) => {
      const r = await this.json<{ sha: string }>("/git/blobs", {
        method: "POST",
        body: { content: bytesToBase64(o.data), encoding: "base64" },
      });
      check("файл", o.oid, r.sha);
    });
    for (const o of order) {
      if (o.type === "tree") {
        const tree = parseTree(o.data).map((e) => ({
          path: e.name,
          mode: e.mode === "40000" ? "040000" : e.mode,
          type: e.mode === "40000" ? "tree" : e.mode === "160000" ? "commit" : "blob",
          sha: e.oid,
        }));
        const r = await this.json<{ sha: string }>("/git/trees", { method: "POST", body: { tree } });
        check("папку", o.oid, r.sha);
      } else if (o.type === "commit") {
        const c = parseLocalCommit(o.data, o.oid);
        const r = await this.json<{ sha: string }>("/git/commits", {
          method: "POST",
          body: {
            message: c.message,
            tree: c.tree,
            parents: c.parents,
            author: c.author,
            committer: c.committer,
          },
        });
        check("коммит", o.oid, r.sha);
      }
    }

    // Все объекты на месте и совпали — теперь можно двигать ветку.
    const report: Uint8Array[] = [pkt("unpack ok\n")];
    for (const cmd of commands) {
      const name = cmd.ref.replace(/^refs\//, "");
      try {
        if (cmd.next === ZERO) {
          throw new Error("удаление веток не поддерживается");
        } else if (cmd.old === ZERO) {
          await this.json("/git/refs", { method: "POST", body: { ref: cmd.ref, sha: cmd.next } });
        } else {
          const current = await this.json<{ object: { sha: string } }>(`/git/ref/${name}`, { fresh: true });
          if (current.object.sha !== cmd.old) throw new Error("fetch first");
          await this.json(`/git/refs/${name}`, { method: "PATCH", body: { sha: cmd.next, force: false } });
        }
        report.push(pkt(`ok ${cmd.ref}\n`));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) throw e;
        const reason = e instanceof ApiError && e.status === 422 ? "non-fast-forward" : (e as Error).message;
        report.push(pkt(`ng ${cmd.ref} ${reason}\n`));
      }
    }
    report.push(FLUSH);
    return sideBand(concat(report));
  }
}

/**
 * HTTP-клиент для isomorphic-git, который вместо github.com ходит в api.github.com.
 * Ошибки доступа (401/403/404) возвращаются кодом — их объясняет explainGitError,
 * как и для настоящего git-сервера.
 */
export async function githubApiRequest(req: GitHttpRequest, deps: GithubTransportDeps): Promise<GitHttpResponse> {
  const target = parseTarget(req.url);
  if (!target) return reply(req, 404, "not a GitHub repository URL");
  const token = tokenFrom(req.headers as Record<string, string>);
  const session = new Session(deps, target, token);
  try {
    switch (target.action) {
      case "upload-ad":
        return reply(req, 200, await session.advertise("git-upload-pack"), "application/x-git-upload-pack-advertisement");
      case "receive-ad":
        return reply(req, 200, await session.advertise("git-receive-pack"), "application/x-git-receive-pack-advertisement");
      case "upload":
        return reply(req, 200, await session.uploadPack(await collectBody(req.body)), "application/x-git-upload-pack-result");
      case "receive":
        return reply(req, 200, await session.receivePack(await collectBody(req.body)), "application/x-git-receive-pack-result");
    }
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) {
        throw new Error("Репозиторий на GitHub пуст. Первую синхронизацию сделайте с ПК или телефона.");
      }
      // Без токена GitHub прячет приватный репозиторий за 404 — для git это «нужен вход».
      const status = !token && e.status === 404 ? 401 : e.status;
      if (status === 401 || status === 403 || status === 404) return reply(req, status, e.message);
      throw new Error(`GitHub API ${e.status}: ${e.message}`);
    }
    throw e;
  }
}
