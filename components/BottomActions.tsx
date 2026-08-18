"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BottomActionsProps {
  children: ReactNode;
}

export function BottomActions({ children }: BottomActionsProps) {
  return (
    <div className="sticky bottom-0 z-30 mt-auto bg-bg-base/95 px-3 py-3 backdrop-blur" style={{ borderTop: "1px solid var(--ring-base)" }}>
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
        "flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] text-text-secondary transition disabled:opacity-40",
      )}
      style={{ ["--hover-bg" as string]: "var(--ring-base)" }}
    >
      <span className="flex h-8 w-8 items-center justify-center text-text-primary">{icon}</span>
      <span className="w-full truncate text-center leading-tight">{label}</span>
    </button>
  );
}
