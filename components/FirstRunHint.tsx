"use client";

/**
 * Экран первого запуска (§13). Тот же текст, что в SETUP-USER.md, но внутри
 * приложения — чтобы не искать файл на GitHub, когда ставишь приложение
 * на новый телефон. Показывается, пока не настроена синхронизация.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, X } from "lucide-react";
import { loadGitConfig } from "@/lib/settings";

const DISMISS_KEY = "flashcards.firstrun.dismissed";

export function FirstRunHint() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    setShow(!loadGitConfig().remoteUrl);
  }, []);

  if (!show) return null;

  return (
    <section className="mb-3 rounded-2xl bg-bg-card p-4 ring-1 ring-[var(--ring-base)]">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch size={18} className="text-[var(--accent)]" />
        <span className="flex-1 text-base font-semibold text-text-primary">
          Подключите свой репозиторий
        </span>
        <button
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setShow(false);
          }}
          className="icon-btn h-8 w-8"
          aria-label="Скрыть"
        >
          <X size={16} />
        </button>
      </div>
      <ol className="ml-4 list-decimal space-y-1 text-sm text-text-secondary">
        <li>Создайте приватный репозиторий на GitHub (например «flashcards-data»).</li>
        <li>
          Сделайте fine-grained токен с доступом только к нему и правом
          <span className="text-text-primary"> Contents: Read and write</span>.
        </li>
        <li>Вставьте адрес и токен в настройках и нажмите «Клонировать».</li>
        <li>На втором устройстве введите те же данные — карточки, прогресс и настройки подтянутся.</li>
      </ol>
      <p className="mt-2 text-xs text-text-faint">
        Без этого приложение тоже работает — карточки просто останутся на этом устройстве.
      </p>
      <button
        onClick={() => router.push("/settings")}
        className="pill-button mt-3 bg-[var(--accent)]/15 text-[var(--accent)]"
      >
        Открыть настройки
      </button>
    </section>
  );
}
