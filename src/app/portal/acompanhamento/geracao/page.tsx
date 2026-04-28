"use client";

import { apiJson } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";
import type { Alvara, AlvaraGroup, AlvaraTask, Company, CompanyAlvara } from "@/types";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
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

function companyLabel(c: Company | null | undefined): string {
  if (!c) return "—";
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

export default function GeracaoTarefasPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [generating, setGenerating] = useState(false);

  const [advFrom, setAdvFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [advTo, setAdvTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [advPassword, setAdvPassword] = useState("");
  const [advBusy, setAdvBusy] = useState(false);

  const cy = new Date().getFullYear();
  const listQuery = useMemo(
    () => `status=pendente&from=${cy - 1}-01-01&to=${cy + 3}-12-31`,
    [cy]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson<{ tasks: TaskRow[] }>("/api/alvara-tasks?" + listQuery);
      setTasks(d.tasks);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [listQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === tasks.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(tasks.map((t) => t.id)));
  }

  async function gerarTarefas() {
    setGenerating(true);
    try {
      const r = await apiJson<{
        inseridos: number;
        ignoradosJaComPendente: number;
      }>("/api/alvara-tasks", { method: "POST", body: "{}" });
      toast.success(
        r.inseridos > 0
          ? `Incluídas ${r.inseridos} nova(s) tarefa(s) pendente(s) sem vencimento até registo da emissão no vínculo.`
          : `Nenhuma tarefa nova necessária (${r.ignoradosJaComPendente} vínculo(s) já têm tarefa pendente).`
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  }

  async function eliminarPendentesIntactas() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.message("Selecione pelo menos uma tarefa.");
      return;
    }
    if (
      !confirm(
        "Eliminar apenas as selecionadas que estejam pendentes e sem alterações desde a criação? (As que não forem elegíveis serão ignoradas.)"
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const r = await apiJson<{
        deleted: number;
        skipped?: number;
        message?: string;
      }>("/api/alvara-tasks/admin/delete-pending-clean", {
        method: "POST",
        body: JSON.stringify({ taskIds: ids }),
      });
      toast.success(
        r.message ??
          `Removidas ${r.deleted} tarefa(s). Ignoradas: ${r.skipped ?? Math.max(0, ids.length - r.deleted)}.`
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBulkBusy(false);
    }
  }

  async function eliminarPorPeriodo() {
    if (!advPassword.trim()) {
      toast.error("Digite a sua palavra-passe.");
      return;
    }
    if (
      !confirm(
        `Isto vai APAGAR permanentemente todas as tarefas com vencimento entre ${advFrom} e ${advTo}, em qualquer estado. Continuar?`
      )
    ) {
      return;
    }
    setAdvBusy(true);
    try {
      const r = await apiJson<{ deleted: number; message?: string }>(
        "/api/alvara-tasks/admin/delete-by-period",
        {
          method: "POST",
          body: JSON.stringify({ from: advFrom, to: advTo, password: advPassword }),
        }
      );
      toast.success(r.message ?? `${r.deleted} tarefa(s) removida(s).`);
      setAdvPassword("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAdvBusy(false);
    }
  }

  return (
    <div className="space-y-8 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/portal/acompanhamento"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Quadro Kanban
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Geração e manutenção de tarefas
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Cada vínculo ativo pode ter <strong>uma tarefa pendente</strong>. No <strong>1.º ciclo</strong>, a meta
            para sair de Pendente é o <strong>Início Obrigatório</strong> (dias configurados no tipo). Após
            registar a <strong>emissão</strong>, o <strong>vencimento da tarefa</strong> é calculado
            automaticamente. Ao concluir, a <strong>próxima</strong> pendente já nasce com esse vencimento
            (com base na emissão do ciclo); desse modo só o vencimento conta como prazo, não o “início
            obrigatório”.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary shrink-0" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Recarregar lista</span>
        </button>
      </div>

      <section className="card-portal p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Wand2 className="h-5 w-5 text-emerald-700" />
          Gerar tarefas em falta
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Insere uma pendente por vínculo que ainda não tenha nenhuma. Não duplica enquanto existir tarefa
          pendente para o mesmo vínculo.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={generating} onClick={() => void gerarTarefas()}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {generating ? "A gerar…" : "Gerar tarefas em falta"}
          </button>
        </div>
      </section>

      <section className="card-portal overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Tarefas pendentes (seleção em massa)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Lista: pendentes com <code className="rounded bg-slate-100 px-1">due_date</code> no intervalo {cy - 1}–{cy + 3}{" "}
            ou <strong>sem vencimento</strong> (aguardam emissão no vínculo). Eliminação segura: só linhas{" "}
            <strong>pendentes</strong> sem eventos de histórico além da criação (ou sem histórico — legado).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={toggleAll} disabled={loading || tasks.length === 0}>
              {selected.size === tasks.length ? "Desmarcar todas" : "Selecionar visíveis"}
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1 border-red-200 text-sm text-red-800 hover:bg-red-50"
              disabled={bulkBusy || selected.size === 0}
              onClick={() => void eliminarPendentesIntactas()}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar selecionadas (só intactas)
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-portal min-w-[900px]">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Venc. tarefa</th>
                <th>Prazo início</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Notas</th>
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
                tasks.map((t) => (
                  <tr key={t.id} className={cn(selected.has(t.id) && "bg-blue-50/50")}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        aria-label="Selecionar tarefa"
                      />
                    </td>
                    <td className="whitespace-nowrap font-medium">{formatDate(t.due_date, { empty: "—" })}</td>
                    <td className="whitespace-nowrap text-slate-600">{formatDate(t.inicio_obrigatorio_ate, { empty: "—" })}</td>
                    <td>{companyLabel(t.company_alvaras?.companies)}</td>
                    <td>{t.company_alvaras?.alvaras?.name ?? "—"}</td>
                    <td className="max-w-xs truncate text-slate-600">{t.notes ?? "—"}</td>
                  </tr>
                ))
              )}
              {!loading && tasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Nenhuma tarefa pendente no intervalo da lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-portal border-amber-200/80 bg-amber-50/30 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-amber-950">
          <AlertTriangle className="h-5 w-5" />
          Exclusão avançada (por período de vencimento)
        </h2>
        <p className="mt-2 text-sm text-amber-950/80">
          Remove <strong>todas</strong> as tarefas cuja <code className="rounded bg-white px-1">due_date</code>{" "}
          está no intervalo, incluindo já alteradas ou concluídas. Exige a sua <strong>palavra-passe</strong> de
          início de sessão para confirmar.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="form-label block" htmlFor="adv-from">
              De
            </label>
            <input id="adv-from" type="date" className="input-field w-40" value={advFrom} onChange={(e) => setAdvFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label block" htmlFor="adv-to">
              Até
            </label>
            <input id="adv-to" type="date" className="input-field w-40" value={advTo} onChange={(e) => setAdvTo(e.target.value)} />
          </div>
          <div>
            <label className="form-label block" htmlFor="adv-pw">
              Palavra-passe
            </label>
            <input
              id="adv-pw"
              type="password"
              autoComplete="current-password"
              className="input-field min-w-[12rem]"
              value={advPassword}
              onChange={(e) => setAdvPassword(e.target.value)}
              placeholder="Confirme a sua palavra-passe"
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
            disabled={advBusy}
            onClick={() => void eliminarPorPeriodo()}
          >
            {advBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Executar exclusão por período
          </button>
        </div>
      </section>
    </div>
  );
}
