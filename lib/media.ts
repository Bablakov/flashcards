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

