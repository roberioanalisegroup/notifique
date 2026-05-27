"use client";

import { apiJson } from "@/lib/api-client";
import { FREQUENCIA_LABELS, type AlvaraFrequencia } from "@/lib/alvara-frequency";
import { prazoInicioPrimeiroCiclo } from "@/lib/alvara-task-generation";
import { linhasHistoricoTarefa } from "@/lib/alvara-task-history-present";
import { cn, formatDate, formatIsoDateParaBR, getTaskStatusMeta, maskDataBRInput, parseDataBRParaIso } from "@/lib/utils";
import type {
  Alvara,
  AlvaraGroup,
  AlvaraTask,
  AlvaraTaskChecklistRow,
  AlvaraTaskHistory,
  Company,
  CompanyAlvara,
} from "@/types";
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
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TaskCardChecklist } from "@/components/acompanhamento/task-card-checklist";

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

type QuadroColumn = "pendente" | "andamento" | "concluido";

/** Coluna atual no Kanban + estado na API — «Em andamento» é só organização local até concluir. */
function textoEstadoNoModal(
  status: AlvaraTask["status"],
  quadroColumn: QuadroColumn | null | undefined
): string {
  if (status === "concluida") return "Concluída";
  if (status === "cancelada") return "Cancelada";
  if (status === "pendente" && quadroColumn === "andamento") return "Em andamento no quadro";
  if (status === "pendente") return "Pendente";
  return status;
}

