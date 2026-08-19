"use client";

import { useEffect, useState } from "react";
import { Camera, Folder, Trash2, X } from "lucide-react";
import { Deck, LANGUAGES } from "@/lib/types";
import { compressImage, fileToBytes } from "@/lib/media";
import { loadMediaDataUrl, saveMedia } from "@/lib/repository";
import { nanoid } from "nanoid";

const PALETTE = [
  "#e36b6b",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#7c3aed",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
];

export interface DeckEditorValue {
  name: string;
  color: string;
  image: string | null;
  description: string;
  frontLanguage: string;
  backLanguage: string;
  parentId: string | null;
}

interface Props {
  open: boolean;
  title: string;
  initial?: Partial<DeckEditorValue> & { id?: string };
  deckId?: string;
  /** Куда можно поместить группу. Пусто — выбор родителя не показываем. */
  parentOptions?: { id: string; label: string }[];
  onSave: (val: DeckEditorValue) => Promise<void> | void;
  onClose: () => void;
}

export function DeckEditorModal({
  open,
  title,
  initial,
  deckId,
  parentOptions,
  onSave,
  onClose,
}: Props) {
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [frontLanguage, setFrontLanguage] = useState(initial?.frontLanguage ?? "ru");
  const [backLanguage, setBackLanguage] = useState(initial?.backLanguage ?? "en");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setColor(initial?.color ?? PALETTE[0]);
    setImage(initial?.image ?? null);
    setDescription(initial?.description ?? "");
    setFrontLanguage(initial?.frontLanguage ?? "ru");
    setBackLanguage(initial?.backLanguage ?? "en");
    setParentId(initial?.parentId ?? null);
  }, [open, initial]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!image || !deckId) {
        setImagePreview(null);
        return;
      }
      const url = await loadMediaDataUrl(deckId, image);
      if (active) setImagePreview(url);
    })();
    return () => {
      active = false;
    };
  }, [image, deckId]);

  if (!open) return null;

  async function pickImage(capture: boolean) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!deckId) {
        const reader = new FileReader();
        reader.onload = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        const { bytes, ext } = await compressImage(file);
        const tempId = nanoid(8);
        (window as Window & { __pendingDeckImage?: { bytes: Uint8Array; ext: string; tempId: string } }).__pendingDeckImage = { bytes, ext, tempId };
        setImage(`__pending__${tempId}`);
      } else {
        const { bytes, ext } = await compressImage(file);
        const path = await saveMedia(deckId, "cover", "deck", "image", bytes, ext);
        setImage(path);
      }
    };
    input.click();
  }

  function clearImage() {
    setImage(null);
    setImagePreview(null);
    const w = window as Window & { __pendingDeckImage?: unknown };
    delete w.__pendingDeckImage;
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        color,
        image,
        description: description.trim(),
        frontLanguage,
        backLanguage,
        parentId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--ring-base)] px-5 py-3">
          <div className="text-[15px] font-semibold">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1 section-title">Название</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
              placeholder="Английский A1, Биология, ..."
            />
          </div>

          {parentOptions && (
            <label className="block">
              <div className="mb-1 section-title">
                Внутри группы
              </div>
              <select
                value={parentId ?? ""}
                onChange={(e) => setParentId(e.target.value || null)}
                className="field"
              >
                <option value="">— верхний уровень —</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <LanguageSelect
              label="Язык вопроса"
              value={frontLanguage}
              onChange={setFrontLanguage}
            />
            <LanguageSelect
              label="Язык ответа"
              value={backLanguage}
              onChange={setBackLanguage}
            />
          </div>

          <div>
            <div className="mb-1 section-title">Описание — необязательно</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="field resize-none"
              placeholder="Кратко: для чего эта группа"
            />
          </div>

          {/* Обложка и цвет — одна тема: цвет работает подложкой, пока картинки нет. */}
          <div>
            <div className="mb-2 section-title">Обложка</div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-[22px] font-semibold text-white"
                style={{ backgroundColor: imagePreview ? "transparent" : color }}
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name.trim().slice(0, 1) || "?").toUpperCase()
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                <button type="button" onClick={() => pickImage(true)} className="pill-button">
                  <Camera size={16} /> Камера
                </button>
                <button type="button" onClick={() => pickImage(false)} className="pill-button">
                  <Folder size={16} /> Файл
                </button>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={clearImage}
                    className="pill-button text-red-500"
                    aria-label="Убрать обложку"
                  >
                    <Trash2 size={16} /> Убрать
                  </button>
                )}
              </div>
            </div>
            <div className="hint-text mt-2">
              Картинка ужимается до 1024 px и сохраняется в webp — репозиторий не распухает.
              Без картинки на плитке остаётся буква на цветном фоне.
            </div>
          </div>

          <div>
            <div className="mb-2 section-title">Цвет</div>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full transition"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${c}` : undefined,
                  }}
                  aria-label={`Цвет ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--ring-base)] px-5 py-3">
          <button className="pill-button" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary py-2" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LanguageSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 section-title">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export async function persistPendingDeckImage(deckId: string, image: string | null): Promise<string | null> {
  if (!image || !image.startsWith("__pending__")) return image;
  const w = window as Window & { __pendingDeckImage?: { bytes: Uint8Array; ext: string; tempId: string } };
  const pending = w.__pendingDeckImage;
  if (!pending) return null;
  const path = await saveMedia(deckId, "cover", "deck", "image", pending.bytes, pending.ext);
  delete w.__pendingDeckImage;
  return path;
}
