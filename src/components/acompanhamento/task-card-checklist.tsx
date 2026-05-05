"use client";

import type { AlvaraTaskChecklistRow } from "@/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";

export function TaskCardChecklist({
  idPrefix,
  items,
  readOnly,
  onToggle,
}: {
  /** Evita ids duplicados no DOM quando vários cartões partilham os mesmos item_id. */
  idPrefix: string;
  items: AlvaraTaskChecklistRow[];
  readOnly: boolean;
  onToggle: (itemId: string, completed: boolean) => void;
}) {
  if (!items.length) return null;

  const done = items.filter((i) => i.completed).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div
      className="mt-2.5 rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white px-3 py-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with progress */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
          Etapas
        </p>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums",
              done === items.length
                ? "bg-emerald-50 text-emerald-600"
                : "bg-slate-100 text-slate-500"
            )}
          >
            {done}/{items.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-1 rounded-full transition-all duration-500 ease-out",
            done === items.length
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : "bg-gradient-to-r from-blue-400 to-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <ul className="space-y-1">
        {items.map((row) => (
          <li key={row.item_id} className="group flex items-start gap-2">
            <button
              type="button"
              id={`chk-${idPrefix}-${row.item_id}`}
              disabled={readOnly}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(row.item_id, !row.completed);
              }}
              className={cn(
                "mt-0.5 shrink-0 transition-colors duration-200",
                readOnly && "cursor-not-allowed opacity-60",
                !readOnly && "cursor-pointer"
              )}
              aria-label={row.completed ? "Desmarcar etapa" : "Marcar etapa como concluída"}
            >
              {row.completed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
              )}
            </button>
            <label
              htmlFor={`chk-${idPrefix}-${row.item_id}`}
              className={cn(
                "min-w-0 flex-1 text-[0.7rem] leading-snug transition-all duration-200",
                row.completed
                  ? "text-slate-400 line-through decoration-slate-300"
                  : "text-slate-700",
                readOnly ? "cursor-default" : "cursor-pointer"
              )}
            >
              {row.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
