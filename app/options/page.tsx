"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Save } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Deck, DeckSettings, DeckSettingsSchema, LANGUAGES } from "@/lib/types";
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
  const router = useRouter();
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
      <TopBar back title="Опции группы" hideDefaults />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        <section className="surface">
          <div className="mb-3 text-[15px] font-semibold text-text-primary">Языки сторон</div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Язык вопроса">
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
              <Field label="Язык ответа">
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

        <section className="surface">
          <div className="mb-3 text-[15px] font-semibold text-text-primary">Время ожидания</div>
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

        {/* Здесь был свой конструктор теста, но он отправлял в самопроверку
            параметры старого образца (mode=custom, boxes=…), которых экран
            сессии не понимает — кнопка вела в пустую сессию. Настройка выборки
            живёт на самом экране самопроверки, поэтому оставляем один переход. */}
        <section className="surface space-y-3">
          <div className="text-[15px] font-semibold text-text-primary">Самопроверка</div>
          <p className="hint-text">
            Сколько карточек взять, какие уровни и в каком порядке — выбирается на экране
            самопроверки, вместе с подсчётом, сколько карточек попадёт в сессию.
          </p>
          <button onClick={() => router.push(`/study?deck=${deckId}`)} className="pill-button">
            <Play size={16} /> Открыть самопроверку
          </button>
        </section>

        <button onClick={handleSave} className="btn-primary w-full">
          <Save size={16} /> Сохранить настройки
        </button>

        {deck && (
          <div className="hint-text">
            Группа: {deck.name} · карточек: {deck.cardCount} · обновлено:{" "}
            {new Date(deck.updatedAt).toLocaleString("ru-RU")}
          </div>
        )}
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 section-title">{label}</div>
      {children}
    </label>
  );
}
