"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  X,
  FileText,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileDown,
  Settings,
  ArrowRight,
  AlertTriangle,
  History,
  User,
  Loader2,
  Lock,
  Edit3,
  PauseCircle,
  PlayCircle,
  Archive,
  ArchiveRestore,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AlvaraDossierDrawerProps {
  open: boolean;
  onClose: () => void;
  companyAlvaraId: string | null;
}

interface DossierData {
  company_alvara: {
    id: string;
    company_id: string;
    alvara_id: string;
    numero: string | null;
    observacoes: string | null;
    is_required: boolean;
    is_exempt: boolean;
    exemption_reason: string | null;
    monitoring_status: string;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  };
  alvara: {
    id: string;
    name: string;
    description: string | null;
    orgao_emissor: string | null;
    frequencia: string;
    weekend_adjust: string;
    prazo_inicio_dias: number;
    anexo_obrigatorio: boolean;
  };
  group: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
  current_document: {
    id: string;
    issue_date: string | null;
    expiration_date: string | null;
    is_indefinite: boolean;
    file_path: string | null;
    file_name: string | null;
    file_size: number | null;
    file_mime_type: string | null;
  } | null;
  documents: Array<{
    id: string;
    issue_date: string | null;
    expiration_date: string | null;
    is_indefinite: boolean;
    file_path: string | null;
    file_name: string | null;
    is_current: boolean;
    archived_at?: string | null;
  }>;
  tasks: Array<{
    id: string;
    task_type: string;
    status: string;
    due_date: string | null;
    start_after: string | null;
    created_at: string;
  }>;
  timeline: Array<{
    id: string;
    source: "document" | "task" | "error";
    event_type: string;
    title: string;
    description: string;
    created_at: string;
    created_by: { id: string; display_name: string } | null;
    severity: "info" | "warning" | "error";
    metadata: any;
  }>;
  document_status: "sem_documento" | "indeterminado" | "vigente" | "vencido";
  task_status: string;
  permissions: {
    canEditObservations: boolean;
    canViewTechnicalLogs: boolean;
    canSuspendMonitoring: boolean;
    canArchiveLink: boolean;
    canArchiveDocuments: boolean;
    canForceCompleteTask: boolean;
  };
}

