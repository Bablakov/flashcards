"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Plus, RefreshCcw, Search, Upload } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { DeckSummary } from "@/lib/types";
import {
  addCard,
  createDeck,
  deleteDeck,
  getDeck,
  getBreadcrumbs,
  listDeckSummaries,
  listGroupOptions,
  moveGroup,
  updateDeck,
  type GroupOption,
} from "@/lib/repository";
import { toast } from "@/components/Toaster";
import { pendingChangesCount } from "@/lib/git";
import { onPendingChange, syncNow } from "@/lib/autosync";
import { maybeInstallSeed } from "@/lib/seed";
import { DeckEditorModal, persistPendingDeckImage } from "@/components/DeckEditorModal";
import { DeckCard } from "@/components/DeckCard";
import { FirstRunHint } from "@/components/FirstRunHint";
import { importPackedDeck, isPackedDeck } from "@/lib/pack";

export default function HomePage() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [filter, setFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentOptions, setParentOptions] = useState<GroupOption[]>([]);
  const [editingInitial, setEditingInitial] = useState<{
    name: string;
    color: string;
    image: string | null;
    description: string;
    frontLanguage: string;
    backLanguage: string;
    parentId: string | null;
  } | null>(null);

  const totalCards = useMemo(() => decks.reduce((s, d) => s + d.cardCount, 0), [decks]);
  const visibleDecks = useMemo(() => {
    if (!filter.trim()) return decks;
    const q = filter.toLowerCase();
    return decks.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
  }, [decks, filter]);

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
    // Индикатор «не синхронизировано» обновляется после каждого коммита (§7.1).
    return onPendingChange(setPending);
  }, []);

  async function openCreate() {
    setEditingId(null);
    setEditingInitial(null);
    setParentOptions(await listGroupOptions());
    setEditorOpen(true);
  }

  async function openEdit(id: string) {
    const d = await getDeck(id);
    if (!d) return;
    const crumbs = await getBreadcrumbs(id);
    setEditingId(id);
    setParentOptions(await listGroupOptions(id));
    setEditingInitial({
      name: d.name,
      color: d.color,
      image: d.image,
      description: d.description,
      frontLanguage: d.settings.frontLanguage,
      backLanguage: d.settings.backLanguage,
      parentId: crumbs.length > 1 ? crumbs[crumbs.length - 2].id : null,
    });
    setEditorOpen(true);
  }

  async function handleDelete(id: string) {
    const d = decks.find((x) => x.id === id);
    if (!window.confirm(`Удалить колоду «${d?.name ?? ""}» со всеми карточками?`)) return;
    await deleteDeck(id);
    toast("Колода удалена", "success");
    await refresh();
  }

  async function handleAddCard(deckId: string) {
    const card = await addCard(deckId, { text: "" }, { text: "" });
    router.push(`/card?deck=${deckId}&id=${card.id}`);
  }

  function handleImportDeck() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".fcdeck,.json,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!isPackedDeck(parsed)) {
          toast("Не похоже на колоду (.fcdeck)", "error");
          return;
        }
        const res = await importPackedDeck(parsed);
        toast(
          `Колода импортирована: ${res.cardCount} карт, ${res.mediaCount} медиа`,
          "success",
        );
        await refresh();
        router.push(`/deck?id=${res.deckId}`);
      } catch (e: unknown) {
        toast(`Ошибка импорта: ${(e as Error).message}`, "error");
      }
    };
    input.click();
  }

  async function handleSync() {
    setBusy(true);
    try {
      await syncNow((m) => toast(m));
      toast("Синхронизировано", "success");
      await refresh();
    } catch (e: unknown) {
      const err = e as Error;
      toast(`Ошибка: ${err.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDeck(val: {
    name: string;
    color: string;
    image: string | null;
    description: string;
    frontLanguage: string;
    backLanguage: string;
    parentId: string | null;
  }) {
    if (editingId) {
      await updateDeck(editingId, {
        name: val.name,
        color: val.color,
        image: val.image,
        description: val.description,
        settings: {
          frontLanguage: val.frontLanguage,
          backLanguage: val.backLanguage,
        } as never,
      });
      const moved = await moveGroup(editingId, val.parentId);
      toast(moved ? "Группа обновлена" : "Группу нельзя переместить внутрь самой себя", moved ? "success" : "error");
    } else {
      const created = await createDeck({
        name: val.name,
        color: val.color,
        image: null,
        description: val.description,
        frontLanguage: val.frontLanguage,
        backLanguage: val.backLanguage,
        parentId: val.parentId,
      });
      const persistedImage = await persistPendingDeckImage(created.id, val.image);
      if (persistedImage) {
        await updateDeck(created.id, { image: persistedImage });
      }
      toast("Колода создана", "success");
    }
    setEditorOpen(false);
    await refresh();
  }

  return (
    <>
      <TopBar />
      <main className="flex-1 px-4 pb-24 pt-2">
        <FirstRunHint />
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-bg-soft px-3 py-2 ring-1 ring-[var(--ring-base)]">
          <Search size={16} className="text-text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск колоды..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
          />
        </div>

        {decks.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Колод" value={decks.length} />
            <Stat label="Карточек" value={totalCards} />
            <Stat
              label="Выучено"
              value={`${Math.round(
                decks.reduce((s, d) => s + d.learnedCount, 0) /
                  Math.max(1, totalCards) *
                  100,
              )}%`}
            />
          </div>
        )}

        {pending > 0 && (
          <div className="mb-3 rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-600">
            Не синхронизировано: {pending} файлов
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {loading && (
            <div className="col-span-full py-12 text-center text-text-muted">Загрузка...</div>
          )}
          {!loading && visibleDecks.length === 0 && (
            <div className="col-span-full py-12 text-center text-text-muted">
              {filter
                ? "Ничего не найдено"
                : "Колод пока нет. Нажми «Добавить колоду»."}
            </div>
          )}
          {visibleDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onAddCard={handleAddCard}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </main>

      <BottomActions>
        <ActionButton icon={<Plus size={22} />} label="Группа" onClick={openCreate} />
        <ActionButton icon={<Upload size={22} />} label="Импорт" onClick={handleImportDeck} />
        <ActionButton
          icon={<BarChart3 size={22} />}
          label="Отчёт"
          onClick={() => router.push("/report")}
        />
        <ActionButton
          icon={<RefreshCcw size={22} className={busy ? "animate-spin" : ""} />}
          label={busy ? "Sync..." : "Синхр."}
          onClick={handleSync}
          disabled={busy}
        />
      </BottomActions>

      <DeckEditorModal
        open={editorOpen}
        title={editingId ? "Редактировать группу" : "Новая группа"}
        deckId={editingId ?? undefined}
        parentOptions={parentOptions}
        initial={editingInitial ?? undefined}
        onSave={handleSaveDeck}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-bg-card px-3 py-2 ring-1 ring-[var(--ring-base)]">
      <div className="text-lg font-semibold text-text-primary">{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}
