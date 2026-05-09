"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Card, Deck } from "@/lib/types";
import { getCards, listDeckSummaries } from "@/lib/repository";

interface Hit {
  deck: Deck;
  card: Card;
  match: "front" | "back";
}

export default function SearchPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [allCards, setAllCards] = useState<Map<string, Card[]>>(new Map());
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const ds = await listDeckSummaries();
      setDecks(ds);
      const map = new Map<string, Card[]>();
      for (const d of ds) {
        map.set(d.id, await getCards(d.id));
      }
      setAllCards(map);
    })();
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Hit[] = [];
    for (const d of decks) {
      const list = allCards.get(d.id) ?? [];
      for (const c of list) {
        if (c.front.text.toLowerCase().includes(term))
          out.push({ deck: d, card: c, match: "front" });
        else if (c.back.text.toLowerCase().includes(term))
          out.push({ deck: d, card: c, match: "back" });
      }
    }
    return out.slice(0, 200);
  }, [q, decks, allCards]);

  return (
    <>
      <TopBar back title="Поиск" rightSlot={<div className="w-10" />} />
      <main className="flex-1 space-y-3 px-4 pb-12 pt-2">
        <div className="flex items-center gap-2 rounded-xl bg-bg-soft px-3 py-2 ring-1 ring-white/5">
          <Search size={16} className="text-neutral-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по всем карточкам..."
            className="flex-1 bg-transparent outline-none placeholder:text-neutral-500"
          />
        </div>
        <div className="space-y-2">
          {hits.map((h) => (
            <Link
              key={`${h.deck.id}-${h.card.id}-${h.match}`}
              href={`/card?deck=${h.deck.id}&id=${h.card.id}`}
              className="block rounded-xl bg-bg-card p-3 ring-1 ring-white/5 hover:ring-white/15"
            >
              <div className="text-xs text-neutral-500">
                {h.deck.name} · {h.match === "front" ? "лицевая" : "обратная"}
              </div>
              <div className="mt-1 truncate text-base text-neutral-100">{h.card.front.text}</div>
              <div className="truncate text-sm text-neutral-400">{h.card.back.text}</div>
            </Link>
          ))}
          {q && hits.length === 0 && (
            <div className="py-12 text-center text-neutral-400">Ничего не найдено</div>
          )}
        </div>
      </main>
    </>
  );
}