export function AlvaraDossierDrawer({
  open,
  onClose,
  companyAlvaraId,
}: AlvaraDossierDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"resumo" | "documentos" | "tarefas" | "auditoria" | "config">("resumo");

  // Filter States
  const [showArchivedDocs, setShowArchivedDocs] = useState(false);
  const [onlyCurrentDoc, setOnlyCurrentDoc] = useState(false);

  const [showFutureTasks, setShowFutureTasks] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [showCancelledTasks, setShowCancelledTasks] = useState(false);

  const [timelineFilter, setTimelineFilter] = useState<"todos" | "document" | "task" | "error">("todos");

  // Edit observations states
  const [observacoes, setObservacoes] = useState("");
  const [savingObs, setSavingObs] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch dossier data
  const fetchDossier = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company-alvaras/${id}/dossier`);
      if (!res.ok) {
        throw new Error(await res.text() || "Erro ao carregar o dossiê.");
      }
      const json: DossierData = await res.json();
      setData(json);
      setObservacoes(json.company_alvara.observacoes || "");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro inesperado.");
      toast.error("Não foi possível carregar o dossiê.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && companyAlvaraId) {
      fetchDossier(companyAlvaraId);
      setActiveTab("resumo");
    } else {
      setData(null);
    }
  }, [open, companyAlvaraId]);

  // Handle Save Observations
  const handleSaveObservations = async () => {
    if (!companyAlvaraId) return;
    setSavingObs(true);
    try {
      const res = await fetch(`/api/company-alvaras/${companyAlvaraId}/observacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacoes: observacoes.trim() || null }),
      });
      if (!res.ok) {
        throw new Error(await res.text() || "Erro ao salvar observações.");
      }
      toast.success("Observações atualizadas com sucesso!");
      // Refresh only the data in state
      if (data) {
        setData({
          ...data,
          company_alvara: {
            ...data.company_alvara,
            observacoes: observacoes.trim() || null,
          },
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Não foi possível salvar.");
    } finally {
      setSavingObs(false);
    }
  };

  // ─── Fase 2: Administrative Action States ───────────────────────────────────
  type ConfirmDialog = {
    title: string;
    description: string;
    confirmLabel: string;
    confirmClass: string;
    requireReason?: boolean;
    onConfirm: (reason?: string) => Promise<void>;
  };
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const openConfirm = (dialog: ConfirmDialog) => {
    setConfirmReason("");
    setConfirmDialog(dialog);
  };
  const closeConfirm = () => {
    setConfirmDialog(null);
    setConfirmReason("");
  };

  const runConfirmedAction = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);
    try {
      await confirmDialog.onConfirm(confirmReason.trim() || undefined);
      closeConfirm();
    } catch {
      // toast already shown in handlers
    } finally {
      setActionLoading(false);
    }
  };

  // Suspend / Reactivate monitoring
  const handleSuspendMonitoring = (action: "suspend" | "reactivate") => {
    const isSuspend = action === "suspend";
    openConfirm({
      title: isSuspend ? "Suspender Monitoramento" : "Reativar Monitoramento",
      description: isSuspend
        ? "O monitoramento automático será suspenso. O sistema não irá gerar novos alertas ou tarefas para este alvará até ser reativado."
        : "O monitoramento será reativado. O sistema voltará a gerar alertas e tarefas normalmente.",
      confirmLabel: isSuspend ? "Confirmar Suspensão" : "Reativar",
      confirmClass: isSuspend
        ? "bg-orange-600 hover:bg-orange-700 text-white"
        : "bg-emerald-600 hover:bg-emerald-700 text-white",
      requireReason: isSuspend,
      onConfirm: async (reason) => {
        if (!companyAlvaraId) return;
        const res = await fetch(`/api/company-alvaras/${companyAlvaraId}/suspend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: reason || undefined }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erro inesperado." }));
          toast.error(err.error || "Operação falhou.");
          throw new Error(err.error);
        }
        const newStatus = isSuspend ? "suspenso" : "ativo";
        toast.success(isSuspend ? "Monitoramento suspenso." : "Monitoramento reativado.");
        if (data) {
          setData({
            ...data,
            company_alvara: { ...data.company_alvara, monitoring_status: newStatus },
          });
        }
      },
    });
  };

  // Archive / Restore link
  const handleArchiveLink = (action: "archive" | "restore") => {
    const isArchive = action === "archive";
    openConfirm({
      title: isArchive ? "Arquivar Vínculo" : "Restaurar Vínculo",
      description: isArchive
        ? "O vínculo será arquivado e ficará oculto na listagem padrão. O histórico de documentos e tarefas será preservado."
        : "O vínculo será restaurado e voltará a aparecer na listagem ativa da empresa.",
      confirmLabel: isArchive ? "Arquivar Vínculo" : "Restaurar Vínculo",
      confirmClass: isArchive
        ? "bg-amber-600 hover:bg-amber-700 text-white"
        : "bg-emerald-600 hover:bg-emerald-700 text-white",
      requireReason: isArchive,
      onConfirm: async (reason) => {
        if (!companyAlvaraId) return;
        const res = await fetch(`/api/company-alvaras/${companyAlvaraId}/archive-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: reason || undefined }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erro inesperado." }));
          toast.error(err.error || "Operação falhou.");
          throw new Error(err.error);
        }
        const json = await res.json();
        toast.success(isArchive ? "Vínculo arquivado com sucesso." : "Vínculo restaurado com sucesso.");
        if (data) {
          setData({
            ...data,
            company_alvara: { ...data.company_alvara, archived_at: json.archived_at },
          });
        }
      },
    });
  };

  // Archive / Restore document
  const handleArchiveDocument = (docId: string, issueDate: string | null, action: "archive" | "restore") => {
    const isArchive = action === "archive";
    openConfirm({
      title: isArchive ? "Arquivar Documento" : "Restaurar Documento",
      description: isArchive
        ? `Arquivar o documento de emissão ${issueDate || "—"}. Ele não será exibido por padrão, mas pode ser restaurado a qualquer momento.`
        : `Restaurar o documento de emissão ${issueDate || "—"}.`,
      confirmLabel: isArchive ? "Arquivar Documento" : "Restaurar",
      confirmClass: isArchive
        ? "bg-slate-700 hover:bg-slate-800 text-white"
        : "bg-emerald-600 hover:bg-emerald-700 text-white",
      onConfirm: async (reason) => {
        const res = await fetch(`/api/company-alvara-documents/${docId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: reason || undefined }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erro inesperado." }));
          toast.error(err.error || "Operação falhou.");
          throw new Error(err.error);
        }
        const json = await res.json();
        toast.success(isArchive ? "Documento arquivado." : "Documento restaurado.");
        if (data) {
          setData({
            ...data,
            documents: data.documents.map((d) =>
              d.id === docId ? { ...d, archived_at: json.archived_at } : d
            ),
          });
        }
      },
    });
  };

  // Force complete task
  const handleForceCompleteTask = (taskId: string) => {
    openConfirm({
      title: "Encerramento Administrativo de Tarefa",
      description:
        "Esta ação encerrará a tarefa de forma administrativa. Use apenas em casos de bloqueio operacional confirmado. O motivo será registrado permanentemente no histórico de auditoria.",
      confirmLabel: "Encerrar Administrativamente",
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
      requireReason: true,
      onConfirm: async (reason) => {
        if (!reason || reason.trim().length < 10) {
          toast.error("A justificativa deve ter no mínimo 10 caracteres.");
          throw new Error("Justificativa obrigatória.");
        }
        const res = await fetch(`/api/alvara-tasks/${taskId}/force-complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erro inesperado." }));
          toast.error(err.error || "Operação falhou.");
          throw new Error(err.error);
        }
        toast.success("Tarefa encerrada administrativamente.");
        if (data) {
          setData({
            ...data,
            tasks: data.tasks.map((t) =>
              t.id === taskId ? { ...t, status: "cancelada" } : t
            ),
          });
        }
      },
    });
  };

  // Prevent scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  // Helper date formatter
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    try {
      const [y, m, d] = dateStr.slice(0, 10).split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  // Helper date time formatter
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  };

  // Badges logic
  const getDocStatusBadge = (status: DossierData["document_status"]) => {
    switch (status) {
      case "vigente":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Vigente
          </span>
        );
      case "vencido":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="h-3 w-3" /> Vencido
          </span>
        );
      case "indeterminado":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <CheckCircle2 className="h-3 w-3" /> Indeterminado
          </span>
        );
      case "sem_documento":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-3 w-3" /> Sem Documento
          </span>
        );
    }
  };

  const getTaskStatusBadge = (status: string) => {
    if (status.includes("vencida") || status.includes("Vencido")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200">
          Operação: Atrasada
        </span>
      );
    }
    if (status === "sem_tarefa_aberta") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200">
          Sem Tarefa Operacional
        </span>
      );
    }
    if (status === "concluida") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          Operação: Finalizada
        </span>
      );
    }
    if (status === "cancelada") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Operação: Cancelada
        </span>
      );
    }
    if (status === "pendente") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200">
          Operação: Pendente
        </span>
      );
    }
    if (status === "com_impedimento") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200">
          Operação: Com Impedimento
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200">
        Operação: Em andamento
      </span>
    );
  };

  // Derive active task from tasks list
  const activeTask = (data?.tasks || []).find(
    (t) => t.status === "pendente" || t.status === "em_andamento" || t.status === "com_impedimento"
  ) || null;

  // Documents filters application
  const filteredDocuments = (data?.documents || []).filter((doc) => {
    if (onlyCurrentDoc && !doc.is_current) return false;
    if (!showArchivedDocs && doc.archived_at) return false;
    return true;
  });

  // Tasks filters application
  const filteredTasks = (data?.tasks || []).filter((task) => {
    const isFuture = task.status === "pendente" && task.start_after && task.start_after > hoje;
    if (isFuture && !showFutureTasks) return false;
    if (task.status === "concluida" && !showCompletedTasks) return false;
    if (task.status === "cancelada" && !showCancelledTasks) return false;
    return true;
  });

  // Timeline filters application
  const filteredTimeline = (data?.timeline || []).filter((item) => {
    if (timelineFilter !== "todos" && item.source !== timelineFilter) return false;
    return true;
  });

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
      {/* Backdrop area click to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />

      {/* Main Slide-Over Panel */}
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {data?.group ? (
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: data.group.color || "#0284c7" }}
              >
                <FileText className="h-5 w-5" />
              </span>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <FileText className="h-5 w-5" />
              </span>
            )}
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {data?.alvara.name || "Dossiê do Alvará"}
              </h2>
              {data?.company_alvara.numero ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nº {data.company_alvara.numero} • {data?.alvara.orgao_emissor || "Sem órgão emissor"}
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data?.alvara.orgao_emissor || "Sem órgão emissor"}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Carregando dossiê documental...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="h-12 w-12 text-rose-500 mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Ops! Falha ao carregar</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">{error}</p>
            <button
              onClick={() => companyAlvaraId && fetchDossier(companyAlvaraId)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Content (if successfully loaded) */}
        {!loading && !error && data && (
          <>
            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-200 px-6 dark:border-slate-800 overflow-x-auto">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "documentos", label: `Documentos (${data.documents.length})` },
                { id: "tarefas", label: `Tarefas (${data.tasks.length})` },
                { id: "auditoria", label: "Linha do Tempo" },
                { id: "config", label: "Anotações / Configs" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap -mb-px transition-colors",
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scrollable Abas Panels Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/40">
              {/* ABA 1: RESUMO */}
              {activeTab === "resumo" && (
                <div className="space-y-6">
                  {/* Status Badges Header Card */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Regularidade do Vínculo
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {getDocStatusBadge(data.document_status)}
                      {getTaskStatusBadge(data.task_status)}
                    </div>
                  </div>

                  {/* Documento Vigente Info Card */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Documento Vigente</h4>
                        {data.current_document ? (
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              <span>Emissão: <strong>{formatDate(data.current_document.issue_date)}</strong></span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              <span>
                                Vencimento:{" "}
                                <strong>
                                  {data.current_document.is_indefinite
                                    ? "Validade Indeterminada"
                                    : formatDate(data.current_document.expiration_date)}
                                </strong>
                              </span>
                            </div>
                            {data.current_document.file_name && (
                              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                                <FileText className="h-3.5 w-3.5" />
                                <span>{data.current_document.file_name}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500 italic">
                            Nenhum arquivo ou documento cadastrado como vigente no momento.
                          </p>
                        )}
                      </div>

                      {data.current_document?.file_path && (
                        <a
                          href={data.current_document.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-colors"
                        >
                          <FileDown className="h-4 w-4" /> Ver / Baixar PDF
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Operacional & Config summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-slate-400" /> Próxima Renovação
                      </h4>
                      {activeTask ? (
                        <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                          <p>Status: <span className="font-semibold">{activeTask.status}</span></p>
                          <p>
                            Prazo Limite:{" "}
                            <span className="font-semibold">
                              {activeTask.due_date ? formatDate(activeTask.due_date) : "—"}
                            </span>
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500 italic">Nenhuma atividade operacional aberta.</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Settings className="h-4 w-4 text-slate-400" /> Detalhes da Configuração
                      </h4>
                      <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                        <p>Frequência: <span className="font-semibold capitalize">{data.alvara.frequencia}</span></p>
                        <p>
                          Avisar com antecedência:{" "}
                          <span className="font-semibold">{data.alvara.prazo_inicio_dias} dias</span>
                        </p>
                        <p>
                          Anexo Obrigatório:{" "}
                          <span className="font-semibold">{data.alvara.anexo_obrigatorio ? "Sim" : "Não"}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Observations panel (if exists) */}
                  {data.company_alvara.observacoes && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-400">Anotações Internas</h4>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {data.company_alvara.observacoes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: HISTÓRICO DE DOCUMENTOS */}
              {activeTab === "documentos" && (
                <div className="space-y-4">
                  {/* Filters Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Filtros de Documento
                    </span>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={onlyCurrentDoc}
                          onChange={(e) => setOnlyCurrentDoc(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Apenas Vigente</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showArchivedDocs}
                          onChange={(e) => setShowArchivedDocs(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Mostrar Arquivados</span>
                      </label>
                    </div>
                  </div>

                  {/* Documents Grid / Table */}
                  {filteredDocuments.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-850 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3">Datas</th>
                            <th className="px-4 py-3">Arquivo</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {filteredDocuments.map((doc) => (
                            <tr
                              key={doc.id}
                              className={cn(
                                "hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors",
                                doc.is_current && "bg-blue-50/20 dark:bg-blue-950/10"
                              )}
                            >
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <span className="text-xs text-slate-400">Emissão:</span>{" "}
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {formatDate(doc.issue_date)}
                                  </span>
                                  <div className="text-xs text-slate-400">
                                    Vencimento:{" "}
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                                      {doc.is_indefinite ? "Indeterminado" : formatDate(doc.expiration_date)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 max-w-[200px] truncate">
                                <div className="font-medium text-slate-955 dark:text-slate-200 truncate">
                                  {doc.file_name || "Sem nome"}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {doc.is_current ? (
                                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    Vigente
                                  </span>
                                ) : doc.archived_at ? (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-850 dark:text-slate-400">
                                    Arquivado
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    Histórico
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {doc.file_path ? (
                                    <a
                                      href={doc.file_path}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                      <FileDown className="h-4 w-4" /> Baixar
                                    </a>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">N/A</span>
                                  )}
                                  {data.permissions.canArchiveDocuments && !doc.is_current && (
                                    <button
                                      onClick={() =>
                                        handleArchiveDocument(
                                          doc.id,
                                          doc.issue_date,
                                          doc.archived_at ? "restore" : "archive"
                                        )
                                      }
                                      className={cn(
                                        "inline-flex items-center gap-0.5 text-xs font-semibold",
                                        doc.archived_at
                                          ? "text-emerald-600 hover:text-emerald-800"
                                          : "text-slate-500 hover:text-slate-700"
                                      )}
                                      title={doc.archived_at ? "Restaurar documento" : "Arquivar documento"}
                                    >
                                      {doc.archived_at ? (
                                        <><ArchiveRestore className="h-3.5 w-3.5" /> Rest.</>
                                      ) : (
                                        <><Archive className="h-3.5 w-3.5" /> Arq.</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 bg-white rounded-xl dark:border-slate-800 dark:bg-slate-900 text-center">
                      <FileText className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                        Nenhum documento emitido registrado para este alvará.
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        Cadastre ou atualize o vínculo para registrar o primeiro documento emitido.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: TAREFAS OPERACIONAIS */}
              {activeTab === "tarefas" && (
                <div className="space-y-4">
                  {/* Filters Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Filtros de Tarefas
                    </span>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showFutureTasks}
                          onChange={(e) => setShowFutureTasks(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Mostrar Futuras</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showCompletedTasks}
                          onChange={(e) => setShowCompletedTasks(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Concluídas</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showCancelledTasks}
                          onChange={(e) => setShowCancelledTasks(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Canceladas</span>
                      </label>
                    </div>
                  </div>

                  {/* Tasks list */}
                  {filteredTasks.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-850 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3">Tipo / Gerada em</th>
                            <th className="px-4 py-3">Prazos</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Kanban</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {filteredTasks.map((t) => {
                            const isFuture = t.status === "pendente" && t.start_after && t.start_after > hoje;
                            return (
                              <tr
                                key={t.id}
                                className={cn(
                                  "hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors",
                                  isFuture && "bg-slate-50/30 text-slate-400"
                                )}
                              >
                                <td className="px-4 py-3">
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-slate-750 dark:text-slate-200 capitalize">
                                      {t.task_type === "renovacao" ? "renovação" : t.task_type}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                      Gerada em {formatDate(t.created_at)}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    <div>Limite: <strong className="text-slate-655 dark:text-slate-300">{formatDate(t.due_date)}</strong></div>
                                    {t.start_after && (
                                      <div>Liberado: <span>{formatDate(t.start_after)}</span></div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {isFuture ? (
                                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-450 dark:bg-slate-800 dark:text-slate-500 border border-slate-200">
                                      Futura
                                    </span>
                                  ) : t.status === "concluida" ? (
                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                      Concluída
                                    </span>
                                  ) : t.status === "cancelada" ? (
                                    <span className="inline-flex rounded-full bg-slate-150 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      Cancelada
                                    </span>
                                  ) : t.status === "com_impedimento" ? (
                                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300">
                                      Impedimento
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                      Pendente
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {t.status !== "cancelada" && t.status !== "concluida" && !isFuture ? (
                                    <a
                                      href={`/portal/acompanhamento?taskId=${t.id}`}
                                      className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                      Abrir <ArrowRight className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 bg-white rounded-xl dark:border-slate-800 dark:bg-slate-900 text-center">
                      <Clock className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                        Nenhuma tarefa relacionada encontrada.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Use filtros mais amplos ou aguarde a geração automática de tarefas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 4: AUDITORIA (TIMELINE) */}
              {activeTab === "auditoria" && (
                <div className="space-y-4">
                  {/* Timeline filter segment */}
                  <div className="flex gap-2 p-1 bg-slate-200/50 rounded-lg dark:bg-slate-850/60 overflow-x-auto">
                    {[
                      { id: "todos", label: "Tudo" },
                      { id: "document", label: "Documentos" },
                      { id: "task", label: "Operacional" },
                      { id: "error", label: "Erros Técnicos", hidden: !data.permissions.canViewTechnicalLogs },
                    ]
                      .filter((f) => !f.hidden)
                      .map((btn) => (
                        <button
                          key={btn.id}
                          onClick={() => setTimelineFilter(btn.id as any)}
                          className={cn(
                            "flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap",
                            timelineFilter === btn.id
                              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                              : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                          )}
                        >
                          {btn.label}
                        </button>
                      ))}
                  </div>

                  {/* Vertical Timeline */}
                  {filteredTimeline.length > 0 ? (
                    <div className="relative border-l border-slate-200 pl-6 space-y-6 dark:border-slate-800 ml-3">
                      {filteredTimeline.map((item) => {
                        const isErr = item.severity === "error";
                        const isWarn = item.severity === "warning";
                        return (
                          <div key={item.id} className="relative">
                            {/* Dot indicator */}
                            <span
                              className={cn(
                                "absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white dark:bg-slate-900",
                                isErr
                                  ? "border-red-500 ring-4 ring-red-100 dark:ring-red-950/40"
                                  : isWarn
                                  ? "border-amber-500 ring-4 ring-amber-100 dark:ring-amber-950/40"
                                  : "border-blue-500 ring-4 ring-blue-100 dark:ring-blue-950/40"
                              )}
                            >
                              {isErr ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              ) : isWarn ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              )}
                            </span>

                            {/* Event details card */}
                            <div className="rounded-xl border border-slate-250 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className={cn("text-sm font-bold", isErr ? "text-red-750 dark:text-red-400" : "text-slate-850 dark:text-white")}>
                                  {item.title}
                                </h5>
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {formatDateTime(item.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 mt-2 dark:text-slate-350 whitespace-pre-wrap">
                                {item.description}
                              </p>

                              {/* Actor name if exists */}
                              {item.created_by && (
                                <div className="flex items-center gap-1 text-xs text-slate-400 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                                  <User className="h-3 w-3" />
                                  <span>Operador: <strong>{item.created_by.display_name}</strong></span>
                                </div>
                              )}

                              {/* Show JSON metadata if technical logs is allowed & metadata is rich */}
                              {data.permissions.canViewTechnicalLogs && item.metadata && Object.keys(item.metadata).length > 0 && (
                                <details className="mt-3 text-xs">
                                  <summary className="cursor-pointer text-slate-400 font-medium hover:text-slate-655">
                                    Ver Detalhes Técnicos (JSON)
                                  </summary>
                                  <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-[10px] text-slate-700 dark:bg-slate-950 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                    {JSON.stringify(item.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 bg-white rounded-xl dark:border-slate-800 dark:bg-slate-900 text-center">
                      <History className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                        {timelineFilter === "error"
                          ? "Nenhum erro técnico registrado."
                          : "Nenhuma movimentação de auditoria registrada."}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Novos eventos e históricos de ciclo de vida serão logados nesta timeline automaticamente.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 5: CONFIGURAÇÕES E ANOTAÇÕES */}
              {activeTab === "config" && (
                <div className="space-y-6">
                  {/* Annotations Section */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                      <Edit3 className="h-4 w-4 text-blue-500" /> Anotações Internas / Observações
                    </h4>
                    <p className="text-xs text-slate-400 mb-3">
                      Estas anotações são restritas para controle operacional interno e não aparecem nas notificações automáticas.
                    </p>

                    <div className="relative">
                      <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Adicione observações, logs manuais ou informações específicas deste vínculo de alvará..."
                        disabled={!data.permissions.canEditObservations || savingObs}
                        rows={6}
                        className="w-full rounded-lg border border-slate-250 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-850 dark:bg-slate-950 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900/60 disabled:cursor-not-allowed"
                      />
                      {!data.permissions.canEditObservations && (
                        <div className="absolute right-3 bottom-3 flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                          <Lock className="h-3 w-3" /> Somente Leitura
                        </div>
                      )}
                    </div>

                    {data.permissions.canEditObservations && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={handleSaveObservations}
                          disabled={savingObs}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-400 shadow-xs cursor-pointer min-w-[120px]"
                        >
                          {savingObs ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                            </>
                          ) : (
                            "Salvar Anotações"
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Config Block Read Only */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Settings className="h-4 w-4 text-slate-400" /> Parâmetros de Vínculo (Leitura)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm pt-2">
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400">Obrigatório no cadastro:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {data.company_alvara.is_required ? "Sim (Obrigatório)" : "Não (Opcional)"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400">Isento de renovação:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {data.company_alvara.is_exempt
                            ? `Sim (${data.company_alvara.exemption_reason || "Sem motivo informado"})`
                            : "Não"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400">Status de Monitoramento:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                          {data.company_alvara.monitoring_status || "ativo"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400">Vínculo Criado em:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDateTime(data.company_alvara.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Zona de Ações Sensíveis */}
                  {(data.permissions.canSuspendMonitoring || data.permissions.canArchiveLink) && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-5 dark:border-orange-900/40 dark:bg-orange-950/20">
                      <h4 className="text-sm font-bold text-orange-900 dark:text-orange-400 flex items-center gap-1.5 mb-1">
                        <ShieldAlert className="h-4 w-4" /> Ações Administrativas
                      </h4>
                      <p className="text-xs text-orange-700 dark:text-orange-500 mb-4">
                        Estas ações afetam o comportamento de monitoramento e compliance. Todas são registradas permanentemente no histórico de auditoria.
                      </p>
                      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                        {data.permissions.canSuspendMonitoring && (
                          data.company_alvara.monitoring_status === "suspenso" ? (
                            <button
                              onClick={() => handleSuspendMonitoring("reactivate")}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:bg-slate-900 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors"
                            >
                              <PlayCircle className="h-4 w-4" /> Reativar Monitoramento
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspendMonitoring("suspend")}
                              className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:bg-slate-900 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30 transition-colors"
                            >
                              <PauseCircle className="h-4 w-4" /> Suspender Monitoramento
                            </button>
                          )
                        )}
                        {data.permissions.canArchiveLink && (
                          data.company_alvara.archived_at ? (
                            <button
                              onClick={() => handleArchiveLink("restore")}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:bg-slate-900 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors"
                            >
                              <ArchiveRestore className="h-4 w-4" /> Restaurar Vínculo
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchiveLink("archive")}
                              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:bg-slate-900 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors"
                            >
                              <Archive className="h-4 w-4" /> Arquivar Vínculo
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>

    {/* Global Confirmation Modal */}
    {confirmDialog && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {confirmDialog.description}
            </p>

            {/* Reason field */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                {confirmDialog.requireReason ? "Justificativa (obrigatória)" : "Observação / Motivo (opcional)"}
              </label>
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                rows={3}
                placeholder={
                  confirmDialog.requireReason
                    ? "Descreva o motivo desta ação (mínimo 10 caracteres)..."
                    : "Opcional: adicione um comentário sobre esta ação..."
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirm}
                disabled={actionLoading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={runConfirmedAction}
                disabled={
                  actionLoading ||
                  (confirmDialog.requireReason && confirmReason.trim().length < 10)
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors",
                  confirmDialog.confirmClass
                )}
              >
                {actionLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                ) : (
                  confirmDialog.confirmLabel
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>,
  document.body
);
}
