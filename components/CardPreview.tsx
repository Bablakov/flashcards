"use client";

import { useEffect, useState } from "react";
import { Card } from "@/lib/types";
import { loadMediaDataUrl } from "@/lib/repository";
import { Image as ImageIcon, Volume2 } from "lucide-react";

interface CardPreviewProps {
  deckId: string;
  card: Card;
  side: "front" | "back";
  onClick?: () => void;
}

export function CardPreview({ deckId, card, side, onClick }: CardPreviewProps) {
  const data = side === "front" ? card.front : card.back;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (data.image) {
        const url = await loadMediaDataUrl(deckId, data.image);
        if (mounted) setImageUrl(url);
      } else {
        setImageUrl(null);
      }
      if (data.audio) {
        const url = await loadMediaDataUrl(deckId, data.audio);
        if (mounted) setAudioUrl(url);
      } else {
        setAudioUrl(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [deckId, data.image, data.audio]);

  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col items-stretch rounded-2xl bg-bg-card p-4 text-left ring-1 ring-white/5 hover:ring-white/15"
    >
      {imageUrl && (
        <div className="mb-3 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-40 w-full object-cover" />
        </div>
      )}
      <div className="whitespace-pre-wrap text-base text-neutral-100">{data.text || <span className="text-neutral-500">Без текста</span>}</div>
      <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
        {!!data.image && <ImageIcon size={14} />}
        {!!audioUrl && (
          <span className="inline-flex items-center gap-1">
            <Volume2 size={14} />
            <audio
              controls
              src={audioUrl}
              className="h-6 w-40"
              onClick={(e) => e.stopPropagation()}
            />
          </span>
        )}
        <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: levelColor(card.level) }}>
          {card.level || "—"}
        </span>
      </div>
    </button>
  );
}

function levelColor(level: number): string {
  switch (level) {
    case 1:
      return "#ef4444";
    case 2:
      return "#f97316";
    case 3:
      return "#eab308";
    case 4:
      return "#22c55e";
    case 5:
      return "#06b6d4";
    case 6:
      return "#6366f1";
    default:
      return "#6b7280";
  }
}
