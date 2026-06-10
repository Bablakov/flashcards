"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Нативная интеграция Android (5.9): аппаратная кнопка «Назад» возвращает на
 * предыдущий экран, а не закрывает приложение; выход — только с корневого экрана.
 * На web — ничего не делает.
 */
export function NativeBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });
      cleanup = () => void handle.remove();
    })();
    return () => cleanup?.();
  }, []);

  return null;
}
