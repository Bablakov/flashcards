"use client";

/**
 * Строка карточки в списке группы.
 *
 * Карточка и подгруппа раньше выглядели одинаковыми плитками, хотя это разные
 * сущности. Теперь у подгруппы слева квадрат обложки и стрелка вправо, а у
 * карточки — точка уровня и две строки текста: вопрос и ответ. Разницу видно
 * с одного взгляда, не читая содержимое.
 */

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/lib/types";
import { loadMediaDataUrl } from "@/lib/repository";
import { BOX_COLORS, BOX_LABEL } from "@/lib/srs";

interface CardRowProps {
  deckId: string;
  card: Card;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CardRow({ deckId, card, onClick, onEdit, onDelete }: CardRowProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const image = card.front.image ?? card.back.image;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!image) {
        setImageUrl(null);
        return;
      }
      const url = await loadMediaDataUrl(deckId, image);
      if (mounted) setImageUrl(url);
    })();
    return () => {
      mounted = false;
    };
  }, [deckId, image]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="row">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className="level-dot"
          style={{ backgroundColor: BOX_COLORS[card.box] }}
          title={`Уровень: ${BOX_LABEL[card.box]}`}
        />
        <span className="min-w-0 flex-1">
          <span className="row-title block">
            {card.front.text || <span className="italic text-text-faint">без текста</span>}
          </span>
          <span className="row-meta block">
            {card.back.text || <span className="italic text-text-faint">ответ не заполнен</span>}
          </span>
        </span>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-[10px] bg-bg-soft object-cover"
          />
        )}
      </button>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="icon-btn"
          aria-label="Действия с карточкой"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="menu-panel right-0 top-full mt-1">
            <button
              className="menu-item"
              onClick={() => {
                setMenuOpen(false);
                onEdit?.();
              }}
            >
              <Pencil size={16} /> Редактировать
            </button>
            <button
              className="menu-item text-red-500"
              onClick={() => {
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
