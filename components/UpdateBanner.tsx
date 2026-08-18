"use client";

/**
 * Плашка «доступна новая версия» для Android и веба (§9.4).
 * В ПК-сборке обновление ставит electron-updater, поэтому там плашка не нужна.
 */

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { checkForUpdate, type UpdateInfo } from "@/lib/updates";

const DISMISS_KEY = "flashcards.update.dismissed";

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

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
    if (info) window.localStorage.setItem(DISMISS_KEY, info.version);
    setInfo(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 bg-[var(--accent)] px-4 py-3 text-white shadow-lg">
      <Download size={18} />
      <span className="flex-1 text-sm">Доступна версия {info.version}</span>
      <a
        href={info.apkUrl ?? info.url}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold hover:bg-white/30"
      >
        {info.apkUrl ? "Скачать APK" : "Открыть"}
      </a>
      <button onClick={dismiss} className="rounded-full p-1.5 opacity-80 hover:opacity-100" aria-label="Закрыть">
        <X size={16} />
      </button>
    </div>
  );
}
