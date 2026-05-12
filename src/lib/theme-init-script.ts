import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

/** Script inline para aplicar a classe `dark` antes da hidratação (evita flash). */
export function themeInitScript(): string {
  const k = JSON.stringify(THEME_STORAGE_KEY);
  return `(function(){try{var t=localStorage.getItem(${k});var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t!=='light'&&d);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;
}
