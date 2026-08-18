"use client";

/** base64 (без префикса data:) → Blob. */
export function base64ToBlob(base64: string, mime: string): Blob {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** data-URL → File (для нативной камеры, отдающей dataUrl). */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const blob = base64ToBlob(body, mime);
  return new File([blob], name, { type: mime });
}

export async function fileToBytes(file: File | Blob): Promise<{ bytes: Uint8Array; ext: string; mime: string }> {
  const buf = await file.arrayBuffer();
  const mime = file.type || "application/octet-stream";
  const ext = mimeToExt(mime);
  return { bytes: new Uint8Array(buf), ext, mime };
}

export function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Сжатие картинки перед сохранением.
 *
 * Обложки и картинки карточек уезжают в git обычными файлами, поэтому снимок
 * с телефона на 4 МБ навсегда останется в истории репозитория. Уменьшаем до
 * разумного размера и переводим в webp — качество для карточки не страдает,
 * а вес падает в разы. Если браузер не смог — сохраняем как есть.
 */
export async function compressImage(
  file: File | Blob,
  maxSide = 1024,
  quality = 0.82,
): Promise<{ bytes: Uint8Array; ext: string; mime: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality),
    );
    if (!blob) throw new Error("toBlob failed");

    // Если пережатие не дало выигрыша (уже маленькая картинка) — берём оригинал.
    if (blob.size >= file.size && scale === 1) return await fileToBytes(file);

    const buf = await blob.arrayBuffer();
    return { bytes: new Uint8Array(buf), ext: "webp", mime: "image/webp" };
  } catch {
    return await fileToBytes(file);
  }
}
