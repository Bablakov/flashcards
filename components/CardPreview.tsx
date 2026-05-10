"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/lib/types";
import { loadMediaDataUrl } from "@/lib/repository";
import { Image as ImageIcon, MoreHorizontal, Pencil, Trash2, Volume2 } from "lucide-react";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";

interface CardPreviewProps {
  deckId: string;
  card: Card;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CardPreview({ deckId, card, onClick, onEdit, onDelete }: CardPreviewProps) {
  const data = card.front;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (data.image) {
        const url = await loadMediaDataUrl(deckId, data.image);
        if (mounted) setImageUrl(url);
      } else {
        setImageUrl(null);
      }
      setHasAudio(!!data.audio);
    })();
    return () => {
      mounted = false;
    };
  }, [deckId, data.image, data.audio]);

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

  return (
    <div className="card-tile">
      <button
        onClick={onClick}
        className="flex h-full flex-1 flex-col items-stretch p-4 text-left"
      >
        <div className="flex items-start gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="line-clamp-3 break-words text-base text-text-primary">
              {data.text || <span className="italic text-text-faint">Без текста на лицевой</span>}
            </div>
            {card.back.text && (
              <div className="mt-1 line-clamp-2 break-words text-sm text-text-muted">
                {card.back.text}
              </div>
            )}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-text-faint">
          {!!data.image && <ImageIcon size={14} />}
          {hasAudio && <Volume2 size={14} />}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: BOX_COLORS[card.box] }}
            title={BOX_LABEL[card.box]}
          >
            {BOX_LABEL[card.box]}
          </span>
          <span className="ml-auto">
            ↻ {card.reviewCount}
          </span>
        </div>
      </button>
      <div className="absolute right-2 top-2" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="icon-btn h-8 w-8 bg-bg-base/60 backdrop-blur"
          aria-label="Меню карточки"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="menu-panel right-0 top-full mt-1">
            <button
              className="menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit?.();
              }}
            >
              <Pencil size={16} /> Редактировать
            </button>
            <button
              className="menu-item text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete?.();
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
