"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useTheme } from "./ThemeProvider";

/**
 * Нативная интеграция Android и iOS (5.9).
 *
 *  - Android: аппаратная кнопка «Назад» возвращает на предыдущий экран, а не
 *    закрывает приложение; выход — только с корневого экрана. На iOS такой
 *    кнопки нет, назад ведёт стрелка в верхней панели.
 *  - iOS: страница рисуется под строкой состояния, поэтому цвет часов и
 *    батареи переключается вместе с темой приложения. Иначе при тёмной теме
 *    на светлой системе (и наоборот) строка состояния сливается с фоном.
 *
 * На web — ничего не делает.
 */
export function NativeBridge() {
  const { theme } = useTheme();

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
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

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Style.Dark — светлый текст для тёмного фона, Style.Light — наоборот.
        await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
      } catch {
        // строка состояния — косметика, запуск из-за неё не должен падать
      }
    })();
  }, [theme]);

  return null;
}
