import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg-base)",
          base: "var(--bg-base)",
          soft: "var(--bg-soft)",
          card: "var(--bg-card)",
          raised: "var(--bg-raised)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        accent: {
          DEFAULT: "var(--accent)",
        },
      },
      fontFamily: {
        /**
         * Раньше здесь стоял «Caveat Brush», но сам шрифт нигде не подключался:
         * ни @font-face, ни next/font — на ПК и телефоне всё это время
         * подставлялся системный. Держим системный стек честно: он
         * гарантированно есть офлайн, а иерархию задаём начертанием и размером.
         */
        display: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Inter",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
