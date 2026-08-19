"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Play,
  FileSpreadsheet,
  Download,
  Search,
  Sliders,
  Sparkles,
  Pencil,
  FolderPlus,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomActions, ActionButton } from "@/components/BottomActions";
import { CardRow } from "@/components/CardRow";
import { Card, Deck, DeckSummary, languageInfo } from "@/lib/types";
import {
  addCard,
  createDeck,
  deleteCard,
  deleteDeck,
  getBreadcrumbs,
  getCards,
  getDeck,
  listGroupOptions,
  listGroupSummaries,
  moveGroup,
  updateDeck,
  type GroupOption,
} from "@/lib/repository";
import { GroupRow, plural } from "@/components/GroupRow";
import { toast } from "@/components/Toaster";
import { parseCsv, cardsToCsv } from "@/lib/csv";
import { DeckEditorModal, persistPendingDeckImage } from "@/components/DeckEditorModal";
import {
  FCDECK_FORMAT,
  importPackedDeck,
  isPackedDeck,
  packDeck,
  safeFileName,
} from "@/lib/pack";

type SortMode =
  | "custom"
  | "shuffle"
  | "createdAsc"
  | "createdDesc"
  | "alphaAsc"
  | "alphaDesc"
  | "boxAsc"
  | "boxDesc";

export default function DeckPageWrapper() {
  return (
    <Suspense>
      <DeckPage />
    </Suspense>
  );
}

function DeckPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const deckId = sp.get("id") ?? "";
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [subgroups, setSubgroups] = useState<DeckSummary[]>([]);
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [parentOptions, setParentOptions] = useState<GroupOption[]>([]);
  const [subgroupOpen, setSubgroupOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("createdDesc");
  const [showSort, setShowSort] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function refresh() {
    if (!deckId) return;
    setLoading(true);
    try {
      const d = await getDeck(deckId);
      setDeck(d);
      setCards(await getCards(deckId));
      setSubgroups(await listGroupSummaries(deckId));
      setCrumbs(await getBreadcrumbs(deckId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [deckId]);

  const visible = useMemo(() => {
    let list = [...cards];
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(
        (c) => c.front.text.toLowerCase().includes(q) || c.back.text.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "shuffle":
        list = list.map((c) => ({ c, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.c);
        break;
      case "createdAsc":
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "createdDesc":
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "alphaAsc":
        list.sort((a, b) => a.front.text.localeCompare(b.front.text, "ru"));
        break;
      case "alphaDesc":
        list.sort((a, b) => b.front.text.localeCompare(a.front.text, "ru"));
        break;
      case "boxAsc":
        list.sort((a, b) => a.box - b.box);
        break;
      case "boxDesc":
        list.sort((a, b) => b.box - a.box);
        break;
    }
    return list;
  }, [cards, filter, sort]);

  async function handleAdd() {
    const card = await addCard(deckId, { text: "" }, { text: "" });
    router.push(`/card?deck=${deckId}&id=${card.id}`);
  }

  async function handleDelete(cardId: string) {
    if (!window.confirm("Удалить карточку?")) return;
    await deleteCard(deckId, cardId);
    await refresh();
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.fcdeck,.json,text/csv,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const text = await f.text();
      const looksJson = /^\s*[{\[]/.test(text);
      try {
        if (looksJson) {
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
          router.push(`/deck?id=${res.deckId}`);
          return;
        }
        const rows = await parseCsv(text);
        for (const r of rows) {
          await addCard(deckId, { text: r.front }, { text: r.back });
        }
        toast(`Импортировано: ${rows.length}`, "success");
        await refresh();
      } catch (e: unknown) {
        toast(`Ошибка импорта: ${(e as Error).message}`, "error");
      }
    };
    input.click();
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const csv = cardsToCsv(cards);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${safeFileName(deck?.name || "deck")}.csv`);
    setExportOpen(false);
  }

  async function handleExportPack(withMedia: boolean) {
    if (!deck) return;
    setExporting(true);
    try {
      const pack = await packDeck(deckId, withMedia);
      const json = JSON.stringify(pack);
      const blob = new Blob([json], { type: "application/json" });
      const suffix = withMedia ? "with-media" : "text-only";
      downloadBlob(blob, `${safeFileName(deck.name)}-${suffix}.fcdeck`);
      const mediaTotal = Object.keys(pack.media).length;
      toast(
        withMedia
          ? `Колода экспортирована: ${pack.cards.length} карт + ${mediaTotal} медиа`
          : `Колода экспортирована: ${pack.cards.length} карт`,
        "success",
      );
    } catch (e: unknown) {
      toast(`Ошибка экспорта: ${(e as Error).message}`, "error");
    } finally {
      setExporting(false);
      setExportOpen(false);
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
    const persistedImage = await persistPendingDeckImage(deckId, val.image);
    await updateDeck(deckId, {
      name: val.name,
      color: val.color,
      image: persistedImage,
      description: val.description,
      settings: {
        frontLanguage: val.frontLanguage,
        backLanguage: val.backLanguage,
      } as never,
    });
    const moved = await moveGroup(deckId, val.parentId);
    toast(moved ? "Сохранено" : "Группу нельзя перенести внутрь самой себя", moved ? "success" : "error");
    setEditorOpen(false);
    await refresh();
  }

  /** Подгруппа создаётся прямо внутри текущей группы — иерархия любой глубины (§5.1). */
  async function handleCreateSubgroup(val: {
    name: string;
    color: string;
    image: string | null;
    description: string;
    frontLanguage: string;
    backLanguage: string;
    parentId: string | null;
  }) {
    const created = await createDeck({
      name: val.name,
      color: val.color,
      image: null,
      description: val.description,
      frontLanguage: val.frontLanguage,
      backLanguage: val.backLanguage,
      parentId: val.parentId ?? deckId,
    });
    const persisted = await persistPendingDeckImage(created.id, val.image);
    if (persisted) await updateDeck(created.id, { image: persisted });
    toast("Подгруппа создана", "success");
    setSubgroupOpen(false);
    await refresh();
  }

  async function openEditor() {
    setParentOptions(await listGroupOptions(deckId));
    setEditorOpen(true);
  }

  async function openSubgroup() {
    setParentOptions(await listGroupOptions());
    setSubgroupOpen(true);
  }

  async function handleDeleteSubgroup(id: string) {
    const g = subgroups.find((x) => x.id === id);
    if (!window.confirm(`Удалить группу «${g?.name ?? ""}» со всем содержимым?`)) return;
    await deleteDeck(id);
    toast("Группа удалена", "success");
    await refresh();
  }

  async function handleAddCardTo(groupId: string) {
    const card = await addCard(groupId, { text: "" }, { text: "" });
    router.push(`/card?deck=${groupId}&id=${card.id}`);
  }

  if (!deckId) {
    return (
      <>
        <TopBar back title="Колода" />
        <div className="px-4 py-12 text-center text-text-muted">Колода не выбрана</div>
      </>
    );
  }

  const front = deck ? languageInfo(deck.settings.frontLanguage) : null;
  const back = deck ? languageInfo(deck.settings.backLanguage) : null;

  return (
    <>
      <TopBar
        title={deck?.name ?? ""}
        back
        rightSlot={
          <>
            <button className="icon-btn" onClick={openEditor} aria-label="Редактировать группу">
              <Pencil size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSort((v) => !v)}
              aria-label="Сортировка"
            >
              <Sliders size={20} />
            </button>
          </>
        }
      />

      <main className="flex-1 px-4 pb-4 pt-3">
        {/* Путь до группы: раньше был мелким текстом, теперь — полноценные
            кнопки, по которым попадаешь пальцем. */}
        {crumbs.length > 0 && (
          <nav className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
            <button
              className="rounded-md px-1.5 py-0.5 text-text-muted transition hover:bg-[var(--ring-base)] hover:text-text-primary"
              onClick={() => router.push("/")}
            >
              Все группы
            </button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-text-faint" />
                {i === crumbs.length - 1 ? (
                  <span className="px-1.5 py-0.5 font-medium text-text-primary">{c.name}</span>
                ) : (
                  <button
                    className="rounded-md px-1.5 py-0.5 text-text-muted transition hover:bg-[var(--ring-base)] hover:text-text-primary"
                    onClick={() => router.push(`/deck?id=${c.id}`)}
                  >
                    {c.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}

        {deck && (
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
            {front && (
              <span className="chip">
                {front.flag} {front.code.toUpperCase()}
              </span>
            )}
            <span className="text-text-faint">→</span>
            {back && (
              <span className="chip">
                {back.flag} {back.code.toUpperCase()}
              </span>
            )}
            <span>{plural(deck.cardCount, "карточка", "карточки", "карточек")}</span>
            {deck.description && (
              <span className="w-full truncate text-text-faint">{deck.description}</span>
            )}
          </div>
        )}

        <div className="search-field mb-3">
          <Search size={16} className="flex-shrink-0 text-text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по карточкам..."
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-faint"
          />
        </div>

        {showSort && (
          <div className="surface mb-3 grid grid-cols-2 gap-1 p-2">
            {(
              [
                ["custom", "По умолчанию"],
                ["shuffle", "Перемешать"],
                ["createdAsc", "Сначала старые"],
                ["createdDesc", "Сначала новые"],
                ["alphaAsc", "А-Я"],
                ["alphaDesc", "Я-А"],
                ["boxAsc", "Слабые первыми"],
                ["boxDesc", "Сильные первыми"],
              ] as [SortMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-[10px] px-3 py-2 text-left text-[13px] transition ${
                  sort === k
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : "text-text-secondary hover:bg-[var(--ring-base)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="py-12 text-center text-text-muted">Загрузка...</div>}

        {subgroups.length > 0 && (
          <section className="mb-4">
            <div className="mb-2 section-title">Подгруппы · {subgroups.length}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {subgroups.map((g) => (
                <GroupRow
                  key={g.id}
                  deck={g}
                  onAddCard={handleAddCardTo}
                  onEdit={(id) => router.push(`/deck?id=${id}`)}
                  onDelete={handleDeleteSubgroup}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && visible.length > 0 && (
          <div className="mb-2 section-title">Карточки · {visible.length}</div>
        )}

        {!loading && visible.length === 0 && (
          <div className="py-12 text-center text-[14px] text-text-muted">
            {filter
              ? "Ничего не найдено"
              : subgroups.length > 0
                ? "В самой группе карточек нет — они лежат в подгруппах."
                : "Карточек нет. Нажми «Карточка» внизу или импортируй CSV."}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((card) => (
            <CardRow
              key={card.id}
              deckId={deckId}
              card={card}
              onClick={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              onEdit={() => router.push(`/card?deck=${deckId}&id=${card.id}`)}
              onDelete={() => handleDelete(card.id)}
            />
          ))}
        </div>
      </main>

      {/* На телефоне шесть кнопок в ряд не помещались и превращались в кашу,
          поэтому редкие действия убраны под «Ещё». */}
      {moreOpen && (
        <div className="modal-backdrop items-end" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-3xl bg-bg-card p-2 ring-1 ring-[var(--ring-base)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="menu-item w-full"
              onClick={() => {
                setMoreOpen(false);
                handleImport();
              }}
            >
              <FileSpreadsheet size={18} /> Импорт CSV или .fcdeck
            </button>
            <button
              className="menu-item w-full disabled:opacity-40"
              disabled={cards.length === 0}
              onClick={() => {
                setMoreOpen(false);
                setExportOpen(true);
              }}
            >
              <Download size={18} /> Экспорт
            </button>
            <button
              className="menu-item w-full"
              onClick={() => {
                setMoreOpen(false);
                router.push(`/options?deck=${deckId}`);
              }}
            >
              <Sparkles size={18} /> Опции группы
            </button>
          </div>
        </div>
      )}

      <BottomActions>
        <ActionButton
          icon={<Play size={20} />}
          label="Учить"
          primary
          onClick={() => router.push(`/study?deck=${deckId}`)}
          disabled={cards.length === 0 && subgroups.length === 0}
        />
        <ActionButton icon={<Plus size={20} />} label="Карточка" onClick={handleAdd} />
        <ActionButton icon={<FolderPlus size={20} />} label="Подгруппа" onClick={openSubgroup} />
        <ActionButton icon={<MoreHorizontal size={20} />} label="Ещё" onClick={() => setMoreOpen(true)} />
      </BottomActions>

      {deck && (
        <DeckEditorModal
          open={editorOpen}
          title="Редактировать группу"
          deckId={deckId}
          parentOptions={parentOptions}
          initial={{
            name: deck.name,
            color: deck.color,
            image: deck.image,
            description: deck.description,
            frontLanguage: deck.settings.frontLanguage,
            backLanguage: deck.settings.backLanguage,
            parentId: crumbs.length > 1 ? crumbs[crumbs.length - 2].id : null,
          }}
          onSave={handleSaveDeck}
          onClose={() => setEditorOpen(false)}
        />
      )}

      <DeckEditorModal
        open={subgroupOpen}
        title="Новая подгруппа"
        parentOptions={parentOptions}
        initial={{
          parentId: deckId,
          frontLanguage: deck?.settings.frontLanguage,
          backLanguage: deck?.settings.backLanguage,
        }}
        onSave={handleCreateSubgroup}
        onClose={() => setSubgroupOpen(false)}
      />

      {exportOpen && (
        <div className="modal-backdrop" onClick={() => !exporting && setExportOpen(false)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[var(--ring-base)] px-5 py-3 text-[15px] font-semibold">
              Экспорт группы
            </div>
            <div className="space-y-3 p-5">
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="surface-flat w-full p-4 text-left hover:border-[var(--ring-strong)] disabled:opacity-50"
              >
                <div className="text-[14px] font-semibold text-text-primary">CSV (только текст)</div>
                <div className="hint-text mt-1">
                  Excel-совместимый. Картинки и аудио не сохраняются.
                </div>
              </button>
              <button
                onClick={() => handleExportPack(false)}
                disabled={exporting}
                className="surface-flat w-full p-4 text-left hover:border-[var(--ring-strong)] disabled:opacity-50"
              >
                <div className="text-[14px] font-semibold text-text-primary">
                  {FCDECK_FORMAT} — только текст (.fcdeck)
                </div>
                <div className="hint-text mt-1">
                  Полные данные карточек (теги, прогресс), без медиа.
                </div>
              </button>
              <button
                onClick={() => handleExportPack(true)}
                disabled={exporting}
                className="surface-flat w-full p-4 text-left hover:border-[var(--ring-strong)] disabled:opacity-50"
              >
                <div className="text-[14px] font-semibold text-[var(--accent)]">
                  Полный пакет с картинками (.fcdeck)
                </div>
                <div className="hint-text mt-1">
                  Один файл со всеми картинками и аудио. Может быть большим.
                </div>
              </button>
            </div>
            <div className="flex justify-end border-t border-[var(--ring-base)] px-5 py-3">
              <button
                className="pill-button"
                onClick={() => setExportOpen(false)}
                disabled={exporting}
              >
                {exporting ? "Подождите..." : "Отмена"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
