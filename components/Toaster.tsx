"use client";

import { useEffect, useState } from "react";

interface ToastEvent {
  id: number;
  text: string;
  kind: "info" | "error" | "success";
}

let counter = 0;
const listeners = new Set<(t: ToastEvent) => void>();

export function toast(text: string, kind: ToastEvent["kind"] = "info") {
  const ev: ToastEvent = { id: ++counter, text, kind };
  listeners.forEach((l) => l(ev));
}

export function Toaster() {
  const [items, setItems] = useState<ToastEvent[]>([]);
  useEffect(() => {
    const onPush = (t: ToastEvent) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
    listeners.add(onPush);
    return () => {
      listeners.delete(onPush);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-6">
      {items.map((it) => (
        <div
          key={it.id}
          className={`pointer-events-auto w-full rounded-[14px] px-4 py-3 text-[14px] shadow-[var(--shadow-float)] ${
            it.kind === "error"
              ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/40"
              : it.kind === "success"
                ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40"
                : "bg-bg-card text-text-primary ring-1 ring-[var(--ring-strong)]"
          }`}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}
