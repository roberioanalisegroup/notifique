import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ResponsiveTableShellProps = {
  children: ReactNode;
  className?: string;
  /** Descrição da região para leitores de ecrã */
  label?: string;
  /** Texto visível só em mobile (antes da tabela) */
  mobileHint?: string;
};

export function ResponsiveTableShell({
  children,
  className,
  label = "Tabela de dados",
  mobileHint = "Em ecrãs pequenos, cada linha aparece em cartão. Em tablets, pode deslizar horizontalmente se necessário.",
}: ResponsiveTableShellProps) {
  return (
    <div className={cn("card-portal card-portal-clip overflow-hidden", className)}>
      <p className="border-b border-slate-100 px-4 py-2.5 text-xs leading-relaxed text-slate-500 md:hidden dark:border-slate-700 dark:text-slate-400">
        {mobileHint}
      </p>
      <div
        className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
