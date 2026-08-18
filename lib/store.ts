"use client";

/**
 * Низкоуровневое хранилище формата 2 (§5 спецификации).
 *
 *   meta.json                          версия формата
 *   settings.json                      синхронизируемые настройки
 *   groups/<id>.json                   группа (иерархия через parentId)
 *   cards/<id>.json                    карточка (только содержимое)
 *   media/<hash>.<ext>                 имя файла = хеш содержимого
 *   journal/<deviceId>/<YYYY-MM>.jsonl ответы, только дописывание
 *
 * Здесь нет бизнес-логики — только чтение/запись файлов и дерево групп.
 */

import {
  AppSettings,
  AppSettingsSchema,
  CardContent,
  CardContentSchema,
  FORMAT_VERSION,
  Group,
  GroupSchema,
  JournalEvent,
  JournalEventSchema,
  RepoMeta,
  RepoMetaSchema,
} from "./model";
import {
  REPO_ROOT,
  ensureDir,
  exists,
  flushFs,
  getPfs,
  listDir,
  readBytes,
  readJson,
  writeBytes,
  writeJson,
} from "./fs";
import { getDeviceId } from "./device";

export const META_FILE = `${REPO_ROOT}/meta.json`;
export const SETTINGS_FILE = `${REPO_ROOT}/settings.json`;
export const GROUPS_DIR = `${REPO_ROOT}/groups`;
export const CARDS_DIR = `${REPO_ROOT}/cards`;
export const MEDIA_DIR = `${REPO_ROOT}/media`;
export const JOURNAL_DIR = `${REPO_ROOT}/journal`;

export function nowIso() {
  return new Date().toISOString();
}

export async function ensureSkeleton(): Promise<void> {
  await ensureDir(REPO_ROOT);
  await ensureDir(GROUPS_DIR);
  await ensureDir(CARDS_DIR);
  await ensureDir(MEDIA_DIR);
  await ensureDir(JOURNAL_DIR);
}

/* ------------------------------------------------------------------ meta */

export async function readMeta(): Promise<RepoMeta | null> {
  if (!(await exists(META_FILE))) return null;
  try {
    return RepoMetaSchema.parse(await readJson<unknown>(META_FILE));
  } catch {
    return null;
  }
}

export async function writeMeta(meta: Partial<RepoMeta>): Promise<RepoMeta> {
  const current = (await readMeta()) ?? RepoMetaSchema.parse({});
  const next = RepoMetaSchema.parse({ ...current, ...meta, updatedAt: nowIso() });
  await ensureDir(REPO_ROOT);
  await writeJson(META_FILE, next);
  await flushFs();
  return next;
}

/**
 * Репозиторий записан более новой версией приложения → работаем только на чтение,
 * чтобы не испортить незнакомые данные (§6.2).
 */
export async function isReadOnly(): Promise<boolean> {
  const meta = await readMeta();
  return !!meta && meta.formatVersion > FORMAT_VERSION;
}

export class ReadOnlyRepoError extends Error {
  constructor() {
    super("Репозиторий создан более новой версией приложения — обновитесь, чтобы вносить изменения");
    this.name = "ReadOnlyRepoError";
  }
}

async function assertWritable(): Promise<void> {
  if (await isReadOnly()) throw new ReadOnlyRepoError();
}

/* ---------------------------------------------------------------- groups */

function groupPath(id: string) {
  return `${GROUPS_DIR}/${id}.json`;
}

export async function listGroups(includeDeleted = false): Promise<Group[]> {
  const names = await listDir(GROUPS_DIR);
  const out: Group[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const g = GroupSchema.parse(await readJson<unknown>(`${GROUPS_DIR}/${name}`));
      if (g.deleted && !includeDeleted) continue;
      out.push(g);
    } catch {
      // повреждённый файл не должен ронять весь список
    }
  }
  return out;
}

export async function getGroup(id: string): Promise<Group | null> {
  if (!id || !(await exists(groupPath(id)))) return null;
  try {
    const g = GroupSchema.parse(await readJson<unknown>(groupPath(id)));
    return g.deleted ? null : g;
  } catch {
    return null;
  }
}

