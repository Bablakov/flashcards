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

/**
 * Верхняя панель одинаковой высоты на всех экранах: 56 px, слева одна кнопка,
 * по центру заголовок, справа не больше трёх иконок. Переключатель темы живёт
 * только на главной и в настройках — на внутренних экранах он занимал место
 * и мешал заголовку.
 */
export function TopBar({ title, back, rightSlot, hideDefaults }: TopBarProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-1 bg-bg-base/95 px-2 backdrop-blur"
      style={{ borderBottom: "1px solid var(--ring-base)" }}
    >
      <div className="flex w-10 flex-shrink-0 items-center">
        {back ? (
          <button className="icon-btn" onClick={() => router.back()} aria-label="Назад">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
      </div>

      <div className="screen-title flex-1 text-center">
        {title ?? <span className="tracking-[0.14em]">ФЛЕШКАРТЫ</span>}
      </div>

      <div className="flex flex-shrink-0 items-center justify-end gap-0.5">
        {rightSlot}
        {!hideDefaults && (
          <>
            <Link href="/search" className="icon-btn" aria-label="Поиск по всем карточкам">
              <Search size={18} />
            </Link>
            <Link href="/settings" className="icon-btn" aria-label="Настройки">
              <Settings size={18} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
