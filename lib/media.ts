"use client";

import { Capacitor } from "@capacitor/core";

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
    case "audio/webm":
      return "webm";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    default:
      return "bin";
  }
}

export interface AudioRecorderHandle {
  stop(): Promise<{ blob: Blob; mime: string }>;
  cancel(): void;
}

export async function startAudioRecording(): Promise<AudioRecorderHandle> {
  // Native (Android-приложение): надёжная запись через плагин вместо капризного
  // WebView MediaRecorder. Возвращает тот же контракт, AudioRecorderButton не меняется.
  if (Capacitor.isNativePlatform()) {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (perm && perm.value === false) throw new Error("Нет разрешения на микрофон");
    await VoiceRecorder.startRecording();
    return {
      async stop() {
        const res = await VoiceRecorder.stopRecording();
        const data = res.value.recordDataBase64;
        if (!data) throw new Error("Пустая запись");
        const mime = res.value.mimeType || "audio/aac";
        return { blob: base64ToBlob(data, mime), mime };
      },
      cancel() {
        VoiceRecorder.stopRecording().catch(() => {});
      },
    };
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  recorder.start();

  return {
    async stop() {
      return await new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const finalMime = recorder.mimeType || mime || "audio/webm";
          const blob = new Blob(chunks, { type: finalMime });
          resolve({ blob, mime: finalMime });
        };
        recorder.stop();
      });
    },
    cancel() {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
