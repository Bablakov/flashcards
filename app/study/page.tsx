"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Minus, Play, RotateCcw, Settings2, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Box, Rating } from "@/lib/types";
import {
  getStudyPool,
  listStudyGroupTree,
  loadMediaDataUrl,
  rateCard,
  type StudyGroupNode,
} from "@/lib/repository";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";
import { readSettings } from "@/lib/store";
import {
  affectsProgress,
  buildSession,
  firstSide,
  poolStats,
  type SessionDirection,
  type SessionMode,
  type SessionOrder,
  type StudyItem,
} from "@/lib/session";

const MODES: { key: SessionMode; title: string; hint: string }[] = [
  { key: "review", title: "Повторение", hint: "то, что созрело сегодня" },
  { key: "new", title: "Новые", hint: "ещё не показывались" },
  { key: "training", title: "Тренировка", hint: "не влияет на прогресс" },
  { key: "exam", title: "Экзамен", hint: "всё подряд, отчёт в конце" },
];

const COUNT_PRESETS = [10, 20, 50, 0];

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
  const started = sp.get("go") === "1";
  return started ? <StudySession sp={sp} router={router} /> : <StudySetup sp={sp} router={router} />;
}

/* ------------------------------------------------------------- настройка */

function StudySetup({
  sp,
  router,
}: {
  sp: ReturnType<typeof useSearchParams>;
  router: ReturnType<typeof useRouter>;
}) {
  const deckId = sp.get("deck") ?? "";
  const [groups, setGroups] = useState<StudyGroupNode[]>([]);
  const [selected, setSelected] = useState<string[]>(deckId ? [deckId] : []);
  const [allGroups, setAllGroups] = useState(!deckId);
  const [mode, setMode] = useState<SessionMode>("review");
  const [levels, setLevels] = useState<Box[]>([]);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [count, setCount] = useState(0);
  const [order, setOrder] = useState<SessionOrder>("random");
  const [direction, setDirection] = useState<SessionDirection>("front");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pool, setPool] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setGroups(await listStudyGroupTree());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setPool(await getStudyPool(allGroups ? null : selected));
      } finally {
        setLoading(false);
      }
    })();
  }, [allGroups, selected]);

  const stats = useMemo(() => poolStats(pool), [pool]);
  const preview = useMemo(
    () => buildSession(pool, { mode, levels, onlyErrors, count, order }).length,
    [pool, mode, levels, onlyErrors, count, order],
  );

  /* Сколько карточек даст каждый режим при текущей области и фильтрах.
     Без этих чисел выбор режима — гадание: «Повторение» может оказаться
     пустым просто потому, что сегодня ничего не созрело. Порядок здесь
     нарочно «по порядку»: считаем количество, перемешивать незачем. */
  const modeCounts = useMemo(() => {
    const out = {} as Record<SessionMode, number>;
    for (const m of MODES) {
      out[m.key] = buildSession(pool, {
        mode: m.key,
        levels,
        onlyErrors,
        order: "sequential",
      }).length;
    }
    return out;
  }, [pool, levels, onlyErrors]);

  /** Потомки выбранных групп — они попадают в тест сами, отдельной галочки не требуют. */
  const covered = useMemo(() => {
    const parentOf = new Map(groups.map((g) => [g.id, g.parentId]));
    const chosen = new Set(selected);
    const out = new Set<string>();
    for (const g of groups) {
      let p = g.parentId;
      while (p) {
        if (chosen.has(p)) {
          out.add(g.id);
          break;
        }
        p = parentOf.get(p) ?? null;
      }
    }
    return out;
  }, [groups, selected]);

  function toggleGroup(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleLevel(b: Box) {
    setLevels((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  function start() {
    const params = new URLSearchParams({ go: "1", mode, order, dir: direction });
    if (!allGroups && selected.length) params.set("groups", selected.join(","));
    if (levels.length) params.set("levels", levels.join(","));
    if (onlyErrors) params.set("errors", "1");
    if (count > 0) params.set("count", String(count));
    if (deckId) params.set("deck", deckId);
    router.push(`/study?${params.toString()}`);
  }

  /* Экран настройки раньше вываливал шесть блоков сразу. Теперь наверху то,
     что меняют каждый раз (область и режим), а редкие фильтры свёрнуты —
     их состояние видно строкой, так что ничего не теряется. */
  const filterSummary = [
    levels.length ? `уровни: ${levels.map((b) => BOX_LABEL[b]).join(", ")}` : null,
    onlyErrors ? "только с ошибками" : null,
    order === "random" ? null : order === "weak" ? "слабые первыми" : "по порядку",
    direction === "front" ? null : direction === "back" ? "с обратной стороны" : "стороны вперемешку",
  ].filter(Boolean) as string[];

  return (
    <>
      <TopBar back title="Самопроверка" />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        <section className="surface space-y-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="section-title">Что учим</span>
            <span className="text-[12px] text-text-faint">
              {loading ? "считаем..." : `созрело ${stats.due} · новых ${stats.new} · всего ${stats.total}`}
            </span>
          </div>
          <div className="segmented">
            <button
              className="segmented-item"
              data-active={allGroups}
              onClick={() => setAllGroups(true)}
            >
              Все группы
            </button>
            <button
              className="segmented-item"
              data-active={!allGroups}
              onClick={() => setAllGroups(false)}
            >
              Выбрать группы
            </button>
          </div>
          {!allGroups && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px]">
                <button
                  className="rounded-full bg-bg-soft px-3 py-1 text-text-secondary transition hover:bg-[var(--ring-base)]"
                  onClick={() => setSelected(groups.filter((g) => g.depth === 0).map((g) => g.id))}
                >
                  Выбрать все
                </button>
                <button
                  className="rounded-full bg-bg-soft px-3 py-1 text-text-secondary transition hover:bg-[var(--ring-base)]"
                  onClick={() => setSelected([])}
                >
                  Снять
                </button>
                <span className="ml-auto text-text-faint">выбрано: {selected.length}</span>
              </div>

              {/* Дерево целиком: любую подгруппу можно взять отдельно, не забирая
                  соседей. Числа справа — всего карточек и сколько созрело, иначе
                  область выбирается вслепую. */}
              <div className="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain">
                {groups.map((g) => {
                  const included = covered.has(g.id);
                  return (
                    <label
                      key={g.id}
                      style={{ paddingLeft: `${8 + g.depth * 18}px` }}
                      className={`flex items-center gap-2 rounded-[10px] py-2 pr-2 text-[14px] hover:bg-bg-soft ${
                        included ? "opacity-60" : "cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included || selected.includes(g.id)}
                        disabled={included}
                        onChange={() => toggleGroup(g.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-text-secondary">{g.name}</span>
                      {included && <span className="text-[11px] text-text-faint">входит</span>}
                      {g.due > 0 && (
                        <span className="chip chip-accent" title="Созрело к повторению">
                          {g.due}
                        </span>
                      )}
                      <span className="w-10 text-right text-[12px] text-text-faint" title="Всего карточек">
                        {g.cards}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="hint-text px-2">
                Выбранная группа берётся вместе с подгруппами — они помечаются «входит».
                Чтобы взять только одну подгруппу, отметь её саму.
              </div>
            </div>
          )}
        </section>

        <section className="surface space-y-3 py-3">
          <div className="section-title">Режим</div>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`rounded-[10px] px-3 py-2 text-left transition ${
                  mode === m.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-bg-soft text-text-secondary hover:bg-[var(--ring-base)]"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{m.title}</span>
                  <span className="ml-auto text-[12px] tabular-nums opacity-70">
                    {loading ? "…" : modeCounts[m.key]}
                  </span>
                </div>
                <div className="text-[11px] opacity-80">{m.hint}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Сколько карточек — вопрос, который задают каждый раз, поэтому он
            на виду, а не внутри свёрнутых фильтров. */}
        <section className="surface space-y-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="section-title">Сколько карточек</span>
            <span className="text-[12px] text-text-faint">
              {loading ? "считаем..." : `доступно ${modeCounts[mode]}`}
            </span>
          </div>
          <div className="segmented">
            {COUNT_PRESETS.map((c) => (
              <button
                key={c}
                className="segmented-item"
                data-active={count === c}
                onClick={() => setCount(c)}
              >
                {c === 0 ? "Все" : c}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            <span className="flex-shrink-0">Своё число</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={count > 0 && !COUNT_PRESETS.includes(count) ? count : ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCount(Number.isFinite(n) && n > 0 ? Math.min(999, Math.floor(n)) : 0);
              }}
              placeholder="напр. 15"
              className="field w-28"
            />
          </label>
        </section>

        <section className="surface space-y-3 py-3">
          <button
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="section-title">Фильтры</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-text-faint">
              {filterSummary.length ? filterSummary.join(" · ") : "без ограничений"}
            </span>
            <ChevronDown
              size={16}
              className={`flex-shrink-0 text-text-muted transition ${filtersOpen ? "rotate-180" : ""}`}
            />
          </button>

          {filtersOpen && (
            <div className="space-y-3 border-t border-[var(--ring-base)] pt-3">
              <div>
                <div className="mb-1.5 text-[13px] text-text-secondary">Уровни запоминания</div>
                <div className="flex flex-wrap gap-1.5">
                  {([1, 2, 3, 4, 5] as Box[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => toggleLevel(b)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                        levels.includes(b)
                          ? "bg-[var(--bg-raised)] text-text-primary ring-1 ring-[var(--ring-strong)]"
                          : "bg-bg-soft text-text-muted"
                      }`}
                    >
                      <span className="level-dot" style={{ backgroundColor: BOX_COLORS[b] }} />
                      {BOX_LABEL[b]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-[14px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={onlyErrors}
                  onChange={(e) => setOnlyErrors(e.target.checked)}
                />
                Только те, где были ошибки
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1.5 text-[13px] text-text-secondary">Порядок</div>
                  <select
                    value={order}
                    onChange={(e) => setOrder(e.target.value as SessionOrder)}
                    className="field"
                  >
                    <option value="random">Вперемешку</option>
                    <option value="sequential">По порядку</option>
                    <option value="weak">Слабые первыми</option>
                  </select>
                </label>
                <label className="block">
                  <div className="mb-1.5 text-[13px] text-text-secondary">Сторона</div>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as SessionDirection)}
                    className="field"
                  >
                    <option value="front">Вопрос → ответ</option>
                    <option value="back">Ответ → вопрос</option>
                    <option value="mixed">Вперемешку</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </section>

        {preview === 0 && !loading && (
          <div className="hint-text text-center">
            Под выбранные условия карточек нет. Попробуй режим «Тренировка» или сними фильтры.
          </div>
        )}
      </main>

      {/* Кнопка старта закреплена внизу: до неё не нужно доскроллить,
          и она же показывает, сколько карточек попадёт в сессию. */}
      <div
        className="sticky bottom-0 z-20 mt-auto bg-bg-base/95 px-4 pt-2 backdrop-blur"
        style={{
          borderTop: "1px solid var(--ring-base)",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <button onClick={start} disabled={preview === 0} className="btn-primary w-full">
          <Play size={18} />
          Начать — {preview} карт.
        </button>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- сессия */

function StudySession({
  sp,
  router,
}: {
  sp: ReturnType<typeof useSearchParams>;
  router: ReturnType<typeof useRouter>;
}) {
  const mode = (sp.get("mode") as SessionMode | null) ?? "review";
  const order = (sp.get("order") as SessionOrder | null) ?? "random";
  const direction = (sp.get("dir") as SessionDirection | null) ?? "front";
  const groupsParam = sp.get("groups") ?? "";
  const levelsParam = sp.get("levels") ?? "";
  const onlyErrors = sp.get("errors") === "1";
  const countParam = Number(sp.get("count") ?? "0");
  const deckId = sp.get("deck") ?? "";

  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [images, setImages] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ good: 0, neutral: 0, bad: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await readSettings();
      const groupIds = groupsParam ? groupsParam.split(",").filter(Boolean) : null;
      const pool = await getStudyPool(groupIds);
      const levels = levelsParam
        .split(",")
        .map((x) => parseInt(x, 10))
        .filter((x) => x >= 1 && x <= 5) as Box[];
      const session = buildSession(pool, {
        mode,
        levels,
        onlyErrors,
        count: countParam,
        order,
        newLimit: settings.dailyNewLimit,
        reviewLimit: settings.dailyReviewLimit,
      });
      setQueue(session);
      setIdx(0);
      setFlipped(false);
      setDone(session.length === 0);
      setStats({ good: 0, neutral: 0, bad: 0 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsParam, levelsParam, onlyErrors, countParam, mode, order]);

  useEffect(() => {
    load();
  }, [load]);

  const item = queue[idx] ?? null;
  const startSide = firstSide(direction, idx);
  const showingBack = startSide === "front" ? flipped : !flipped;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!item) {
        setImages({ front: null, back: null });
        return;
      }
      const [f, b] = await Promise.all([
        item.card.front.image ? loadMediaDataUrl("", item.card.front.image) : Promise.resolve(null),
        item.card.back.image ? loadMediaDataUrl("", item.card.back.image) : Promise.resolve(null),
      ]);
      if (!active) return;
      setImages({ front: f, back: b });
      setFlipped(false);
    })();
    return () => {
      active = false;
    };
  }, [item]);

  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onPointerCancel() {
    swipeStart.current = null;
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    const tap = Date.now() - start.t < 350 && dist < 12;
    // Переворачиваем только по горизонтальному свайпу: вертикальный — это
    // прокрутка длинного текста, и карточка не должна на неё переворачиваться.
    const swipe = Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy);
    if (tap || swipe) setFlipped((f) => !f);
  }

  async function rate(rating: Rating) {
    if (!item) return;
    // В тренировке и экзамене прогресс не трогаем — ответ не пишется в журнал.
    if (affectsProgress(mode)) await rateCard(item.card.id, rating);
    setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
    if (idx + 1 >= queue.length) {
      setDone(true);
      // Конец сессии — фиксируем накопленные ответы одним коммитом (§7.1).
      void import("@/lib/autosync").then((m) => m.flushJournal());
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
    }
  }

  function gotoSetup() {
    router.replace(deckId ? `/study?deck=${deckId}` : "/study");
  }

  if (loading) {
    return (
      <>
        <TopBar back title="Самопроверка" />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">Загрузка...</div>
      </>
    );
  }

  if (done) {
    const total = stats.good + stats.neutral + stats.bad;
    return (
      <>
        <TopBar back title={total ? "Готово!" : "Пусто"} />
        <main className="flex-1 px-4 pb-4 pt-3">
          <div className="surface p-6">
            <div className="text-center text-[20px] font-semibold text-text-primary">
              {total ? "Сессия завершена" : "Нет карточек под выбранные условия"}
            </div>
            {total > 0 && (
              <>
                <div className="mt-1 text-center text-[13px] text-text-muted">
                  Просмотрено карточек: {total}
                  {!affectsProgress(mode) && " · прогресс не изменялся"}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  <ResultStat label="Не помню" value={stats.bad} color="#ef4444" />
                  <ResultStat label="Что-то помню" value={stats.neutral} color="#eab308" />
                  <ResultStat label="Хорошо" value={stats.good} color="#22c55e" />
                </div>
              </>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="pill-button" onClick={() => router.replace("/")}>
                На главную
              </button>
              <button className="pill-button" onClick={gotoSetup}>
                <Settings2 size={16} /> Настройки
              </button>
              <button
                className="pill-button bg-[var(--accent)]/15 text-[var(--accent)]"
                onClick={load}
              >
                Ещё раз
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!item) return null;

  const frontText = item.card.front.text;
  const backText = item.card.back.text;

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
            <button
              className="icon-btn"
              onClick={() => setFlipped((f) => !f)}
              aria-label="Перевернуть"
            >
              <RotateCcw size={18} />
            </button>
          </>
        }
      />
      <main className="flex flex-1 flex-col px-4 pb-8 pt-2">
        <div className="mb-2 flex items-center justify-between text-[12px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="level-dot"
              style={{ backgroundColor: BOX_COLORS[item.progress.box] }}
            />
            {BOX_LABEL[item.progress.box]}
          </span>
          <span className="text-text-faint">
            {showingBack ? "ответ" : "вопрос"}
            {!affectsProgress(mode) && " · без записи прогресса"}
          </span>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.round(((idx + (done ? 1 : 0)) / queue.length) * 100)}%` }}
          />
        </div>

        <div
          className="flip-card relative mx-auto mt-3 w-full max-w-md"
          style={{ height: "58vh", minHeight: 340 }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className={`flip-inner h-full w-full ${flipped ? "flipped" : ""}`}>
            <CardFace
              text={startSide === "front" ? frontText : backText}
              imageUrl={startSide === "front" ? images.front : images.back}
              hint="свайп / тап → переворот"
            />
            <CardFace
              text={startSide === "front" ? backText : frontText}
              imageUrl={startSide === "front" ? images.back : images.front}
              back
              hint="оцени, как запомнил"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <RateButton
            label="Не помню"
            color="#ef4444"
            icon={<X size={18} />}
            onClick={() => rate("bad")}
          />
          <RateButton
            label="Что-то помню"
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

// Короткий вопрос читается крупно по центру, статья на несколько экранов —
// нет: 30-м кеглем она превращается в бесконечную прокрутку.
function textScale(text: string) {
  const n = text.trim().length;
  if (n <= 90) return "text-center text-3xl";
  if (n <= 220) return "text-center text-2xl";
  if (n <= 600) return "text-left text-xl";
  if (n <= 1500) return "text-left text-lg";
  return "text-left text-base";
}

function CardFace({
  text,
  imageUrl,
  back,
  hint,
}: {
  text: string;
  imageUrl: string | null;
  back?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flip-face ${back ? "back" : ""} flex h-full w-full flex-col rounded-3xl bg-bg-card p-6 shadow-lg ring-1 ring-[var(--ring-base)]`}
    >
      {imageUrl && (
        <div className="mb-4 flex h-[35%] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
      {/* Центрируем обёрткой min-h-full, а не items-center: у флекса с
          выравниванием по центру текст выше контейнера уезжает вверх за начало
          прокрутки, и его первые строки нельзя ни увидеть, ни домотать. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col justify-center">
          <div
            className={`whitespace-pre-wrap break-words font-semibold leading-snug text-text-primary ${textScale(text)}`}
          >
            {text || <span className="text-text-faint">пусто</span>}
          </div>
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
      className="flex flex-col items-center gap-1 rounded-[14px] px-3 py-3 text-[14px] font-semibold text-white transition active:scale-95"
      style={{ backgroundColor: color }}
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="surface-flat px-3 py-4">
      <div className="text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-text-muted">{label}</div>
    </div>
  );
}
