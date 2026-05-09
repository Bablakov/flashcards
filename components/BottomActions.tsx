"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BottomActionsProps {
  children: ReactNode;
}

export function BottomActions({ children }: BottomActionsProps) {
  return (
    <div className="sticky bottom-0 z-30 mt-auto border-t border-white/5 bg-bg/95 px-3 py-3 backdrop-blur">
      <div className="flex items-stretch justify-around gap-1">{children}</div>
    </div>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export function ActionButton({ icon, label, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs text-neutral-300 transition hover:bg-white/5 disabled:opacity-40",
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center text-neutral-100">{icon}</span>
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}
