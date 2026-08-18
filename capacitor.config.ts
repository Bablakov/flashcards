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
    // Нативный HTTP: запросы git идут мимо браузерного CORS прямо в GitHub,
    // поэтому на телефоне сторонний прокси не нужен (§11).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
