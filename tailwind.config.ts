import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#1a1a1a",
          soft: "#262626",
          card: "#2d2d2d",
        },
        accent: {
          DEFAULT: "#e36b6b",
          purple: "#7c3aed",
          orange: "#f59e0b",
        },
        level: {
          1: "#ef4444",
          2: "#f97316",
          3: "#eab308",
          4: "#22c55e",
          5: "#06b6d4",
          6: "#6366f1",
        },
      },
      fontFamily: {
        display: ['"Caveat Brush"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
