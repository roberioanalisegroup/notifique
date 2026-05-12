"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

export type ThemeChoice = "light" | "dark" | "system";

export { THEME_STORAGE_KEY };

type ThemeContextValue = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  resolved: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveDark(choice: ThemeChoice): boolean {
  return choice === "dark" || (choice === "system" && systemPrefersDark());
}

export function applyThemeClass(choice: ThemeChoice): void {
  document.documentElement.classList.toggle("dark", resolveDark(choice));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      const next: ThemeChoice =
        raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
      setThemeState(next);
      applyThemeClass(next);
      setResolved(resolveDark(next) ? "dark" : "light");
    } catch {
      applyThemeClass("system");
      setResolved(systemPrefersDark() ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyThemeClass(theme);
    setResolved(resolveDark(theme) ? "dark" : "light");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyThemeClass("system");
      setResolved(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, mounted]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, resolved }),
    [theme, setTheme, resolved]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  }
  return ctx;
}
