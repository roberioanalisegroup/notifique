"use client";

import type { AlvaraTaskChecklistRow } from "@/types";
import { cn } from "@/lib/utils";

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

  return (
    <div
      className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
        Etapas ({done}/{items.length})
      </p>
      <ul className="space-y-1.5">
        {items.map((row) => (
          <li key={row.item_id} className="flex items-start gap-2">
            <input
              type="checkbox"
              id={`chk-${idPrefix}-${row.item_id}`}
              checked={row.completed}
              disabled={readOnly}
              onChange={(e) => {
                e.stopPropagation();
                onToggle(row.item_id, e.target.checked);
              }}
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                readOnly && "cursor-not-allowed opacity-60"
              )}
            />
            <label
              htmlFor={`chk-${idPrefix}-${row.item_id}`}
              className={cn(
                "min-w-0 flex-1 cursor-pointer text-[0.7rem] leading-snug text-slate-800",
                row.completed && "text-slate-500 line-through",
                readOnly && "cursor-default"
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
