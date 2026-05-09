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
      }, 4000);
    };
    listeners.add(onPush);
    return () => {
      listeners.delete(onPush);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {items.map((it) => (
        <div
          key={it.id}
          className={`pointer-events-auto w-full rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ring-white/10 ${
            it.kind === "error"
              ? "bg-red-500/15 text-red-200"
              : it.kind === "success"
                ? "bg-emerald-500/15 text-emerald-200"
                : "bg-neutral-800 text-neutral-100"
          }`}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}
