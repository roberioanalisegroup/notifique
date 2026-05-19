import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        /** Tokens do portal (preferir em código novo em vez de hex soltos) */
        primary: { DEFAULT: "#2F6BFF", foreground: "#FFFFFF" },
        secondary: "#111827",
        surface: { DEFAULT: "#131C2E", muted: "rgba(255,255,255,0.03)" },
        accent: "#4DA3FF",
        "text-primary": "#FFFFFF",
        "text-secondary": "#9CA3AF",
        success: "#22C55E",
        "border-soft": "rgba(255,255,255,0.08)",
      },
      boxShadow: {
        "portal": "0 4px 20px -2px rgba(0, 0, 0, 0.4)",
        "portal-md": "0 8px 30px -4px rgba(0, 0, 0, 0.5)",
        "glow": "0 0 15px 0 rgba(47, 107, 255, 0.25)",
        "glow-lg": "0 0 25px 0 rgba(47, 107, 255, 0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
