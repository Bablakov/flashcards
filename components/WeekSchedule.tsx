"use client";

/**
 * Расписание «день недели + время». Используется и для уведомлений (§8.2),
 * и для синхронизации (§7.2) — формат один и тот же и синхронизируется
 * между устройствами через settings.json.
 */

import { WeekSchedule } from "@/lib/model";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Пн" },
  { key: "tue", label: "Вт" },
  { key: "wed", label: "Ср" },
  { key: "thu", label: "Чт" },
  { key: "fri", label: "Пт" },
  { key: "sat", label: "Сб" },
  { key: "sun", label: "Вс" },
];

const DEFAULT_TIME = "08:00";

export function WeekScheduleEditor({
  value,
  onChange,
  title,
  hint,
}: {
  value: WeekSchedule;
  onChange: (next: WeekSchedule) => void;
  title: string;
  hint?: string;
}) {
  function toggleDay(day: string, on: boolean) {
    const days = { ...value.days };
    if (on) days[day] = days[day] || DEFAULT_TIME;
    else delete days[day];
    onChange({ ...value, days });
  }

  function setTime(day: string, time: string) {
    onChange({ ...value, days: { ...value.days, [day]: time } });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-base font-semibold text-text-primary">{title}</span>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
      </label>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}

      {value.enabled && (
        <div className="space-y-1.5">
          {DAYS.map((d) => {
            const time = value.days[d.key];
            const on = !!time;
            return (
              <div key={d.key} className="flex items-center gap-3 rounded-lg bg-bg-soft px-3 py-2">
                <input type="checkbox" checked={on} onChange={(e) => toggleDay(d.key, e.target.checked)} />
                <span className="w-8 text-sm text-text-secondary">{d.label}</span>
                <input
                  type="time"
                  value={time ?? DEFAULT_TIME}
                  disabled={!on}
                  onChange={(e) => setTime(d.key, e.target.value)}
                  className="field w-32 px-3 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
