import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kirill.flashcards",
  appName: "Flashcards",
  webDir: "out",
  android: {
    allowMixedContent: false,
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
