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

export default function ReportPage() {
  const router = useRouter();
  const [byDay, setByDay] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<CardProgress[]>([]);
  const [groups, setGroups] = useState<DeckSummary[]>([]);
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

  const due = useMemo(() => progress.filter((p) => isDue(p)).length, [progress]);
  const fresh = useMemo(() => progress.filter((p) => isNew(p)).length, [progress]);
  const plan = useMemo(() => forecast(progress, 7), [progress]);
  const weekMax = Math.max(1, ...week.map((w) => w.count));
  const planMax = Math.max(1, ...Object.values(plan));
  const totalWeek = week.reduce((s, w) => s + w.count, 0);

  if (loading) {
    return (
      <>
        <TopBar back title="Отчёт" rightSlot={<div className="w-10" />} />
        <div className="flex-1 px-4 py-12 text-center text-text-muted">Считаем...</div>
      </>
    );
  }

  return (
    <>
      <TopBar back title="Отчёт" rightSlot={<div className="w-10" />} />
      <main className="flex-1 space-y-4 px-4 pb-12 pt-2">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Flame size={16} />} label="Дней подряд" value={currentStreak(byDay)} />
          <Stat icon={<TrendingUp size={16} />} label="Лучшая серия" value={bestStreak(byDay)} />
          <Stat icon={<CalendarDays size={16} />} label="За неделю" value={totalWeek} />
        </div>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-sm font-medium text-text-secondary">Последние 7 дней</div>
          <div className="flex h-32 items-end gap-2">
            {week.map((w) => (
              <div key={w.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[11px] text-text-muted">{w.count || ""}</div>
                <div
                  className="w-full rounded-t-lg bg-[var(--accent)] transition-all"
                  style={{
                    height: `${Math.max(4, (w.count / weekMax) * 100)}%`,
                    opacity: w.count ? 1 : 0.25,
                  }}
                />
                <div className="text-[11px] text-text-faint">{w.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Уровни запоминания</span>
            <span className="text-xs text-text-faint">
              к повторению {due} · новых {fresh}
            </span>
          </div>
          <div className="space-y-2">
            {([1, 2, 3, 4, 5] as Box[]).map((b) => {
              const total = Math.max(1, progress.length);
              return (
                <div key={b} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-text-muted">{BOX_LABEL[b]}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-bg-soft">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(levels[b] / total) * 100}%`,
                        backgroundColor: BOX_COLORS[b],
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-text-muted">{levels[b]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-sm font-medium text-text-secondary">
            Нагрузка на ближайшую неделю
          </div>
          <div className="flex h-24 items-end gap-2">
            {Object.entries(plan).map(([day, count]) => (
              <div key={day} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[11px] text-text-muted">{count || ""}</div>
                <div
                  className="w-full rounded-t-lg bg-emerald-500 transition-all"
                  style={{
                    height: `${Math.max(4, (count / planMax) * 100)}%`,
                    opacity: count ? 1 : 0.25,
                  }}
                />
                <div className="text-[10px] text-text-faint">{day.slice(8)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-sm font-medium text-text-secondary">По группам</div>
          <div className="space-y-2">
            {groups.length === 0 && <div className="text-sm text-text-muted">Групп пока нет</div>}
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => router.push(`/deck?id=${g.id}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-bg-soft px-3 py-2 text-left hover:bg-[var(--ring-base)]"
              >
                <span
                  className="h-8 w-8 flex-shrink-0 rounded-lg"
                  style={{ backgroundColor: g.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{g.name}</span>
                <span className="text-xs text-text-muted">
                  {g.learnedCount}/{g.cardCount}
                </span>
                <span className="w-10 text-right text-xs font-semibold text-[var(--accent)]">
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
    <div className="rounded-2xl bg-bg-card px-3 py-3 text-center ring-1 ring-[var(--ring-base)]">
      <div className="flex items-center justify-center gap-1 text-[var(--accent)]">{icon}</div>
      <div className="mt-1 text-xl font-semibold text-text-primary">{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}
