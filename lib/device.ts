"use client";

/**
 * Идентификатор устройства. Живёт только локально (§5.5) и нужен для того,
 * чтобы журнал ответов писался в отдельный файл на каждом устройстве —
 * тогда git-конфликт по журналу невозможен даже после долгого офлайна.
 */

import { nanoid } from "nanoid";

const KEY = "flashcards.device.id";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = nanoid(8).replace(/[^a-zA-Z0-9]/g, "x");
    window.localStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}
