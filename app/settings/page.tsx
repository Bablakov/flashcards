"use client";

import { useEffect, useState } from "react";
import { GitBranch, RefreshCcw, Trash2, Download, Upload } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { GitConfig, GitConfigSchema } from "@/lib/types";
import { loadGitConfig, loadSyncStatus, saveGitConfig } from "@/lib/settings";
import { syncAll, clone, isInitialized, pendingChangesCount } from "@/lib/git";
import { toast } from "@/components/Toaster";
import { removePath } from "@/lib/fs";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<GitConfig>(() => GitConfigSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [hasRepo, setHasRepo] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    setCfg(loadGitConfig());
    refresh();
  }, []);

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
      await syncAll(cfg, "Update from web", (m) => toast(m));
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

  return (
    <>
      <TopBar back title="Настройки" rightSlot={<div className="w-10" />} />
      <main className="flex-1 px-4 pb-12 pt-2">
        <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <GitBranch size={18} /> Git синхронизация
          </div>
          <p className="text-sm text-neutral-400">
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
              <p className="mt-1 text-xs text-neutral-500">
                GitHub: Settings → Developer settings → Personal access tokens (Fine-grained) →
                доступ на запись (contents: read/write) к одному репозиторию.
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
              className="pill-button bg-purple-500/20 hover:bg-purple-500/30"
            >
              <Download size={16} /> Клонировать
            </button>
            <button
              onClick={handleSync}
              disabled={busy || !cfg.remoteUrl}
              className="pill-button bg-emerald-500/20 hover:bg-emerald-500/30"
            >
              <RefreshCcw size={16} className={busy ? "animate-spin" : ""} />
              Sync (pull + push)
            </button>
          </div>

          <div className="space-y-1 pt-3 text-xs text-neutral-400">
            <div>Локальный репозиторий: {hasRepo ? "инициализирован" : "не инициализирован"}</div>
            <div>Несинхронизированных файлов: {pending}</div>
            <div>Последняя синхронизация: {lastSync ?? "—"}</div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
          <div className="text-lg font-semibold">Опасная зона</div>
          <button
            onClick={handleWipeRepo}
            className="pill-button bg-red-500/20 text-red-200 hover:bg-red-500/30"
          >
            <Trash2 size={16} /> Удалить локальные данные
          </button>
        </section>

        <section className="mt-6 space-y-2 rounded-2xl bg-bg-card p-4 ring-1 ring-white/5">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Upload size={18} /> Как использовать
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            <li>
              Создай пустой репозиторий на GitHub (например <code>flashcards</code>).
            </li>
            <li>
              GitHub → Settings → Developer settings → Personal access tokens (Fine-grained) → создай
              токен с правом «Contents: Read and write» на этот репо.
            </li>
            <li>Вставь URL и токен на этой странице, нажми «Клонировать».</li>
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
      <div className="mb-1 text-sm font-medium text-neutral-300">{label}</div>
      {children}
    </label>
  );
}
