"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Play, FileSpreadsheet, Download, Search, Sliders, Sparkles } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { CardPreview } from "@/components/CardPreview";
import { Card, Deck } from "@/lib/types";
import { addCard, deleteCard, getCards, getDeck } from "@/lib/repository";
import { toast } from "@/components/Toaster";
import { parseCsv, cardsToCsv } from "@/lib/csv";

type SortMode =
  | "custom"
  | "shuffle"
  | "createdAsc"
  | "createdDesc"
  | "alphaAsc"
  | "alphaDesc"
  | "levelAsc"
  | "levelDesc";

export default function DeckPageWrapper() {
  return (
    <Suspense>
      <DeckPage />
    </Suspense>
  );
}

function DeckPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const deckId = sp.get("id") ?? "";
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("custom");
  const [showSort, setShowSort] = useState(false);

  async function refresh() {
    if (!deckId) return;
    setLoading(true);
    try {
      const d = await getDeck(deckId);
      setDeck(d);
      setCards(await getCards(deckId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [deckId]);

  const visible = useMemo(() => {
    let list = [...cards];
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(
        (c) => c.front.text.toLowerCase().includes(q) || c.back.text.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "shuffle":
        list = list.map((c) => ({ c, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.c);
        break;
      case "createdAsc":
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "createdDesc":
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "alphaAsc":
        list.sort((a, b) => a.front.text.localeCompare(b.front.text, "ru"));
        break;
      case "alphaDesc":
        list.sort((a, b) => b.front.text.localeCompare(a.front.text, "ru"));
        break;
      case "levelAsc":
        list.sort((a, b) => a.level - b.level);
        break;
      case "levelDesc":
        list.sort((a, b) => b.level - a.level);
        break;
    }
    return list;
  }, [cards, filter, sort]);

  async function handleAdd() {
    const card = await addCard(deckId, { text: "" }, { text: "" });
    router.push(`/card?deck=${deckId}&id=${card.id}`);
  }

  async function handleDelete(cardId: string) {
    if (!window.confirm("Удалить карточку?")) return;
    await deleteCard(deckId, cardId);
    await refresh();
  }

  async function handleImportCsv() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const text = await f.text();
      try {
        const rows = await parseCsv(text);
        for (const r of rows) {
          await addCard(deckId, { text: r.front }, { text: r.back });
        }
        toast(`Импортировано: ${rows.length}`, "success");
        await refresh();
      } catch (e: unknown) {
        toast(`CSV ошибка: ${(e as Error).message}`, "error");
      }
    };
    input.click();
  }

  function handleExportCsv() {
    const csv = cardsToCsv(cards);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck?.name || "deck"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!deckId) {
    return (
      <>
        <TopBar back title="Колода" />
        <div className="px-4 py-12 text-center text-neutral-400">Колода не выбрана</div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={deck?.name ?? ""}
        back
        rightSlot={
          <button
            className="icon-btn"
            onClick={() => setShowSort((v) => !v)}
            aria-label="Сортировка"
          >
            <Sliders size={20} />
          </button>
        }
      />

      <main className="flex-1 px-4 pb-28 pt-2">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-bg-soft px-3 py-2 ring-1 ring-white/5">
            <Search size={16} className="text-neutral-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
          </div>
        </div>

        {showSort && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-bg-card p-3 ring-1 ring-white/5">
            {(
              [
                ["custom", "Пользовательский"],
                ["shuffle", "Перемешать"],
                ["createdAsc", "Создано ↑"],
                ["createdDesc", "Создано ↓"],
                ["alphaAsc", "А-Я"],
                ["alphaDesc", "Я-А"],
                ["levelAsc", "Уровень ↑"],
                ["levelDesc", "Уровень ↓"],
              ] as [SortMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-lg px-3 py-2 text-left text-sm ${sort === k ? "bg-accent/20 text-accent" : "text-neutral-300 hover:bg-white/5"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="py-12 text-center text-neutral-400">Загрузка...</div>}

        {!loading && visible.length === 0 && (
          <div className="py-12 text-center text-neutral-400">
            Карточек нет. Нажми «Добавить карточку» или импортируй CSV.
          </div>
        )}

        <div className="space-y-3">
          {visible.map((card) => (
            <div key={card.id} className="space-y-2">
              <CardPreview
                deckId={deckId}
                card={card}
                side="front"
                onClick={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              />
              <CardPreview
                deckId={deckId}
                card={card}
                side="back"
                onClick={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              />
              <div className="flex items-center justify-end gap-2 px-1">
                <Link
                  href={`/card?deck=${deckId}&id=${card.id}`}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  редактировать
                </Link>
                <button
                  onClick={() => handleDelete(card.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      <BottomActions>
        <ActionButton
          icon={<Play size={22} />}
          label="Тест"
          onClick={() => router.push(`/study?deck=${deckId}`)}
          disabled={cards.length === 0}
        />
        <ActionButton icon={<Plus size={22} />} label="Добавить" onClick={handleAdd} />
        <ActionButton icon={<FileSpreadsheet size={22} />} label="Импорт" onClick={handleImportCsv} />
        <ActionButton
          icon={<Download size={22} />}
          label="Экспорт"
          onClick={handleExportCsv}
          disabled={cards.length === 0}
        />
        <ActionButton
          icon={<Sparkles size={22} />}
          label="Опции"
          onClick={() => router.push(`/options?deck=${deckId}`)}
        />
      </BottomActions>
    </>
  );
}
