"use client";

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