export async function writeGroup(group: Group): Promise<Group> {
  await assertWritable();
  await ensureDir(GROUPS_DIR);
  const next = GroupSchema.parse({ ...group, updatedAt: nowIso() });
  await writeJson(groupPath(next.id), next);
  await flushFs();
  return next;
}

/** Прямые потомки группы (parentId === id); для корня — parentId === null. */
export function childrenOf(groups: Group[], parentId: string | null): Group[] {
  return groups
    .filter((g) => (g.parentId ?? null) === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * Все потомки группы вниз по дереву, включая её саму.
 * Защита от циклов (A → B → A) — обход с множеством посещённых.
 */
export function descendantIds(groups: Group[], rootId: string): string[] {
  const byParent = new Map<string | null, Group[]>();
  for (const g of groups) {
    const key = g.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(g);
    byParent.set(key, list);
  }
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return [...seen];
}

/** Путь от корня до группы — для хлебных крошек. */
export function pathTo(groups: Group[], id: string): Group[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const chain: Group[] = [];
  const seen = new Set<string>();
  let current = byId.get(id) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
  }
  return chain;
}

/**
 * Проверка, что назначение нового родителя не создаст цикл
 * (нельзя перенести группу внутрь собственного потомка).
 */
export function canReparent(groups: Group[], id: string, newParentId: string | null): boolean {
  if (!newParentId) return true;
  if (id === newParentId) return false;
  return !descendantIds(groups, id).includes(newParentId);
}

/* ----------------------------------------------------------------- cards */

function cardPath(id: string) {
  return `${CARDS_DIR}/${id}.json`;
}

export async function listCards(includeDeleted = false): Promise<CardContent[]> {
  const names = await listDir(CARDS_DIR);
  const out: CardContent[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const c = CardContentSchema.parse(await readJson<unknown>(`${CARDS_DIR}/${name}`));
      if (c.deleted && !includeDeleted) continue;
      out.push(c);
    } catch {
      // пропускаем повреждённый файл
    }
  }
  return out;
}

export async function getCard(id: string): Promise<CardContent | null> {
  if (!id || !(await exists(cardPath(id)))) return null;
  try {
    return CardContentSchema.parse(await readJson<unknown>(cardPath(id)));
  } catch {
    return null;
  }
}

export async function writeCard(card: CardContent): Promise<CardContent> {
  await assertWritable();
  await ensureDir(CARDS_DIR);
  const next = CardContentSchema.parse({ ...card, updatedAt: nowIso() });
  await writeJson(cardPath(next.id), next);
  // Без этого только что созданная карточка теряется при переходе в редактор.
  await flushFs();
  return next;
}

/* ----------------------------------------------------------------- media */

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array, limit = 20): string {
  let out = "";
  for (let i = 0; i < Math.min(bytes.length, limit); i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  }
  return out;
}

/** SHA-256 содержимого; если crypto.subtle недоступен — детерминированный запасной хеш. */
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const digest = await subtle.digest("SHA-256", buf);
    return toHex(new Uint8Array(digest));
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 + bytes[i] + i, 0x85ebca6b) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0") +
    bytes.length.toString(16).padStart(8, "0")
  );
}

function safeExt(ext: string, fallback = "bin"): string {
  const clean = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 6);
  return clean || fallback;
}

/**
 * Сохранение медиа по хешу содержимого: одинаковые байты дают одинаковое имя,
 * поэтому два устройства не могут создать разные файлы с одним именем —
 * бинарных конфликтов в git не возникает. Повторное сохранение бесплатно.
 */
export async function saveMediaBytes(bytes: Uint8Array, ext: string): Promise<string> {
  await assertWritable();
  await ensureDir(MEDIA_DIR);
  const name = `${await hashBytes(bytes)}.${safeExt(ext, "webp")}`;
  if (!(await exists(`${MEDIA_DIR}/${name}`))) {
    await writeBytes(`${MEDIA_DIR}/${name}`, bytes);
    await flushFs();
  }
  return name;
}

