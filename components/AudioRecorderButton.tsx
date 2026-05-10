"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudioRecorderHandle, startAudioRecording } from "@/lib/media";
import { toast } from "@/components/Toaster";

interface Props {
  onRecorded: (blob: Blob, mime: string) => void;
}

export function AudioRecorderButton({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const handleRef = useRef<AudioRecorderHandle | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      handleRef.current?.cancel();
    };
  }, []);

  async function start() {
    try {
      const handle = await startAudioRecording();
      handleRef.current = handle;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: unknown) {
      toast(`Микрофон недоступен: ${(e as Error).message}`, "error");
    }
  }

  async function stop() {
    if (!handleRef.current) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const { blob, mime } = await handleRef.current.stop();
    handleRef.current = null;
    setRecording(false);
    onRecorded(blob, mime);
  }

  const fmt = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <button
      onClick={recording ? stop : start}
      type="button"
      className={`flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-medium transition ${
        recording ? "bg-red-500 text-white" : "bg-[var(--accent)] text-white hover:opacity-90"
      }`}
    >
      {recording ? <Square size={20} /> : <Mic size={20} />}
      {recording ? `Остановить ${fmt}` : "Запись голоса"}
    </button>
  );
}
