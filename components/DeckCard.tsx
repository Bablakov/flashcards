"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DeckSummary, languageInfo } from "@/lib/types";
import { loadMediaDataUrl } from "@/lib/repository";

interface Props {
  deck: DeckSummary;
  onAddCard: (deckId: string) => void;
  onEdit: (deckId: string) => void;
  onDelete: (deckId: string) => void;
}

export function DeckCard({ deck, onAddCard, onEdit, onDelete }: Props) {
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const front = languageInfo(deck.settings.frontLanguage);
  const back = languageInfo(deck.settings.backLanguage);
  const date = new Date(deck.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="deck-card" style={{ borderTop: `4px solid ${deck.color}` }}>
      <Link href={`/deck?id=${deck.id}`} className="block">
        <div className="relative h-32 w-full overflow-hidden">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${deck.color} 0%, ${shadeColor(deck.color, -25)} 100%)`,
              }}
            >
              <div className="font-display text-6xl text-white" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
                {deck.name.slice(0, 1).toUpperCase()}
              </div>
            </div>
          )}
          <div className="absolute right-2 top-2 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white"
              title="Прогресс"
            >
              {deck.progress}%
            </span>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <span className="truncate">{deck.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            <span className="lang-chip" title={front.name}>
              {front.flag} {front.code.toUpperCase()}
            </span>
            <ArrowRight size={12} className="text-text-faint" />
            <span className="lang-chip" title={back.name}>
              {back.flag} {back.code.toUpperCase()}
            </span>
            <span className="ml-auto whitespace-nowrap text-text-faint">
              {deck.cardCount} карт.
            </span>
          </div>
          <div className="mt-1 text-[11px] text-text-faint">создано {date}</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ring-base)]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${deck.progress}%`, backgroundColor: deck.color }}
            />
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--ring-base)] px-3 py-2">
        <button
          onClick={() => onAddCard(deck.id)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-medium text-text-secondary transition hover:bg-[var(--ring-base)]"
        >
          <Plus size={14} /> Добавить карту
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="icon-btn h-8 w-8"
            aria-label="Меню"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="menu-panel right-0 bottom-full mb-1">
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
    </div>
  );
}

function shadeColor(hex: string, percent: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
