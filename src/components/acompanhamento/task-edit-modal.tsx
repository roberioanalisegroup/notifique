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
  FileCheck2,
  History,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TaskCardChecklist } from "@/components/acompanhamento/task-card-checklist";
import { isChecklistFullyCompleted } from "@/lib/alvara-checklist-completion";

type TaskDetail = AlvaraTask & {
  company_alvaras:
    | (CompanyAlvara & {
        companies: Company | null;
        alvaras: (Alvara & { alvara_groups: AlvaraGroup | null }) | null;
        company_alvara_documents?: any[] | null;
      })
    | null;
};

function companyLabel(c: Company | null | undefined): string {
  if (!c) return "—";
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

type QuadroColumn = "pendente" | "andamento" | "concluido" | "impedimento" | "cancelada";

/** Coluna atual no Kanban + estado na API — «Em andamento» é só organização local até concluir. */
function textoEstadoNoModal(
  status: AlvaraTask["status"],
  quadroColumn: QuadroColumn | null | undefined
): string {
  if (status === "concluida" || quadroColumn === "concluido") return "Concluída";
  if (status === "cancelada" || quadroColumn === "cancelada") return "Cancelada";
  if (quadroColumn === "impedimento") return "Impedimento";
  if (quadroColumn === "andamento") return "Em andamento no quadro";
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
  const [isIndefiniteDraft, setIsIndefiniteDraft] = useState(false);
  const [checklistRows, setChecklistRows] = useState<AlvaraTaskChecklistRow[]>([]);
  const emissaoDatePickerRef = useRef<HTMLInputElement>(null);
  const vencimentoDatePickerRef = useRef<HTMLInputElement>(null);
  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [overrideFreq, setOverrideFreq] = useState<string>("inherit");
  const [overrideDias, setOverrideDias] = useState<number | "">("");
  const [regerando, setRegerando] = useState(false);

  // ── Estado de upload de anexo (Cloudflare R2) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preparedAttachment, setPreparedAttachment] = useState<{
    storage_key: string;
    public_url: string;
    file_name: string;
    file_size: number;
    file_mime_type: string;
  } | null>(null);

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
      setIsIndefiniteDraft(false);
      setPreparedAttachment(null);
      setUploading(false);
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!task?.company_alvaras) {
      setEmissaoDraft("");
      setVencimentoDraft("");
      setIsIndefiniteDraft(false);
      return;
    }
    const docs = task.company_alvaras.company_alvara_documents ?? [];
    const activeDoc = task.status === "concluida"
      ? (Array.isArray(docs) ? docs.find((d: any) => d.id === task.result_document_id || d.source_task_id === task.id) : null)
      : (Array.isArray(docs) ? docs.find((d: any) => d.is_current) : null);
    const isIndef = activeDoc ? Boolean(activeDoc.is_indefinite) : false;
    setIsIndefiniteDraft(isIndef);

    if (task.status === "concluida") {
      setEmissaoDraft(formatIsoDateParaBR(activeDoc?.issue_date ?? task.completed_at?.slice(0, 10) ?? null));
      setVencimentoDraft(isIndef ? "" : formatIsoDateParaBR(activeDoc?.expiration_date ?? task.due_date ?? null));
    } else {
      setEmissaoDraft(formatIsoDateParaBR(task.company_alvaras.data_emissao ?? null));
      setVencimentoDraft(isIndef ? "" : formatIsoDateParaBR(task.company_alvaras.data_vencimento ?? null));
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
    const isoVenc = isIndefiniteDraft ? null : parseDataBRParaIso(vencimentoDraft);
    if (!isIndefiniteDraft && vencimentoDraft.trim() !== "" && isoVenc === null) {
      toast.error("Data de vencimento inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
      return;
    }
    if (!isIndefiniteDraft && isoVenc && isoEm && isoVenc < isoEm) {
      toast.error("A data de vencimento não pode ser anterior à data de emissão.");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/company-alvaras/" + caId, {
        method: "PATCH",
        body: JSON.stringify({
          data_emissao: isoEm,
          data_vencimento: isoVenc,
          is_indefinite: isIndefiniteDraft,
        }),
      });
      toast.success("Dados do documento salvos com sucesso!");
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
  const isTarefaAberta = task ? ["pendente", "em_andamento", "com_impedimento"].includes(task.status) : false;
  const c = ca?.companies;
  const a = ca?.alvaras;
  const g = a?.alvara_groups;
  const hasEmissao = Boolean(emissaoDraft && emissaoDraft.trim());
  const hasVencimento = Boolean(vencimentoDraft && vencimentoDraft.trim());
  const exigeAnexoTipo = a?.anexo_obrigatorio === true;
  // Anexo existente no documento vigente OU anexo preparado no estado local
  const docs = ca?.company_alvara_documents ?? [];
  const activeDoc = task && task.status === "concluida"
    ? (Array.isArray(docs) ? docs.find((d: any) => d.id === task.result_document_id || d.source_task_id === task.id) : null)
    : (Array.isArray(docs) ? docs.find((d: any) => d.is_current) : null);
  const temAnexoExistente = Boolean(activeDoc?.file_path && String(activeDoc.file_path).trim());
  const temAnexo = temAnexoExistente || Boolean(preparedAttachment);
  const okAnexo = !exigeAnexoTipo || temAnexo;
  const exigeChecklist = a?.checklist_obrigatorio === true;
  const okChecklist = !exigeChecklist || isChecklistFullyCompleted(checklistRows);
  const podeConcluirModal = Boolean(
    task && hasEmissao && (isIndefiniteDraft || hasVencimento) && okAnexo && okChecklist
  );
  const primeiroCicloModal = Boolean(
    task?.inicio_obrigatorio_ate && String(task.inicio_obrigatorio_ate).trim() !== ""
  );
  const prazoInicioCalculado = task
    ? prazoInicioPrimeiroCiclo(task.created_at, a?.prazo_inicio_dias)
    : null;

  function motivoNaoConclusaoModal(): string {
    if (!task) return "";
    const list: string[] = [];
    if (!hasEmissao) {
      list.push("Data de Emissão");
    }
    if (!isIndefiniteDraft && !hasVencimento) {
      list.push("Data de Vencimento (ou marque Validade Legal Indeterminada)");
    }
    if (exigeAnexoTipo && !temAnexo) {
      list.push("Anexo do documento (obrigatório para este tipo de alvará)");
    }
    if (exigeChecklist && !okChecklist) {
      list.push("Todas as etapas da checklist");
    }
    if (list.length === 0) return "";
    return "Falta preencher os seguintes requisitos obrigatórios para concluir: " + list.join(", ") + ".";
  }

  const timeline = [...history].sort(
    (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
  );
  const venc = getTaskStatusMeta(task, new Date().toISOString().slice(0, 10), quadroColumn || undefined);
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
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{a?.name ?? "Tarefa de alvará"}</h3>
                  {isTarefaAberta && (
                    <span title={!podeConcluirModal ? motivoNaoConclusaoModal() : "Clique para concluir este ciclo"}>
                      <button
                        type="button"
                        className={cn(
                          "rounded-lg px-4 py-1.5 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5",
                          podeConcluirModal
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            : "bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 cursor-not-allowed"
                        )}
                        disabled={saving || !podeConcluirModal}
                        onClick={async () => {
                          const isoEm = parseDataBRParaIso(emissaoDraft);
                          const isoVenc = isIndefiniteDraft ? null : parseDataBRParaIso(vencimentoDraft);

                          // Validações
                          if (emissaoDraft.trim() !== "" && isoEm === null) {
                            toast.error("Data de emissão inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
                            return;
                          }
                          if (!isIndefiniteDraft && vencimentoDraft.trim() !== "" && isoVenc === null) {
                            toast.error("Data de vencimento inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
                            return;
                          }
                          if (!isIndefiniteDraft && isoVenc && isoEm && isoVenc < isoEm) {
                            toast.error("A data de vencimento não pode ser anterior à data de emissão.");
                            return;
                          }
                          if (exigeAnexoTipo && !temAnexo) {
                            toast.error("Este tipo de alvará exige documento anexado para conclusão.");
                            return;
                          }

                          // Bloqueio de clique duplo
                          setSaving(true);
                          try {
                            const finalNotes = notes.trim() !== "" ? notes.trim() : "Documento cadastrado e ciclo operacional concluído pelo portal.";

                            // Dados do anexo: priorizar preparedAttachment (upload novo), fallback para doc existente
                            const attachmentData = preparedAttachment
                              ? {
                                  file_path: preparedAttachment.storage_key,
                                  file_name: preparedAttachment.file_name,
                                  file_size: preparedAttachment.file_size,
                                  file_mime_type: preparedAttachment.file_mime_type,
                                }
                              : {
                                  file_path: activeDoc?.file_path ?? null,
                                  file_name: activeDoc?.file_name ?? null,
                                  file_size: activeDoc?.file_size ?? null,
                                  file_mime_type: activeDoc?.file_mime_type ?? null,
                                };

                            await apiJson("/api/alvara-tasks/" + taskId, {
                              method: "PATCH",
                              body: JSON.stringify({
                                status: "concluida",
                                notes: finalNotes,
                                protocolo: protocolo.trim() || null,
                                issue_date: isoEm,
                                expiration_date: isoVenc,
                                is_indefinite: isIndefiniteDraft,
                                ...attachmentData,
                              }),
                            });

                            toast.success("Documento salvo e ciclo concluído com sucesso.");

                            if (isIndefiniteDraft) {
                              toast.info("Documento salvo como validade indeterminada. Nenhuma renovação futura foi criada.");
                            } else if (ca?.frequencia_override === "personalizada" || a?.frequencia === "personalizada") {
                              toast.info("Documento salvo. Como a frequência é personalizada, a próxima renovação deverá ser planejada manualmente.");
                            } else {
                              toast.info("A próxima renovação foi planejada automaticamente.");
                            }

                            onClose();
                            onSaved();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Erro ao concluir ciclo");
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            A concluir…
                          </>
                        ) : (
                          "Concluir"
                        )}
                      </button>
                    </span>
                  )}
                </div>
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
                readOnly={!isTarefaAberta}
                onToggle={(itemId, completed, comment, attachmentUrl) => void patchChecklistModal(itemId, completed, comment, attachmentUrl)}
              />

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-600 dark:bg-slate-900/60">
                <p className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Dados do documento</p>
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
                        disabled={!isTarefaAberta}
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
                        disabled={!isTarefaAberta}
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
                        disabled={!isTarefaAberta || isIndefiniteDraft}
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
                        disabled={!isTarefaAberta || isIndefiniteDraft}
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

                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                      checked={isIndefiniteDraft}
                      disabled={!isTarefaAberta}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsIndefiniteDraft(checked);
                        if (checked) {
                          setVencimentoDraft("");
                        }
                      }}
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Validade Legal Indeterminada (AVCB/Dispensa/etc)
                    </span>
                  </label>
                </div>

                <p className="mt-2 text-[0.7rem] leading-snug text-slate-500 dark:text-slate-400">
                  A <strong>data de emissão</strong> e a <strong>data de vencimento</strong> devem ser preenchidas manualmente conforme o documento real.
                </p>

                <button
                  type="button"
                  className="btn-primary mt-4 w-full justify-center text-sm font-semibold py-2 flex items-center gap-2"
                  disabled={saving || !isTarefaAberta || !hasEmissao || (!isIndefiniteDraft && !hasVencimento)}
                  onClick={() => void saveVinculo()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A salvar dados…
                    </>
                  ) : (
                    "Salvar dados do documento"
                  )}
                </button>
                <p className="mt-2 text-center text-[0.7rem] text-slate-500 dark:text-slate-400 italic">
                  Esta ação salva as datas, mas não conclui a tarefa. Para finalizar o ciclo, clique em Concluir no topo.
                </p>
              </div>



              <div className="flex flex-wrap items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Input invisível de ficheiro */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !taskId) return;
                      // Reset para permitir re-seleção do mesmo ficheiro
                      e.target.value = "";

                      // Validação rápida no frontend (backend valida novamente)
                      const allowedMimes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
                      if (!allowedMimes.includes(file.type)) {
                        toast.error(`Tipo de ficheiro não permitido: ${file.type}. Use PDF ou imagens (PNG, JPEG, WebP).`);
                        return;
                      }
                      const maxBytes = 10 * 1024 * 1024;
                      if (file.size > maxBytes) {
                        toast.error("Ficheiro excede o limite de 10 MB.");
                        return;
                      }

                      setUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch(`/api/alvara-tasks/${taskId}/attachment`, {
                          method: "POST",
                          body: fd,
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          throw new Error(json.error || "Erro no upload.");
                        }
                        setPreparedAttachment({
                          storage_key: json.storage_key,
                          public_url: json.public_url,
                          file_name: json.file_name,
                          file_size: json.file_size,
                          file_mime_type: json.file_mime_type,
                        });
                        toast.success("Anexo enviado! Pronto para conclusão.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Falha no upload do anexo.");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />

                  <p className="flex flex-col gap-1">
                    {preparedAttachment ? (
                      <span className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-400">
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Anexo pronto para conclusão: {preparedAttachment.file_name} ({(preparedAttachment.file_size / 1024).toFixed(0)} KB)
                      </span>
                    ) : temAnexoExistente && activeDoc ? (
                      <a
                        href={`/api/documents/${activeDoc.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                        title="Clique para visualizar ou baixar o documento"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        <span>Visualizar anexo: {activeDoc.file_name || "Documento associado"}</span>
                        {activeDoc.file_size && (
                          <span className="text-[10px] text-slate-500 font-normal">
                            ({(Number(activeDoc.file_size) / 1024).toFixed(0)} KB)
                          </span>
                        )}
                      </a>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">Sem documento associado ao vínculo.</span>
                    )}
                    {exigeAnexoTipo && !temAnexo && (
                      <span className="font-medium text-amber-600 dark:text-amber-400 text-[10px] mt-0.5">
                        ⚠️ Este tipo exige anexo para concluir.
                      </span>
                    )}
                  </p>

                  {/* Botões de ação */}
                  {isTarefaAberta && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center gap-1 py-1.5 text-xs"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            A enviar…
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            {preparedAttachment ? "Substituir anexo" : "Adicionar anexo"}
                          </>
                        )}
                      </button>
                      {preparedAttachment && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          onClick={() => setPreparedAttachment(null)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      )}
                    </div>
                  )}
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
                      disabled={!isTarefaAberta}
                      onChange={(e) => setProtocolo(e.target.value)}
                      placeholder="Ex: 2026/12345-AB..."
                    />
                    <button
                      type="button"
                      className="btn-primary text-xs py-1.5 px-3 shrink-0"
                      disabled={saving || !isTarefaAberta || protocolo === (task.protocolo ?? "")}
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
