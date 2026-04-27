import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/90", className)} />;
}

export function AlvarasTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
      </div>
      <div className="card-portal overflow-hidden">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/90">
            <tr>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i} className="p-2.5">
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="p-2">
                  <Skeleton className="h-4 w-full max-w-[200px]" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-5 w-24" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-4 w-20" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-4 w-8" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-4 w-6" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-4 w-20" />
                </td>
                <td className="p-2">
                  <Skeleton className="h-4 w-24" />
                </td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AlvaraGruposGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 shrink-0" />
      </div>
      <div className="card-portal overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/40 p-4"
              style={{ borderLeftWidth: 4, borderLeftColor: "#e2e8f0" }}
            >
              <Skeleton className="h-6 w-[min(75%,12rem)]" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-40" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
