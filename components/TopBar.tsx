"use client";

import Link from "next/link";
import { ArrowLeft, Moon, Search, Settings, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeProvider";

interface TopBarProps {
  title?: string;
  back?: boolean;
  rightSlot?: React.ReactNode;
  hideDefaults?: boolean;
}

export function TopBar({ title, back, rightSlot, hideDefaults }: TopBarProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-bg-base/95 px-3 py-3 backdrop-blur">
      <div className="flex items-center gap-1">
        {back ? (
          <button className="icon-btn" onClick={() => router.back()} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        )}
      </div>
      <div className="flex-1 truncate text-center font-display text-2xl tracking-wide text-text-primary sm:text-3xl">
        {title ?? "FLASHCARDS"}
      </div>
      <div className="flex items-center gap-1">
        {rightSlot}
        {!hideDefaults && (
          <>
            {back && (
              <button
                className="icon-btn"
                onClick={toggle}
                aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
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
