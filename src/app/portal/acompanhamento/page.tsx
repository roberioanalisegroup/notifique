"use client";

import { apiJson } from "@/lib/api-client";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { prazoInicioPrimeiroCiclo } from "@/lib/alvara-task-generation";
import { cn, formatDate, getTaskStatusMeta } from "@/lib/utils";
import type { Company } from "@/types";
import { format } from "date-fns";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Eraser,
  EyeOff,
  FileSignature,
  GripVertical,
  LayoutGrid,
  List,
  ListTodo,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  Upload,
  UserCircle,
  XCircle,
} from "lucide-react";
import type { AcompanhamentoTaskRow as TaskRow } from "@/components/acompanhamento/acompanhamento-task-type";
import { TaskCardChecklist } from "@/components/acompanhamento/task-card-checklist";
import dynamic from "next/dynamic";

const AcompanhamentoCalendarView = dynamic(
  () =>
    import("@/components/acompanhamento/acompanhamento-calendar-view").then((m) => ({
      default: m.AcompanhamentoCalendarView,
    })),
  { loading: () => <div className="min-h-[320px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" /> }
);

const AcompanhamentoListView = dynamic(
  () =>
    import("@/components/acompanhamento/acompanhamento-list-view").then((m) => ({
      default: m.AcompanhamentoListView,
    })),
  { loading: () => <div className="min-h-[320px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" /> }
);

const TaskEditModal = dynamic(
  () =>
    import("@/components/acompanhamento/task-edit-modal").then((m) => ({
      default: m.TaskEditModal,
    })),
  { ssr: false }
);
import type { AlvaraTaskChecklistRow } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type UiLane = "pendente" | "andamento";

const LANES_STORAGE_KEY = "notifique-acompanhamento-lanes";

const VIEW_MODE_KEY = "notifique-acompanhamento-viewmode";

type ViewMode = "kanban" | "lista" | "calendario";

function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "kanban";
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "lista" || v === "calendario" || v === "kanban") return v;
  } catch {
    /* ignore */
  }
  return "kanban";
}

type ColumnId = "pendente" | "andamento" | "concluido";

const COLUMNS: { id: ColumnId; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "pendente",
    label: "Pendente",
    icon: <Clock className="h-4 w-4" />,
    description: "A iniciar",
  },
  {
    id: "andamento",
    label: "Em andamento",
    icon: <ListTodo className="h-4 w-4" />,
    description: "Destaque do que está em tratamento (continua pendente no sistema)",
  },
  {
    id: "concluido",
    label: "Concluído",
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: "Tarefas concluídas",
  },
];

function parseLaneMapJson(raw: string): Record<string, UiLane> {
  const p = JSON.parse(raw) as Record<string, string>;
  const out: Record<string, UiLane> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === "andamento") out[k] = "andamento";
    else out[k] = "pendente";
  }
  return out;
}

/** Pendente vs Em andamento: guardado em localStorage (persiste e partilha entre separadores deste navegador). */
function readLaneMap(): Record<string, UiLane> {
  if (typeof window === "undefined") return {};
  try {
    let raw = localStorage.getItem(LANES_STORAGE_KEY);
    if (!raw) {
      const legacy = sessionStorage.getItem(LANES_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(LANES_STORAGE_KEY, legacy);
        sessionStorage.removeItem(LANES_STORAGE_KEY);
        raw = legacy;
      }
    }
    if (!raw) return {};
    return parseLaneMapJson(raw);
  } catch {
    return {};
  }
}

function writeLaneMap(map: Record<string, UiLane>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota excedida ou modo privado restrito
  }
}

function yearFromIso(d: string | null | undefined): number | null {
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : null;
}



