import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        /** Tokens do portal atualizados para estilo Apple */
        primary: { DEFAULT: "#0071E3", foreground: "#FFFFFF" },
        secondary: "#1D1D1F",
        surface: { DEFAULT: "#2C2C2E", muted: "rgba(255,255,255,0.03)" },
        accent: "#0071E3",
        "text-primary": "#F5F5F7",
        "text-secondary": "#AEAEB2",
        success: "#34C759",
        "border-soft": "rgba(255,255,255,0.08)",
      },
      boxShadow: {
        "portal": "0 2px 20px rgba(0, 0, 0, 0.07), 0 1px 4px rgba(0, 0, 0, 0.04)",
        "portal-md": "0 8px 32px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.06)",
        "glow": "0 0 15px 0 rgba(0, 113, 227, 0.20)",
        "glow-lg": "0 0 25px 0 rgba(0, 113, 227, 0.35)",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "apple-out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "apple-in-out": "cubic-bezier(0.645, 0.045, 0.355, 1.0)",
        "apple-default": "cubic-bezier(0.4, 0.0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
