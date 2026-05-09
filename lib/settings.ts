"use client";

import { GitConfig, GitConfigSchema, SyncStatus, SyncStatusSchema } from "./types";

const KEY_GIT = "flashcards.git.config";
const KEY_SYNC = "flashcards.sync.status";

export function loadGitConfig(): GitConfig {
  if (typeof window === "undefined") return GitConfigSchema.parse({});
  const raw = window.localStorage.getItem(KEY_GIT);
  if (!raw) return GitConfigSchema.parse({});
  try {
    return GitConfigSchema.parse(JSON.parse(raw));
  } catch {
    return GitConfigSchema.parse({});
  }
}

export function saveGitConfig(cfg: GitConfig): void {
  window.localStorage.setItem(KEY_GIT, JSON.stringify(cfg));
}

export function loadSyncStatus(): SyncStatus {
  if (typeof window === "undefined") return SyncStatusSchema.parse({});
  const raw = window.localStorage.getItem(KEY_SYNC);
  if (!raw) return SyncStatusSchema.parse({});
  try {
    return SyncStatusSchema.parse(JSON.parse(raw));
  } catch {
    return SyncStatusSchema.parse({});
  }
}

export function saveSyncStatus(status: SyncStatus): void {
  window.localStorage.setItem(KEY_SYNC, JSON.stringify(status));
}