function companyLabel(c: Company | null | undefined): string {
  if (!c) return "—";
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

function taskMotivoNaoConclusao(t: TaskRow): string {
  const em = t.company_alvaras?.data_emissao;
  const hasEmissao = em != null && String(em).trim() !== "";
  if (!hasEmissao) {
    return "Para concluir é preciso registar a data de emissão no vínculo (ou usar «Dar baixa no vínculo»).";
  }
  const exigeAnexo = t.company_alvaras?.alvaras?.anexo_obrigatorio === true;
  if (exigeAnexo) {
    const url = t.company_alvaras?.arquivo_url;
    if (!url || String(url).trim() === "") {
      return "Este tipo de alvará exige um documento anexo no vínculo antes de concluir.";
    }
  }
  const hasVencimentoTarefa = t.due_date != null && String(t.due_date).trim() !== "";
  if (!hasVencimentoTarefa) {
    return "O vencimento da tarefa preenche-se ao registar a emissão no vínculo; use também «Dar baixa» se aplicável.";
  }
  return "Não é possível concluir esta tarefa.";
}

function taskPodeConcluir(t: TaskRow): boolean {
  const em = t.company_alvaras?.data_emissao;
  const hasEmissao = em != null && String(em).trim() !== "";
  const hasVencimentoTarefa = t.due_date != null && String(t.due_date).trim() !== "";
  if (!hasEmissao || !hasVencimentoTarefa) return false;
  const exigeAnexo = t.company_alvaras?.alvaras?.anexo_obrigatorio === true;
  if (exigeAnexo) {
    const url = t.company_alvaras?.arquivo_url;
    if (!url || String(url).trim() === "") return false;
  }
  return true;
}

function vinculoTemEmissao(ca: TaskRow["company_alvaras"]): boolean {
  const em = ca?.data_emissao;
  return em != null && String(em).trim() !== "";
}

function taskAtrasoInicio(t: TaskRow, uiColumn: ColumnId, hoje: string): boolean {
  if (t.status !== "pendente") return false;
  if (uiColumn !== "pendente") return false;
  if (vinculoTemEmissao(t.company_alvaras)) return false;
  const lim =
    prazoInicioPrimeiroCiclo(t.created_at, t.company_alvaras?.alvaras?.prazo_inicio_dias) ??
    t.inicio_obrigatorio_ate;
  if (!lim) return false;
  return lim < hoje;
}

function taskAtrasoVencimento(t: TaskRow, hoje: string): boolean {
  if (t.status !== "pendente") return false;
  if (!t.due_date || String(t.due_date).trim() === "") return false;
  return t.due_date < hoje;
}

function isTaskOculta(t: TaskRow, hojeStr: string): boolean {
  if (t.status !== "pendente") return false;
  if (!t.due_date || String(t.due_date).trim() === "") return false;
  const diffTime = new Date(t.due_date).getTime() - new Date(hojeStr).getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 90;
}

function getTaskYear(t: TaskRow): number {
  const cy = new Date().getFullYear();
  const y = yearFromIso(t.due_date);
  if (y != null) return y;
  const yi = yearFromIso(t.inicio_obrigatorio_ate);
  if (yi != null) return yi;
  return cy;
}

export default function AcompanhamentoPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [checklistByTaskId, setChecklistByTaskId] = useState<Record<string, AlvaraTaskChecklistRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedYears, setSelectedYears] = useState<(number | "ocultos")[]>(() => [new Date().getFullYear()]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [laneMap, setLaneMap] = useState<Record<string, UiLane>>({});
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [selectedAlvaraNames, setSelectedAlvaraNames] = useState<string[]>([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode());
  const [detailModal, setDetailModal] = useState<{ taskId: string; column: ColumnId } | null>(
    null
  );
  const companyMenuRef = useRef<HTMLDivElement>(null);
  const yearMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);

  const hoje = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  useEffect(() => {
    setLaneMap(readLaneMap());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LANES_STORAGE_KEY || e.newValue == null) return;
      try {
        setLaneMap(parseLaneMapJson(e.newValue));
      } catch {
        // ignore
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!companyMenuRef.current?.contains(e.target as Node)) setCompanyMenuOpen(false);
      if (!yearMenuRef.current?.contains(e.target as Node)) setYearMenuOpen(false);
      if (!taskMenuRef.current?.contains(e.target as Node)) setTaskMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const persistLanes = useCallback((next: Record<string, UiLane>) => {
    setLaneMap(next);
    writeLaneMap(next);
  }, []);

  const buildQuery = useCallback(() => {
    const sp = new URLSearchParams();
    const numericYears = selectedYears.filter((y): y is number => typeof y === "number");
    if (numericYears.length > 0 && !selectedYears.includes("ocultos")) {
      const ys = [...numericYears].sort((a, b) => a - b);
      const fromY = ys[0];
      const toY = ys[ys.length - 1];
      sp.set("from", `${fromY}-01-01`);
      sp.set("to", `${toY}-12-31`);
    }
    return sp.toString();
  }, [selectedYears]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const qs = buildQuery();
      const url = "/api/alvara-tasks" + (qs ? "?" + qs : "");
      const d = await apiJson<{ tasks: TaskRow[] }>(url);
      setTasks(d.tasks.filter((t) => t.status !== "cancelada"));
    } catch (e) {
      if (!silent) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar tarefas");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ids = tasks.map((t) => t.id);
    if (ids.length === 0) {
      setChecklistByTaskId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiJson<{ by_task: Record<string, AlvaraTaskChecklistRow[]> }>(
          "/api/alvara-tasks/checklist-batch",
          { method: "POST", body: JSON.stringify({ task_ids: ids }) }
        );
        if (!cancelled) setChecklistByTaskId(d.by_task ?? {});
      } catch {
        if (!cancelled) setChecklistByTaskId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  const patchChecklist = useCallback(async (taskId: string, itemId: string, completed: boolean, comment?: string, attachmentUrl?: string) => {
    setChecklistByTaskId((prev) => {
      const rows = prev[taskId] ?? [];
      return {
        ...prev,
        [taskId]: rows.map((r) => (r.item_id === itemId ? { ...r, completed, comment: comment ?? null, attachment_url: attachmentUrl ?? null, completed_at: completed ? new Date().toISOString() : null } : r)),
      };
    });
    try {
      await apiJson("/api/alvara-tasks/" + taskId + "/checklist", {
        method: "PATCH",
        body: JSON.stringify({ item_id: itemId, completed, comment: comment ?? null, attachment_url: attachmentUrl ?? null }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar etapa");
      void load({ silent: true });
    }
  }, [load]);

  /** Atualização em segundo plano: outra sessão, vínculo novo ou mesmo separador. */
  useEffect(() => {
    if (detailModal != null) return;
    const intervalMs = 30_000;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [load, detailModal]);

  useEffect(() => {
    function onVisibility() {
      if (detailModal != null) return;
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load, detailModal]);

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const set = new Set<number>();
    for (let y = cy + 3; y >= cy - 15; y--) set.add(y);
    tasks.forEach((t) => {
      const y = yearFromIso(t.due_date);
      if (y != null) set.add(y);
      const yi = yearFromIso(t.inicio_obrigatorio_ate);
      if (yi != null) set.add(yi);
      if (t.due_date == null || String(t.due_date).trim() === "") set.add(cy);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [tasks]);

  const uniqueAlvaraNames = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((t) => {
      const n = t.company_alvaras?.alvaras?.name?.trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks]);

  const uniqueCompanies = useMemo(() => {
    const map = new Map<string, { id: string; label: string; cnpj: string; codigo: string; name: string }>();
    tasks.forEach((t) => {
      const c = t.company_alvaras?.companies;
      if (!c || !c.id) return;
      const name = (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
      const cnpj = c.cnpj || c.numero_documento || "";
      const formattedCnpj = cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
      const codigo = c.codigo_empresa || "";
      
      let label = name;
      const details: string[] = [];
      if (formattedCnpj) details.push(`CNPJ: ${formattedCnpj}`);
      if (codigo) details.push(`Cód: ${codigo}`);
      if (details.length > 0) {
        label += ` (${details.join(" - ")})`;
      }
      
      map.set(c.id, {
        id: c.id,
        label,
        cnpj: formattedCnpj,
        codigo,
        name
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [tasks]);

  const filteredCompaniesList = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return uniqueCompanies;
    return uniqueCompanies.filter((c) => c.label.toLowerCase().includes(q));
  }, [uniqueCompanies, companyQuery]);

  const filteredAlvaraNamesList = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    if (!q) return uniqueAlvaraNames;
    return uniqueAlvaraNames.filter((n) => n.toLowerCase().includes(q));
  }, [uniqueAlvaraNames, taskQuery]);

  const filteredTasks = useMemo(() => {
    const hojeStr = hoje;
    const showOcultos = selectedYears.includes("ocultos");
    const numericYears = selectedYears.filter((y): y is number => typeof y === "number");

    return tasks.filter((t) => {
      if (selectedCompanies.length > 0) {
        const companyId = t.company_alvaras?.companies?.id;
        if (!companyId || !selectedCompanies.includes(companyId)) return false;
      }
      if (selectedAlvaraNames.length > 0) {
        const an = t.company_alvaras?.alvaras?.name?.trim() ?? "";
        if (!selectedAlvaraNames.includes(an)) return false;
      }
      // Regra de Visibilidade de 90 dias para tarefas pendentes
      const isOculta = isTaskOculta(t, hojeStr);
      if (isOculta && !showOcultos) {
        return false;
      }
      // Filtro de Anos (em memória)
      if (numericYears.length > 0) {
        const tYear = getTaskYear(t);
        if (!numericYears.includes(tYear)) return false;
      }
      return true;
    });
  }, [tasks, selectedCompanies, selectedAlvaraNames, selectedYears, hoje]);

  const tasksByColumn = useMemo(() => {
    const pendente: TaskRow[] = [];
    const andamento: TaskRow[] = [];
    const concluido: TaskRow[] = [];

    for (const t of filteredTasks) {
      if (t.status === "concluida") {
        concluido.push(t);
        continue;
      }
      const lane = laneMap[t.id] ?? "pendente";
      if (lane === "andamento") andamento.push(t);
      else pendente.push(t);
    }

    pendente.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    andamento.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    concluido.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

    return { pendente, andamento, concluido };
  }, [filteredTasks, laneMap]);

  const getTaskUiColumn = useCallback(
    (t: TaskRow): ColumnId => {
      if (t.status === "concluida") return "concluido";
      return (laneMap[t.id] ?? "pendente") === "andamento" ? "andamento" : "pendente";
    },
    [laneMap]
  );

  async function darBaixaNoVinculo(t: TaskRow) {
    if (
      !confirm(
        "Concluir esta tarefa e registar a baixa no vínculo (emissão hoje, próximo vencimento recalculado)?"
      )
    ) {
      return;
    }
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ registrarBaixaNoVinculo: true, status: "concluida" }),
      });
      const next = { ...laneMap };
      delete next[t.id];
      persistLanes(next);
      toast.success("Baixa registada e vínculo atualizado");
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function soConcluir(t: TaskRow) {
    if (!taskPodeConcluir(t)) {
      toast.error(taskMotivoNaoConclusao(t));
      return;
    }
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "concluida" }),
      });
      const next = { ...laneMap };
      delete next[t.id];
      persistLanes(next);
      toast.success("Tarefa concluída");
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function reabrir(t: TaskRow) {
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "pendente" }),
      });
      toast.success("Tarefa reaberta");
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function cancelarTarefa(t: TaskRow) {
    if (!confirm("Cancelar esta tarefa? Ela deixa de aparecer no quadro.")) return;
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelada" }),
      });
      const next = { ...laneMap };
      delete next[t.id];
      persistLanes(next);
      toast.success("Tarefa cancelada");
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function onOpenTaskDetail(id: string, column: ColumnId) {
    setDetailModal({ taskId: id, column });
  }

  function clearFilters() {
    setSelectedYears([]);
    setSelectedCompanies([]);
    setSelectedAlvaraNames([]);
    setCompanyQuery("");
    setTaskQuery("");
    toast.message("Filtros limpos");
  }

  function onDragStart(e: React.DragEvent, taskId: string) {
    setDragTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDragTaskId(null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function moveTaskToColumn(task: TaskRow, target: ColumnId) {
    if (target === "concluido") {
      if (task.status === "concluida") return;
      if (!taskPodeConcluir(task)) {
        toast.error(taskMotivoNaoConclusao(task));
        return;
      }
      await soConcluir(task);
      return;
    }

    if (task.status === "concluida") {
      await reabrir(task);
      const lane: UiLane = target === "andamento" ? "andamento" : "pendente";
      const next: Record<string, UiLane> = { ...laneMap, [task.id]: lane };
      persistLanes(next);
      return;
    }

    const lane: UiLane = target === "andamento" ? "andamento" : "pendente";
    const next: Record<string, UiLane> = { ...laneMap, [task.id]: lane };
    persistLanes(next);
    toast.message(target === "andamento" ? "Movido para Em andamento" : "Movido para Pendente");
  }

  async function onDropColumn(e: React.DragEvent, target: ColumnId) {
    e.preventDefault();
    setDragTaskId(null);
    const id = e.dataTransfer.getData("text/plain");
    const task = tasks.find((x) => x.id === id);
    if (!task) return;
    await moveTaskToColumn(task, target);
  }

  const selectedYearsLabel = useMemo(() => {
    if (selectedYears.length === 0) return "Todos os anos";
    const hasOcultos = selectedYears.includes("ocultos");
    const numericYears = selectedYears.filter((y): y is number => typeof y === "number");
    
    if (numericYears.length === 0) {
      return "Ocultos";
    }
    
    const yearsStr = numericYears.length === 1 
      ? String(numericYears[0]) 
      : `${numericYears.length} anos selecionados`;
      
    if (hasOcultos) {
      return `${yearsStr} + Ocultos`;
    }
    return yearsStr;
  }, [selectedYears]);

  const selectedCompaniesLabel = useMemo(() => {
    if (selectedCompanies.length === 0) return "Todas empresas";
    if (selectedCompanies.length === 1) {
      const found = uniqueCompanies.find((c) => c.id === selectedCompanies[0]);
      return found ? found.name : "1 empresa";
    }
    return `${selectedCompanies.length} empresas selecionadas`;
  }, [selectedCompanies, uniqueCompanies]);

  const selectedAlvarasLabel =
    selectedAlvaraNames.length === 0
      ? "Todos os tipos"
      : selectedAlvaraNames.length === 1
        ? selectedAlvaraNames[0]
        : `${selectedAlvaraNames.length} tipos selecionados`;

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Cabeçalho — alinhado ao portal + tom verde do modelo */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-100">
            <FileSignature className="h-7 w-7 text-emerald-800 dark:text-emerald-400" aria-hidden />
            Gestão de alvarás
          </h1>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <div
              className="inline-flex rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm dark:border-slate-600/90 dark:bg-slate-800/90"
              role="group"
              aria-label="Tipo de visualização"
            >
              <button
                type="button"
                title="Quadro Kanban"
                aria-pressed={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition sm:h-8 sm:w-8",
                  viewMode === "kanban"
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                title="Lista"
                aria-pressed={viewMode === "lista"}
                onClick={() => setViewMode("lista")}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition sm:h-8 sm:w-8",
                  viewMode === "lista"
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <List className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                title="Calendário"
                aria-pressed={viewMode === "calendario"}
                onClick={() => setViewMode("calendario")}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition sm:h-8 sm:w-8",
                  viewMode === "calendario"
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              id="acompanhamento-ajuda-toggle"
              aria-expanded={helpPanelOpen}
              aria-controls="acompanhamento-ajuda-conteudo"
              onClick={() => setHelpPanelOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/90 bg-white px-3 py-2 text-sm font-medium text-emerald-950 shadow-sm transition hover:bg-emerald-50/90 dark:border-emerald-800/60 dark:bg-slate-800 dark:text-emerald-100 dark:hover:bg-emerald-950/40"
            >
              <span>Dicas de Uso</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-emerald-800 transition-transform duration-300 dark:text-emerald-300",
                  helpPanelOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
          </div>
        </div>

        <div className="max-w-3xl">
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out",
              helpPanelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                id="acompanhamento-ajuda-conteudo"
                className="space-y-5 rounded-xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/90 to-white px-4 pb-4 pt-3 text-sm leading-relaxed text-slate-700 shadow-sm dark:border-emerald-800/40 dark:from-emerald-950/30 dark:to-slate-900 dark:text-slate-300"
              >
                <section>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Quadro de Acompanhamento</h2>
                  <p className="mt-2">
                    Aqui você acompanha as tarefas geradas a partir dos alvarás das empresas.
                  </p>
                  <p className="mt-1.5">
                    Veja rapidamente o que está pendente, em andamento ou concluído, sempre considerando a validade e a
                    empresa.
                  </p>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    Use os ícones ao lado de <strong className="text-slate-800 dark:text-slate-200">Dicas de Uso</strong> para alternar
                    entre <strong className="text-slate-800 dark:text-slate-200">Kanban</strong>, <strong className="text-slate-800 dark:text-slate-200">lista</strong>{" "}
                    e <strong className="text-slate-800 dark:text-slate-200">calendário</strong> (vencimento ou início obrigatório).
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-slate-700 dark:text-slate-300">
                    <li>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Anos:</span> considera o ano do vencimento da tarefa
                    </li>
                    <li>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Nenhum selecionado</span> → mostra todas
                    </li>
                    <li>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Vários selecionados</span> → mostra do menor ao
                      maior ano
                    </li>
                    <li>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Empresas e Tipo de Alvará:</span> use para focar
                      apenas no que precisa no momento
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Colunas</h2>
                  <dl className="mt-2 space-y-3 text-slate-700 dark:text-slate-300">
                    <div>
                      <dt className="font-medium text-slate-800 dark:text-slate-200">Pendente</dt>
                      <dd className="mt-0.5 pl-0 text-slate-600 dark:text-slate-400">Tarefas que ainda não foram iniciadas</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-800 dark:text-slate-200">Em andamento</dt>
                      <dd className="mt-0.5 text-slate-600 dark:text-slate-400">
                        Use para destacar o que já está em tratamento ou com documentação em curso, à parte do que
                        ainda não começou. É só organização no quadro: a tarefa continua{" "}
                        <strong className="text-slate-800 dark:text-slate-200">pendente</strong> no sistema até passar para{" "}
                        <strong className="text-slate-800 dark:text-slate-200">Concluído</strong> (ou usar «Dar baixa», quando aplicável).
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-800 dark:text-slate-200">Concluído</dt>
                      <dd className="mt-0.5 text-slate-600 dark:text-slate-400">Tarefas finalizadas</dd>
                    </div>
                  </dl>
                </section>

                <p className="rounded-lg bg-emerald-50/80 px-3 py-2 text-slate-700 dark:bg-emerald-950/30 dark:text-slate-300">
                  No modo Kanban, pode arrastar os cartões entre as colunas para refletir o andamento.
                </p>

                <section>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Como concluir uma tarefa</h2>
                  <p className="mt-2 font-medium text-slate-800 dark:text-slate-200">Para mover para Concluído:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-slate-700 dark:text-slate-300">
                    <li>
                      Normalmente é preciso preencher a data de emissão no vínculo empresa–alvará
                    </li>
                    <li>O próprio cartão avisa se falta alguma informação</li>
                  </ul>
                  <p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Se precisar encerrar sem emissão:</p>
                  <p className="mt-1.5 text-slate-700 dark:text-slate-300">
                    Use a opção &quot;Dar baixa&quot; dentro da tarefa
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Dicas rápidas</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-slate-700 dark:text-slate-300">
                    <li>As cores no Kanban, na lista e no calendário ajudam a ver prazos e estado</li>
                    <li>
                      O quadro atualiza sozinho em segundo plano (cerca de 30 segundos) e de novo ao voltar a este
                      separador, para apanhar tarefas novas — por exemplo após vincular um alvará noutra página ou noutra
                      sessão. Enquanto um card está em edição, essa atualização automática fica pausada.
                    </li>
                    <li>
                      Em <strong className="text-slate-800 dark:text-slate-200">Configurações → Geração e manutenção</strong> pode
                      recriar ou ajustar tarefas em massa (anos, empresas, etc.), por exemplo se tiver apagado cartões.
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de filtros — overflow-visible para os popovers não ficarem cortados pelo card */}
      <div className="relative z-30">
        <div className="card-portal flex flex-wrap items-end gap-6 overflow-visible p-5">
        <div
          ref={yearMenuRef}
          className={cn("relative min-w-[200px] flex-1", yearMenuOpen && "z-50")}
        >
          <label
            id="filtro-anos-label"
            htmlFor="filtro-anos-btn"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Anos (vencimento da tarefa)
          </label>
          <button
            id="filtro-anos-btn"
            type="button"
            className="input-field flex h-10 w-full items-center justify-between text-left"
            onClick={() => setYearMenuOpen((o) => !o)}
            aria-expanded={yearMenuOpen}
            aria-labelledby="filtro-anos-label"
          >
            <span className="truncate">{selectedYearsLabel}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", yearMenuOpen && "rotate-180")} />
          </button>
          {yearMenuOpen ? (
            <div className="absolute left-0 right-0 top-full z-[100] mt-1 flex max-h-72 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/40">
              <p className="px-2 py-1.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
                Nenhum marcado = todas as tarefas. Vários anos = intervalo do menor ao maior.
              </p>
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-2 pb-2 dark:border-slate-700">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedYears(yearOptions.slice());
                  }}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedYears([]);
                  }}
                >
                  Desmarcar
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {/* Opção Especial: Ocultos */}
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 border-b border-slate-100 dark:border-slate-700/80 mb-1 pb-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedYears.includes("ocultos")}
                    onChange={(e) => {
                      setSelectedYears((prev) => {
                        const next = e.target.checked ? [...prev, "ocultos" as const] : prev.filter((x) => x !== "ocultos");
                        const nums = next.filter((x): x is number => typeof x === "number").sort((a, b) => b - a);
                        return next.includes("ocultos") ? [...nums, "ocultos" as const] : nums;
                      });
                    }}
                  />
                  <EyeOff className="h-4 w-4 shrink-0" />
                  <span>Ocultos (&gt; 90 dias)</span>
                </label>

                {yearOptions.map((y) => {
                  const checked = selectedYears.includes(y);
                  return (
                    <label
                      key={y}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/80"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedYears((prev) => {
                            const next = e.target.checked ? [...prev, y] : prev.filter((x) => x !== y);
                            const nums = next.filter((x): x is number => typeof x === "number").sort((a, b) => b - a);
                            return next.includes("ocultos") ? [...nums, "ocultos" as const] : nums;
                          });
                        }}
                      />
                      <span>{y}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div
          ref={companyMenuRef}
          className={cn("relative min-w-[240px] flex-1", companyMenuOpen && "z-50")}
        >
          <label
            id="filtro-empresas-label"
            htmlFor="filtro-empresas-btn"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Empresas
          </label>
          <button
            id="filtro-empresas-btn"
            type="button"
            className="input-field flex h-10 w-full items-center justify-between text-left"
            onClick={() => setCompanyMenuOpen((o) => !o)}
            aria-expanded={companyMenuOpen}
            aria-labelledby="filtro-empresas-label"
          >
            <span className="truncate">{selectedCompaniesLabel}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", companyMenuOpen && "rotate-180")} />
          </button>
          {companyMenuOpen ? (
            <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/40">
              <div className="border-b border-slate-100 p-2 dark:border-slate-700">
                <input
                  type="search"
                  className="input-field h-9 text-sm"
                  placeholder="Buscar empresa…"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCompanies(uniqueCompanies.map((uc) => uc.id));
                    }}
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCompanies([]);
                    }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
              <ul className="max-h-56 overflow-y-auto p-1">
                {filteredCompaniesList.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">Nenhuma empresa encontrada</li>
                ) : (
                  filteredCompaniesList.map((c) => {
                    const checked = selectedCompanies.includes(c.id);
                    return (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/80">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedCompanies((prev) =>
                                e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                              );
                            }}
                          />
                          <span className="truncate" title={c.label}>{c.label}</span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}
        </div>

        <div
          ref={taskMenuRef}
          className={cn("relative min-w-[240px] flex-1", taskMenuOpen && "z-50")}
        >
          <label
            id="filtro-tarefas-label"
            htmlFor="filtro-tarefas-btn"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Tipo de alvará (tarefa)
          </label>
          <button
            id="filtro-tarefas-btn"
            type="button"
            className="input-field flex h-10 w-full items-center justify-between text-left"
            onClick={() => setTaskMenuOpen((o) => !o)}
            aria-expanded={taskMenuOpen}
            aria-labelledby="filtro-tarefas-label"
          >
            <span className="truncate">{selectedAlvarasLabel}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", taskMenuOpen && "rotate-180")} />
          </button>
          {taskMenuOpen ? (
            <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/40">
              <div className="border-b border-slate-100 p-2 dark:border-slate-700">
                <input
                  type="search"
                  className="input-field h-9 text-sm"
                  placeholder="Buscar tipo…"
                  value={taskQuery}
                  onChange={(e) => setTaskQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlvaraNames(uniqueAlvaraNames.slice());
                    }}
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlvaraNames([]);
                    }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
              <ul className="max-h-56 overflow-y-auto p-1">
                {filteredAlvaraNamesList.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">Nenhum tipo encontrado</li>
                ) : (
                  filteredAlvaraNamesList.map((name) => {
                    const checked = selectedAlvaraNames.includes(name);
                    return (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/80">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedAlvaraNames((prev) =>
                                e.target.checked ? [...prev, name] : prev.filter((x) => x !== name)
                              );
                            }}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={clearFilters}
          className="btn-secondary inline-flex items-center gap-2 self-end"
        >
          <Eraser className="h-4 w-4" />
          Limpar filtros
        </button>
        </div>
      </div>

      {/* Quadro: Kanban | Lista | Calendário */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm">A carregar quadro…</span>
          </div>
        </div>
      ) : viewMode === "lista" ? (
        <AcompanhamentoListView
          tasks={filteredTasks}
          getUiColumn={getTaskUiColumn}
          onOpen={(t) => onOpenTaskDetail(t.id, getTaskUiColumn(t))}
        />
      ) : viewMode === "calendario" ? (
        <AcompanhamentoCalendarView
          tasks={filteredTasks}
          getUiColumn={getTaskUiColumn}
          onOpen={(t) => onOpenTaskDetail(t.id, getTaskUiColumn(t))}
        />
      ) : (
        <div className="relative z-0 -mx-1 flex flex-col gap-5 overflow-x-auto pb-4 md:flex-row md:items-start">
          {COLUMNS.map((col) => {
            const list =
              col.id === "pendente"
                ? tasksByColumn.pendente
                : col.id === "andamento"
                  ? tasksByColumn.andamento
                  : tasksByColumn.concluido;

            return (
              <section
                key={col.id}
                className="flex min-h-[420px] min-w-[min(100%,320px)] flex-1 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3 shadow-sm dark:border-slate-700/90 dark:bg-slate-900/50 md:min-w-[300px]"
                onDragOver={onDragOver}
                onDrop={(e) => void onDropColumn(e, col.id)}
              >
                <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                  <div>
                    <h2
                      className={cn(
                        "flex items-center gap-2 text-base font-semibold",
                        col.id === "concluido" && "text-emerald-800 dark:text-emerald-300",
                        col.id === "andamento" && "text-amber-800 dark:text-amber-300",
                        col.id === "pendente" && "text-red-800 dark:text-red-300"
                      )}
                    >
                      {col.icon}
                      {col.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{col.description}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                      col.id === "concluido" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                      col.id === "andamento" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                      col.id === "pendente" && "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                    )}
                  >
                    {list.length}
                  </span>
                </header>

                <div className="flex max-h-[620px] min-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
                  {list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-500">
                      Nenhum item
                    </p>
                  ) : (
                    list.map((t) => (
                      <article
                        key={t.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onDragEnd={onDragEnd}
                        className={cn(
                          "group cursor-grab rounded-2xl bg-white p-4 shadow-sm transition active:cursor-grabbing dark:bg-slate-800/90 dark:shadow-black/20",
                          col.id === "concluido" &&
                            "border-4 border-emerald-500/60 shadow-emerald-50 dark:border-emerald-500/50 dark:shadow-emerald-950/30",
                          col.id === "andamento" &&
                            "border-2 border-amber-500/60 shadow-amber-50 dark:border-amber-500/50 dark:shadow-amber-950/20",
                          col.id === "pendente" && "border-0 border-transparent shadow-sm",
                          dragTaskId === t.id && "opacity-60"
                        )}
                      >
                        <TaskCard
                          task={t}
                          uiColumn={col.id}
                          hoje={hoje}
                          checklistRows={checklistByTaskId[t.id] ?? []}
                          onChecklistToggle={(itemId, completed, comment, attachmentUrl) =>
                            void patchChecklist(t.id, itemId, completed, comment, attachmentUrl)
                          }
                          onOpenDetail={() => onOpenTaskDetail(t.id, col.id)}
                          onBaixa={() => void darBaixaNoVinculo(t)}
                          onConcluir={() => void soConcluir(t)}
                          onReabrir={() => void reabrir(t)}
                          onCancelar={() => void cancelarTarefa(t)}
                          onMoveToColumn={(target) => void moveTaskToColumn(t, target)}
                        />
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && tasks.length === 0 ? (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Nenhuma tarefa no período com estes filtros. As tarefas são criadas{" "}
          <strong className="text-slate-700 dark:text-slate-300">automaticamente</strong> ao vincular alvarás às empresas. Se apagou
          entradas ou precisa de manutenção em massa, use{" "}
          <strong className="text-slate-700 dark:text-slate-300">Configurações → Geração e manutenção</strong> no menu superior.
        </p>
      ) : null}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        <ClipboardList className="mb-0.5 inline h-3.5 w-3.5 align-text-bottom" /> Para <strong>concluir</strong> é
        necessário ter emissão no vínculo e o vencimento da tarefa (calculado ao registar a emissão). Use o ícone de
        edição para detalhes e histórico.
      </p>

      <TaskEditModal
        taskId={detailModal?.taskId ?? null}
        quadroColumn={detailModal?.column ?? null}
        open={detailModal != null}
        onClose={() => setDetailModal(null)}
        onSaved={() => void load({ silent: true })}
      />
    </div>
  );
}

function TaskCard({
  task,
  uiColumn,
  hoje,
  checklistRows,
  onChecklistToggle,
  onOpenDetail,
  onBaixa,
  onConcluir,
  onReabrir,
  onCancelar,
  onMoveToColumn,
}: {
  task: TaskRow;
  uiColumn: ColumnId;
  hoje: string;
  checklistRows: AlvaraTaskChecklistRow[];
  onChecklistToggle: (itemId: string, completed: boolean, comment?: string, attachmentUrl?: string) => void;
  onOpenDetail: () => void;
  onBaixa: () => void;
  onConcluir: () => void;
  onReabrir: () => void;
  onCancelar: () => void;
  onMoveToColumn: (target: ColumnId) => void;
}) {
  const ca = task.company_alvaras;
  const c = ca?.companies;
  const a = ca?.alvaras;
  const venc = getTaskStatusMeta(task, hoje);
  const atrasoInicio = taskAtrasoInicio(task, uiColumn, hoje);
  const atrasoVenc = taskAtrasoVencimento(task, hoje);
  const atrasada = atrasoInicio || atrasoVenc;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
            venc.className || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          {venc.text}
        </span>
        <div className="flex shrink-0 items-center gap-1 text-slate-400 dark:text-slate-500">
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Detalhes e histórico"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400"
            title="Cancelar tarefa"
            onClick={(e) => {
              e.stopPropagation();
              onCancelar();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-500" aria-hidden />
        </div>
      </div>

      <h3 className="mt-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
        {a?.name ?? "Tarefa de alvará"}
      </h3>

      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{companyLabel(c)}</span>
      </p>

      {c && (c.cnpj || c.numero_documento || c.codigo_empresa) ? (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
          {(c.cnpj || c.numero_documento) && (
            <span>
              CNPJ: {(() => {
                const raw = c.cnpj || c.numero_documento || "";
                return raw.length === 14 ? raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : raw;
              })()}
            </span>
          )}
          {c.codigo_empresa && (
            <span className="rounded bg-slate-100 px-1 py-0.2 text-[0.6rem] font-medium dark:bg-slate-800">
              Cód: {c.codigo_empresa}
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl bg-violet-50/60 px-2.5 py-2 text-[0.7rem] text-slate-700 dark:bg-violet-950/25 dark:text-slate-200">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
            Emissão: {formatDate(task.status === "concluida" ? (task.completed_at ? task.completed_at.slice(0, 10) : ca?.data_emissao) : (ca?.data_emissao ?? null), { empty: "—" })}
          </span>
          <span className={cn("flex items-center gap-1", atrasada && "font-semibold text-amber-800 dark:text-amber-300")}>
            <CalendarDays className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
            Validade: {formatDate(task.status === "concluida" ? (task.due_date ?? ca?.data_vencimento) : (ca?.data_vencimento ?? null), { empty: "—" })}
          </span>
        </div>
      </div>

      {task.protocolo && (
        <div className="mt-2.5 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2 py-1 text-[0.7rem] font-medium text-indigo-900 dark:border-indigo-950 dark:bg-indigo-950/20 dark:text-indigo-200 flex items-center gap-1">
          <FileSignature className="h-3 w-3 shrink-0 text-indigo-700 dark:text-indigo-400" />
          <span>Protocolo: {task.protocolo}</span>
        </div>
      )}

      <div className="mt-3 text-[0.7rem] text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-500 dark:text-slate-400">Responsável (empresa):</span>{" "}
        {(c?.responsible?.display_name ?? "").trim() || "—"}
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-slate-600 dark:text-slate-400">
        <UserCircle className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
        <span className="truncate">{task.notes?.slice(0, 80) || "Sem notas na tarefa"}</span>
      </div>
    </>
  );
}
