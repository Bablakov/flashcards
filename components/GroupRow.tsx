"use client";

/**
 * Строка группы в списке.
 *
 * Раньше группа рисовалась плиткой с обложкой на 128 px: на телефон помещалось
 * две-три штуки, а высота плиток гуляла из-за разной длины названия. Строка
 * фиксированной высоты 60 px решает и то, и другое: в экран входит 5–6 групп,
 * обложка остаётся видна миниатюрой, а колонка справа выровнена по всем строкам.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreVertical, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { DeckSummary } from "@/lib/types";
import { loadMediaDataUrl } from "@/lib/repository";

interface Props {
  deck: DeckSummary;
  onAddCard: (deckId: string) => void;
  onEdit: (deckId: string) => void;
  onDelete: (deckId: string) => void;
  /** Тест по этой группе, не заходя внутрь. */
  onStudy?: (deckId: string) => void;
}

export function GroupRow({ deck, onAddCard, onEdit, onDelete, onStudy }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!deck.image) {
        setImageUrl(null);
        return;
      }
      const url = await loadMediaDataUrl(deck.id, deck.image);
      if (active) setImageUrl(url);
    })();
    return () => {
      active = false;
    };
  }, [deck.id, deck.image]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const parts: string[] = [];
  if (deck.subgroupCount > 0) parts.push(plural(deck.subgroupCount, "подгруппа", "подгруппы", "подгрупп"));
  parts.push(plural(deck.cardCount, "карточка", "карточки", "карточек"));
  if (deck.cardCount > 0) parts.push(`${deck.progress}% выучено`);

  return (
    <div className="row group">
      <Link href={`/deck?id=${deck.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="row-thumb"
          style={{ backgroundColor: imageUrl ? "transparent" : deck.color }}
          aria-hidden
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            deck.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="row-title block">{deck.name}</span>
          <span className="row-meta block">{parts.join(" · ")}</span>
        </span>
        {deck.dueCount > 0 && (
          <span className="chip chip-accent" title="Созрело к повторению">
            {deck.dueCount}
          </span>
        )}
        <ChevronRight size={16} className="flex-shrink-0 text-text-faint" />
      </Link>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="icon-btn"
          aria-label={`Действия с группой ${deck.name}`}
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="menu-panel right-0 top-full mt-1">
            {onStudy && deck.cardCount > 0 && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onStudy(deck.id);
                }}
              >
                <Play size={16} /> Пройти тест
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                setMenuOpen(false);
                onAddCard(deck.id);
              }}
            >
              <Plus size={16} /> Добавить карточку
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setMenuOpen(false);
                onEdit(deck.id);
              }}
            >
              <Pencil size={16} /> Редактировать
            </button>
            <button
              className="menu-item text-red-500"
              onClick={() => {
                setMenuOpen(false);
                onDelete(deck.id);
              }}
            >
              <Trash2 size={16} /> Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** «1 карточка», «2 карточки», «5 карточек» — иначе строка выглядит машинной. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
