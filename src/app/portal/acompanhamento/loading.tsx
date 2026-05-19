import { PortalPageLoading } from "@/components/portal/portal-page-loading";

export default function AcompanhamentoLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <PortalPageLoading rows={4} />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[360px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/50"
          />
        ))}
      </div>
    </div>
  );
}
