"use client";

/**
 * Где запущено приложение. Одна кодовая база собирается в три приложения
 * (ПК, Android, iOS) и открывается как сайт, а различаются они немногим:
 * как ставить обновление и как подписать платформу в диагностике.
 *
 * Для «нативный HTTP / локальные уведомления / камера» достаточно
 * Capacitor.isNativePlatform() — там Android и iOS ведут себя одинаково.
 */

export type AppPlatform = "desktop" | "android" | "ios" | "web";

export async function detectPlatform(): Promise<AppPlatform> {
  if (typeof window === "undefined") return "web";
  if ((window as unknown as { desktop?: { isDesktop?: boolean } }).desktop?.isDesktop) {
    return "desktop";
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform === "android" || platform === "ios") return platform;
  } catch {
    // не Capacitor-сборка
  }
  return "web";
}
