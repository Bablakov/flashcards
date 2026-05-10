"use client";

import { useEffect, useState } from "react";
import { Camera, Folder, Trash2 } from "lucide-react";
import { loadMediaDataUrl } from "@/lib/repository";

interface Props {
  deckId: string;
  imagePath: string | null;
  onPicked: (file: File) => void;
  onCleared: () => void;
  label: string;
}

export function ImageInput({ deckId, imagePath, onPicked, onCleared, label }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!imagePath) {
        setPreview(null);
        return;
      }
      const url = await loadMediaDataUrl(deckId, imagePath);
      if (active) setPreview(url);
    })();
    return () => {
      active = false;
    };
  }, [deckId, imagePath]);

  function pick(capture?: boolean) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onPicked(f);
    };
    input.click();
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      {preview ? (
        <div className="relative overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-48 w-full object-cover" />
          <button
            type="button"
            onClick={onCleared}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            aria-label="Удалить"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => pick(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500/80 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            <Camera size={16} /> Камера
          </button>
          <button
            type="button"
            onClick={() => pick(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500/80 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-500"
          >
            <Folder size={16} /> Файл
          </button>
        </div>
      )}
    </div>
  );
}
