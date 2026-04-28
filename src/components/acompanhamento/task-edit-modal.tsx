"use client";

import { apiJson } from "@/lib/api-client";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { cn, formatDate } from "@/lib/utils";
import type { Alvara, AlvaraGroup, AlvaraTask, AlvaraTaskHistory, Company, CompanyAlvara } from "@/types";
import {
  Building2,
  CalendarDays,
  History,
  Loader2,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type TaskDetail = AlvaraTask & {
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

function eventLabel(t: string): string {
  const m: Record<string, string> = {
    created: "Criação",
    status: "Estado",
    notes: "Descrição",
    attachment: "Anexo",
    due_date: "Vencimento",
    system: "Sistema",
  };
  return m[t] ?? t;
}

function validityMeta(expirationDate: string | null | undefined): { className: string; text: string } {
  if (!expirationDate) return { className: "", text: "Sem validade no vínculo" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  if (diffDays < 0) return { className: "bg-red-100 text-red-800", text: "Vencido" };
  if (diffDays <= 90)
    return { className: "bg-orange-100 text-orange-900", text: `Vence em ${diffDays} dias` };
  return {
    className: "bg-sky-100 text-sky-800",
    text: `Válido até ${exp.toLocaleDateString("pt-BR")}`,
  };
}

export function TaskEditModal({
  taskId,
  open,
  onClose,
  onSaved,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [history, setHistory] = useState<AlvaraTaskHistory[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vincEmissao, setVincEmissao] = useState("");
  const [vincVenc, setVincVenc] = useState("");

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const d = await apiJson<{ task: TaskDetail; history: AlvaraTaskHistory[] }>(
        "/api/alvara-tasks/" + taskId
      );
      setTask(d.task);
      setHistory(d.history);
      setNotes(d.task.notes ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar tarefa");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [taskId, onClose]);

  useEffect(() => {
    if (open && taskId) void load();
    else if (!open) {
      setTask(null);
      setHistory([]);
      setNotes("");
      setVincEmissao("");
      setVincVenc("");
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!task?.company_alvaras) {
      setVincEmissao("");
      setVincVenc("");
      return;
    }
    setVincEmissao(task.company_alvaras.data_emissao?.slice(0, 10) ?? "");
    setVincVenc(task.company_alvaras.data_vencimento?.slice(0, 10) ?? "");
  }, [task]);

  async function saveVinculo() {
    const caId = task?.company_alvaras?.id;
    if (!caId || !taskId) return;
    setSaving(true);
    try {
      await apiJson("/api/company-alvaras/" + caId, {
        method: "PATCH",
        body: JSON.stringify({
          data_emissao: vincEmissao.trim() || null,
          data_vencimento: vincVenc.trim() || null,
        }),
      });
      toast.success("Datas do vínculo atualizadas");
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!taskId) return;
    setSaving(true);
    try {
      await apiJson("/api/alvara-tasks/" + taskId, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      toast.success("Descrição guardada");
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function patchStatus(body: Record<string, unknown>) {
    if (!taskId) return;
    setSaving(true);
    try {
      await apiJson("/api/alvara-tasks/" + taskId, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Atualizado");
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const ca = task?.company_alvaras;
  const c = ca?.companies;
  const a = ca?.alvaras;
  const g = a?.alvara_groups;
  const hasEmissao = Boolean(ca?.data_emissao && String(ca.data_emissao).trim());
  const hasVencimentoTarefa = Boolean(task?.due_date && String(task.due_date).trim());
  const podeConcluirModal = Boolean(task && hasEmissao && hasVencimentoTarefa);
  const venc = validityMeta(ca?.data_vencimento);
  const empresaHref = c ? "/portal/empresas/" + c.id : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="task-edit-title"
    >
      <div className="modal-panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="task-edit-title" className="text-lg font-semibold text-slate-900">
              Detalhe da tarefa
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Edite a descrição e consulte o histórico.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading || !task ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <span className="text-sm text-slate-500">A carregar…</span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="space-y-4 px-6 py-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    venc.className || "bg-slate-100 text-slate-700"
                  )}
                >
                  {venc.text}
                </span>
                <span className="text-xs font-medium uppercase text-slate-500">
                  Estado: {task.status}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">{a?.name ?? "Tarefa de alvará"}</h3>
                <p className="mt-1 flex items-center gap-1 text-emerald-800">
                  <Building2 className="h-4 w-4 shrink-0" />
                  {empresaHref ? (
                    <Link href={empresaHref} className="font-medium hover:underline">
                      {companyLabel(c)}
                    </Link>
                  ) : (
                    companyLabel(c)
                  )}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 font-mono text-xs text-slate-700">
                {ca?.numero ? `📄 ${ca.numero}` : `Grupo · ${g?.name ?? "Sem grupo"}`}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <p className="mb-2 font-semibold text-slate-800">Datas do vínculo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="form-label mb-1 block text-slate-700">Data de emissão</span>
                    <input
                      type="date"
                      className="input-field"
                      value={vincEmissao}
                      onChange={(e) => setVincEmissao(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="form-label mb-1 block text-slate-700">Data de vencimento (vínculo)</span>
                    <input
                      type="date"
                      className="input-field"
                      value={vincVenc}
                      onChange={(e) => setVincVenc(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[0.7rem] leading-snug text-slate-500">
                  O <strong>vencimento da tarefa</strong> não é editado à mão: ao guardar a emissão, o sistema
                  recalcula o vencimento pelo tipo (salvo se definir explicitamente o vencimento do vínculo).
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 text-xs"
                  disabled={saving || !ca?.id}
                  onClick={() => void saveVinculo()}
                >
                  Guardar datas do vínculo
                </button>
              </div>

              <div className="grid gap-2 rounded-xl bg-violet-50/50 p-3 text-xs text-slate-700 sm:grid-cols-2">
                {!hasEmissao && task.inicio_obrigatorio_ate ? (
                  <span className="flex items-start gap-1 sm:col-span-2">
                    <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span>
                      <span className="font-medium text-slate-600">Início Obrigatório:</span>{" "}
                      {formatDate(task.inicio_obrigatorio_ate, { empty: "—" })}{" "}
                      <span className="text-slate-500">
                        (1.º ciclo — em <strong>Pendente</strong>, inicie até esta data)
                      </span>
                    </span>
                  </span>
                ) : null}
                <span className="flex items-start gap-1 sm:col-span-2">
                  <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>
                    <span className="font-medium text-slate-600">Vencimento (tarefa):</span>{" "}
                    {formatDate(task.due_date, {
                      empty: hasEmissao ? "—" : "(após registar emissão)",
                    })}
                  </span>
                </span>
                <span className="sm:col-span-2">
                  <span className="font-medium text-slate-600">Periodicidade (tipo):</span>{" "}
                  {a ? FREQUENCIA_LABELS[a.frequencia] ?? a.frequencia : "—"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Paperclip className="h-4 w-4" />
                {ca?.arquivo_url ? (
                  <span className="text-emerald-700">Anexo no vínculo registado</span>
                ) : (
                  <span>Sem anexo no vínculo</span>
                )}
                <button
                  type="button"
                  className="btn-secondary ml-auto inline-flex items-center gap-1 py-1.5 text-xs"
                  onClick={() =>
                    toast.message("Upload de anexo será disponibilizado em breve.", {
                      description: "Por agora registe o ficheiro na ficha da empresa, se necessário.",
                    })
                  }
                >
                  <Upload className="h-3.5 w-3.5" />
                  Adicionar anexo
                </button>
              </div>

              <div>
                <label className="form-label mb-1.5 block" htmlFor="task-notes">
                  Descrição / comentário
                </label>
                <textarea
                  id="task-notes"
                  className="textarea-field min-h-[6rem]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas internas sobre esta tarefa…"
                />
                <button
                  type="button"
                  className="btn-primary mt-2"
                  disabled={saving || notes === (task.notes ?? "")}
                  onClick={() => void saveNotes()}
                >
                  {saving ? "A guardar…" : "Guardar descrição"}
                </button>
              </div>

              <div className="card-portal overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <History className="h-4 w-4 text-slate-500" />
                  <h4 className="text-sm font-semibold text-slate-900">Histórico</h4>
                </div>
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                  {history.length === 0 ? (
                    <li className="px-4 py-6 text-center text-xs text-slate-400">Sem eventos.</li>
                  ) : (
                    history.map((h) => (
                      <li key={h.id} className="px-4 py-3 text-xs">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            {eventLabel(h.event_type)}
                          </span>
                          <time className="tabular-nums text-slate-400">
                            {formatDate(h.created_at, { empty: "—" })}
                          </time>
                        </div>
                        {h.summary ? (
                          <p className="mt-1 text-slate-600">{h.summary}</p>
                        ) : null}
                        {h.metadata && Object.keys(h.metadata).length > 0 ? (
                          <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[0.65rem] text-slate-600">
                            {JSON.stringify(h.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                {task.status === "pendente" ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving || !podeConcluirModal}
                      title={
                        !podeConcluirModal
                          ? "Registe a data de emissão no vínculo para preencher o vencimento da tarefa, ou use Dar baixa"
                          : undefined
                      }
                      onClick={() => void patchStatus({ status: "concluida" })}
                    >
                      Concluir tarefa
                    </button>
                    {!hasEmissao || !hasVencimentoTarefa ? (
                      <p className="text-xs text-amber-800">
                        Para concluir é necessário <strong>data de emissão</strong> no vínculo e{" "}
                        <strong>vencimento da tarefa</strong> (preenchido automaticamente quando regista a emissão na
                        empresa ou com «Dar baixa»).
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={saving}
                      onClick={() => {
                        if (
                          !confirm(
                            "Registar baixa no vínculo (emissão hoje, vencimento recalculado) e concluir a tarefa?"
                          )
                        ) {
                          return;
                        }
                        void patchStatus({ registrarBaixaNoVinculo: true, status: "concluida" });
                      }}
                    >
                      Dar baixa no vínculo e concluir
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                      disabled={saving}
                      onClick={() => {
                        if (!confirm("Cancelar esta tarefa?")) return;
                        void patchStatus({ status: "cancelada" });
                        onClose();
                      }}
                    >
                      Cancelar tarefa
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving}
                    onClick={() => void patchStatus({ status: "pendente" })}
                  >
                    Reabrir tarefa
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
