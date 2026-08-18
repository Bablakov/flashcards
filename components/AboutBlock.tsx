"use client";

/**
 * Блок «О приложении» в настройках: версия, где она установлена, когда была
 * последняя синхронизация и что именно сломалось в прошлый раз.
 *
 * Кнопка «Скопировать диагностику» собирает всё это в текст — чтобы не
 * пересказывать ошибку словами, а вставить одним куском.
 */

import { useEffect, useState } from "react";
import { Copy, Info, RefreshCcw } from "lucide-react";
import { toast } from "@/components/Toaster";
import { loadGitConfig, loadSyncStatus } from "@/lib/settings";
import { getDeviceId } from "@/lib/device";
import { checkForUpdate, currentVersion } from "@/lib/updates";

type Platform = "ПК (Electron)" | "Android" | "Браузер";

async function detectPlatform(): Promise<Platform> {
  if ((window as unknown as { desktop?: { isDesktop?: boolean } }).desktop?.isDesktop) {
    return "ПК (Electron)";
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) return "Android";
  } catch {
    // не Capacitor-сборка
  }
  return "Браузер";
}

function formatMoment(iso: string | null): string {
  if (!iso) return "ещё не было";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU");
}

export function AboutBlock() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void detectPlatform().then(setPlatform);
    const status = loadSyncStatus();
    setLastSync(status.lastSyncAt);
    setLastError(status.lastError);
  }, []);

  function refreshStatus() {
    const status = loadSyncStatus();
    setLastSync(status.lastSyncAt);
    setLastError(status.lastError);
  }

  async function handleCheckUpdate() {
    setChecking(true);
    try {
      const update = await checkForUpdate(true);
      toast(
        update
          ? `Доступна версия ${update.version} — обновиться можно со страницы релиза`
          : `Установлена последняя версия (${currentVersion()})`,
        "success",
      );
    } catch {
      toast("Не удалось проверить обновления — нет сети?", "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleCopy() {
    const cfg = loadGitConfig();
    const text = [
      `Версия: ${currentVersion()}`,
      `Платформа: ${platform ?? "?"}`,
      `Устройство: ${getDeviceId()}`,
      `Репозиторий: ${cfg.remoteUrl || "не задан"}`,
      `Ветка: ${cfg.branch || "не задана"}`,
      `Токен: ${cfg.token ? `задан, ${cfg.token.length} символов, начинается с ${cfg.token.slice(0, 10)}…` : "НЕ ЗАДАН"}`,
      `CORS-прокси: ${cfg.corsProxy || "пусто (правильно для ПК и Android)"}`,
      `Последняя синхронизация: ${formatMoment(lastSync)}`,
      `Последняя ошибка: ${lastError ?? "нет"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Диагностика скопирована — можно вставить в переписку", "success");
    } catch {
      toast(text, "error");
    }
  }

  return (
    <section className="mb-6 space-y-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
      <div className="flex items-center gap-2">
        <Info size={18} className="text-[var(--accent)]" />
        <span className="text-lg font-semibold text-text-primary">О приложении</span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row label="Версия" value={currentVersion()} />
        <Row label="Платформа" value={platform ?? "определяем..."} />
        <Row label="Последняя синхронизация" value={formatMoment(lastSync)} />
        <Row label="Идентификатор устройства" value={getDeviceId()} />
      </dl>

      {lastError && (
        <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <div className="mb-1 font-medium">Последняя ошибка синхронизации</div>
          {lastError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={handleCheckUpdate} disabled={checking} className="pill-button">
          <RefreshCcw size={16} className={checking ? "animate-spin" : ""} />
          Проверить обновления
        </button>
        <button onClick={handleCopy} className="pill-button">
          <Copy size={16} /> Скопировать диагностику
        </button>
        <button onClick={refreshStatus} className="pill-button">
          Обновить статус
        </button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right text-text-primary">{value}</dd>
    </div>
  );
}
