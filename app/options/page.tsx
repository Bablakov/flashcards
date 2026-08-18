"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Save } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Box, Deck, DeckSettings, DeckSettingsSchema, LANGUAGES } from "@/lib/types";
import { getDeck, setDeckSettings } from "@/lib/repository";
import { toast } from "@/components/Toaster";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";

export default function OptionsWrapper() {
  return (
    <Suspense>
      <DeckOptionsPage />
    </Suspense>
  );
}

function DeckOptionsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const deckId = sp.get("deck") ?? "";
  const [deck, setDeck] = useState<Deck | null>(null);
  const [s, setS] = useState<DeckSettings>(() => DeckSettingsSchema.parse({}));

  const [studyCount, setStudyCount] = useState(20);
  const [studyBoxes, setStudyBoxes] = useState<Box[]>([1, 2, 3]);

  useEffect(() => {
    if (!deckId) return;
    (async () => {
      const d = await getDeck(deckId);
      setDeck(d);
      if (d) setS(d.settings);
    })();
  }, [deckId]);

  async function handleSave() {
    await setDeckSettings(deckId, s);
    toast("Сохранено", "success");
  }

  function toggleBox(b: Box) {
    setStudyBoxes((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  function startCustom() {
    const params = new URLSearchParams({ deck: deckId, mode: "custom", count: String(studyCount) });
    if (studyBoxes.length) params.set("boxes", studyBoxes.join(","));
    router.push(`/study?${params.toString()}`);
  }

  return (
    <>
      <TopBar back title="Опции колоды" rightSlot={<div className="w-10" />} />
      <main className="flex-1 space-y-4 px-4 pb-16 pt-2">
        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-4 text-base font-semibold text-text-primary">Языки сторон</div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Язык лицевой">
                <select
                  value={s.frontLanguage}
                  onChange={(e) => setS((x) => ({ ...x, frontLanguage: e.target.value }))}
                  className="field"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Язык обратной">
                <select
                  value={s.backLanguage}
                  onChange={(e) => setS((x) => ({ ...x, backLanguage: e.target.value }))}
                  className="field"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-4 text-base font-semibold text-text-primary">Время ожидания</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="До переворота (сек)">
              <input
                type="number"
                step="0.5"
                min={0}
                value={s.flipDelay}
                onChange={(e) => setS((x) => ({ ...x, flipDelay: Number(e.target.value) }))}
                className="field"
              />
            </Field>
            <Field label="До следующей (сек)">
              <input
                type="number"
                step="0.5"
                min={0}
                value={s.nextDelay}
                onChange={(e) => setS((x) => ({ ...x, nextDelay: Number(e.target.value) }))}
                className="field"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-4 text-base font-semibold text-text-primary">Настраиваемое тестирование</div>
          <p className="mb-3 text-xs text-text-muted">
            Выбери, сколько карточек показать и из каких корзин (по убыванию знания: новая → выучено).
            Полезно для повторения слабых карточек или быстрого блиц-теста.
          </p>
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-text-secondary">Карточек</label>
            <input
              type="number"
              min={1}
              max={500}
              value={studyCount}
              onChange={(e) => setStudyCount(Math.max(1, Number(e.target.value) || 1))}
              className="field w-28 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as Box[]).map((b) => (
              <button
                key={b}
                onClick={() => toggleBox(b)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  studyBoxes.includes(b) ? "text-white" : "bg-bg-soft text-text-secondary"
                }`}
                style={studyBoxes.includes(b) ? { backgroundColor: BOX_COLORS[b] } : undefined}
              >
                {BOX_LABEL[b]}
              </button>
            ))}
          </div>
          <button onClick={startCustom} className="pill-button bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30">
            <Play size={16} /> Запустить тест
          </button>
        </section>

        <button
          onClick={handleSave}
          className="pill-button w-full justify-center bg-[var(--accent)]/15 text-[var(--accent)]"
        >
          <Save size={16} /> Сохранить настройки
        </button>

        {deck && (
          <div className="text-xs text-text-faint">
            Колода: {deck.name} · карт: {deck.cardCount} · обновлено:{" "}
            {new Date(deck.updatedAt).toLocaleString()}
          </div>
        )}
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-text-secondary">{label}</div>
      {children}
    </label>
  );
}
