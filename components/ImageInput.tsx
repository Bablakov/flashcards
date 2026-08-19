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
      {preview ? (
        // С картинкой: она сама и есть подпись, поэтому заголовок не нужен.
        // Кнопки под ней — «заменить» раньше не было вообще, только удаление.
        <>
          <div className="overflow-hidden rounded-[14px] bg-bg-soft ring-1 ring-[var(--ring-base)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="max-h-48 w-full object-contain" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void pick(true)} className="pill-button">
              <Camera size={16} /> Переснять
            </button>
            <button type="button" onClick={() => void pick(false)} className="pill-button">
              <Folder size={16} /> Заменить
            </button>
            <button type="button" onClick={onCleared} className="pill-button text-red-500">
              <Trash2 size={16} /> Убрать
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <div className="section-title">{label}</div>
          {/* Две кнопки в ряд: в одну строку с подписью они не помещались
              на 390 px и разъезжались на две строки. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void pick(true)}
              className="pill-button flex-1 justify-center"
            >
              <Camera size={16} /> Камера
            </button>
            <button
              type="button"
              onClick={() => void pick(false)}
              className="pill-button flex-1 justify-center"
            >
              <Folder size={16} /> Файл
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
