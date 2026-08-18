"use client";

import { useEffect, useState } from "react";
import { GitBranch, RefreshCcw, Trash2, Download, Upload } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { GitConfig, GitConfigSchema } from "@/lib/types";
import { loadGitConfig, loadSyncStatus, saveGitConfig } from "@/lib/settings";
import { clone, isInitialized, pendingChangesCount } from "@/lib/git";
import { syncNow } from "@/lib/autosync";
import { toast } from "@/components/Toaster";
import { removePath } from "@/lib/fs";
import { useTheme } from "@/components/ThemeProvider";
import { WeekScheduleEditor } from "@/components/WeekSchedule";
import { AppSettings, AppSettingsSchema, WeekSchedule } from "@/lib/model";
import { readSettings, writeSettings } from "@/lib/store";
import {
  enabledOnThisDevice,
  rescheduleNotifications,
  sendTestNotification,
  setEnabledOnThisDevice,
} from "@/lib/notifications";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<GitConfig>(() => GitConfigSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [hasRepo, setHasRepo] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [app, setApp] = useState<AppSettings>(() => AppSettingsSchema.parse({}));
  const [deviceNotifications, setDeviceNotifications] = useState(true);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setCfg(loadGitConfig());
    refresh();
    void readSettings().then(setApp);
    setDeviceNotifications(enabledOnThisDevice());
  }, []);

  /** Настройки приложения лежат в репозитории и переезжают на второе устройство (§5.5). */
  async function updateApp(patch: Partial<AppSettings>) {
    const next = await writeSettings(patch);
    setApp(next);
    if ("notifications" in patch) void rescheduleNotifications();
  }

  async function handleTestNotification() {
    const ok = await sendTestNotification();
    toast(ok ? "Тестовое уведомление отправлено" : "Уведомления запрещены в системе", ok ? "success" : "error");
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
    setBusy(true);
    try {
      await clone(cfg, (m) => toast(m));
      toast("Репозиторий склонирован", "success");
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
      <TopBar back title="Настройки" rightSlot={<div className="w-10" />} />
      <main className="flex-1 px-4 pb-12 pt-2">
        <section className="mb-6 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="mb-3 text-lg font-semibold text-text-primary">Внешний вид</div>
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${theme === t ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40" : "bg-bg-soft text-text-secondary ring-1 ring-[var(--ring-base)]"}`}
              >
                {t === "dark" ? "🌙 Тёмная" : "☀️ Светлая"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <GitBranch size={18} /> Git синхронизация
          </div>
          <p className="text-sm text-text-muted">
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
              <p className="mt-1 text-xs text-text-faint">
                GitHub: Settings → Developer settings → Personal access tokens (Fine-grained) →
                доступ на запись (contents: read/write) к одному репозиторию.
              </p>
            </Field>
            <Field label="CORS-прокси">
              <input
                value={cfg.corsProxy}
                onChange={(e) => update("corsProxy", e.target.value)}
                className="field"
                placeholder="https://your-proxy.workers.dev"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <p className="mt-1 text-xs text-text-faint">
                GitHub не отдаёт CORS, поэтому синхронизация из браузера/телефона идёт через свой
                прокси. Разверни его из папки <code>cors-proxy/</code> (Cloudflare Workers, бесплатно)
                и вставь сюда URL. Пусто — синхронизация только нативным git с ПК.
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
              className="pill-button bg-purple-500/20 text-purple-600 hover:bg-purple-500/30"
            >
              <Download size={16} /> Клонировать
            </button>
            <button
              onClick={handleSync}
              disabled={busy || !cfg.remoteUrl}
              className="pill-button bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30"
            >
              <RefreshCcw size={16} className={busy ? "animate-spin" : ""} />
              Sync (pull + push)
            </button>
          </div>

          <div className="space-y-1 pt-3 text-xs text-text-muted">
            <div>Локальный репозиторий: {hasRepo ? "инициализирован" : "не инициализирован"}</div>
            <div>Несинхронизированных файлов: {pending}</div>
            <div>Последняя синхронизация: {lastSync ?? "—"}</div>
          </div>
        </section>

        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="text-lg font-semibold text-text-primary">Обучение</div>
          <p className="text-xs text-text-muted">
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
            <div className="mb-1 flex items-center justify-between text-sm text-text-secondary">
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
            <p className="mt-1 text-xs text-text-faint">
              Насколько уверенно нужно помнить материал. Выше — повторов больше, забывается меньше.
            </p>
          </label>
          <SyncToggle
            label="Строгий режим: не засчитывать прохождение без синхронизации"
            checked={app.strictOffline}
            onChange={(v) => updateApp({ strictOffline: v })}
          />
        </section>

        <div className="mb-3">
          <WeekScheduleEditor
            title="Напоминания"
            hint="Локальные уведомления без сервера: работают офлайн. На ПК приходят, пока приложение запущено (в трее), на телефоне — по системному расписанию."
            value={app.notifications as WeekSchedule}
            onChange={(v) => updateApp({ notifications: v })}
          />
        </div>

        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <SyncToggle
            label="Показывать уведомления на этом устройстве"
            checked={deviceNotifications}
            onChange={(v) => {
              setDeviceNotifications(v);
              setEnabledOnThisDevice(v);
            }}
          />
          <p className="text-xs text-text-faint">
            Расписание общее для всех устройств, а этот тумблер — только для текущего.
          </p>
          <button onClick={handleTestNotification} className="pill-button">
            Проверить уведомление
          </button>
        </section>

        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="text-lg font-semibold text-text-primary">Когда синхронизировать</div>
          <p className="text-xs text-text-muted">
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

        <div className="mb-6">
          <WeekScheduleEditor
            title="Синхронизация по расписанию"
            hint="Например, каждый день в 03:00 — приложение подтянет и отправит изменения само."
            value={app.syncSchedule as WeekSchedule}
            onChange={(v) => updateApp({ syncSchedule: v })}
          />
        </div>

        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="text-lg font-semibold text-text-primary">Опасная зона</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleWipeToken}
              disabled={!cfg.token}
              className="pill-button bg-amber-500/15 text-amber-600 hover:bg-amber-500/30"
            >
              <Trash2 size={16} /> Стереть токен
            </button>
            <button
              onClick={handleWipeRepo}
              className="pill-button bg-red-500/15 text-red-500 hover:bg-red-500/30"
            >
              <Trash2 size={16} /> Удалить локальные данные
            </button>
          </div>
          <p className="text-xs text-text-faint">
            «Стереть токен» убирает Personal Access Token из этого устройства (на общем/чужом
            устройстве). Колоды и репозиторий остаются.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Upload size={18} /> Как использовать
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
            <li>Создай пустой репозиторий на GitHub (например <code>flashcards</code>).</li>
            <li>
              GitHub → Settings → Developer settings → Personal access tokens (Fine-grained) → создай
              токен с правом «Contents: Read and write» на этот репо.
            </li>
            <li>
              Разверни CORS-прокси из папки <code>cors-proxy/</code> (одна команда{" "}
              <code>npx wrangler deploy</code>) и вставь его URL в поле «CORS-прокси».
            </li>
            <li>Вставь URL репозитория и токен на этой странице, нажми «Клонировать».</li>
            <li>Создавай колоды/карточки — нажимай «Sync» чтобы запушить.</li>
            <li>На другом устройстве сделай то же самое — данные подтянутся.</li>
          </ol>
        </section>
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
    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-bg-soft px-4 py-3 ring-1 ring-[var(--ring-base)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span className="text-sm text-text-secondary">{label}</span>
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
      <span className="text-sm text-text-secondary">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="field w-28 px-3 py-1.5 text-sm"
      />
    </label>
  );
}
