import type { NextConfig } from "next";
import pkg from "./package.json";

// Сайт на GitHub Pages живёт в подпапке /flashcards — её задаёт `npm run build:web`.
// ПК и телефонные сборки открывают файлы из корня, им подпапка не нужна.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  // Версия нужна в интерфейсе для проверки обновлений (§9.2).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
