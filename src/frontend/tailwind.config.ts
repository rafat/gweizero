import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        success: "var(--success)",
        danger: "var(--danger)"
      },
      boxShadow: {
        glow: "0 0 30px rgba(240, 185, 11, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
