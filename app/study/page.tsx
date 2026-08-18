"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RotateCcw,
  Check,
  X,
  Minus,
  Settings2,
  Play,
  Shuffle,
  ListOrdered,
  ArrowLeft,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Box, Card, Deck, Rating, StudyMode, languageInfo } from "@/lib/types";
import { getCards, getDeck, updateCard, loadMediaDataUrl } from "@/lib/repository";
import { applyRating, BOX_COLORS, BOX_LABEL, selectStudyDeck } from "@/lib/srs";

type Order = "random" | "sequential";

const COUNT_PRESETS = [10, 15, 30, 50];

export default function StudyWrapper() {
  return (
    <Suspense>
      <Study />
    </Suspense>
  );
}

function Study() {
  const sp = useSearchParams();
  const router = useRouter();
  const deckId = sp.get("deck") ?? "";
  const modeParam = sp.get("mode") as StudyMode | null;
  const isSetup = !modeParam;

  if (!deckId) {
    return (
      <>
        <TopBar back title="Тест" rightSlot={<div className="w-10" />} />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">Колода не выбрана</div>
      </>
    );
  }

  if (isSetup) {
    return <StudySetup deckId={deckId} router={router} />;
  }

  return <StudySession deckId={deckId} sp={sp} router={router} />;
}

