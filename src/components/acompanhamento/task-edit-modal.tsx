"use client";

import { apiJson } from "@/lib/api-client";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { prazoInicioPrimeiroCiclo } from "@/lib/alvara-task-generation";
import { linhasHistoricoTarefa } from "@/lib/alvara-task-history-present";
import { cn, formatDate, formatIsoDateParaBR, maskDataBRInput, parseDataBRParaIso } from "@/lib/utils";
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
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emissaoDraft, setEmissaoDraft] = useState("");
  const emissaoDatePickerRef = useRef<HTMLInputElement>(null);

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
      setEmissaoDraft("");
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!task?.company_alvaras) {
      setEmissaoDraft("");
      return;
    }
    setEmissaoDraft(formatIsoDateParaBR(task.company_alvaras.data_emissao ?? null));
  }, [task]);

  async function saveVinculo() {
    const caId = task?.company_alvaras?.id;
    if (!caId || !taskId) return;
    const iso = parseDataBRParaIso(emissaoDraft);
    if (emissaoDraft.trim() !== "" && iso === null) {
      toast.error("Data de emissão inválida. Use o formato dia/mês/ano (dd/mm/aaaa).");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/company-alvaras/" + caId, {
        method: "PATCH",
        body: JSON.stringify({
          data_emissao: iso,
        }),
      });
      toast.success("Emissão do vínculo atualizada");
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
  const exigeAnexoTipo = a?.anexo_obrigatorio === true;
  const temAnexo = Boolean(ca?.arquivo_url && String(ca.arquivo_url).trim());
  const okAnexo = !exigeAnexoTipo || temAnexo;
  const podeConcluirModal = Boolean(task && hasEmissao && hasVencimentoTarefa && okAnexo);
  const primeiroCicloModal = Boolean(
    task?.inicio_obrigatorio_ate && String(task.inicio_obrigatorio_ate).trim() !== ""
  );
  const prazoInicioCalculado = task
    ? prazoInicioPrimeiroCiclo(task.created_at, a?.prazo_inicio_dias)
    : null;

  function motivoNaoConclusaoModal(): string {
    if (!task) return "";
    if (!hasEmissao) {
      return "Registe a data de emissão no vínculo para preencher o vencimento da tarefa, ou use «Dar baixa no vínculo».";
    }
    if (!hasVencimentoTarefa) {
      return "O vencimento da tarefa é definido ao registar a emissão.";
    }
    if (exigeAnexoTipo && !temAnexo) {
      return "Este tipo exige documento anexado ao vínculo.";
    }
    return "";
  }

  const timeline = [...history].sort(
    (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
  );
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
                <span className="max-w-[min(100%,14rem)] text-right text-xs font-medium leading-snug text-slate-700">
                  Estado: {textoEstadoNoModal(task.status, quadroColumn)}
                  {task.status === "pendente" && quadroColumn === "andamento" ? (
                    <span className="mt-1 block text-[0.65rem] font-normal text-slate-500">
                      Na base de dados continua «pendente» até concluir a tarefa.
                    </span>
                  ) : null}
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

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-700">
                {ca?.numero ? `📄 ${ca.numero}` : `Grupo: ${g?.name ?? "Sem grupo"}`}
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-xs text-slate-800">
                <span className="font-semibold text-violet-900">Data de criação da tarefa:</span>{" "}
                <span className="tabular-nums">{formatDate(task.created_at, { empty: "—" })}</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <p className="mb-2 font-semibold text-slate-800">Datas do vínculo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="form-label mb-1 block text-slate-700">Data de emissão</span>
                    <div className="relative max-w-[11rem]">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="dd/mm/aaaa"
                        className="input-field w-full pr-10"
                        value={emissaoDraft}
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
                        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
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
                    <p className="mt-1 text-[0.65rem] text-slate-500">
                      Digite a data — a máscara formata em dd/mm/aaaa — ou use o ícone à direita.
                    </p>
                  </label>
                  <div className="block">
                    <span className="form-label mb-1 block text-slate-700">Prazo de início (1.º ciclo)</span>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 tabular-nums">
                      {primeiroCicloModal || !hasEmissao ? (
                        formatDate(prazoInicioCalculado ?? task.inicio_obrigatorio_ate, { empty: "—" })
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[0.7rem] leading-snug text-slate-500">
                      No 1.º ciclo fica registado com base na data de criação da tarefa mais{" "}
                      <strong>{a?.prazo_inicio_dias ?? 30}</strong> dias corridos (este valor mantém-se visível mesmo após
                      registar emissão). Nos ciclos seguintes só se usa o <strong>vencimento da tarefa</strong> abaixo.
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[0.7rem] leading-snug text-slate-500">
                  O <strong>vencimento da tarefa</strong> (renovação) preenche-se automaticamente ao guardar a emissão,
                  pela periodicidade do tipo.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 text-xs"
                  disabled={saving || !ca?.id}
                  onClick={() => void saveVinculo()}
                >
                  Guardar emissão no vínculo
                </button>
              </div>

              <div className="grid gap-2 rounded-xl bg-violet-50/50 p-3 text-xs text-slate-700 sm:grid-cols-2">
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

              <div className="flex flex-wrap items-start gap-2 text-xs text-slate-600">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>
                    {ca?.arquivo_url ? (
                      <span className="text-emerald-700">Documento associado ao vínculo.</span>
                    ) : (
                      <span>Sem documento no vínculo.</span>
                    )}
                    {exigeAnexoTipo ? (
                      <span className="font-medium text-amber-900"> Este tipo exige anexo para concluir.</span>
                    ) : (
                      <span className="text-slate-500"> Anexo opcional ao concluir.</span>
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
                <div className="max-h-72 overflow-y-auto px-4 py-4">
                  {timeline.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">Sem registos ainda.</p>
                  ) : (
                    <div className="relative ms-2 border-l-2 border-violet-200 pl-6">
                      {timeline.map((h) => (
                        <div key={h.id} className="relative pb-8 last:pb-1">
                          <span
                            className="absolute -left-[calc(0.375rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-500 ring-4 ring-white"
                            aria-hidden
                          />
                          <time className="block text-[0.7rem] font-medium tabular-nums text-slate-500">
                            {formatDate(h.created_at, { empty: "—" })}
                          </time>
                          <div className="mt-1.5 space-y-1 text-[0.8125rem] leading-snug text-slate-700">
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

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
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
                      <p className="text-xs text-amber-800">{motivoNaoConclusaoModal()}</p>
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
