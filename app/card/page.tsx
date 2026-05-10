"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2, Volume2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Box, Card, Deck, languageInfo } from "@/lib/types";
import {
  addCard,
  deleteCard,
  getCards,
  getDeck,
  loadMediaDataUrl,
  saveMedia,
  updateCard,
} from "@/lib/repository";
import { fileToBytes, mimeToExt } from "@/lib/media";
import { ImageInput } from "@/components/ImageInput";
import { AudioRecorderButton } from "@/components/AudioRecorderButton";
import { toast } from "@/components/Toaster";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";
import { speak } from "@/lib/tts";

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

  const [deck, setDeck] = useState<Deck | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deckId || !cardId) {
      setLoading(false);
      return;
    }
    (async () => {
      const [d, cards] = await Promise.all([getDeck(deckId), getCards(deckId)]);
      setDeck(d);
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

  async function handleSaveAndBack() {
    if (!card) return;
    setSaving(true);
    try {
      await updateCard(deckId, card.id, card);
      router.replace(`/deck?id=${deckId}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndAdd() {
    if (!card) return;
    setSaving(true);
    try {
      await updateCard(deckId, card.id, card);
      const created = await addCard(deckId, { text: "" }, { text: "" });
      router.replace(`/card?deck=${deckId}&id=${created.id}`);
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
        <div className="px-4 py-12 text-center text-text-muted">Загрузка...</div>
      </>
    );
  }
  if (!card) {
    return (
      <>
        <TopBar back title="Карточка" />
        <div className="px-4 py-12 text-center text-text-muted">Карточка не найдена</div>
      </>
    );
  }

  const front = deck ? languageInfo(deck.settings.frontLanguage) : null;
  const back = deck ? languageInfo(deck.settings.backLanguage) : null;

  return (
    <>
      <TopBar
        back
        title="Редактор"
        rightSlot={
          <>
            <button onClick={handleDelete} className="icon-btn text-red-500" aria-label="Удалить">
              <Trash2 size={18} />
            </button>
            <button onClick={handleSave} className="pill-button" disabled={saving}>
              <Save size={16} /> {saving ? "..." : "Сохр."}
            </button>
          </>
        }
      />
      <main className="flex-1 space-y-5 px-4 pb-12 pt-2">
        <Side
          title="Лицевая сторона"
          lang={front}
          deckId={deckId}
          card={card}
          side="front"
          deck={deck}
          onTextChange={(text) => setCard({ ...card, front: { ...card.front, text } })}
          onImagePicked={(f) => handleImagePicked("front", f)}
          onAudioPicked={(b, m) => handleAudioPicked("front", b, m)}
          onClearImage={() => handleClearImage("front")}
          onClearAudio={() => handleClearAudio("front")}
        />
        <Side
          title="Обратная сторона"
          lang={back}
          deckId={deckId}
          card={card}
          side="back"
          deck={deck}
          onTextChange={(text) => setCard({ ...card, back: { ...card.back, text } })}
          onImagePicked={(f) => handleImagePicked("back", f)}
          onAudioPicked={(b, m) => handleAudioPicked("back", b, m)}
          onClearImage={() => handleClearImage("back")}
          onClearAudio={() => handleClearAudio("back")}
        />

        <section className="space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="text-sm font-medium text-text-secondary">Прогресс запоминания</div>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as Box[]).map((b) => (
              <button
                key={b}
                onClick={() => setCard({ ...card, box: b })}
                className={`flex flex-col items-center rounded-xl px-2 py-2 text-[11px] font-medium transition ${
                  card.box === b ? "text-white" : "bg-bg-soft text-text-muted"
                }`}
                style={card.box === b ? { backgroundColor: BOX_COLORS[b] } : undefined}
              >
                <span>Bx{b}</span>
                <span className="text-[10px] opacity-90">{BOX_LABEL[b]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-text-muted">
            <div>Повторов: {card.reviewCount}</div>
            <div>Хорошо: {card.goodCount}</div>
            <div>Плохо: {card.badCount}</div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-sm font-medium text-text-secondary">Теги (через запятую)</div>
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={handleSaveAndBack}
            className="pill-button w-full justify-center bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
            disabled={saving}
          >
            <ArrowLeft size={16} /> Сохранить и вернуться
          </button>
          <button
            onClick={handleSaveAndAdd}
            className="pill-button w-full justify-center bg-[var(--accent)]/15 text-[var(--accent)]"
            disabled={saving}
          >
            <Plus size={16} /> Сохранить и добавить ещё
          </button>
        </div>
      </main>
    </>
  );
}

interface SideProps {
  title: string;
  lang: { code: string; name: string; flag: string } | null;
  deckId: string;
  card: Card;
  deck: Deck | null;
  side: "front" | "back";
  onTextChange: (s: string) => void;
  onImagePicked: (f: File) => void;
  onAudioPicked: (b: Blob, m: string) => void;
  onClearImage: () => void;
  onClearAudio: () => void;
}

function Side({
  title,
  lang,
  deckId,
  card,
  deck,
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

  function trySpeak() {
    if (!data.text.trim() || !deck) return;
    const langCode = side === "front" ? deck.settings.frontLanguage : deck.settings.backLanguage;
    const rate = side === "front" ? deck.settings.frontSpeechSpeed : deck.settings.backSpeechSpeed;
    speak(data.text, langCode, rate);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
      <div className="flex items-center justify-between">
        <div className="font-display text-2xl text-text-primary">{title}</div>
        {lang && (
          <span className="lang-chip">
            {lang.flag} {lang.code.toUpperCase()}
          </span>
        )}
      </div>
      <div className="relative">
        <textarea
          value={data.text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={4}
          className="field min-h-[120px] resize-y pr-12"
          placeholder="Текст..."
        />
        <button
          type="button"
          onClick={trySpeak}
          className="absolute right-2 top-2 icon-btn h-9 w-9"
          aria-label="Озвучить"
          title="Озвучить"
        >
          <Volume2 size={16} />
        </button>
      </div>
      <ImageInput
        deckId={deckId}
        imagePath={data.image}
        onPicked={onImagePicked}
        onCleared={onClearImage}
        label="Изображение"
      />
      <div className="space-y-2">
        <div className="text-sm font-medium text-text-secondary">Аудио</div>
        {audioUrl ? (
          <div className="flex items-center gap-2 rounded-xl bg-bg-soft p-3 ring-1 ring-[var(--ring-base)]">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={audioUrl} className="flex-1" />
            <button
              type="button"
              onClick={onClearAudio}
              className="rounded-full p-2 text-red-500 hover:bg-red-500/10"
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
