"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RotateCcw, Volume2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Card, MemoryLevel } from "@/lib/types";
import { getCards, loadMediaDataUrl, updateCard } from "@/lib/repository";

const LEVEL_COLORS: Record<number, string> = {
  0: "#6b7280",
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#06b6d4",
  6: "#6366f1",
};

export default function StudyWrapper() {
  return (
    <Suspense>
      <Study />
    </Suspense>
  );
}

function Study() {
  const sp = useSearchParams();
  const deckId = sp.get("deck") ?? "";
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!deckId) return;
    (async () => {
      const list = await getCards(deckId);
      const shuffled = list
        .map((c) => ({ c, k: Math.random() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.c);
      setCards(shuffled);
    })();
  }, [deckId]);

  const card = cards[idx] ?? null;
  const side = card ? (flipped ? card.back : card.front) : null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!side) {
        setImageUrl(null);
        setAudioUrl(null);
        return;
      }
      setImageUrl(side.image ? await loadMediaDataUrl(deckId, side.image) : null);
      setAudioUrl(side.audio ? await loadMediaDataUrl(deckId, side.audio) : null);
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [deckId, side]);

  function speak() {
    if (!side?.text) return;
    try {
      const u = new SpeechSynthesisUtterance(side.text);
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }

  function next() {
    setFlipped(false);
    setIdx((i) => Math.min(i + 1, cards.length - 1));
  }
  function prev() {
    setFlipped(false);
    setIdx((i) => Math.max(i - 1, 0));
  }

  async function setLevel(level: MemoryLevel) {
    if (!card) return;
    const updated = await updateCard(deckId, card.id, { level });
    if (updated) {
      const copy = [...cards];
      copy[idx] = updated;
      setCards(copy);
    }
  }

  if (cards.length === 0) {
    return (
      <>
        <TopBar back title="Тест" rightSlot={<div className="w-10" />} />
        <div className="flex-1 px-4 py-12 text-center text-neutral-400">Карточек нет</div>
      </>
    );
  }

  if (!card || !side) return null;

  return (
    <>
      <TopBar
        back
        title={`${idx + 1} / ${cards.length}`}
        rightSlot={
          <button
            onClick={() => setFlipped((f) => !f)}
            className="icon-btn"
            aria-label="Перевернуть"
          >
            <RotateCcw size={20} />
          </button>
        }
      />
      <main className="flex-1 px-4 pb-8 pt-2">
        <button
          onClick={() => setFlipped((f) => !f)}
          className="block w-full rounded-3xl bg-bg-card p-6 text-left ring-1 ring-white/5"
        >
          <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
            {flipped ? "Обратная" : "Лицевая"}
          </div>
          {imageUrl && (
            <div className="mb-4 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="max-h-[40vh] w-full object-contain" />
            </div>
          )}
          <div className="whitespace-pre-wrap text-2xl text-neutral-100">{side.text}</div>
          {audioUrl && (
            <div className="mt-4">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio
                controls
                src={audioUrl}
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </button>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={prev} className="icon-btn" disabled={idx === 0}>
            <ChevronLeft size={28} />
          </button>
          <button onClick={speak} className="pill-button">
            <Volume2 size={16} /> Озвучить
          </button>
          <button onClick={next} className="icon-btn" disabled={idx >= cards.length - 1}>
            <ChevronRight size={28} />
          </button>
        </div>

        <div className="mt-6 space-y-2">
          <div className="text-sm text-neutral-400">Оцени запоминание:</div>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5, 6] as MemoryLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold text-white transition ${
                  card.level === lvl ? "ring-2 ring-white" : ""
                }`}
                style={{ backgroundColor: LEVEL_COLORS[lvl] }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
