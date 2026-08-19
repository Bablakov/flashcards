"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BottomActionsProps {
  children: ReactNode;
}

/**
 * Нижняя панель действий. Ровно четыре пункта, редкое уходит под «Ещё».
 * Отступ снизу учитывает жестовую полосу Android — иначе последняя кнопка
 * попадает под системную зону и по ней трудно попасть.
 */
export function BottomActions({ children }: BottomActionsProps) {
  return (
    <nav
      className="sticky bottom-0 z-30 mt-auto bg-bg-base/95 px-2 pt-1.5 backdrop-blur"
      style={{
        borderTop: "1px solid var(--ring-base)",
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* На широком экране кнопки не растягиваются на весь монитор:
          иначе иконка теряется посреди пустой полосы в 250 px. */}
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">{children}</div>
    </nav>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Главное действие экрана — подсвечено акцентом, такое на экране одно. */
  primary?: boolean;
}

export function ActionButton({ icon, label, onClick, disabled, primary }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full min-w-0 flex-col items-center gap-0.5 rounded-[14px] px-1 py-1.5 text-[11px] transition disabled:opacity-40",
        primary ? "text-[var(--accent)]" : "text-text-muted hover:text-text-primary",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[10px]",
          primary && "bg-[var(--accent-soft)]",
        )}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center leading-tight">{label}</span>
    </button>
  );
}
