"use client";

import { apiJson } from "@/lib/api-client";
import { janelaAPartirDe } from "@/lib/alvara-task-generation";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { cn, formatCNPJ, formatDate } from "@/lib/utils";
import type { Alvara, AlvaraGroup, AlvaraTask, Company, CompanyAlvara } from "@/types";
import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TaskRow = AlvaraTask & {
  company_alvaras:
    | (CompanyAlvara & {
        companies: Company | null;
        alvaras: (Alvara & { alvara_groups: AlvaraGroup | null }) | null;
      })
    | null;
};

function statusStyle(s: string) {
  const m: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-900",
    concluida: "bg-green-100 text-green-900",
    cancelada: "bg-slate-200 text-slate-800",
  };
  return m[s] ?? "bg-slate-100 text-slate-800";
}

export default function AcompanhamentoPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<"pendente" | "todas">("pendente");

  const { inicio, fim } = useMemo(() => janelaAPartirDe(new Date(), 30), []);
  const hoje = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (filter === "pendente") {
        sp.set("status", "pendente");
      }
      sp.set("from", inicio);
      sp.set("to", fim);
      const d = await apiJson<{ tasks: TaskRow[] }>("/api/alvara-tasks?" + sp.toString());
      setTasks(d.tasks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [filter, inicio, fim]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gerarTarefas() {
    setGenerating(true);
    try {
      const r = await apiJson<{
        janela: { inicio: string; fim: string; offsetDias: number };
        inseridos: number;
        ignoradosDuplicata: number;
      }>("/api/alvara-tasks", { method: "POST", body: JSON.stringify({ offsetDias: 30 }) });
      toast.success(
        r.inseridos > 0
          ? `Incluídas ${r.inseridos} tarefa(s). Janela: ${r.janela.inicio} a ${r.janela.fim}.`
          : `Nenhuma tarefa nova; ${r.ignoradosDuplicata} já existiam. Atualizando a lista.`
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar tarefas");
    } finally {
      setGenerating(false);
    }
  }

  async function darBaixaNoVinculo(t: TaskRow) {
    if (!confirm("Concluir esta tarefa e registar a baixa no vínculo (emissão hoje, próximo vencimento recalculado)?")) {
      return;
    }
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ registrarBaixaNoVinculo: true, status: "concluida" }),
      });
      toast.success("Baixa registada e vínculo atualizado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function soConcluir(t: TaskRow) {
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "concluida" }),
      });
      toast.success("Tarefa concluída");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Acompanhamento de alvarás</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tarefas na janela de <span className="font-medium text-slate-700">{inicio}</span> a{" "}
          <span className="font-medium text-slate-700">{fim}</span> (30 dias, alinhado ao restante do
          portal). Gere tarefas com base na periodicidade de cada tipo e na data de emissão / vencimento
          do vínculo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={gerarTarefas} disabled={generating} className="btn-primary">
          {generating ? "A gerar…" : "Gerar / atualizar tarefas (30 dias)"}
        </button>
        <Link href="/portal/configuracoes/periodicidade" className="btn-secondary">
          Periodicidade dos tipos
        </Link>
        <div className="ml-auto flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setFilter("pendente")}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-medium",
              filter === "pendente" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Pendentes
          </button>
          <button
            type="button"
            onClick={() => setFilter("todas")}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-medium",
              filter === "todas" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Todas
          </button>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading}>
          {loading ? "A atualizar…" : "Atualizar lista"}
        </button>
      </div>

      <div className="card-portal overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-portal min-w-[900px]">
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Empresa</th>
                <th>Alvará / grupo</th>
                <th>Periodicidade (tipo)</th>
                <th>Estado</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    A carregar…
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const ca = t.company_alvaras;
                  const c = ca?.companies;
                  const a = ca?.alvaras;
                  const g = a?.alvara_groups;
                  const freq = a ? FREQUENCIA_LABELS[a.frequencia] ?? a.frequencia : "—";
                  const atrasada = t.status === "pendente" && t.due_date < hoje;
                  return (
                    <tr
                      key={t.id}
                      className={cn(atrasada && "border-l-4 border-amber-500 bg-amber-50/30")}
                    >
                      <td className="whitespace-nowrap font-medium text-slate-900">
                        {formatDate(t.due_date, { empty: "—" })}
                      </td>
                      <td>
                        {c ? (
                          <Link
                            href={"/portal/empresas/" + c.id}
                            className="font-medium text-blue-600 hover:text-blue-700"
                          >
                            {c.razao_social ?? c.nome_fantasia ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {c?.cnpj ? (
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{formatCNPJ(c.cnpj)}</p>
                        ) : null}
                      </td>
                      <td>
                        <span className="font-medium text-slate-900">{a?.name ?? "—"}</span>
                        {g ? (
                          <p className="text-xs text-slate-500">{g.name}</p>
                        ) : (
                          <p className="text-xs text-slate-500">Sem grupo</p>
                        )}
                      </td>
                      <td className="text-sm text-slate-700">{freq}</td>
                      <td>
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                            statusStyle(t.status)
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="space-x-2 whitespace-nowrap">
                        {t.status === "pendente" ? (
                          <>
                            <button
                              type="button"
                              className="text-sm font-medium text-blue-600 hover:text-blue-700"
                              onClick={() => void darBaixaNoVinculo(t)}
                            >
                              Dar baixa
                            </button>
                            <button
                              type="button"
                              className="text-sm font-medium text-slate-600 hover:text-slate-800"
                              onClick={() => void soConcluir(t)}
                            >
                              Só concluir
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && tasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Nenhuma tarefa neste filtro. Use &quot;Gerar / atualizar tarefas&quot; para criar
                    entradas com base na periodicidade e nos vínculos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
