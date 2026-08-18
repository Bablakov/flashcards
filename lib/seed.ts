"use client";

/**
 * Демо-данные для первого запуска. Файлы в public/seed-data остались в старом
 * (плоском) виде, поэтому здесь они читаются как есть и раскладываются уже
 * через репозиторий — то есть сразу в формате 2 (группы + карточки + журнал).
 */

import { CardSchema, DeckSchema } from "./types";
import { addCard, createDeck, listDeckIds, updateCard } from "./repository";

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

  // Если группы уже есть (например, репозиторий склонирован) — ничего не подкладываем.
  if ((await listDeckIds()).length > 0) {
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

      const deck = DeckSchema.parse(await deckRes.json());
      const rawCards = await cardsRes.json();
      const cards = Array.isArray(rawCards)
        ? (rawCards as unknown[]).flatMap((c) => {
            try {
              return [CardSchema.parse(c)];
            } catch {
              return [];
            }
          })
        : [];

      const group = await createDeck({
        name: deck.name,
        color: deck.color,
        description: deck.description,
        frontLanguage: deck.settings.frontLanguage,
        backLanguage: deck.settings.backLanguage,
      });

      for (const card of cards) {
        const created = await addCard(
          group.id,
          { text: card.front.text },
          { text: card.back.text },
        );
        if (card.box > 1 || card.reviewCount > 0 || card.tags.length > 0) {
          await updateCard(group.id, created.id, {
            tags: card.tags,
            box: card.box,
            goodCount: card.goodCount,
            badCount: card.badCount,
            reviewCount: card.reviewCount,
          });
        }
      }
      count++;
    } catch {
      // повреждённая демо-колода не должна ломать первый запуск
    }
  }

  markSeedInstalled();
  return { installed: count > 0, count };
}
