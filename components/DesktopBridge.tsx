"use client";

/**
 * Связка окна с десктопной оболочкой: плашка обновления (§9.3) и команда
 * «Синхронизировать» из меню в трее. В браузере и на Android компонент
 * ничего не делает.
 */

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@/components/Toaster";

interface DesktopApi {
  isDesktop: boolean;
  installUpdate: () => Promise<void>;
  onSyncRequest: (handler: () => void) => void;
  onUpdateReady: (handler: (version: string) => void) => void;
}

function api(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  const d = (window as unknown as { desktop?: DesktopApi }).desktop;
  return d?.isDesktop ? d : null;
}

export function DesktopBridge() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    const desktop = api();
    if (!desktop) return;

    desktop.onUpdateReady((version) => setUpdateVersion(version || "новая"));
    desktop.onSyncRequest(() => {
      void import("@/lib/autosync").then(async (m) => {
        try {
          await m.syncNow();
          toast("Синхронизировано", "success");
        } catch (e: unknown) {
          toast(`Синхронизация: ${(e as Error).message}`, "error");
        }
      });
    });
  }, []);

  if (!updateVersion) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 bg-[var(--accent)] px-4 py-3 text-white shadow-lg">
      <Download size={18} />
      <span className="flex-1 text-sm">
        Готова версия {updateVersion}. Перезапустить приложение и обновиться?
      </span>
      <button
        onClick={() => api()?.installUpdate()}
        className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold hover:bg-white/30"
      >
        Обновить
      </button>
      <button
        onClick={() => setUpdateVersion(null)}
        className="rounded-full px-3 py-1.5 text-sm opacity-80 hover:opacity-100"
      >
        Позже
      </button>
    </div>
  );
}
