"use client";

/**
 * Обновление приложения на Android и в вебе (§9.4).
 *
 * По просьбе пользователя это не ссылка, а диалог: приложение само скачивает
 * файл с показом процента и сразу отдаёт его системному установщику —
 * остаётся только подтвердить установку.
 *
 * В ПК-сборке компонент молчит: там обновление ставит electron-updater.
 */

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "@/components/Toaster";
import { checkForUpdate, downloadAndInstall, type UpdateInfo } from "@/lib/updates";

const DISMISS_KEY = "flashcards.update.dismissed";

type Phase = "offer" | "downloading" | "installing";

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("offer");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const isDesktop = (window as unknown as { desktop?: { isDesktop?: boolean } }).desktop?.isDesktop;
    if (isDesktop) return;
    (async () => {
      const update = await checkForUpdate();
      if (!update) return;
      if (window.localStorage.getItem(DISMISS_KEY) === update.version) return;
      setInfo(update);
    })();
  }, []);

  if (!info) return null;

  function dismiss() {
    if (phase === "downloading") return;
    if (info) window.localStorage.setItem(DISMISS_KEY, info.version);
    setInfo(null);
  }

  async function handleInstall() {
    if (!info) return;
    setPhase("downloading");
    setPercent(0);
    try {
      const result = await downloadAndInstall(info, setPercent);
      if (result === "installing") {
        setPhase("installing");
      } else {
        setInfo(null);
      }
    } catch (e: unknown) {
      toast(`Не удалось обновиться: ${(e as Error).message}`, "error");
      setPhase("offer");
    }
  }

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--ring-base)] px-5 py-3">
          <div className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <Download size={18} className="text-[var(--accent)]" />
            Доступна версия {info.version}
          </div>
          <button
            className="icon-btn"
            onClick={dismiss}
            disabled={phase === "downloading"}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {phase === "offer" && (
            <>
              <p className="text-sm text-text-secondary">
                Приложение скачает обновление само, а затем предложит его установить.
                Данные и настройки останутся на месте.
              </p>
              {info.notes && (
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl bg-bg-soft p-3 text-xs text-text-muted">
                  {info.notes}
                </div>
              )}
            </>
          )}

          {phase === "downloading" && (
            <>
              <p className="text-sm text-text-secondary">Скачиваем обновление... {percent}%</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-soft">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.max(3, percent)}%` }}
                />
              </div>
            </>
          )}

          {phase === "installing" && (
            <p className="text-sm text-text-secondary">
              Файл скачан. Система спросит разрешение на установку — подтвердите его,
              и приложение обновится поверх текущей версии.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--ring-base)] px-5 py-3">
          {phase !== "downloading" && (
            <button className="pill-button" onClick={dismiss}>
              {phase === "installing" ? "Закрыть" : "Позже"}
            </button>
          )}
          {phase === "offer" && (
            <button
              className="pill-button bg-[var(--accent)]/15 text-[var(--accent)]"
              onClick={handleInstall}
            >
              <Download size={16} /> Скачать и установить
            </button>
          )}
          {phase === "installing" && (
            <button
              className="pill-button bg-[var(--accent)]/15 text-[var(--accent)]"
              onClick={handleInstall}
            >
              Открыть установщик ещё раз
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