function StudySetup({
  deckId,
  router,
}: {
  deckId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [mode, setMode] = useState<StudyMode>("review");
  const [count, setCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState<string>("");
  const [order, setOrder] = useState<Order>("random");
  const [boxes, setBoxes] = useState<Box[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    (async () => {
      const [d, list] = await Promise.all([getDeck(deckId), getCards(deckId)]);
      setDeck(d);
      setCards(list);
    })();
  }, [deckId]);

  const total = cards.length;
  const filtered = useMemo(
    () => cards.filter((c) => boxes.includes(c.box)),
    [cards, boxes],
  );
  const effectiveCount = Math.min(count, filtered.length || 1);

  function toggleBox(b: Box) {
    setBoxes((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  function start() {
    const params = new URLSearchParams({ deck: deckId, mode });
    params.set("count", String(count));
    if (mode === "self") params.set("order", order);
    if (boxes.length && boxes.length < 5) params.set("boxes", boxes.join(","));
    router.replace(`/study?${params.toString()}`);
  }

  return (
    <>
      <TopBar back title={deck?.name ? `Тест: ${deck.name}` : "Тест"} rightSlot={<div className="w-10" />} />
      <main className="flex-1 space-y-4 px-4 pb-12 pt-2">
        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-sm font-semibold text-text-primary">Режим</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeButton
              active={mode === "review"}
              onClick={() => setMode("review")}
              title="Повторение"
              hint="Сначала слабые карточки"
            />
            <ModeButton
              active={mode === "self"}
              onClick={() => setMode("self")}
              title="Самопроверка"
              hint="Все карточки подряд"
            />
          </div>
        </section>

        {mode === "self" && (
          <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
            <div className="mb-3 text-sm font-semibold text-text-primary">Порядок</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrder("random")}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  order === "random"
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                    : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"
                }`}
              >
                <Shuffle size={16} /> Случайный
              </button>
              <button
                onClick={() => setOrder("sequential")}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  order === "sequential"
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                    : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"
                }`}
              >
                <ListOrdered size={16} /> По порядку
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-text-primary">Сколько карт</div>
            <div className="text-xs text-text-faint">из {filtered.length} доступных</div>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {COUNT_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setCount(n);
                  setCustomCount("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  count === n && !customCount
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                    : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">Свой:</label>
            <input
              type="number"
              min={1}
              max={500}
              value={customCount}
              onChange={(e) => {
                const v = e.target.value;
                setCustomCount(v);
                const n = Number(v);
                if (Number.isFinite(n) && n > 0) setCount(n);
              }}
              placeholder="например, 25"
              className="field flex-1 px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-sm font-semibold text-text-primary">Из каких корзин</div>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as Box[]).map((b) => (
              <button
                key={b}
                onClick={() => toggleBox(b)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  boxes.includes(b) ? "text-white" : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"
                }`}
                style={boxes.includes(b) ? { backgroundColor: BOX_COLORS[b] } : undefined}
              >
                {BOX_LABEL[b]}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-text-faint">
            Всего в колоде: {total}
          </div>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => router.replace(`/deck?id=${deckId}`)}
            className="pill-button flex-1 justify-center"
          >
            <ArrowLeft size={16} /> Назад
          </button>
          <button
            onClick={start}
            disabled={filtered.length === 0}
            className="pill-button flex-[2] justify-center bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30"
          >
            <Play size={16} /> Запустить ({effectiveCount})
          </button>
        </div>
      </main>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition ${
        active
          ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
          : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"
      }`}
    >
      <span className="text-base font-semibold">{title}</span>
      <span className="text-xs opacity-80">{hint}</span>
    </button>
  );
}

function StudySession({
  deckId,
  sp,
  router,
}: {
  deckId: string;
  sp: ReturnType<typeof useSearchParams>;
  router: ReturnType<typeof useRouter>;
}) {
  const mode = (sp.get("mode") as StudyMode | null) ?? "review";
  const order = (sp.get("order") as Order | null) ?? "random";
  const countParam = Number(sp.get("count") ?? "");
  const boxesParam = (sp.get("boxes") ?? "")
    .split(",")
    .map((x) => parseInt(x, 10))
    .filter((x) => x >= 1 && x <= 5) as Box[];

  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [imageFront, setImageFront] = useState<string | null>(null);
  const [imageBack, setImageBack] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ good: 0, neutral: 0, bad: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const d = await getDeck(deckId);
      const cards = await getCards(deckId);
      setDeck(d);
      const selected = selectStudyDeck(cards, {
        count: Number.isFinite(countParam) && countParam > 0 ? countParam : undefined,
        boxes: boxesParam.length ? boxesParam : undefined,
        prioritizeWeak: mode === "review",
        preserveOrder: mode === "self" && order === "sequential",
        shuffle: !(mode === "self" && order === "sequential"),
      });
      setQueue(selected);
      setIdx(0);
      setFlipped(false);
      setDone(selected.length === 0);
      setLoading(false);
      setStats({ good: 0, neutral: 0, bad: 0 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, mode, countParam, order, sp.get("boxes")]);

  const card = queue[idx] ?? null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!card || !deckId) {
        setImageFront(null);
        setImageBack(null);
        return;
      }
      const [fi, bi] = await Promise.all([
        card.front.image ? loadMediaDataUrl(deckId, card.front.image) : Promise.resolve(null),
        card.back.image ? loadMediaDataUrl(deckId, card.back.image) : Promise.resolve(null),
      ]);
      if (!active) return;
      setImageFront(fi);
      setImageBack(bi);
      setFlipped(false);
    })();
    return () => {
      active = false;
    };
  }, [card, deckId]);

  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 40) {
      setFlipped((f) => !f);
    } else if (Date.now() - start.t < 350 && dist < 12) {
      setFlipped((f) => !f);
    }
  }

  async function rate(rating: Rating) {
    if (!card) return;
    const updated = applyRating(card, rating);
    await updateCard(deckId, card.id, updated);
    const newStats = { ...stats };
    if (rating === "good") newStats.good += 1;
    else if (rating === "neutral") newStats.neutral += 1;
    else newStats.bad += 1;
    setStats(newStats);

    if (idx + 1 >= queue.length) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
    }
  }

  function gotoSetup() {
    router.replace(`/study?deck=${deckId}`);
  }

  if (loading) {
    return (
      <>
        <TopBar back title="Изучение" rightSlot={<div className="w-10" />} />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">Загрузка...</div>
      </>
    );
  }

  if (queue.length === 0) {
    return (
      <>
        <TopBar back title="Изучение" rightSlot={<div className="w-10" />} />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">
          Нет карточек, подходящих под фильтр.
        </div>
      </>
    );
  }

  if (done) {
    const total = stats.good + stats.neutral + stats.bad;
    return (
      <>
        <TopBar back title="Готово!" rightSlot={<div className="w-10" />} />
        <main className="flex-1 px-4 pb-12 pt-2">
          <div className="rounded-3xl bg-bg-card p-6 ring-1 ring-[var(--ring-base)]">
            <div className="text-center text-2xl font-semibold text-text-primary">
              Сессия завершена
            </div>
            <div className="mt-1 text-center text-sm text-text-muted">
              Просмотрено карточек: {total}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <ResultStat label="Плохо" value={stats.bad} color="#ef4444" />
              <ResultStat label="Нейтр." value={stats.neutral} color="#eab308" />
              <ResultStat label="Хорошо" value={stats.good} color="#22c55e" />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="pill-button" onClick={() => router.replace(`/deck?id=${deckId}`)}>
                К колоде
              </button>
              <button
                className="pill-button"
                onClick={gotoSetup}
              >
                <Settings2 size={16} /> Настройки
              </button>
              <button
                className="pill-button bg-[var(--accent)]/15 text-[var(--accent)]"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  router.replace(`/study?${params.toString()}`);
                }}
              >
                Ещё раз
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!card || !deck) return null;

  const front = languageInfo(deck.settings.frontLanguage);
  const back = languageInfo(deck.settings.backLanguage);

  return (
    <>
      <TopBar
        back
        title={`${idx + 1} / ${queue.length}`}
        rightSlot={
          <>
            <button className="icon-btn" onClick={gotoSetup} aria-label="Настройки сессии">
              <Settings2 size={18} />
            </button>
            <button className="icon-btn" onClick={() => setFlipped((f) => !f)} aria-label="Перевернуть">
              <RotateCcw size={18} />
            </button>
          </>
        }
      />
      <main className="flex flex-1 flex-col px-4 pb-8 pt-2">
        <div className="mb-3 flex items-center justify-between text-xs text-text-muted">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: BOX_COLORS[card.box] }}
          >
            {BOX_LABEL[card.box]}
          </span>
          <span>
            {flipped ? `${back.flag} ${back.name}` : `${front.flag} ${front.name}`}
          </span>
        </div>

        <div
          className="flip-card relative mx-auto w-full max-w-md"
          style={{ height: "60vh", minHeight: 360 }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <div className={`flip-inner h-full w-full ${flipped ? "flipped" : ""}`}>
            <CardFace
              text={card.front.text}
              imageUrl={imageFront}
              accent={deck.color}
              hint="свайп / тап → переворот"
            />
            <CardFace
              text={card.back.text}
              imageUrl={imageBack}
              accent={deck.color}
              back
              hint="оцени, как запомнил"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <RateButton
            label="Плохо"
            color="#ef4444"
            icon={<X size={18} />}
            onClick={() => rate("bad")}
          />
          <RateButton
            label="Нейтрально"
            color="#eab308"
            icon={<Minus size={18} />}
            onClick={() => rate("neutral")}
          />
          <RateButton
            label="Хорошо"
            color="#22c55e"
            icon={<Check size={18} />}
            onClick={() => rate("good")}
          />
        </div>
      </main>
    </>
  );
}

function CardFace({
  text,
  imageUrl,
  accent,
  back,
  hint,
}: {
  text: string;
  imageUrl: string | null;
  accent: string;
  back?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flip-face ${back ? "back" : ""} flex h-full w-full flex-col rounded-3xl bg-bg-card p-6 shadow-lg ring-1 ring-[var(--ring-base)]`}
      style={{ borderTop: `4px solid ${accent}` }}
    >
      {imageUrl && (
        <div className="mb-4 flex h-[35%] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        <div className="whitespace-pre-wrap break-words text-center text-3xl font-semibold leading-snug text-text-primary">
          {text || <span className="text-text-faint">пусто</span>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end text-[11px] text-text-faint">
        <span>{hint}</span>
      </div>
    </div>
  );
}

function RateButton({
  label,
  color,
  icon,
  onClick,
}: {
  label: string;
  color: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-95"
      style={{ backgroundColor: color }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-bg-soft p-3 ring-1 ring-[var(--ring-base)]">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
