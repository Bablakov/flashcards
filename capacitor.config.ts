import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kirill.flashcards",
  appName: "Flashcards",
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
  ios: {
    // Фон WebView до первой отрисовки страницы: без него между заставкой
    // и приложением мелькал белый экран. Цвет — фон тёмной темы (--bg-base).
    backgroundColor: "#171717",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    // Глобальный патч fetch/XHR ВЫКЛЮЧЕН намеренно: он перехватывал вообще все
    // запросы приложения (включая загрузку страниц) и не умеет передавать
    // двоичные тела git-протокола. Нативный HTTP вызывается явно из
    // lib/git-http.ts — только для запросов git.
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
