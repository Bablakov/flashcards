"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Card, MemoryLevel } from "@/lib/types";
import { deleteCard, getCards, loadMediaDataUrl, saveMedia, updateCard } from "@/lib/repository";
import { fileToBytes, mimeToExt } from "@/lib/media";
import { ImageInput } from "@/components/ImageInput";
import { AudioRecorderButton } from "@/components/AudioRecorderButton";
import { toast } from "@/components/Toaster";

const LEVEL_COLORS: Record<number, string> = {
  0: "#6b7280",
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#06b6d4",
  6: "#6366f1",
};

export default function CardEditorWrapper() {
  return (
    <Suspense>
      <CardEditor />
    </Suspense>
  );
}

function CardEditor() {
  const sp = useSearchParams();
  const router = useRouter();
  const deckId = sp.get("deck") ?? "";
  const cardId = sp.get("id") ?? "";

  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deckId || !cardId) {
      setLoading(false);
      return;
    }
    (async () => {
      const cards = await getCards(deckId);
      const found = cards.find((c) => c.id === cardId) ?? null;
      setCard(found);
      setLoading(false);
    })();
  }, [deckId, cardId]);

  async function handleImagePicked(side: "front" | "back", file: File) {
    if (!card) return;
    const { bytes, ext } = await fileToBytes(file);
    const path = await saveMedia(deckId, card.id, side, "image", bytes, ext);
    const updated = await updateCard(deckId, card.id, {
      [side]: { ...card[side], image: path },
    } as Partial<Card>);
    if (updated) setCard(updated);
  }

  async function handleAudioPicked(side: "front" | "back", blob: Blob, mime: string) {
    if (!card) return;
    const buf = await blob.arrayBuffer();
    const path = await saveMedia(
      deckId,
      card.id,
      side,
      "audio",
      new Uint8Array(buf),
      mimeToExt(mime),
    );
    const updated = await updateCard(deckId, card.id, {
      [side]: { ...card[side], audio: path },
    } as Partial<Card>);
    if (updated) setCard(updated);
  }

  async function handleClearImage(side: "front" | "back") {
    if (!card) return;
    const updated = await updateCard(deckId, card.id, {
      [side]: { ...card[side], image: null },
    } as Partial<Card>);
    if (updated) setCard(updated);
  }

  async function handleClearAudio(side: "front" | "back") {
    if (!card) return;
    const updated = await updateCard(deckId, card.id, {
      [side]: { ...card[side], audio: null },
    } as Partial<Card>);
    if (updated) setCard(updated);
  }

  async function handleSave() {
    if (!card) return;
    setSaving(true);
    try {
      await updateCard(deckId, card.id, card);
      toast("Сохранено", "success");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    if (!window.confirm("Удалить карточку?")) return;
    await deleteCard(deckId, card.id);
    router.replace(`/deck?id=${deckId}`);
  }

  if (loading) {
    return (
      <>
        <TopBar back title="Карточка" />
        <div className="px-4 py-12 text-center text-neutral-400">Загрузка...</div>
      </>
    );
  }
  if (!card) {
    return (
      <>
        <TopBar back title="Карточка" />
        <div className="px-4 py-12 text-center text-neutral-400">Карточка не найдена</div>
      </>
    );
  }

  return (
    <>
      <TopBar
        back
        title="Редактор"
        rightSlot={
          <>
            <button onClick={handleDelete} className="icon-btn text-red-400" aria-label="Удалить">
              <Trash2 size={20} />
            </button>
            <button onClick={handleSave} className="pill-button" disabled={saving}>
              <Save size={16} /> {saving ? "..." : "Сохранить"}
            </button>
          </>
        }
      />
      <main className="flex-1 space-y-6 px-4 pb-12 pt-2">
        <Side
          title="Лицевая сторона"
          deckId={deckId}
          card={card}
          side="front"
          onTextChange={(text) => setCard({ ...card, front: { ...card.front, text } })}
          onImagePicked={(f) => handleImagePicked("front", f)}
          onAudioPicked={(b, m) => handleAudioPicked("front", b, m)}
          onClearImage={() => handleClearImage("front")}
          onClearAudio={() => handleClearAudio("front")}
        />
        <Side
          title="Обратная сторона"
          deckId={deckId}
          card={card}
          side="back"
          onTextChange={(text) => setCard({ ...card, back: { ...card.back, text } })}
          onImagePicked={(f) => handleImagePicked("back", f)}
          onAudioPicked={(b, m) => handleAudioPicked("back", b, m)}
          onClearImage={() => handleClearImage("back")}
          onClearAudio={() => handleClearAudio("back")}
        />

        <section className="space-y-3">
          <div className="text-sm font-medium text-neutral-300">Уровень запоминания</div>
          <div className="flex flex-wrap gap-2">
            {([0, 1, 2, 3, 4, 5, 6] as MemoryLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setCard({ ...card, level: lvl })}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                  card.level === lvl ? "ring-2 ring-white" : "ring-1 ring-white/10"
                }`}
                style={{ backgroundColor: LEVEL_COLORS[lvl], color: "white" }}
              >
                {lvl === 0 ? "—" : lvl}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-sm font-medium text-neutral-300">Теги (через запятую)</div>
          <input
            value={card.tags.join(", ")}
            onChange={(e) =>
              setCard({
                ...card,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            className="field"
            placeholder="например: бизнес, мотивация"
          />
        </section>
      </main>
    </>
  );
}

interface SideProps {
  title: string;
  deckId: string;
  card: Card;
  side: "front" | "back";
  onTextChange: (s: string) => void;
  onImagePicked: (f: File) => void;
  onAudioPicked: (b: Blob, m: string) => void;
  onClearImage: () => void;
  onClearAudio: () => void;
}

function Side({
  title,
  deckId,
  card,
  side,
  onTextChange,
  onImagePicked,
  onAudioPicked,
  onClearImage,
  onClearAudio,
}: SideProps) {
  const data = card[side];
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!data.audio) {
        setAudioUrl(null);
        return;
      }
      const url = await loadMediaDataUrl(deckId, data.audio);
      if (mounted) setAudioUrl(url);
    })();
    return () => {
      mounted = false;
    };
  }, [deckId, data.audio]);

  return (
    <section className="space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
      <div className="font-display text-2xl text-neutral-100">{title}</div>
      <textarea
        value={data.text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={4}
        className="field min-h-[120px] resize-y"
        placeholder="Текст..."
      />
      <ImageInput
        deckId={deckId}
        imagePath={data.image}
        onPicked={onImagePicked}
        onCleared={onClearImage}
        label="Изображение"
      />
      <div className="space-y-2">
        <div className="text-sm font-medium text-neutral-300">Аудио</div>
        {audioUrl ? (
          <div className="flex items-center gap-2 rounded-xl bg-bg-soft p-3 ring-1 ring-white/5">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={audioUrl} className="flex-1" />
            <button
              type="button"
              onClick={onClearAudio}
              className="rounded-full p-2 text-red-300 hover:bg-red-500/10"
              aria-label="Удалить аудио"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <AudioRecorderButton onRecorded={onAudioPicked} />
        )}
      </div>
    </section>
  );
}
