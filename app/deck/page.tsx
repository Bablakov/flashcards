"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Play,
  FileSpreadsheet,
  Download,
  Search,
  Sliders,
  Sparkles,
  Pencil,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { CardPreview } from "@/components/CardPreview";
import { Card, Deck, languageInfo } from "@/lib/types";
import {
  addCard,
  deleteCard,
  getCards,
  getDeck,
  updateDeck,
} from "@/lib/repository";
import { toast } from "@/components/Toaster";
import { parseCsv, cardsToCsv } from "@/lib/csv";
import { DeckEditorModal, persistPendingDeckImage } from "@/components/DeckEditorModal";

type SortMode =
  | "custom"
  | "shuffle"
  | "createdAsc"
  | "createdDesc"
  | "alphaAsc"
  | "alphaDesc"
  | "boxAsc"
  | "boxDesc";

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
  const [sort, setSort] = useState<SortMode>("createdDesc");
  const [showSort, setShowSort] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

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
      case "boxAsc":
        list.sort((a, b) => a.box - b.box);
        break;
      case "boxDesc":
        list.sort((a, b) => b.box - a.box);
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

  async function handleSaveDeck(val: {
    name: string;
    color: string;
    image: string | null;
    description: string;
    frontLanguage: string;
    backLanguage: string;
  }) {
    const persistedImage = await persistPendingDeckImage(deckId, val.image);
    await updateDeck(deckId, {
      name: val.name,
      color: val.color,
      image: persistedImage,
      description: val.description,
      settings: {
        frontLanguage: val.frontLanguage,
        backLanguage: val.backLanguage,
      } as never,
    });
    toast("Сохранено", "success");
    setEditorOpen(false);
    await refresh();
  }

  if (!deckId) {
    return (
      <>
        <TopBar back title="Колода" />
        <div className="px-4 py-12 text-center text-text-muted">Колода не выбрана</div>
      </>
    );
  }

  const front = deck ? languageInfo(deck.settings.frontLanguage) : null;
  const back = deck ? languageInfo(deck.settings.backLanguage) : null;

  return (
    <>
      <TopBar
        title={deck?.name ?? ""}
        back
        rightSlot={
          <>
            <button className="icon-btn" onClick={() => setEditorOpen(true)} aria-label="Редактировать колоду">
              <Pencil size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSort((v) => !v)}
              aria-label="Сортировка"
            >
              <Sliders size={20} />
            </button>
          </>
        }
      />

      <main className="flex-1 px-4 pb-28 pt-2">
        {deck && (
          <div className="mb-3 flex items-center gap-2 text-xs text-text-muted">
            {front && (
              <span className="lang-chip">
                {front.flag} {front.code.toUpperCase()}
              </span>
            )}
            <span className="text-text-faint">→</span>
            {back && (
              <span className="lang-chip">
                {back.flag} {back.code.toUpperCase()}
              </span>
            )}
            <span className="ml-2">{deck.cardCount} карт.</span>
            {deck.description && (
              <span className="ml-auto truncate text-text-faint">{deck.description}</span>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-bg-soft px-3 py-2 ring-1 ring-[var(--ring-base)]">
            <Search size={16} className="text-text-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
            />
          </div>
        </div>

        {showSort && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-bg-card p-3 ring-1 ring-[var(--ring-base)]">
            {(
              [
                ["custom", "По умолчанию"],
                ["shuffle", "Перемешать"],
                ["createdAsc", "Создано ↑"],
                ["createdDesc", "Создано ↓"],
                ["alphaAsc", "А-Я"],
                ["alphaDesc", "Я-А"],
                ["boxAsc", "Слабые → сильные"],
                ["boxDesc", "Сильные → слабые"],
              ] as [SortMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-lg px-3 py-2 text-left text-sm transition ${sort === k ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-text-secondary hover:bg-[var(--ring-base)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="py-12 text-center text-text-muted">Загрузка...</div>}

        {!loading && visible.length === 0 && (
          <div className="py-12 text-center text-text-muted">
            Карточек нет. Нажми «Добавить» или импортируй CSV.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((card) => (
            <CardPreview
              key={card.id}
              deckId={deckId}
              card={card}
              onClick={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              onEdit={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              onDelete={() => handleDelete(card.id)}
            />
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

      {deck && (
        <DeckEditorModal
          open={editorOpen}
          title="Редактировать колоду"
          deckId={deckId}
          initial={{
            name: deck.name,
            color: deck.color,
            image: deck.image,
            description: deck.description,
            frontLanguage: deck.settings.frontLanguage,
            backLanguage: deck.settings.backLanguage,
          }}
          onSave={handleSaveDeck}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}
