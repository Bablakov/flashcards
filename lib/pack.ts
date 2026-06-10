"use client";

import { Deck } from "./types";
import {
  addCard,
  createDeck,
  getCards,
  getDeck,
  loadMediaDataUrl,
  saveMedia,
  updateCard,
  updateDeck,
} from "./repository";

export const FCDECK_FORMAT = "flashcards-editor.deck";
export const FCDECK_VERSION = 1;

interface PackedMedia {
  ext: string;
  mime: string;
  data: string;
}

interface PackedCardSide {
  text: string;
  imageRef: string | null;
  audioRef: string | null;
}

interface PackedCard {
  id: string;
  front: PackedCardSide;
  back: PackedCardSide;
  box: number;
  goodCount: number;
  badCount: number;
  reviewCount: number;
  lastReviewedAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PackedDeck {
  format: typeof FCDECK_FORMAT;
  version: number;
  exportedAt: string;
  withMedia: boolean;
  deck: {
    name: string;
    color: string;
    description: string;
    image: string | null;
    settings: Deck["settings"];
  };
  cards: PackedCard[];
  media: Record<string, PackedMedia>;
}

function extFromPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : "bin";
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
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

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

export async function packDeck(deckId: string, withMedia: boolean): Promise<PackedDeck> {
  const deck = await getDeck(deckId);
  if (!deck) throw new Error("Deck not found");
  const cards = await getCards(deckId);

  const media: Record<string, PackedMedia> = {};
  const collected = new Set<string>();

  async function collect(path: string | null): Promise<string | null> {
    if (!path) return null;
    if (!withMedia) return null;
    if (collected.has(path)) return path;
    const url = await loadMediaDataUrl(deckId, path);
    if (!url) return null;
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    media[path] = { ext: extFromPath(path), mime: m[1], data: m[2] };
    collected.add(path);
    return path;
  }

  const deckImage = await collect(deck.image);

  const packedCards: PackedCard[] = [];
  for (const c of cards) {
    const frontImage = await collect(c.front.image);
    const frontAudio = await collect(c.front.audio);
    const backImage = await collect(c.back.image);
    const backAudio = await collect(c.back.audio);
    packedCards.push({
      id: c.id,
      front: { text: c.front.text, imageRef: frontImage, audioRef: frontAudio },
      back: { text: c.back.text, imageRef: backImage, audioRef: backAudio },
      box: c.box,
      goodCount: c.goodCount,
      badCount: c.badCount,
      reviewCount: c.reviewCount,
      lastReviewedAt: c.lastReviewedAt,
      tags: c.tags,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  }

  return {
    format: FCDECK_FORMAT,
    version: FCDECK_VERSION,
    exportedAt: new Date().toISOString(),
    withMedia,
    deck: {
      name: deck.name,
      color: deck.color,
      description: deck.description,
      image: deckImage,
      settings: deck.settings,
    },
    cards: packedCards,
    media,
  };
}

export function isPackedDeck(value: unknown): value is PackedDeck {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.format === FCDECK_FORMAT && typeof v.version === "number";
}

async function unpackMedia(
  newDeckId: string,
  cardId: string,
  side: "front" | "back" | "deck",
  kind: "image" | "audio",
  originalPath: string | null,
  pack: PackedDeck,
): Promise<string | null> {
  if (!originalPath) return null;
  const meta = pack.media[originalPath];
  if (!meta) return null;
  const dataUrl = `data:${meta.mime || mimeFromExt(meta.ext)};base64,${meta.data}`;
  const { bytes } = dataUrlToBytes(dataUrl);
  return await saveMedia(newDeckId, cardId, side, kind, bytes, meta.ext);
}

export interface ImportPackedResult {
  deckId: string;
  cardCount: number;
  mediaCount: number;
}

export async function importPackedDeck(pack: PackedDeck): Promise<ImportPackedResult> {
  const created = await createDeck({
    name: pack.deck.name || "Импортированная колода",
    color: pack.deck.color,
    description: pack.deck.description,
    frontLanguage: pack.deck.settings?.frontLanguage,
    backLanguage: pack.deck.settings?.backLanguage,
    image: null,
  });

  const deckImagePath = await unpackMedia(
    created.id,
    "cover",
    "deck",
    "image",
    pack.deck.image,
    pack,
  );

  await updateDeck(created.id, {
    image: deckImagePath,
    settings: pack.deck.settings,
  });

  let mediaCount = deckImagePath ? 1 : 0;

  for (const c of pack.cards) {
    const fresh = await addCard(
      created.id,
      { text: c.front.text || "" },
      { text: c.back.text || "" },
    );
    const frontImage = await unpackMedia(created.id, fresh.id, "front", "image", c.front.imageRef, pack);
    const frontAudio = await unpackMedia(created.id, fresh.id, "front", "audio", c.front.audioRef, pack);
    const backImage = await unpackMedia(created.id, fresh.id, "back", "image", c.back.imageRef, pack);
    const backAudio = await unpackMedia(created.id, fresh.id, "back", "audio", c.back.audioRef, pack);
    mediaCount += [frontImage, frontAudio, backImage, backAudio].filter(Boolean).length;
    await updateCard(created.id, fresh.id, {
      front: { text: c.front.text, image: frontImage, audio: frontAudio },
      back: { text: c.back.text, image: backImage, audio: backAudio },
      box: (c.box as 1 | 2 | 3 | 4 | 5) ?? 1,
      goodCount: c.goodCount ?? 0,
      badCount: c.badCount ?? 0,
      reviewCount: c.reviewCount ?? 0,
      lastReviewedAt: c.lastReviewedAt ?? null,
      tags: c.tags ?? [],
    });
  }

  return { deckId: created.id, cardCount: pack.cards.length, mediaCount };
}

export function safeFileName(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N}_\- ]+/gu, "")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "deck"
  );
}