export async function loadMediaBytes(name: string): Promise<Uint8Array | null> {
  if (!name) return null;
  const path = name.includes("/") ? `${REPO_ROOT}/${name}` : `${MEDIA_DIR}/${name}`;
  if (!(await exists(path))) return null;
  return await readBytes(path);
}

export function guessMime(nameOrPath: string): string {
  const ext = nameOrPath.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

/**
 * Сборка мусора: удаляет файлы media/, на которые не ссылается ни одна живая
 * карточка и ни одна группа. Вызывается редко (мягкое удаление означает, что
 * ссылки живут дольше самих карточек).
 */
export async function gcMedia(): Promise<number> {
  await assertWritable();
  const used = new Set<string>();
  for (const c of await listCards(true)) {
    if (c.deleted) continue;
    for (const ref of [c.front.image, c.back.image]) if (ref) used.add(ref);
  }
  for (const g of await listGroups(true)) {
    if (g.deleted) continue;
    if (g.cover) used.add(g.cover);
  }
  let removed = 0;
  const pfs = getPfs();
  for (const name of await listDir(MEDIA_DIR)) {
    if (used.has(name)) continue;
    try {
      await pfs.unlink(`${MEDIA_DIR}/${name}`);
      removed++;
    } catch {
      // ignore
    }
  }
  return removed;
}

/* --------------------------------------------------------------- journal */

function journalMonth(iso: string): string {
  return iso.slice(0, 7);
}

async function journalFileFor(iso: string): Promise<string> {
  const dir = `${JOURNAL_DIR}/${getDeviceId()}`;
  await ensureDir(dir);
  return `${dir}/${journalMonth(iso)}.jsonl`;
}

/**
 * Дописывание событий. Каждое устройство пишет ТОЛЬКО в свой файл — поэтому
 * при слиянии двух офлайн-устройств конфликта не возникает в принципе.
 */
export async function appendJournal(events: JournalEvent[]): Promise<void> {
  if (events.length === 0) return;
  await assertWritable();
  const pfs = getPfs();
  const byFile = new Map<string, string[]>();
  for (const raw of events) {
    const ev = JournalEventSchema.parse({ ...raw, dev: raw.dev ?? getDeviceId() });
    const file = await journalFileFor(ev.t);
    const list = byFile.get(file) ?? [];
    list.push(JSON.stringify(ev));
    byFile.set(file, list);
  }
  for (const [file, lines] of byFile) {
    let prev = "";
    if (await exists(file)) {
      prev = (await pfs.readFile(file, "utf8")) as string;
      if (prev && !prev.endsWith("\n")) prev += "\n";
    }
    await pfs.writeFile(file, `${prev}${lines.join("\n")}\n`, "utf8");
  }
}

/** Все события всех устройств, отсортированные по времени. */
export async function readJournal(): Promise<JournalEvent[]> {
  const out: JournalEvent[] = [];
  const pfs = getPfs();
  for (const device of await listDir(JOURNAL_DIR)) {
    for (const file of await listDir(`${JOURNAL_DIR}/${device}`)) {
      if (!file.endsWith(".jsonl")) continue;
      let text = "";
      try {
        text = (await pfs.readFile(`${JOURNAL_DIR}/${device}/${file}`, "utf8")) as string;
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          out.push(JournalEventSchema.parse(JSON.parse(trimmed)));
        } catch {
          // битая строка не должна ронять историю
        }
      }
    }
  }
  out.sort((a, b) => a.t.localeCompare(b.t));
  return out;
}

/* -------------------------------------------------------------- settings */

export async function readSettings(): Promise<AppSettings> {
  if (!(await exists(SETTINGS_FILE))) return AppSettingsSchema.parse({});
  try {
    return AppSettingsSchema.parse(await readJson<unknown>(SETTINGS_FILE));
  } catch {
    return AppSettingsSchema.parse({});
  }
}

export async function writeSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await assertWritable();
  const current = await readSettings();
  const next = AppSettingsSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
  await ensureDir(REPO_ROOT);
  await writeJson(SETTINGS_FILE, next);
  await flushFs();
  return next;
}
