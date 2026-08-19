"use client";

import { useEffect, useState } from "react";
import { GitBranch, RefreshCcw, Trash2, Download, Upload } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { GitConfig, GitConfigSchema } from "@/lib/types";
import { loadGitConfig, loadSyncStatus, saveGitConfig } from "@/lib/settings";
import {
  checkAccess,
  cloneFresh,
  hasLocalData,
  isInitialized,
  pendingChangesCount,
  rebuildLocalRepo,
} from "@/lib/git";
import { onSyncStateChange, syncNow } from "@/lib/autosync";
import { toast } from "@/components/Toaster";
import { removePath } from "@/lib/fs";
import { useTheme } from "@/components/ThemeProvider";
import { WeekScheduleEditor } from "@/components/WeekSchedule";
import { AboutBlock } from "@/components/AboutBlock";
import { AppSettings, AppSettingsSchema, WeekSchedule } from "@/lib/model";
import { readSettings, writeSettings } from "@/lib/store";
import {
  describeSchedule,
  enabledOnThisDevice,
  rescheduleNotifications,
  sendTestNotification,
  setEnabledOnThisDevice,
  type ScheduleInfo,
} from "@/lib/notifications";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<GitConfig>(() => GitConfigSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [hasRepo, setHasRepo] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [app, setApp] = useState<AppSettings>(() => AppSettingsSchema.parse({}));
  const [deviceNotifications, setDeviceNotifications] = useState(true);
  const [access, setAccess] = useState<string | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setCfg(loadGitConfig());
    refresh();
    void readSettings().then(setApp);
    setDeviceNotifications(enabledOnThisDevice());
    void refreshSchedule();
    // Пока идёт автоматическая синхронизация, кнопки гасим.
    const offSync = onSyncStateChange(setBusy);
    const desktop = (window as unknown as {
      desktop?: { isDesktop: boolean; getAutoLaunch: () => Promise<boolean>; setAutoLaunch: (v: boolean) => Promise<boolean> };
    }).desktop;
    if (desktop?.isDesktop) {
      setIsDesktop(true);
      void desktop.getAutoLaunch().then(setAutoLaunch);
    }
    return offSync;
  }, []);

  /** Настройки приложения лежат в репозитории и переезжают на второе устройство (§5.5). */
  async function updateApp(patch: Partial<AppSettings>) {
    const next = await writeSettings(patch);
    setApp(next);
    if ("notifications" in patch) {
      void rescheduleNotifications().then(refreshSchedule);
    }
  }

  async function handleTestNotification(delaySeconds: number) {
    const ok = await sendTestNotification(delaySeconds);
    if (!ok) {
      toast("Уведомления запрещены в системе", "error");
      return;
    }
    toast(
      delaySeconds > 0
        ? `Придёт через ${delaySeconds} секунд — сверни приложение и проверь`
        : "Тестовое уведомление отправлено",
      "success",
    );
    setTimeout(() => void refreshSchedule(), (delaySeconds + 2) * 1000);
  }

  /** Показывает, что реально зарегистрировано в системе, а не что мы попросили. */
  async function refreshSchedule() {
    try {
      setSchedule(await describeSchedule());
    } catch {
      setSchedule(null);
    }
  }

  async function refresh() {
    try {
      setHasRepo(await isInitialized());
      setPending(await pendingChangesCount());
    } catch {
      // ignore
    }
    setLastSync(loadSyncStatus().lastSyncAt);
  }

  function update<K extends keyof GitConfig>(key: K, value: GitConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  function persist() {
    saveGitConfig(cfg);
    toast("Настройки сохранены", "success");
  }

  async function handleClone() {
    persist();
    // Подключение заменяет локальную копию содержимым репозитория: клонировать
    // поверх своих данных git не даст (ошибка checkout по meta.json).
    if (await hasLocalData()) {
      const ok = window.confirm(
        [
          "Карточки на этом устройстве будут заменены содержимым репозитория.",
          "Если локальные карточки нужны — сначала сохраните их через Экспорт .fcdeck.",
          "Продолжить?",
        ].join("\n\n"),
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await cloneFresh(cfg, (m) => toast(m));
      toast("Данные загружены из репозитория", "success");
      await refresh();
    } catch (e: unknown) {
      toast(`Ошибка: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    persist();
    setBusy(true);
    try {
      await syncNow((m) => toast(m));
      toast("Готово", "success");
      await refresh();
    } catch (e: unknown) {
      toast(`Ошибка: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  /** Диагностика: спрашиваем у GitHub отдельно про чтение и запись (§ошибки 401/403). */
  async function handleCheckAccess() {
    persist();
    setBusy(true);
    setAccess(null);
    try {
      const report = await checkAccess(cfg);
      setAccess(report.summary);
      toast(report.summary, report.read.ok && report.write.ok ? "success" : "error");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setAccess(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  /** Чинит служебную часть репозитория, сохраняя карточки на устройстве. */
  async function handleRebuild() {
    persist();
    setBusy(true);
    try {
      await rebuildLocalRepo(cfg, (m) => toast(m));
      await syncNow((m) => toast(m));
      toast("Локальный репозиторий пересобран, данные на месте", "success");
      await refresh();
    } catch (e: unknown) {
      toast(`Ошибка: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleWipeRepo() {
    if (!window.confirm("Удалить локальные данные? Сначала запушь изменения, иначе потеряешь их."))
      return;
    setBusy(true);
    try {
      await removePath("/repo");
      toast("Локальные данные удалены", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleWipeToken() {
    const next = { ...cfg, token: "" };
    setCfg(next);
    saveGitConfig(next);
    toast("Токен стёрт с этого устройства", "success");
  }

  return (
    <>
      <TopBar back title="Настройки" hideDefaults />
      <main className="flex-1 space-y-3 px-4 pb-4 pt-3">
        <AboutBlock />

        <section className="surface">
          <div className="mb-3 text-[15px] font-semibold text-text-primary">Внешний вид</div>
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 rounded-[14px] px-4 py-3 text-[14px] font-medium transition ${theme === t ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "surface-flat text-text-secondary"}`}
              >
                {t === "dark" ? "🌙 Тёмная" : "☀️ Светлая"}
              </button>
            ))}
          </div>
        </section>

        <section className="surface space-y-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <GitBranch size={18} /> Git синхронизация
          </div>
          <p className="text-[13px] leading-relaxed text-text-muted">
            Введи URL Git-репозитория (HTTPS) и Personal Access Token. Все колоды и карточки хранятся
            в этом репозитории — обе стороны (телефон и сайт) подключаются к одному репо и
            синхронизируются.
          </p>
          <div className="space-y-3">
            <Field label="URL репозитория">
              <input
                value={cfg.remoteUrl}
                onChange={(e) => update("remoteUrl", e.target.value)}
                className="field"
                placeholder="https://github.com/username/flashcards.git"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
            </Field>
            <Field label="Ветка">
              <input
                value={cfg.branch}
                onChange={(e) => update("branch", e.target.value)}
                className="field"
                placeholder="main"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Имя пользователя">
                <input
                  value={cfg.username}
                  onChange={(e) => update("username", e.target.value)}
                  className="field"
                  placeholder="github-username"
                  autoCapitalize="off"
                />
              </Field>
              <Field label="E-mail">
                <input
                  value={cfg.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="field"
                  placeholder="me@example.com"
                />
              </Field>
            </div>
            <Field label="Personal Access Token">
              <input
                type="password"
                value={cfg.token}
                onChange={(e) => update("token", e.target.value)}
                className="field"
                placeholder="ghp_..."
                spellCheck={false}
                autoComplete="new-password"
              />
              <p className="hint-text mt-1">
                GitHub: Settings → Developer settings → Personal access tokens (Fine-grained) →
                доступ на запись (contents: read/write) к одному репозиторию.
              </p>
            </Field>
            <Field label="CORS-прокси — оставьте пустым">
              <input
                value={cfg.corsProxy}
                onChange={(e) => update("corsProxy", e.target.value)}
                className="field"
                placeholder="не требуется"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <p className="hint-text mt-1">
                Приложению на ПК и на телефоне прокси не нужен: запросы к GitHub идут мимо
                браузерных ограничений. Поле пригодится, только если открыть приложение как
                обычный сайт в браузере.
              </p>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={persist} className="pill-button">
              Сохранить настройки
            </button>
            <button
              onClick={handleClone}
              disabled={busy || !cfg.remoteUrl}
              className="pill-button"
            >
              <Download size={16} /> Подключить и заменить данные
            </button>
            <button
              onClick={handleSync}
              disabled={busy || !cfg.remoteUrl}
              className="btn-primary py-2"
            >
              <RefreshCcw size={16} className={busy ? "animate-spin" : ""} />
              Синхронизировать
            </button>
            <button
              onClick={handleCheckAccess}
              disabled={busy || !cfg.remoteUrl}
              className="pill-button"
            >
              Проверить доступ
            </button>
            <button
              onClick={handleRebuild}
              disabled={busy || !cfg.remoteUrl}
              className="pill-button"
              title="Собирает служебную часть репозитория заново; карточки на устройстве остаются"
            >
              Пересобрать репозиторий
            </button>
          </div>

          {access && (
            <div className="surface-flat px-4 py-3 text-[13px] text-text-secondary">
              {access}
            </div>
          )}

          <div className="space-y-1 pt-3 text-[12px] text-text-muted">
            <div>Локальный репозиторий: {hasRepo ? "инициализирован" : "не инициализирован"}</div>
            <div>Несинхронизированных файлов: {pending}</div>
            <div>Последняя синхронизация: {lastSync ?? "—"}</div>
          </div>
        </section>

        <section className="surface space-y-3">
          <div className="text-[15px] font-semibold text-text-primary">Обучение</div>
          <p className="hint-text">
            Лимиты защищают от завала после перерыва: после недельной паузы приложение не
            вывалит все просроченные карточки сразу.
          </p>
          <NumberField
            label="Новых карточек в день"
            value={app.dailyNewLimit}
            min={1}
            max={200}
            onChange={(v) => updateApp({ dailyNewLimit: v })}
          />
          <NumberField
            label="Повторов в день"
            value={app.dailyReviewLimit}
            min={10}
            max={1000}
            onChange={(v) => updateApp({ dailyReviewLimit: v })}
          />
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-[14px] text-text-secondary">
              <span>Целевая удерживаемость</span>
              <span className="text-text-muted">{Math.round(app.retention * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.85}
              max={0.95}
              step={0.01}
              value={app.retention}
              onChange={(e) => updateApp({ retention: Number(e.target.value) })}
              className="w-full"
            />
            <p className="hint-text mt-1">
              Насколько уверенно нужно помнить материал. Выше — повторов больше, забывается меньше.
            </p>
          </label>
          <SyncToggle
            label="Строгий режим: не засчитывать прохождение без синхронизации"
            checked={app.strictOffline}
            onChange={(v) => updateApp({ strictOffline: v })}
          />
        </section>

        <div>
          <WeekScheduleEditor
            title="Напоминания"
            hint="Локальные уведомления без сервера: работают офлайн. На ПК приходят, пока приложение запущено (в трее), на телефоне — по системному расписанию."
            value={app.notifications as WeekSchedule}
            onChange={(v) => updateApp({ notifications: v })}
          />
        </div>

        <section className="surface space-y-3">
          <SyncToggle
            label="Показывать уведомления на этом устройстве"
            checked={deviceNotifications}
            onChange={(v) => {
              setDeviceNotifications(v);
              setEnabledOnThisDevice(v);
            }}
          />
          <p className="hint-text">
            Расписание общее для всех устройств, а этот тумблер — только для текущего.
          </p>

          {schedule && (
            <div className="surface-flat space-y-1 px-4 py-3 text-[12px] text-text-muted">
              <div>
                Разрешение системы:{" "}
                <span className={schedule.permission === "granted" ? "text-text-primary" : "text-red-500"}>
                  {schedule.permission === "granted"
                    ? "выдано"
                    : schedule.permission === "denied"
                      ? "запрещено"
                      : "неизвестно"}
                </span>
              </div>
              {schedule.registered !== null && (
                <div>
                  Зарегистрировано в системе:{" "}
                  <span className="text-text-primary">{schedule.registered}</span>
                </div>
              )}
              <div>
                Ближайшее напоминание:{" "}
                <span className="text-text-primary">
                  {schedule.next ? schedule.next.toLocaleString("ru-RU") : "не запланировано"}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleTestNotification(0)} className="pill-button">
              Проверить сейчас
            </button>
            {/* Настоящая проверка: уведомление должно прийти, когда приложение свёрнуто. */}
            <button onClick={() => handleTestNotification(15)} className="pill-button">
              Проверить через 15 секунд
            </button>
            <button onClick={() => void refreshSchedule()} className="pill-button">
              Обновить
            </button>
          </div>
          {isDesktop && (
            <>
              <SyncToggle
                label="Запускать вместе с Windows (свёрнутым в трей)"
                checked={autoLaunch}
                onChange={async (v) => {
                  const desktop = (window as unknown as {
                    desktop?: { setAutoLaunch: (x: boolean) => Promise<boolean> };
                  }).desktop;
                  const next = (await desktop?.setAutoLaunch(v)) ?? false;
                  setAutoLaunch(next);
                }}
              />
              <p className="hint-text">
                На ПК уведомление приходит, только пока приложение запущено. Автозапуск и трей
                нужны, чтобы напоминания срабатывали без открытого окна.
              </p>
            </>
          )}
        </section>

        <section className="surface space-y-3">
          <div className="text-[15px] font-semibold text-text-primary">Когда синхронизировать</div>
          <p className="hint-text">
            Варианты комбинируются. Изменения коммитятся сразу и в офлайне — отправка просто
            откладывается до сети. Настройки переезжают на второе устройство сами.
          </p>
          <SyncToggle
            label="При запуске приложения"
            checked={app.syncOnStart}
            onChange={(v) => updateApp({ syncOnStart: v })}
          />
          <SyncToggle
            label="После изменений (через 3 секунды тишины)"
            checked={app.syncOnChange}
            onChange={(v) => updateApp({ syncOnChange: v })}
          />
          <SyncToggle
            label="При выходе и сворачивании"
            checked={app.syncOnExit}
            onChange={(v) => updateApp({ syncOnExit: v })}
          />
        </section>

        <div>
          <WeekScheduleEditor
            title="Синхронизация по расписанию"
            hint="Например, каждый день в 03:00 — приложение подтянет и отправит изменения само."
            value={app.syncSchedule as WeekSchedule}
            onChange={(v) => updateApp({ syncSchedule: v })}
          />
        </div>

        <section className="surface space-y-3">
          <div className="text-[15px] font-semibold text-text-primary">Опасная зона</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleWipeToken}
              disabled={!cfg.token}
              className="pill-button"
            >
              <Trash2 size={16} /> Стереть токен
            </button>
            <button
              onClick={handleWipeRepo}
              className="pill-button text-red-500"
            >
              <Trash2 size={16} /> Удалить локальные данные
            </button>
          </div>
          <p className="hint-text">
            «Стереть токен» убирает Personal Access Token из этого устройства (на общем/чужом
            устройстве). Колоды и репозиторий остаются.
          </p>
        </section>

        <section className="surface space-y-2">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Upload size={18} /> Как использовать
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-text-secondary">
            <li>Создай приватный репозиторий на GitHub (например <code>flashcards-data</code>).</li>
            <li>
              GitHub → Settings → Developer settings → Personal access tokens (Fine-grained) → создай
              токен с правом «Contents: Read and write» на этот репозиторий. Read-only не подойдёт:
              приложению нужно писать.
            </li>
            <li>
              Заполни на этой странице адрес, имя пользователя, e-mail и токен. Поле «CORS-прокси»
              оставь пустым.
            </li>
            <li>Нажми «Проверить доступ» — сразу видно, есть ли право записи.</li>
            <li>
              На первом устройстве нажми «Синхронизировать», на втором — «Подключить и заменить
              данные», чтобы забрать всё из репозитория.
            </li>
          </ol>
        </section>
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

function SyncToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="surface-flat flex cursor-pointer items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span className="text-[14px] text-text-secondary">{label}</span>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-text-secondary">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="field w-28 px-3 py-1.5 text-[14px]"
      />
    </label>
  );
}
