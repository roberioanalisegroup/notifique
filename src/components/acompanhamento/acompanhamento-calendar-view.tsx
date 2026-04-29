"use client";

import type { AcompanhamentoTaskRow } from "@/components/acompanhamento/acompanhamento-task-type";
import { cn } from "@/lib/utils";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type UiColumn = "pendente" | "andamento" | "concluido";

function taskAnchorDateIso(t: AcompanhamentoTaskRow): string | null {
  const d = t.due_date?.trim();
  if (d) return d.slice(0, 10);
  const i = t.inicio_obrigatorio_ate?.trim();
  if (i) return i.slice(0, 10);
  return null;
}

function labelFromCa(ca: AcompanhamentoTaskRow["company_alvaras"]) {
  if (!ca?.companies) return "—";
  const c = ca.companies;
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

function eventClass(t: AcompanhamentoTaskRow, getUiColumn: (t: AcompanhamentoTaskRow) => UiColumn): string {
  if (t.status === "concluida") return "bg-emerald-100 text-emerald-900 line-through decoration-emerald-700/60";
  const col = getUiColumn(t);
  if (col === "andamento") return "bg-sky-100 text-sky-900";
  const anchor = taskAnchorDateIso(t);
  if (anchor) {
    const exp = new Date(anchor + "T12:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);
    if (exp < today) return "bg-red-100 text-red-900";
  }
  return "bg-slate-100 text-slate-800";
}

export function AcompanhamentoCalendarView({
  tasks,
  getUiColumn,
  onOpen,
}: {
  tasks: AcompanhamentoTaskRow[];
  getUiColumn: (t: AcompanhamentoTaskRow) => UiColumn;
  onOpen: (t: AcompanhamentoTaskRow) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  const { gridDays, eventsByDay } = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const eventsByDay = new Map<string, AcompanhamentoTaskRow[]>();
    for (const t of tasks) {
      const iso = taskAnchorDateIso(t);
      if (!iso) continue;
      const arr = eventsByDay.get(iso) ?? [];
      arr.push(t);
      eventsByDay.set(iso, arr);
    }
    for (const [, arr] of Array.from(eventsByDay.entries())) {
      arr.sort((a: AcompanhamentoTaskRow, b: AcompanhamentoTaskRow) => {
        const na = a.company_alvaras?.alvaras?.name ?? a.title ?? "";
        const nb = b.company_alvaras?.alvaras?.name ?? b.title ?? "";
        return na.localeCompare(nb, "pt-BR");
      });
    }

    return { gridDays, eventsByDay };
  }, [tasks, cursor]);

  const monthTitle = format(cursor, "MMMM yyyy", { locale: ptBR });

  useEffect(() => {
    setExpandedDayKey(null);
  }, [cursor]);

  return (
    <div className="card-portal p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((d) => addMonths(d, -1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setCursor((d) => addMonths(d, 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Próximo mês"
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
          >
            Hoje
          </button>
        </div>
        <h2 className="text-center text-base font-semibold capitalize text-emerald-950 sm:text-lg">
          {monthTitle}
        </h2>
        <div className="hidden w-[min(100%,14rem)] sm:block" aria-hidden />
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
        {gridDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, cursor);
          const dayTasks = eventsByDay.get(key) ?? [];
          const expanded = expandedDayKey === key;
          const shown = expanded ? dayTasks : dayTasks.slice(0, 3);
          const more = dayTasks.length - shown.length;

          return (
            <div
              key={key}
              onClick={() => {
                if (dayTasks.length > 0) {
                  setExpandedDayKey((prev) => (prev === key ? null : key));
                }
              }}
              className={cn(
                "flex min-h-[5.5rem] flex-col rounded-xl border p-1.5 transition sm:min-h-[6.5rem] sm:p-2",
                inMonth ? "border-slate-200/90 bg-slate-50/80" : "border-transparent bg-slate-100/40 opacity-70",
                isToday(day) && "ring-2 ring-emerald-700 ring-offset-1 ring-offset-white",
                dayTasks.length > 0 && "cursor-pointer hover:border-emerald-300/80 hover:bg-emerald-50/40",
                expanded && "z-10 min-h-[11rem] border-emerald-300 bg-emerald-50/40 shadow-sm"
              )}
            >
              <span
                className={cn(
                  "mb-1 text-xs font-semibold tabular-nums",
                  inMonth ? "text-slate-800" : "text-slate-400"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {shown.map((t) => {
                  const title =
                    t.company_alvaras?.alvaras?.name?.trim() || t.title?.trim() || "Tarefa";
                  const short = title.length > 22 ? title.slice(0, 22) + "…" : title;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={`${title} — ${labelFromCa(t.company_alvaras)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(t);
                      }}
                      className={cn(
                        "w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-90 sm:text-[11px]",
                        eventClass(t, getUiColumn)
                      )}
                    >
                      {short}
                    </button>
                  );
                })}
                {!expanded && more > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDayKey(key);
                    }}
                    className="text-center text-[10px] font-medium text-emerald-800 hover:underline"
                  >
                    +{more} mais
                  </button>
                ) : null}
                {expanded && dayTasks.length > 3 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDayKey(null);
                    }}
                    className="text-center text-[10px] font-medium text-slate-600 hover:underline"
                  >
                    Recolher
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Eventos pela <strong className="text-slate-600">data de vencimento da tarefa</strong>; se não existir, usa-se
        o <strong className="text-slate-600">início obrigatório</strong> (1.º ciclo).
      </p>
    </div>
  );
}


