"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, Check, Plus, Save, Trash2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { Box, Card, Deck, languageInfo } from "@/lib/types";
import {
  addCard,
  deleteCard,
  getCards,
  getDeck,
  listGroupOptions,
  moveCard,
  saveMedia,
  updateCard,
  type GroupOption,
} from "@/lib/repository";
import { compressImage } from "@/lib/media";
import { ImageInput } from "@/components/ImageInput";
import { toast } from "@/components/Toaster";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";

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
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState(deckId);
  const [levelOpen, setLevelOpen] = useState(false);

  useEffect(() => {
    if (!deckId || !cardId) {
      setLoading(false);
      return;
    }
    (async () => {
      const [d, cards, opts] = await Promise.all([
        getDeck(deckId),
        getCards(deckId),
        listGroupOptions(),
      ]);
      setDeck(d);
      setGroups(opts);
      setGroupId(deckId);
      const found = cards.find((c) => c.id === cardId) ?? null;
      setCard(found);
      setLoading(false);
    })();
  }, [deckId, cardId]);

  /** Перенос карточки в другую группу — карточка живёт отдельным файлом, меняется одно поле. */
  async function handleMove(nextGroupId: string) {
    if (!card || nextGroupId === groupId) return;
    const ok = await moveCard(card.id, nextGroupId);
    if (!ok) {
      toast("Не удалось перенести карточку", "error");
      return;
    }
    setGroupId(nextGroupId);
    toast("Карточка перенесена", "success");
    router.replace(`/card?deck=${nextGroupId}&id=${card.id}`);
  }

  async function handleImagePicked(side: "front" | "back", file: File) {
    if (!card) return;
    const { bytes, ext } = await compressImage(file);
    const path = await saveMedia(deckId, card.id, side, "image", bytes, ext);
    const updated = await updateCard(deckId, card.id, {
      [side]: { ...card[side], image: path },
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

  async function handleSave() {
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
        title="Карточка"
        rightSlot={
          <button
            onClick={handleSave}
            className="icon-btn text-[var(--accent)]"
            disabled={saving}
            aria-label="Сохранить и вернуться"
          >
            <Check size={20} />
          </button>
        }
      />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        {/* Две стороны раньше шли одинаковыми блоками подряд, и было непонятно,
            где заканчивается лицевая. Теперь у лицевой акцентная полоса слева,
            между сторонами — стрелка «переворот». */}
        <Side
          title="Вопрос"
          subtitle="лицевая сторона"
          accent
          lang={front}
          deckId={deckId}
          card={card}
          side="front"
          onTextChange={(text) => setCard({ ...card, front: { ...card.front, text } })}
          onImagePicked={(f) => handleImagePicked("front", f)}
          onClearImage={() => handleClearImage("front")}
        />

        <div className="flex items-center gap-2 px-1 text-text-faint">
          <span className="h-px flex-1 bg-[var(--ring-base)]" />
          <ArrowDown size={14} />
          <span className="text-[11px]">переворот</span>
          <span className="h-px flex-1 bg-[var(--ring-base)]" />
        </div>

        <Side
          title="Ответ"
          subtitle="обратная сторона"
          lang={back}
          deckId={deckId}
          card={card}
          side="back"
          onTextChange={(text) => setCard({ ...card, back: { ...card.back, text } })}
          onImagePicked={(f) => handleImagePicked("back", f)}
          onClearImage={() => handleClearImage("back")}
        />

        {/* Прогресс занимал столько же места, сколько содержимое карточки.
            Теперь это одна строка, а ручная правка уровня — по запросу. */}
        <section className="surface space-y-3 py-3">
          <div className="flex items-center gap-2">
            <span className="level-dot" style={{ backgroundColor: BOX_COLORS[card.box] }} />
            <span className="text-[14px] text-text-primary">{BOX_LABEL[card.box]}</span>
            <span className="text-[12px] text-text-muted">
              · {card.reviewCount} повт. · {card.goodCount} хорошо · {card.badCount} плохо
            </span>
            <button
              className="ml-auto text-[12px] text-[var(--accent)]"
              onClick={() => setLevelOpen((v) => !v)}
            >
              {levelOpen ? "скрыть" : "изменить"}
            </button>
          </div>
          {levelOpen && (
            <div className="grid grid-cols-5 gap-1">
              {([1, 2, 3, 4, 5] as Box[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setCard({ ...card, box: b })}
                  className={`rounded-[10px] px-1 py-2 text-[11px] font-medium transition ${
                    card.box === b ? "text-white" : "bg-bg-soft text-text-muted"
                  }`}
                  style={card.box === b ? { backgroundColor: BOX_COLORS[b] } : undefined}
                >
                  {BOX_LABEL[b]}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="surface space-y-3 py-3">
          <label className="block">
            <div className="mb-1 section-title">Группа</div>
            <select value={groupId} onChange={(e) => handleMove(e.target.value)} className="field">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 section-title">Теги через запятую</div>
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
          </label>
        </section>
      </main>

      <BottomActions>
        <ActionButton
          icon={<Save size={20} />}
          label={saving ? "Сохраняю" : "Сохранить"}
          primary
          onClick={handleSave}
          disabled={saving}
        />
        <ActionButton
          icon={<Plus size={20} />}
          label="Ещё карточка"
          onClick={handleSaveAndAdd}
          disabled={saving}
        />
        <ActionButton icon={<Trash2 size={20} />} label="Удалить" onClick={handleDelete} />
      </BottomActions>
    </>
  );
}

interface SideProps {
  title: string;
  subtitle: string;
  accent?: boolean;
  lang: { code: string; name: string; flag: string } | null;
  deckId: string;
  card: Card;
  side: "front" | "back";
  onTextChange: (s: string) => void;
  onImagePicked: (f: File) => void;
  onClearImage: () => void;
}

function Side({
  title,
  subtitle,
  accent,
  lang,
  deckId,
  card,
  side,
  onTextChange,
  onImagePicked,
  onClearImage,
}: SideProps) {
  const data = card[side];

  return (
    <section
      className="surface space-y-3 py-3"
      style={accent ? { borderLeft: "3px solid var(--accent)" } : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold text-text-primary">{title}</span>
        <span className="text-[12px] text-text-faint">{subtitle}</span>
        {lang && (
          <span className="chip ml-auto">
            {lang.flag} {lang.code.toUpperCase()}
          </span>
        )}
      </div>
      <textarea
        value={data.text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={3}
        className="field min-h-[88px] resize-y"
        placeholder={side === "front" ? "Что спрашиваем..." : "Что должно вспомниться..."}
      />
      <ImageInput
        deckId={deckId}
        imagePath={data.image}
        onPicked={onImagePicked}
        onCleared={onClearImage}
        label="Изображение"
      />
    </section>
  );
}
