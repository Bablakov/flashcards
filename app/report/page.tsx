"use client";

/**
 * Отчёт (§8.1). Все цифры считаются из журнала ответов и состояния FSRS —
 * ничего дополнительно не хранится.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, CalendarDays, TrendingUp } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { readJournal } from "@/lib/store";
import {
  bestStreak,
  currentStreak,
  forecast,
  getProgressMap,
  isDue,
  isNew,
  reviewsByDay,
  type CardProgress,
} from "@/lib/progress";
import { listDeckSummaries } from "@/lib/repository";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";
import { Box, DeckSummary } from "@/lib/types";

const DAY_LABEL = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

type GroupSort = "weak" | "cards" | "name";

export default function ReportPage() {
  const router = useRouter();
  const [byDay, setByDay] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<CardProgress[]>([]);
  const [groups, setGroups] = useState<DeckSummary[]>([]);
  const [groupSort, setGroupSort] = useState<GroupSort>("weak");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [events, map, summaries] = await Promise.all([
          readJournal(),
          getProgressMap(),
          listDeckSummaries(),
        ]);
        setByDay(reviewsByDay(events));
        setProgress([...map.values()]);
        setGroups(summaries);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const week = useMemo(() => {
    const out: { key: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ key, label: DAY_LABEL[d.getDay()], count: byDay[key] ?? 0 });
    }
    return out;
  }, [byDay]);

  const levels = useMemo(() => {
    const counts: Record<Box, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const p of progress) counts[p.box] += 1;
    return counts;
  }, [progress]);

  const sortedGroups = useMemo(() => {
    const list = [...groups];
    switch (groupSort) {
      case "weak":
        // Пустые группы не должны стоять первыми только потому, что у них 0%.
        return list.sort(
          (a, b) => Number(b.cardCount > 0) - Number(a.cardCount > 0) || a.progress - b.progress,
        );
      case "cards":
        return list.sort((a, b) => b.cardCount - a.cardCount);
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
  }, [groups, groupSort]);

  const due = useMemo(() => progress.filter((p) => isDue(p)).length, [progress]);
  const fresh = useMemo(() => progress.filter((p) => isNew(p)).length, [progress]);
  const plan = useMemo(() => forecast(progress, 7), [progress]);
  const weekMax = Math.max(1, ...week.map((w) => w.count));
  const planMax = Math.max(1, ...Object.values(plan));
  const totalWeek = week.reduce((s, w) => s + w.count, 0);

  if (loading) {
    return (
      <>
        <TopBar back title="Отчёт" />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">Считаем...</div>
      </>
    );
  }

  return (
    <>
      <TopBar back title="Отчёт" />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Flame size={15} />} label="Дней подряд" value={currentStreak(byDay)} />
          <Stat icon={<TrendingUp size={15} />} label="Лучшая серия" value={bestStreak(byDay)} />
          <Stat icon={<CalendarDays size={15} />} label="За неделю" value={totalWeek} />
        </div>

        <section className="surface space-y-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="section-title">Последние 7 дней</span>
            <span className="text-[12px] text-text-faint">ответов в день</span>
          </div>
          <BarChart
            bars={week.map((w) => ({ key: w.key, label: w.label, value: w.count }))}
            max={weekMax}
            color="var(--accent)"
            height={112}
          />
        </section>

        <section className="surface space-y-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="section-title">Уровни запоминания</span>
            <span className="text-[12px] text-text-faint">
              к повторению {due} · новых {fresh}
            </span>
          </div>
          <div className="space-y-1.5">
            {([1, 2, 3, 4, 5] as Box[]).map((b) => {
              const total = Math.max(1, progress.length);
              return (
                <div key={b} className="flex items-center gap-2">
                  <span className="inline-flex w-[104px] flex-shrink-0 items-center gap-1.5 text-[12px] text-text-muted">
                    <span className="level-dot" style={{ backgroundColor: BOX_COLORS[b] }} />
                    {BOX_LABEL[b]}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-soft">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(levels[b] / total) * 100}%`,
                        backgroundColor: BOX_COLORS[b],
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[12px] text-text-muted">{levels[b]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface space-y-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="section-title">На неделю вперёд</span>
            <span className="text-[12px] text-text-faint">к повторению</span>
          </div>
          <BarChart
            bars={Object.entries(plan).map(([day, count]) => ({
              key: day,
              label: `${DAY_LABEL[new Date(day).getDay()]} ${day.slice(8)}`,
              value: count,
            }))}
            max={planMax}
            color="#22c55e"
            height={88}
          />
        </section>

        <section className="surface space-y-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="section-title">По группам</span>
            {/* Разрез по группам не сортировался — теперь три порядка,
                и по умолчанию наверху то, что хуже всего выучено. */}
            <div className="segmented p-0.5">
              {(
                [
                  ["weak", "Слабые"],
                  ["cards", "Крупные"],
                  ["name", "А-Я"],
                ] as [GroupSort, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  className="segmented-item px-2 py-1 text-[12px]"
                  data-active={groupSort === k}
                  onClick={() => setGroupSort(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {groups.length === 0 && (
              <div className="text-[14px] text-text-muted">Групп пока нет</div>
            )}
            {sortedGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => router.push(`/deck?id=${g.id}`)}
                className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition hover:bg-[var(--ring-base)]"
              >
                <span
                  className="h-7 w-7 flex-shrink-0 rounded-[8px]"
                  style={{ backgroundColor: g.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="row-title block">{g.name}</span>
                  <span className="progress-track mt-1">
                    <span
                      className="progress-fill block"
                      style={{ width: `${g.progress}%`, backgroundColor: g.color }}
                    />
                  </span>
                </span>
                <span className="w-16 flex-shrink-0 text-right text-[12px] text-text-muted">
                  {g.learnedCount}/{g.cardCount}
                </span>
                <span className="w-10 flex-shrink-0 text-right text-[13px] font-semibold text-text-primary">
                  {g.progress}%
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="surface px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-text-muted">{icon}</div>
      <div className="mt-1 text-[20px] font-semibold text-text-primary">{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}

/**
 * Столбики с подписью значения над каждым и подписью дня под ним.
 * Раньше значения печатались только у ненулевых столбиков, и было непонятно,
 * ноль там или просто не подписано.
 */
function BarChart({
  bars,
  max,
  color,
  height,
}: {
  bars: { key: string; label: string; value: number }[];
  max: number;
  color: string;
  height: number;
}) {
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {bars.map((b) => (
        <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div className="text-[11px] leading-none text-text-muted">{b.value}</div>
          <div
            className="w-full rounded-t-[6px] transition-all"
            style={{
              height: `${Math.max(3, (b.value / max) * 100)}%`,
              backgroundColor: color,
              opacity: b.value ? 1 : 0.2,
            }}
          />
          <div className="whitespace-nowrap text-[10px] leading-none text-text-faint">{b.label}</div>
        </div>
      ))}
    </div>
  );
}
