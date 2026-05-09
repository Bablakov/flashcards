"use client";

import Link from "next/link";
import { ArrowLeft, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

interface TopBarProps {
  title?: string;
  back?: boolean;
  rightSlot?: React.ReactNode;
}

export function TopBar({ title, back, rightSlot }: TopBarProps) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        {back ? (
          <button className="icon-btn" onClick={() => router.back()} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>
      <div className="flex-1 text-center font-display text-3xl tracking-wide text-neutral-100">
        {title ?? "FLASHCARDS"}
      </div>
      <div className="flex items-center gap-2">
        {rightSlot ?? (
          <>
            <Link href="/search" className="icon-btn" aria-label="Поиск">
              <Search size={20} />
            </Link>
            <Link href="/settings" className="icon-btn" aria-label="Настройки">
              <Settings size={20} />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
