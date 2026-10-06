"use client";

/**
 * Веб-версия — сайт на GitHub Pages, который на iPhone ставится через
 * «На экран „Домой“» и открывается без панелей Safari.
 *
 *  - service worker (public/sw.js собирает scripts/build-web.mjs) кладёт
 *    приложение в кэш: без интернета оно открывается и работает, синхронизация
 *    просто ждёт сети, как и в APK;
 *  - persist() просит браузер не стирать данные сайта при нехватке места;
 *  - в Safari, а не с иконки, — подсказка: у иконки на экране «Домой» своё
 *    хранилище, настройки и карточки из вкладки Safari туда не переезжают.
 *
 * В ПК-приложении, APK и IPA компонент ничего не делает.
 */

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { detectPlatform } from "@/lib/platform";

const HINT_KEY = "flashcards.web.homeScreenHint";

function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function WebAppBridge() {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    (async () => {
      if ((await detectPlatform()) !== "web") return;
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
        navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {
          // сборка без sw.js (обычный next build) — работаем без офлайн-кэша
        });
      }
      navigator.storage?.persist?.().catch(() => {});
      try {
        if (isIos() && !isStandalone() && localStorage.getItem(HINT_KEY) !== "1") setHint(true);
      } catch {
        // localStorage недоступен (приватный режим) — без подсказки
      }
    })();
  }, []);

  if (!hint) return null;

  function dismiss() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // не запомнили — покажем ещё раз, не страшно
    }
    setHint(false);
  }

  return (
    <div className="fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top,0px))] z-40 flex justify-center px-3">
      <div className="surface flex w-full max-w-md items-start gap-3 p-4 shadow-[var(--shadow-float)]">
        <Share size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <p className="flex-1 text-[13px] leading-relaxed text-text-secondary">
          Чтобы пользоваться как приложением: кнопка «Поделиться» → «На экран „Домой“», затем
          откройте Flashcards с иконки и уже там заполните настройки синхронизации. У иконки своё
          хранилище — данные из этой вкладки туда не переносятся.
        </p>
        <button className="icon-btn -mr-1 -mt-1 shrink-0" onClick={dismiss} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
