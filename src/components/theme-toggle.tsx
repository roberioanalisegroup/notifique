"use client";

import { useTheme, type ThemeChoice } from "@/components/theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

type ThemeToggleProps = {
  className?: string;
  /** Estilo compacto (só ícone) para barras estreitas */
  compact?: boolean;
};

export function ThemeToggle({ className, compact }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open]);

  const ActiveIcon =
    theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white",
          compact ? "h-9 w-9" : "gap-2 px-3 py-2 text-sm font-medium"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Tema: escolher claro, escuro ou sistema"
      >
        <ActiveIcon className="h-4 w-4 shrink-0" />
        {!compact && <span className="hidden sm:inline">Tema</span>}
      </button>
      {open && (
        <ul
          className="absolute right-0 z-[100] mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-portal-md dark:border-slate-600 dark:bg-slate-800"
          role="listbox"
          aria-label="Opções de tema"
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/80"
                  )}
                  onClick={() => {
                    setTheme(opt.value);
                    setOpen(false);
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
