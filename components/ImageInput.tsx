"use client";

import { useEffect, useState } from "react";
import { Camera, Folder, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { loadMediaDataUrl } from "@/lib/repository";
import { dataUrlToFile } from "@/lib/media";

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

  async function pick(capture?: boolean) {
    // Native (Android-приложение): системная камера / галерея через плагин.
    if (Capacitor.isNativePlatform()) {
      try {
        const { Camera: CapCamera, CameraResultType, CameraSource } = await import(
          "@capacitor/camera"
        );
        const photo = await CapCamera.getPhoto({
          quality: 80,
          resultType: CameraResultType.DataUrl,
          source: capture ? CameraSource.Camera : CameraSource.Photos,
        });
        if (photo.dataUrl) onPicked(dataUrlToFile(photo.dataUrl, `photo.${photo.format || "jpeg"}`));
        return;
      } catch {
        // отказ/ошибка — тихо выходим (не падаем в web-выбор, чтобы не открывать два диалога)
        return;
      }
    }

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
        <div className="relative overflow-hidden rounded-xl bg-bg-soft ring-1 ring-[var(--ring-base)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-48 w-full object-contain" />
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
            onClick={() => void pick(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500/80 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            <Camera size={16} /> Камера
          </button>
          <button
            type="button"
            onClick={() => void pick(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500/80 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-500"
          >
            <Folder size={16} /> Файл
          </button>
        </div>
      )}
    </div>
  );
}
