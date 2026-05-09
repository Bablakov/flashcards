"use client";

import { Card, CardSchema, Deck, DeckSchema } from "./types";
import { ensureDir, ensureRepoSkeleton, writeJson, listDir } from "./fs";

const FLAG_KEY = "flashcards.seed.installed";

interface SeedManifest {
  generatedAt?: string;
  decks: string[];
  note?: string;
}

export async function isSeedInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(FLAG_KEY) === "1";
}

function markSeedInstalled() {
  window.localStorage.setItem(FLAG_KEY, "1");
}

export async function maybeInstallSeed(): Promise<{ installed: boolean; count: number }> {
  if (typeof window === "undefined") return { installed: false, count: 0 };
  if (await isSeedInstalled()) return { installed: false, count: 0 };

  await ensureRepoSkeleton();
  const existing = await listDir("/repo/decks");
  if (existing.length > 0) {
    markSeedInstalled();
    return { installed: false, count: 0 };
  }

  let manifest: SeedManifest;
  try {
    const res = await fetch("./seed-data/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as SeedManifest;
  } catch {
    markSeedInstalled();
    return { installed: false, count: 0 };
  }

  let count = 0;
  for (const deckId of manifest.decks) {
    try {
      const [deckRes, cardsRes] = await Promise.all([
        fetch(`./seed-data/decks/${deckId}/deck.json`, { cache: "no-store" }),
        fetch(`./seed-data/decks/${deckId}/cards.json`, { cache: "no-store" }),
      ]);
      if (!deckRes.ok || !cardsRes.ok) continue;
      const deckJson = (await deckRes.json()) as unknown;
      const cardsJson = (await cardsRes.json()) as unknown;

      const deck: Deck = DeckSchema.parse(deckJson);
      const cards: Card[] = Array.isArray(cardsJson)
        ? (cardsJson as unknown[]).map((c) => CardSchema.parse(c))
        : [];

      const dir = `/repo/decks/${deck.id}`;
      await ensureDir(dir);
      await ensureDir(`${dir}/media`);
      await writeJson(`${dir}/deck.json`, deck);
      await writeJson(`${dir}/cards.json`, cards);
      count++;
    } catch {
      // skip malformed deck
    }
  }

  markSeedInstalled();
  return { installed: count > 0, count };
}
