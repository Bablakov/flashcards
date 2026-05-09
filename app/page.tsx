"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, RefreshCcw, Palette, MoreHorizontal } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { DeckSummary } from "@/lib/types";
import {
  createDeck,
  deleteDeck,
  listDeckSummaries,
  renameDeck,
  setDeckColor,
} from "@/lib/repository";
import { toast } from "@/components/Toaster";
import { syncAll, pendingChangesCount } from "@/lib/git";
import { loadGitConfig, loadSyncStatus } from "@/lib/settings";
import { maybeInstallSeed } from "@/lib/seed";

const PALETTE = [
  "#e36b6b",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#7c3aed",
  "#ec4899",
];

export default function HomePage() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const totalCards = useMemo(() => decks.reduce((s, d) => s + d.cardCount, 0), [decks]);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listDeckSummaries();
      setDecks(data);
      try {
        setPending(await pendingChangesCount());
      } catch {
        setPending(0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await maybeInstallSeed();
        if (r.installed) toast(`Установлен пример: ${r.count} колод`, "success");
      } catch {
        // ignore
      }
      await refresh();
    })();
  }, []);

  async function handleAddDeck() {
    const name = window.prompt("Название колоды");
    if (!name) return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    await createDeck(name, color);
    await refresh();
  }

  async function handleRename(id: string) {
    const current = decks.find((d) => d.id === id);
    const name = window.prompt("Новое название", current?.name ?? "");
    if (!name) return;
    await renameDeck(id, name);
    setMenuFor(null);
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить колоду со всеми карточками?")) return;
    await deleteDeck(id);
    setMenuFor(null);
    toast("Колода удалена", "success");
    await refresh();
  }

  async function handleColor(id: string) {
    const cur = decks.find((d) => d.id === id);
    const idx = PALETTE.indexOf(cur?.color ?? "");
    const next = PALETTE[(idx + 1) % PALETTE.length];
    await setDeckColor(id, next);
    setMenuFor(null);
    await refresh();
  }

  async function handleSync() {
    setBusy(true);
    try {
      const cfg = loadGitConfig();
      if (!cfg.remoteUrl) {
        toast("Сначала настрой Git в /settings", "error");
        return;
      }
      await syncAll(cfg, "Update from web", (m) => toast(m));
      toast("Синхронизировано", "success");
      await refresh();
    } catch (e: unknown) {
      const err = e as Error;
      toast(`Ошибка: ${err.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="flex-1 px-4 pb-24 pt-2">
        {pending > 0 && (
          <div className="mb-3 rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            Не синхронизировано: {pending} файлов
          </div>
        )}
        <div className="space-y-3">
          {loading && <div className="py-12 text-center text-neutral-400">Загрузка...</div>}
          {!loading && decks.length === 0 && (
            <div className="py-12 text-center text-neutral-400">
              Колод пока нет. Нажми «Добавить колоду».
            </div>
          )}
          {decks.map((deck) => (
            <div key={deck.id} className="relative">
              <Link
                href={`/deck?id=${deck.id}`}
                className="deck-tile block"
                style={{ borderLeft: `4px solid ${deck.color}` }}
              >
                <span
                  className="absolute left-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: deck.color }}
                >
                  {deck.progress}%
                </span>
                <span
                  className="absolute right-3 top-3 text-xs text-neutral-400"
                  aria-label="карточек"
                >
                  {deck.cardCount} карт.
                </span>
                <div className="text-center text-2xl font-semibold text-neutral-100">
                  {deck.name}
                </div>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setMenuFor(menuFor === deck.id ? null : deck.id);
                }}
                className="absolute bottom-2 right-2 icon-btn"
                aria-label="Меню"
              >
                <MoreHorizontal size={20} />
              </button>
              {menuFor === deck.id && (
                <div className="absolute bottom-12 right-2 z-20 w-56 overflow-hidden rounded-xl bg-bg-card shadow-lg ring-1 ring-white/10">
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/5"
                    onClick={() => handleRename(deck.id)}
                  >
                    <Pencil size={16} /> Переименовать
                  </button>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/5"
                    onClick={() => handleColor(deck.id)}
                  >
                    <Palette size={16} /> Сменить цвет
                  </button>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/10"
                    onClick={() => handleDelete(deck.id)}
                  >
                    <Trash2 size={16} /> Удалить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
      <BottomActions>
        <ActionButton icon={<Plus size={22} />} label="Добавить колоду" onClick={handleAddDeck} />
        <ActionButton
          icon={<RefreshCcw size={22} className={busy ? "animate-spin" : ""} />}
          label={busy ? "Sync..." : "Синхронизация"}
          onClick={handleSync}
          disabled={busy}
        />
      </BottomActions>
    </>
  );
}
