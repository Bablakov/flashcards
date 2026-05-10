"use client";

import { nanoid } from "nanoid";
import {
  Card,
  CardSchema,
  Deck,
  DeckSchema,
  DeckSettings,
  DeckSettingsSchema,
  DeckSummary,
} from "./types";
import { deckProgress } from "./srs";
import {
  DECKS_DIR,
  ensureDir,
  ensureRepoSkeleton,
  exists,
  listDir,
  readBytes,
  readJson,
  removePath,
  writeBytes,
  writeJson,
} from "./fs";

const DECK_FILE = "deck.json";
const CARDS_FILE = "cards.json";
const MEDIA_DIR = "media";

function deckPath(deckId: string) {
  return `${DECKS_DIR}/${deckId}`;
}
function deckMetaPath(deckId: string) {
  return `${deckPath(deckId)}/${DECK_FILE}`;
}
function deckCardsPath(deckId: string) {
  return `${deckPath(deckId)}/${CARDS_FILE}`;
}
function deckMediaDir(deckId: string) {
  return `${deckPath(deckId)}/${MEDIA_DIR}`;
}

function nowIso() {
  return new Date().toISOString();
}

export async function listDeckIds(): Promise<string[]> {
  await ensureRepoSkeleton();
  return await listDir(DECKS_DIR);
}

export async function getDeck(deckId: string): Promise<Deck | null> {
  if (!(await exists(deckMetaPath(deckId)))) return null;
  const raw = await readJson<unknown>(deckMetaPath(deckId));
  return DeckSchema.parse(raw);
}

export async function getCards(deckId: string): Promise<Card[]> {
  if (!(await exists(deckCardsPath(deckId)))) return [];
  const raw = await readJson<unknown>(deckCardsPath(deckId));
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => CardSchema.parse(it));
}

async function writeDeckMeta(deck: Deck): Promise<void> {
  await ensureDir(deckPath(deck.id));
  await writeJson(deckMetaPath(deck.id), deck);
}

async function writeCards(deckId: string, cards: Card[]): Promise<void> {
  await ensureDir(deckPath(deckId));
  await writeJson(deckCardsPath(deckId), cards);
}

export async function listDeckSummaries(): Promise<DeckSummary[]> {
  const ids = await listDeckIds();
  const out: DeckSummary[] = [];
  for (const id of ids) {
    const deck = await getDeck(id);
    if (!deck) continue;
    const cards = await getCards(id);
    const { learned, percent } = deckProgress(cards);
    out.push({ ...deck, cardCount: cards.length, progress: percent, learnedCount: learned });
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export interface CreateDeckInput {
  name: string;
  color?: string;
  image?: string | null;
  description?: string;
  frontLanguage?: string;
  backLanguage?: string;
}

export async function createDeck(input: CreateDeckInput | string, color = "#e36b6b"): Promise<Deck> {
  const params: CreateDeckInput =
    typeof input === "string" ? { name: input, color } : input;
  const id = nanoid(10);
  const now = nowIso();
  const settings = DeckSettingsSchema.parse({
    frontLanguage: params.frontLanguage ?? "ru",
    backLanguage: params.backLanguage ?? "en",
  });
  const deck: Deck = {
    id,
    name: params.name.trim() || "Без названия",
    color: params.color ?? color,
    image: params.image ?? null,
    description: params.description ?? "",
    settings,
    cardCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await ensureDir(deckPath(id));
  await ensureDir(deckMediaDir(id));
  await writeDeckMeta(deck);
  await writeCards(id, []);
  return deck;
}

export async function updateDeck(
  deckId: string,
  patch: Partial<Omit<Deck, "id" | "createdAt">>,
): Promise<Deck | null> {
  const deck = await getDeck(deckId);
  if (!deck) return null;
  const settings = patch.settings
    ? DeckSettingsSchema.parse({ ...deck.settings, ...patch.settings })
    : deck.settings;
  const updated: Deck = {
    ...deck,
    ...patch,
    settings,
    id: deck.id,
    createdAt: deck.createdAt,
    updatedAt: nowIso(),
  };
  await writeDeckMeta(updated);
  return updated;
}

export async function renameDeck(deckId: string, name: string): Promise<Deck | null> {
  return updateDeck(deckId, { name: name.trim() || undefined });
}

export async function setDeckColor(deckId: string, color: string): Promise<Deck | null> {
  return updateDeck(deckId, { color });
}

export async function setDeckSettings(
  deckId: string,
  settings: Partial<DeckSettings>,
): Promise<Deck | null> {
  return updateDeck(deckId, { settings: settings as DeckSettings });
}

export async function deleteDeck(deckId: string): Promise<void> {
  await removePath(deckPath(deckId));
}

export async function addCard(
  deckId: string,
  front: Partial<Card["front"]>,
  back: Partial<Card["back"]>,
): Promise<Card> {
  const deck = await getDeck(deckId);
  if (!deck) throw new Error("Deck not found");
  const cards = await getCards(deckId);
  const id = nanoid(10);
  const now = nowIso();
  const card: Card = {
    id,
    front: { text: "", image: null, audio: null, ...front },
    back: { text: "", image: null, audio: null, ...back },
    box: 1,
    goodCount: 0,
    badCount: 0,
    reviewCount: 0,
    lastReviewedAt: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  cards.push(card);
  await writeCards(deckId, cards);
  await writeDeckMeta({ ...deck, cardCount: cards.length, updatedAt: now });
  return card;
}

export async function updateCard(
  deckId: string,
  cardId: string,
  patch: Partial<Card>,
): Promise<Card | null> {
  const cards = await getCards(deckId);
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const old = cards[idx];
  const updated: Card = {
    ...old,
    ...patch,
    front: { ...old.front, ...(patch.front ?? {}) },
    back: { ...old.back, ...(patch.back ?? {}) },
    id: old.id,
    createdAt: old.createdAt,
    updatedAt: nowIso(),
  };
  cards[idx] = updated;
  await writeCards(deckId, cards);
  const deck = await getDeck(deckId);
  if (deck) await writeDeckMeta({ ...deck, updatedAt: updated.updatedAt });
  return updated;
}

export async function deleteCard(deckId: string, cardId: string): Promise<void> {
  const cards = await getCards(deckId);
  const target = cards.find((c) => c.id === cardId);
  const next = cards.filter((c) => c.id !== cardId);
  await writeCards(deckId, next);
  if (target) {
    for (const ref of [target.front.image, target.front.audio, target.back.image, target.back.audio]) {
      if (ref) await removePath(`${deckPath(deckId)}/${ref}`);
    }
  }
  const deck = await getDeck(deckId);
  if (deck) await writeDeckMeta({ ...deck, cardCount: next.length, updatedAt: nowIso() });
}

export async function saveMedia(
  deckId: string,
  cardId: string,
  side: "front" | "back" | "deck",
  kind: "image" | "audio",
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  await ensureDir(deckMediaDir(deckId));
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || (kind === "image" ? "webp" : "webm");
  const fileName = `${cardId}_${side}_${kind}.${safeExt}`;
  const relPath = `${MEDIA_DIR}/${fileName}`;
  const fullPath = `${deckPath(deckId)}/${relPath}`;
  await writeBytes(fullPath, bytes);
  return relPath;
}

export async function loadMediaDataUrl(deckId: string, relPath: string): Promise<string | null> {
  const fullPath = `${deckPath(deckId)}/${relPath}`;
  if (!(await exists(fullPath))) return null;
  const bytes = await readBytes(fullPath);
  const mime = guessMime(relPath);
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function guessMime(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
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
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}
