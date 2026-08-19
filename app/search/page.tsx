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
      <TopBar back title="Поиск" hideDefaults />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        <div className="search-field">
          <Search size={16} className="flex-shrink-0 text-text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по всем карточкам..."
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-faint"
          />
        </div>
        {hits.length > 0 && (
          <div className="section-title">Найдено · {hits.length}</div>
        )}
        <div className="space-y-2">
          {hits.map((h) => (
            <Link
              key={`${h.deck.id}-${h.card.id}-${h.match}`}
              href={`/card?deck=${h.deck.id}&id=${h.card.id}`}
              className="row flex-col items-stretch justify-center gap-0.5 py-2.5"
            >
              <span className="text-[11px] text-text-faint">
                {h.deck.name} · совпало в {h.match === "front" ? "вопросе" : "ответе"}
              </span>
              <span className="row-title">{h.card.front.text}</span>
              <span className="row-meta">{h.card.back.text}</span>
            </Link>
          ))}
          {q && hits.length === 0 && (
            <div className="py-12 text-center text-[14px] text-text-muted">Ничего не найдено</div>
          )}
          {!q && (
            <div className="py-12 text-center text-[14px] text-text-muted">
              Начни вводить — ищем по вопросу и ответу во всех группах.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
