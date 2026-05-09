"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Deck, DeckSettings, DeckSettingsSchema } from "@/lib/types";
import { getDeck, setDeckSettings } from "@/lib/repository";
import { toast } from "@/components/Toaster";

export default function OptionsWrapper() {
  return (
    <Suspense>
      <DeckOptionsPage />
    </Suspense>
  );
}

function DeckOptionsPage() {
  const sp = useSearchParams();
  const deckId = sp.get("deck") ?? "";
  const [deck, setDeck] = useState<Deck | null>(null);
  const [s, setS] = useState<DeckSettings>(() => DeckSettingsSchema.parse({}));

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

  return (
    <>
      <TopBar back title="Опции колоды" rightSlot={<div className="w-10" />} />
      <main className="flex-1 space-y-4 px-4 pb-16 pt-2">
        <div className="rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
          <div className="mb-4 text-base font-semibold">Озвучка</div>
          <div className="space-y-3">
            <Slider
              label={`Скорость лицевой стороны: ${s.frontSpeechSpeed.toFixed(2)}x`}
              value={s.frontSpeechSpeed}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(v) => setS((x) => ({ ...x, frontSpeechSpeed: v }))}
            />
            <Slider
              label={`Скорость обратной стороны: ${s.backSpeechSpeed.toFixed(2)}x`}
              value={s.backSpeechSpeed}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(v) => setS((x) => ({ ...x, backSpeechSpeed: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Язык лицевой стороны">
                <select
                  value={s.frontLanguage}
                  onChange={(e) => setS((x) => ({ ...x, frontLanguage: e.target.value }))}
                  className="field"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
              <Field label="Язык обратной стороны">
                <select
                  value={s.backLanguage}
                  onChange={(e) => setS((x) => ({ ...x, backLanguage: e.target.value }))}
                  className="field"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
          <div className="mb-4 text-base font-semibold">Время ожидания</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="До переворота карточки (сек)">
              <input
                type="number"
                step="0.5"
                value={s.flipDelay}
                onChange={(e) => setS((x) => ({ ...x, flipDelay: Number(e.target.value) }))}
                className="field"
              />
            </Field>
            <Field label="До следующей карточки (сек)">
              <input
                type="number"
                step="0.5"
                value={s.nextDelay}
                onChange={(e) => setS((x) => ({ ...x, nextDelay: Number(e.target.value) }))}
                className="field"
              />
            </Field>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="pill-button bg-emerald-500/20 hover:bg-emerald-500/30"
        >
          Сохранить
        </button>

        {deck && (
          <div className="text-xs text-neutral-500">
            Колода: {deck.name} · карт: {deck.cardCount} · обновлено:{" "}
            {new Date(deck.updatedAt).toLocaleString()}
          </div>
        )}
      </main>
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-300">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-neutral-300">{label}</div>
      {children}
    </label>
  );
}
