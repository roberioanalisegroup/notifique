"use client";

import type { AcompanhamentoTaskRow } from "@/components/acompanhamento/acompanhamento-task-type";
import type { Company } from "@/types";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { cn, formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";

type UiColumn = "pendente" | "andamento" | "concluido";

function labelFromCa(ca: AcompanhamentoTaskRow["company_alvaras"]) {
  if (!ca?.companies) return "—";
  const c = ca.companies;
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

function responsibleFromCompany(c: Company | null | undefined) {
  const name = c?.responsible?.display_name?.trim();
  return name && name.length > 0 ? name : "—";
}

function colLabel(col: UiColumn): string {
  if (col === "pendente") return "Pendente";
  if (col === "andamento") return "Em andamento";
  return "Concluído";
}

function colBadgeClass(col: UiColumn): string {
  if (col === "pendente") return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200";
  if (col === "andamento") return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
}

export function AcompanhamentoListView({
  tasks,
  getUiColumn,
  onOpen,
}: {
  tasks: AcompanhamentoTaskRow[];
  getUiColumn: (t: AcompanhamentoTaskRow) => UiColumn;
  onOpen: (t: AcompanhamentoTaskRow) => void;
}) {
  const sorted = [...tasks].sort((a, b) => {
    const da = a.due_date || a.inicio_obrigatorio_ate || "";
    const db = b.due_date || b.inicio_obrigatorio_ate || "";
    return da.localeCompare(db);
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        Nenhuma tarefa com os filtros atuais.
      </div>
    );
  }

  return (
    <ResponsiveTableShell label="Lista de tarefas">
        <table className="table-portal table-portal-stack md:min-w-[880px]">
          <thead>
            <tr>
              <th>Alvará</th>
              <th>Empresa</th>
              <th>Responsável</th>
              <th>Vencimento (tarefa)</th>
              <th>Emissão (vínculo)</th>
              <th>Coluna</th>
              <th className="w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const ca = t.company_alvaras;
              const nome = ca?.alvaras?.name?.trim() || t.title?.trim() || "—";
              const col = getUiColumn(t);
              return (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="max-w-[220px] font-medium text-slate-900 dark:text-slate-100">
                    <span className="line-clamp-2">{nome}</span>
                  </td>
                  <td className="max-w-[200px] text-slate-700 dark:text-slate-300">
                    <span className="line-clamp-2">{labelFromCa(ca)}</span>
                  </td>
                  <td className="max-w-[160px] text-slate-600 dark:text-slate-400">
                    <span className="line-clamp-2">{responsibleFromCompany(ca?.companies)}</span>
                  </td>
                  <td className="whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {formatDate(t.due_date, { empty: "—" })}
                  </td>
                  <td className="whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {formatDate(ca?.data_emissao ?? null, { empty: "—" })}
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        colBadgeClass(col)
                      )}
                    >
                      {colLabel(col)}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Abrir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
    </ResponsiveTableShell>
  );
}
