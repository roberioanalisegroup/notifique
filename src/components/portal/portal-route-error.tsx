"use client";

import Link from "next/link";

type PortalRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
};

export function PortalRouteError({
  error,
  reset,
  title = "Não foi possível carregar esta página",
}: PortalRouteErrorProps) {
  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50/90 px-6 py-8 text-center dark:border-red-500/30 dark:bg-red-950/40"
      role="alert"
    >
      <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">{title}</h2>
      <p className="mt-2 text-sm text-red-800/90 dark:text-red-200/80">
        {error.message || "Ocorreu um erro inesperado. Tente novamente."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Tentar novamente
        </button>
        <Link href="/portal/dashboard" className="btn-secondary">
          Ir ao dashboard
        </Link>
      </div>
    </div>
  );
}
