import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: "export",
  // Версия нужна в интерфейсе для проверки обновлений (§9.2).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
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
