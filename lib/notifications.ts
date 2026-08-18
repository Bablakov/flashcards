"use client";

/**
 * Локальные напоминания по расписанию пользователя (§8.2).
 *
 * Это именно локальные уведомления: ни сервера, ни FCM, ни аккаунтов —
 * расписание живёт на устройстве и срабатывает без интернета.
 *
 *  - Android: @capacitor/local-notifications с недельным повтором. Android 13+
 *    требует разрешения POST_NOTIFICATIONS, Android 14 может запретить точное
 *    время — тогда уведомление придёт с небольшим разбросом.
 *  - ПК и браузер: Notification API. Уведомление приходит, только пока
 *    приложение запущено, поэтому в десктопной сборке включаются автозапуск
 *    и сворачивание в трей.
 */

import { AppSettings } from "./model";
import { getProgressMap, isDue } from "./progress";
import { readSettings } from "./store";

const DAY_TO_WEEKDAY: Record<string, number> = {
  // Capacitor: 1 = воскресенье … 7 = суббота
  sun: 1,
  mon: 2,
  tue: 3,
  wed: 4,
  thu: 5,
  fri: 6,
  sat: 7,
};

const JS_DAY: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const LOCAL_ENABLED_KEY = "flashcards.notifications.device";

/** Тумблер «показывать уведомления на этом устройстве» — локальный (§5.5). */
export function enabledOnThisDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOCAL_ENABLED_KEY) !== "0";
}

export function setEnabledOnThisDevice(on: boolean): void {
  window.localStorage.setItem(LOCAL_ENABLED_KEY, on ? "1" : "0");
  void rescheduleNotifications();
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function requestPermission(): Promise<boolean> {
  if (await isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.requestPermissions();
      return res.display === "granted";
    } catch {
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/** Сколько карточек ждёт повтора прямо сейчас — попадает в текст уведомления. */
async function dueCount(): Promise<number> {
  try {
    const map = await getProgressMap();
    let n = 0;
    for (const p of map.values()) if (isDue(p)) n++;
    return n;
  } catch {
    return 0;
  }
}

function notificationBody(count: number): string {
  if (count <= 0) return "Время повторить карточки";
  return `К повторению: ${count} карт.`;
}

/* --------------------------------------------------------------- native */

async function scheduleNative(settings: AppSettings): Promise<void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }
  if (!settings.notifications.enabled || !enabledOnThisDevice()) return;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    const asked = await LocalNotifications.requestPermissions();
    if (asked.display !== "granted") return;
  }

  const body = notificationBody(await dueCount());
  const items = Object.entries(settings.notifications.days).map(([day, time], i) => {
    const [hour, minute] = time.split(":").map((x) => parseInt(x, 10));
    return {
      id: 1000 + i,
      title: "Flashcards",
      body,
      schedule: {
        on: { weekday: DAY_TO_WEEKDAY[day] ?? 2, hour, minute },
        repeats: true,
        allowWhileIdle: true,
      },
    };
  });
  if (items.length > 0) await LocalNotifications.schedule({ notifications: items });
}

/* ------------------------------------------------------------------ web */

let webTimer: ReturnType<typeof setTimeout> | null = null;

function nextOccurrence(days: Record<string, string>, from = new Date()): Date | null {
  let best: Date | null = null;
  for (const [day, time] of Object.entries(days)) {
    const weekday = JS_DAY[day];
    if (weekday === undefined) continue;
    const [hour, minute] = time.split(":").map((x) => parseInt(x, 10));
    for (let ahead = 0; ahead <= 7; ahead++) {
      const d = new Date(from);
      d.setDate(d.getDate() + ahead);
      d.setHours(hour, minute, 0, 0);
      if (d.getDay() !== weekday || d.getTime() <= from.getTime()) continue;
      if (!best || d < best) best = d;
      break;
    }
  }
  return best;
}

async function scheduleWeb(settings: AppSettings): Promise<void> {
  if (webTimer) {
    clearTimeout(webTimer);
    webTimer = null;
  }
  if (!settings.notifications.enabled || !enabledOnThisDevice()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const next = nextOccurrence(settings.notifications.days);
  if (!next) return;
  const delay = Math.min(next.getTime() - Date.now(), 2 ** 31 - 1);
  webTimer = setTimeout(async () => {
    try {
      new Notification("Flashcards", { body: notificationBody(await dueCount()) });
    } catch {
      // уведомления могли отключить в системе
    }
    void rescheduleNotifications();
  }, Math.max(delay, 1000));
}

/** Пересобрать расписание — при старте и после изменения настроек. */
export async function rescheduleNotifications(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const settings = await readSettings();
    if (await isNative()) await scheduleNative(settings);
    else await scheduleWeb(settings);
  } catch {
    // уведомления не должны ломать запуск приложения
  }
}

/** Проверка «дойдёт ли уведомление» — кнопка в настройках. */
export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestPermission();
  if (!granted) return false;
  const body = notificationBody(await dueCount());
  if (await isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        { id: 999, title: "Flashcards", body, schedule: { at: new Date(Date.now() + 3000) } },
      ],
    });
    return true;
  }
  new Notification("Flashcards", { body });
  return true;
}