export function TaskEditModal({
  taskId,
  open,
  onClose,
  onSaved,
  quadroColumn,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Coluna onde o cartão está no quadro (para refletir «Em andamento» local). */
  quadroColumn?: QuadroColumn | null;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [history, setHistory] = useState<AlvaraTaskHistory[]>([]);
  const [notes, setNotes] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emissaoDraft, setEmissaoDraft] = useState("");
  const [vencimentoDraft, setVencimentoDraft] = useState("");
  const [checklistRows, setChecklistRows] = useState<AlvaraTaskChecklistRow[]>([]);
  const emissaoDatePickerRef = useRef<HTMLInputElement>(null);
  const vencimentoDatePickerRef = useRef<HTMLInputElement>(null);
  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [overrideFreq, setOverrideFreq] = useState<string>("inherit");
  const [overrideDias, setOverrideDias] = useState<number | "">("");
  const [regerando, setRegerando] = useState(false);

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
      setProtocolo(d.task.protocolo ?? "");
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
      setProtocolo("");
      setEmissaoDraft("");
      setVencimentoDraft("");
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!task?.company_alvaras) {
      setEmissaoDraft("");
      setVencimentoDraft("");
      return;
    }
    if (task.status === "concluida") {
      setEmissaoDraft(formatIsoDateParaBR(task.completed_at ? task.completed_at.slice(0, 10) : (task.company_alvaras.data_emissao ?? null)));
      setVencimentoDraft(formatIsoDateParaBR(task.due_date ?? (task.company_alvaras.data_vencimento ?? null)));
    } else {
      setEmissaoDraft(formatIsoDateParaBR(task.company_alvaras.data_emissao ?? null));
      setVencimentoDraft(formatIsoDateParaBR(task.company_alvaras.data_vencimento ?? null));
    }
  }, [task]);

  useEffect(() => {
    if (task?.company_alvaras) {
      setOverrideFreq(task.company_alvaras.frequencia_override ?? "inherit");
      setOverrideDias(task.company_alvaras.dias_frequencia_personalizada ?? "");
    } else {
      setOverrideFreq("inherit");
      setOverrideDias("");
    }
  }, [task]);

  useEffect(() => {
    if (!open || !taskId) {
      setChecklistRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiJson<{ by_task: Record<string, AlvaraTaskChecklistRow[]> }>(
          "/api/alvara-tasks/checklist-batch",
          { method: "POST", body: JSON.stringify({ task_ids: [taskId] }) }
        );
        if (!cancelled) setChecklistRows(d.by_task?.[taskId] ?? []);
      } catch {
        if (!cancelled) setChecklistRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  async function patchChecklistModal(itemId: string, completed: boolean, comment?: string, attachmentUrl?: string) {
    if (!taskId) return;
    setChecklistRows((prev) => prev.map((r) => (r.item_id === itemId ? { ...r, completed, comment: comment ?? null, attachment_url: attachmentUrl ?? null, completed_at: completed ? new Date().toISOString() : null } : r)));
    try {
      await apiJson("/api/alvara-tasks/" + taskId + "/checklist", {
        method: "PATCH",
        body: JSON.stringify({ item_id: itemId, completed, comment: comment ?? null, attachment_url: attachmentUrl ?? null }),
      });
      // Reload history since checklist events now appear there
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar etapa");
      void load();
    }
  }

  async function saveVinculo() {
    const caId = task?.company_alvaras?.id;
    if (!caId || !taskId) return;
    const isoEm = parseDataBRParaIso(emissaoDraft);
    if (emissaoDraft.trim() !== "" && isoEm === null) {
      toast.error("Data de emissão inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
      return;
    }
    const isoVenc = parseDataBRParaIso(vencimentoDraft);
    if (vencimentoDraft.trim() !== "" && isoVenc === null) {
      toast.error("Data de vencimento inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/company-alvaras/" + caId, {
        method: "PATCH",
        body: JSON.stringify({
          data_emissao: isoEm,
          data_vencimento: isoVenc,
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

  async function savePeriodicidadeLocal() {
    const caId = task?.company_alvaras?.id;
    if (!caId || !taskId) return;

    if (overrideFreq === "personalizada" && (!overrideDias || overrideDias <= 0)) {
      toast.error("Para frequência personalizada, defina a quantidade de dias.");
      return;
    }

    setSaving(true);
    try {
      await apiJson("/api/company-alvaras/" + caId, {
        method: "PATCH",
        body: JSON.stringify({
          frequencia_override: overrideFreq === "inherit" ? null : overrideFreq,
          dias_frequencia_personalizada: overrideFreq === "personalizada" ? Number(overrideDias) : null,
        }),
      });
      toast.success("Periodicidade do cartão atualizada!");
      setIsEditingFreq(false);
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar periodicidade");
    } finally {
      setSaving(false);
    }
  }

  async function regerarDatas() {
    const caId = task?.company_alvaras?.id;
    if (!caId || !taskId) return;
    
    if (!confirm("Tem a certeza que deseja regerar as datas deste cartão com base nas regras de periodicidade atuais?")) {
      return;
    }

    setRegerando(true);
    try {
      const res = await apiJson<{ ok: boolean; summary: string }>("/api/company-alvaras/" + caId + "/regerar", {
        method: "POST"
      });
      toast.success(res.summary || "Datas regeradas com sucesso!");
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao regerar datas");
    } finally {
      setRegerando(false);
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

  async function saveProtocolo() {
    if (!taskId) return;
    setSaving(true);
    try {
      await apiJson("/api/alvara-tasks/" + taskId, {
        method: "PATCH",
        body: JSON.stringify({ protocolo: protocolo.trim() || null }),
      });
      toast.success("Protocolo guardado");
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

  const ca = task?.company_alvaras;
  const c = ca?.companies;
  const a = ca?.alvaras;
  const g = a?.alvara_groups;
  const hasEmissao = Boolean(ca?.data_emissao && String(ca.data_emissao).trim());
  const hasVencimentoTarefa = Boolean(task?.due_date && String(task.due_date).trim());
  const exigeAnexoTipo = a?.anexo_obrigatorio === true;
  const temAnexo = Boolean(ca?.arquivo_url && String(ca.arquivo_url).trim());
  const okAnexo = !exigeAnexoTipo || temAnexo;
  const podeConcluirModal = Boolean(task && hasEmissao && hasVencimentoTarefa && okAnexo && notes.trim() !== "");
  const primeiroCicloModal = Boolean(
    task?.inicio_obrigatorio_ate && String(task.inicio_obrigatorio_ate).trim() !== ""
  );
  const prazoInicioCalculado = task
    ? prazoInicioPrimeiroCiclo(task.created_at, a?.prazo_inicio_dias)
    : null;

  function motivoNaoConclusaoModal(): string {
    if (!task) return "";
    if (notes.trim() === "") {
      return "A descrição / comentário é obrigatória para concluir a tarefa.";
    }
    if (!hasEmissao) {
      return "Registe a data de emissão no vínculo para poder concluir.";
    }
    if (!hasVencimentoTarefa) {
      return "A data de vencimento no vínculo é obrigatória para concluir.";
    }
    if (exigeAnexoTipo && !temAnexo) {
      return "Este tipo exige documento anexado ao vínculo.";
    }
    return "";
  }

  const timeline = [...history].sort(
    (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
  );
  const venc = getTaskStatusMeta(task, new Date().toISOString().slice(0, 10));
  const empresaHref = c ? "/portal/empresas/" + c.id : null;

  return (
    <AccessibleModal
      open={open}
      onClose={onClose}
      labelledBy="task-edit-title"
      overlayClassName="z-[9999]"
      panelClassName="modal-panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden p-0"
    >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 id="task-edit-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Detalhe da tarefa
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Edite a descrição e consulte o histórico.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading || !task ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <span className="text-sm text-slate-500 dark:text-slate-400">A carregar…</span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="space-y-4 px-6 py-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    venc.className || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  {venc.text}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{a?.name ?? "Tarefa de alvará"}</h3>
                <p className="mt-1 flex items-center gap-1 text-emerald-800 dark:text-emerald-300">
                  <Building2 className="h-4 w-4 shrink-0" />
                  {empresaHref ? (
                    <Link href={empresaHref} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                      {companyLabel(c)}
                    </Link>
                  ) : (
                    companyLabel(c)
                  )}
                </p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  Responsável:{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {(c?.responsible?.display_name ?? "").trim() || "—"}
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                {ca?.numero ? `📄 ${ca.numero}` : `Grupo de Alvarás: ${g?.name ?? "Sem grupo"}`}
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-xs text-slate-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-slate-200">
                <span className="font-semibold text-violet-900 dark:text-violet-300">Data de criação da tarefa:</span>{" "}
                <span className="tabular-nums">{formatDate(task.created_at, { empty: "—" })}</span>
              </div>

              <TaskCardChecklist
                idPrefix={"modal-" + task.id}
                items={checklistRows}
                readOnly={task.status !== "pendente"}
                onToggle={(itemId, completed, comment, attachmentUrl) => void patchChecklistModal(itemId, completed, comment, attachmentUrl)}
              />

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-600 dark:bg-slate-900/60">
                <p className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Datas do vínculo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="form-label mb-1 block text-slate-700 dark:text-slate-300">Data de emissão</span>
                    <div className="relative max-w-[11rem]">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="dd/mm/aaaa"
                        className="input-field w-full pr-10"
                        value={emissaoDraft}
                        disabled={task.status !== "pendente"}
                        onChange={(e) => setEmissaoDraft(maskDataBRInput(e.target.value))}
                      />
                      <input
                        ref={emissaoDatePickerRef}
                        type="date"
                        lang="pt-BR"
                        aria-hidden="true"
                        tabIndex={-1}
                        className="sr-only"
                        value={parseDataBRParaIso(emissaoDraft) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEmissaoDraft(v ? formatIsoDateParaBR(v) : "");
                        }}
                      />
                      <button
                        type="button"
                        disabled={task.status !== "pendente"}
                        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                        aria-label="Abrir calendário"
                        title="Abrir calendário"
                        onClick={() => {
                          const el = emissaoDatePickerRef.current;
                          if (!el) return;
                          if (typeof el.showPicker === "function") {
                            void el.showPicker();
                          } else {
                            el.focus();
                            el.click();
                          }
                        }}
                      >
                        <CalendarDays className="h-4 w-4 shrink-0" />
                      </button>
                    </div>
                    <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Digite a data de emissão.
                    </p>
                  </label>
                  
                  <label className="block">
                    <span className="form-label mb-1 block text-slate-700 dark:text-slate-300">Data de vencimento</span>
                    <div className="relative max-w-[11rem]">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="dd/mm/aaaa"
                        className="input-field w-full pr-10"
                        value={vencimentoDraft}
                        disabled={task.status !== "pendente"}
                        onChange={(e) => setVencimentoDraft(maskDataBRInput(e.target.value))}
                      />
                      <input
                        ref={vencimentoDatePickerRef}
                        type="date"
                        lang="pt-BR"
                        aria-hidden="true"
                        tabIndex={-1}
                        className="sr-only"
                        value={parseDataBRParaIso(vencimentoDraft) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVencimentoDraft(v ? formatIsoDateParaBR(v) : "");
                        }}
                      />
                      <button
                        type="button"
                        disabled={task.status !== "pendente"}
                        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                        aria-label="Abrir calendário"
                        title="Abrir calendário"
                        onClick={() => {
                          const el = vencimentoDatePickerRef.current;
                          if (!el) return;
                          if (typeof el.showPicker === "function") {
                            void el.showPicker();
                          } else {
                            el.focus();
                            el.click();
                          }
                        }}
                      >
                        <CalendarDays className="h-4 w-4 shrink-0" />
                      </button>
                    </div>
                    <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Vencimento manual (obrigatório para frequência Personalizada).
                    </p>
                  </label>
                </div>
                <p className="mt-2 text-[0.7rem] leading-snug text-slate-500 dark:text-slate-400">
                  A <strong>data de emissão</strong> e a <strong>data de vencimento</strong> devem ser preenchidas manualmente conforme o documento real.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 text-xs"
                  disabled={saving || !ca?.id || task.status !== "pendente"}
                  onClick={() => void saveVinculo()}
                >
                  Guardar datas no vínculo
                </button>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5 text-xs text-slate-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-slate-300">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-violet-900 dark:text-violet-300">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                      Periodicidade do cartão:
                    </p>
                    <p className="mt-1 text-slate-800 dark:text-slate-200">
                      {ca?.frequencia_override ? (
                        <>
                          <span className="font-semibold text-violet-700 dark:text-violet-400">
                            {ca.frequencia_override === "personalizada"
                              ? `Personalizada (+${ca.dias_frequencia_personalizada} dias)`
                              : FREQUENCIA_LABELS[ca.frequencia_override as AlvaraFrequencia] ?? ca.frequencia_override}
                          </span>{" "}
                          <span className="text-[0.65rem] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded font-medium">
                            Sobrescrito local
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            {a?.frequencia === "personalizada"
                              ? `Personalizada (+${a.dias_frequencia_personalizada} dias)`
                              : a ? FREQUENCIA_LABELS[a.frequencia] ?? a.frequencia : "—"}
                          </span>{" "}
                          <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                            (herdado do tipo)
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="btn-secondary py-1 px-2.5 text-[0.7rem]"
                      disabled={saving || regerando}
                      onClick={() => setIsEditingFreq(!isEditingFreq)}
                    >
                      {isEditingFreq ? "Cancelar" : "Editar"}
                    </button>
                    {/*
                    {task.status === "pendente" && (
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center gap-1 bg-violet-100 hover:bg-violet-200 text-violet-800 dark:bg-violet-900 dark:hover:bg-violet-850 dark:text-violet-200 py-1 px-2.5 text-[0.7rem]"
                        disabled={saving || regerando}
                        onClick={() => void regerarDatas()}
                        title="Recalcula o vencimento com base na frequência atual e emissão do vínculo."
                      >
                        {regerando ? "A regerar…" : "Regerar datas"}
                      </button>
                    )}
                    */}
                  </div>
                </div>

                {isEditingFreq && (
                  <div className="mt-3.5 border-t border-violet-100/60 pt-3.5 space-y-3 dark:border-violet-900/40">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Alterar periodicidade (apenas para esta empresa e ciclos futuros)
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="form-label mb-1 block text-slate-700 dark:text-slate-300">Frequência</span>
                        <select
                          className="select-field w-full text-xs py-1"
                          value={overrideFreq}
                          onChange={(e) => setOverrideFreq(e.target.value)}
                        >
                          <option value="inherit">Herdar do tipo de alvará</option>
                          <option value="diaria">Diária</option>
                          <option value="semanal">Semanal</option>
                          <option value="decendial">Decendial</option>
                          <option value="mensal">Mensal</option>
                          <option value="bimestral">Bimestral</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option>
                          <option value="anual">Anual</option>
                          <option value="personalizada">Personalizada</option>
                        </select>
                      </label>

                      {overrideFreq === "personalizada" && (
                        <label className="block">
                          <span className="form-label mb-1 block text-slate-700 dark:text-slate-300">Frequência (dias)</span>
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            placeholder="Ex: 7 ou 700"
                            className="input-field w-full text-xs py-1"
                            value={overrideDias}
                            onChange={(e) => setOverrideDias(e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn-primary text-[0.7rem] py-1 px-3 mt-1"
                      disabled={saving}
                      onClick={() => void savePeriodicidadeLocal()}
                    >
                      {saving ? "A guardar…" : "Salvar periodicidade"}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>
                    {ca?.arquivo_url ? (
                      <span className="text-emerald-700 dark:text-emerald-400">Documento associado ao vínculo.</span>
                    ) : (
                      <span>Sem documento no vínculo.</span>
                    )}
                    {exigeAnexoTipo ? (
                      <span className="font-medium text-amber-900 dark:text-amber-300"> Este tipo exige anexo para concluir.</span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400"> Anexo opcional ao concluir.</span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-1 py-1.5 text-xs"
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
              </div>

              <div className="space-y-4">
                <div>
                  <label className="form-label mb-1.5 block" htmlFor="task-protocolo">
                    Número de protocolo
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="task-protocolo"
                      type="text"
                      className="input-field max-w-sm text-xs py-1.5"
                      value={protocolo}
                      disabled={task.status !== "pendente"}
                      onChange={(e) => setProtocolo(e.target.value)}
                      placeholder="Ex: 2026/12345-AB..."
                    />
                    <button
                      type="button"
                      className="btn-primary text-xs py-1.5 px-3 shrink-0"
                      disabled={saving || task.status !== "pendente" || protocolo === (task.protocolo ?? "")}
                      onClick={() => void saveProtocolo()}
                    >
                      {saving ? "A guardar…" : "Guardar protocolo"}
                    </button>
                  </div>
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
              </div>

              <div className="card-portal overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Histórico</h4>
                </div>
                <div className="max-h-72 overflow-y-auto px-4 py-4">
                  {timeline.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Sem registos ainda.</p>
                  ) : (
                    <div className="relative ms-2 border-l-2 border-violet-200 pl-6 dark:border-violet-800/80">
                      {timeline.map((h) => (
                        <div key={h.id} className="relative pb-8 last:pb-1">
                          <span
                            className="absolute -left-[calc(0.375rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-500 ring-4 ring-white dark:ring-slate-900"
                            aria-hidden
                          />
                          <time className="block text-[0.7rem] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {formatDate(h.created_at, { empty: "—", includeTime: true })}
                          </time>
                          <div className="mt-1.5 space-y-1 text-[0.8125rem] leading-snug text-slate-700 dark:text-slate-300">
                            {linhasHistoricoTarefa(h).map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                {task.status === "pendente" ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving || !podeConcluirModal}
                      title={!podeConcluirModal ? motivoNaoConclusaoModal() || undefined : undefined}
                      onClick={() => void patchStatus({ status: "concluida" })}
                    >
                      Concluir tarefa
                    </button>
                    {!podeConcluirModal ? (
                      <p className="text-xs text-amber-800 dark:text-amber-300">{motivoNaoConclusaoModal()}</p>
                    ) : null}
                    {/*
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
                    */}
                    <button
                      type="button"
                      className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
    </AccessibleModal>
  );
}
