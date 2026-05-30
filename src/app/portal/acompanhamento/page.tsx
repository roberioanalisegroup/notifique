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
  Plus,
  SlidersHorizontal,
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

type UiLane = "pendente" | "andamento" | "impedimento";

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

type ColumnId = "pendente" | "andamento" | "concluido" | "impedimento" | "cancelada";

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
  {
    id: "impedimento",
    label: "Impedimento",
    icon: <XCircle className="h-4 w-4 text-rose-500" />,
    description: "Tarefas com algum bloqueio ou impedimento",
  },
  {
    id: "cancelada",
    label: "Canceladas",
    icon: <Trash2 className="h-4 w-4 text-slate-500" />,
    description: "Tarefas canceladas",
  },
];

function parseLaneMapJson(raw: string): Record<string, UiLane> {
  const p = JSON.parse(raw) as Record<string, string>;
  const out: Record<string, UiLane> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === "andamento") out[k] = "andamento";
    else if (v === "impedimento") out[k] = "impedimento";
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

  const caVenc = t.company_alvaras?.data_vencimento;
  if (caVenc && t.due_date && caVenc.slice(0, 10) <= t.due_date.slice(0, 10)) {
    return "Para concluir, é preciso atualizar as datas do vínculo no modal para as datas da nova renovação futura.";
  }

  return "Não é possível concluir esta tarefa.";
}

function taskPodeConcluir(t: TaskRow): boolean {
  const em = t.company_alvaras?.data_emissao;
  const hasEmissao = em != null && String(em).trim() !== "";
  const hasVencimentoTarefa = t.due_date != null && String(t.due_date).trim() !== "";
  if (!hasEmissao || !hasVencimentoTarefa) return false;

  const caVenc = t.company_alvaras?.data_vencimento;
  if (caVenc && t.due_date && caVenc.slice(0, 10) <= t.due_date.slice(0, 10)) {
    return false;
  }

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

export type FilterCondition = {
  id: string;
  field: "cidade" | "uf" | "codigo_empresa" | "frequencia" | "nome_alvara" | "protocolo" | "nome_empresa" | "atraso" | "etapa" | "status";
  operator: "equals" | "contains" | "starts_with" | "ends_with";
  value: string;
};

function matchesCondition(
  t: TaskRow,
  cond: FilterCondition,
  hoje: string,
  laneMap: Record<string, string>
): boolean {
  const lane = t.status === "cancelada" ? "cancelada" : (t.status === "concluida" ? "concluido" : (laneMap[t.id] ?? "pendente"));

  if (cond.field === "atraso") {
    const isAtrasada = taskAtrasoInicio(t, lane as any, hoje) || taskAtrasoVencimento(t, hoje);
    const valAtrasada = isAtrasada ? "sim" : "não";
    return valAtrasada === cond.value;
  }

  if (cond.field === "etapa") {
    const colLabels: Record<string, string> = {
      pendente: "pendente",
      andamento: "em andamento",
      concluido: "concluído",
      impedimento: "impedimento",
      cancelada: "canceladas"
    };
    const label = colLabels[lane] || lane;
    const nVal = label.trim().toLowerCase();
    const nCond = cond.value.trim().toLowerCase();
    if (cond.operator === "equals") return nVal === nCond;
    if (cond.operator === "contains") return nVal.includes(nCond);
    if (cond.operator === "starts_with") return nVal.startsWith(nCond);
    if (cond.operator === "ends_with") return nVal.endsWith(nCond);
    return false;
  }

  if (cond.field === "status") {
    const statusMeta = getTaskStatusMeta(t, hoje, lane as any);
    const label = statusMeta ? statusMeta.text : "";
    const nVal = label.trim().toLowerCase();
    const nCond = cond.value.trim().toLowerCase();
    if (cond.operator === "equals") return nVal === nCond;
    if (cond.operator === "contains") return nVal.includes(nCond);
    if (cond.operator === "starts_with") return nVal.startsWith(nCond);
    if (cond.operator === "ends_with") return nVal.endsWith(nCond);
    return false;
  }

  let val = "";
  if (cond.field === "cidade") val = t.company_alvaras?.companies?.municipio ?? "";
  else if (cond.field === "uf") val = t.company_alvaras?.companies?.uf ?? "";
  else if (cond.field === "codigo_empresa") val = t.company_alvaras?.companies?.codigo_empresa ?? "";
  else if (cond.field === "nome_empresa") {
    val = (t.company_alvaras?.companies?.razao_social ?? "") + " " + (t.company_alvaras?.companies?.nome_fantasia ?? "");
  }
  else if (cond.field === "nome_alvara") val = t.company_alvaras?.alvaras?.name ?? "";
  else if (cond.field === "frequencia") {
    val = t.company_alvaras?.frequencia_override ?? t.company_alvaras?.alvaras?.frequencia ?? "";
  }
  else if (cond.field === "protocolo") val = t.protocolo ?? "";

  const nVal = val.trim().toLowerCase();
  const nCond = cond.value.trim().toLowerCase();

  if (cond.operator === "equals") return nVal === nCond;
  if (cond.operator === "contains") return nVal.includes(nCond);
  if (cond.operator === "starts_with") return nVal.startsWith(nCond);
  if (cond.operator === "ends_with") return nVal.endsWith(nCond);
  return false;
}

export default function AcompanhamentoPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [checklistByTaskId, setChecklistByTaskId] = useState<Record<string, AlvaraTaskChecklistRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedYears, setSelectedYears] = useState<(number | "ocultos")[]>(() => [new Date().getFullYear()]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [logicalOperator, setLogicalOperator] = useState<"and" | "or">("and");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
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
  const [swimlaneMode, setSwimlaneMode] = useState<"nenhuma" | "empresa" | "responsavel">(() => {
    if (typeof window === "undefined") return "nenhuma";
    try {
      const s = localStorage.getItem("notifique-acompanhamento-swimlane");
      if (s === "empresa" || s === "responsavel") return s;
    } catch { /* ignore */ }
    return "nenhuma";
  });
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const s = localStorage.getItem("notifique-acompanhamento-collapsed-swimlanes");
      if (s) return JSON.parse(s);
    } catch { /* ignore */ }
    return {};
  });

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
    try {
      localStorage.setItem("notifique-acompanhamento-swimlane", swimlaneMode);
    } catch {
      /* ignore */
    }
  }, [swimlaneMode]);

  useEffect(() => {
    try {
      localStorage.setItem("notifique-acompanhamento-collapsed-swimlanes", JSON.stringify(collapsedSwimlanes));
    } catch {
      /* ignore */
    }
  }, [collapsedSwimlanes]);

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
      setTasks(d.tasks);
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
      // Filtros Personalizados Lógicos (E/OU)
      if (conditions.length > 0) {
        const results = conditions.map((cond) => matchesCondition(t, cond, hojeStr, laneMap));
        const matched = logicalOperator === "and"
          ? results.every((r) => r === true)
          : results.some((r) => r === true);
        if (!matched) return false;
      }
      return true;
    });
  }, [tasks, selectedCompanies, selectedAlvaraNames, selectedYears, hoje, conditions, logicalOperator]);

  const tasksByColumn = useMemo(() => {
    const pendente: TaskRow[] = [];
    const andamento: TaskRow[] = [];
    const concluido: TaskRow[] = [];
    const impedimento: TaskRow[] = [];
    const cancelada: TaskRow[] = [];

    for (const t of filteredTasks) {
      if (t.status === "cancelada") {
        cancelada.push(t);
        continue;
      }
      if (t.status === "concluida") {
        concluido.push(t);
        continue;
      }
      const lane = laneMap[t.id] ?? "pendente";
      if (lane === "andamento") {
        andamento.push(t);
      } else if (lane === "impedimento") {
        impedimento.push(t);
      } else {
        pendente.push(t);
      }
    }

    pendente.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    andamento.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    concluido.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
    impedimento.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    cancelada.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

    return { pendente, andamento, concluido, impedimento, cancelada };
  }, [filteredTasks, laneMap]);

  const swimlaneGroups = useMemo((): {
    id: string;
    label: string;
    tasksByColumn: {
      pendente: TaskRow[];
      andamento: TaskRow[];
      concluido: TaskRow[];
      impedimento: TaskRow[];
      cancelada: TaskRow[];
    };
  }[] => {
    if (swimlaneMode === "nenhuma") return [];

    const groupsMap = new Map<string, { label: string; tasks: TaskRow[] }>();

    for (const t of filteredTasks) {
      let groupId = "unassigned";
      let groupLabel = "Sem Responsável";

      if (swimlaneMode === "empresa") {
        const c = t.company_alvaras?.companies;
        groupId = c?.id || "unassigned";
        groupLabel = c ? (c.nome_fantasia || c.razao_social || "Empresa Sem Nome") : "Sem Empresa";
      } else if (swimlaneMode === "responsavel") {
        const resp = t.company_alvaras?.companies?.responsible;
        groupId = resp?.id || "unassigned";
        groupLabel = resp?.display_name || "Sem Responsável";
      }

      const existing = groupsMap.get(groupId);
      if (existing) {
        existing.tasks.push(t);
      } else {
        groupsMap.set(groupId, { label: groupLabel, tasks: [t] });
      }
    }

    const groupsList: {
      id: string;
      label: string;
      tasksByColumn: {
        pendente: TaskRow[];
        andamento: TaskRow[];
        concluido: TaskRow[];
        impedimento: TaskRow[];
        cancelada: TaskRow[];
      };
    }[] = [];

    groupsMap.forEach((val, id) => {
      const pendente: TaskRow[] = [];
      const andamento: TaskRow[] = [];
      const concluido: TaskRow[] = [];
      const impedimento: TaskRow[] = [];
      const cancelada: TaskRow[] = [];

      for (const t of val.tasks) {
        if (t.status === "cancelada") {
          cancelada.push(t);
          continue;
        }
        if (t.status === "concluida") {
          concluido.push(t);
          continue;
        }
        const lane = laneMap[t.id] ?? "pendente";
        if (lane === "andamento") {
          andamento.push(t);
        } else if (lane === "impedimento") {
          impedimento.push(t);
        } else {
          pendente.push(t);
        }
      }

      pendente.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
      andamento.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
      concluido.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      impedimento.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
      cancelada.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

      groupsList.push({
        id,
        label: val.label,
        tasksByColumn: { pendente, andamento, concluido, impedimento, cancelada }
      });
    });

    return groupsList.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [filteredTasks, laneMap, swimlaneMode]);

  const getTaskUiColumn = useCallback(
    (t: TaskRow): ColumnId => {
      if (t.status === "cancelada") return "cancelada";
      if (t.status === "concluida") return "concluido";
      const lane = laneMap[t.id] ?? "pendente";
      if (lane === "andamento") return "andamento";
      if (lane === "impedimento") return "impedimento";
      return "pendente";
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
    if (!confirm("Cancelar esta tarefa?")) return;
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
    setConditions([]);
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

    if (target === "cancelada") {
      if (task.status === "cancelada") return;
      await cancelarTarefa(task);
      return;
    }

    if (task.status === "concluida" || task.status === "cancelada") {
      await reabrir(task);
      const lane: UiLane = target === "andamento" ? "andamento" : target === "impedimento" ? "impedimento" : "pendente";
      const next: Record<string, UiLane> = { ...laneMap, [task.id]: lane };
      persistLanes(next);
      return;
    }

    const lane: UiLane = target === "andamento" ? "andamento" : target === "impedimento" ? "impedimento" : "pendente";
    const next: Record<string, UiLane> = { ...laneMap, [task.id]: lane };
    persistLanes(next);
    toast.message(
      target === "andamento" 
        ? "Movido para Em andamento" 
        : target === "impedimento" 
          ? "Movido para Impedimento" 
          : "Movido para Pendente"
    );
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

            {viewMode === "kanban" && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2 py-0.5 shadow-sm dark:border-slate-600/90 dark:bg-slate-800/90">
                <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pl-1">Raias:</span>
                <select
                  value={swimlaneMode}
                  onChange={(e) => setSwimlaneMode(e.target.value as any)}
                  className="bg-transparent text-xs font-semibold py-1.5 pr-8 pl-1 border-none focus:outline-none focus:ring-0 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="nenhuma" className="dark:bg-slate-850">Nenhuma</option>
                  <option value="empresa" className="dark:bg-slate-850">Por Empresa</option>
                  <option value="responsavel" className="dark:bg-slate-850">Por Responsável</option>
                </select>
              </div>
            )}

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
            Vencimento
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
            Tarefas
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
          onClick={() => setAdvancedFiltersOpen((o) => !o)}
          className={cn(
            "btn-secondary inline-flex items-center gap-2 self-end",
            advancedFiltersOpen && "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros Avançados
        </button>

        <button
          type="button"
          onClick={clearFilters}
          className="btn-secondary inline-flex items-center gap-2 self-end"
        >
          <Eraser className="h-4 w-4" />
          Limpar filtros
        </button>
        </div>

        {/* Painel de Filtros Avançados / Query Builder */}
        {advancedFiltersOpen && (
          <div className="card-portal mt-4 border border-emerald-100 bg-emerald-50/10 dark:border-emerald-900/20 dark:bg-slate-900/30 p-5 space-y-4 rounded-2xl shadow-sm transition-all duration-300">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
                  Pesquisa Personalizada Lógica
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Combine regras personalizadas das empresas, alvarás e tarefas.</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Satisfazer:</span>
                <select
                  className="select-field text-xs py-1 px-2.5 max-w-[12rem] bg-white border border-slate-200"
                  value={logicalOperator}
                  onChange={(e) => setLogicalOperator(e.target.value as "and" | "or")}
                >
                  <option value="and">TODAS as condições (E)</option>
                  <option value="or">QUALQUER uma (OU)</option>
                </select>
              </div>
            </div>

            {conditions.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2 border-t border-slate-100 dark:border-slate-800">
                Nenhuma condição lógica ativa. Adicione regras abaixo para refinar sua busca.
              </p>
            ) : (
              <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                {conditions.map((cond, idx) => (
                  <div key={cond.id} className="flex flex-wrap items-center gap-3 bg-white/40 dark:bg-slate-900/10 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800/40">
                    <span className="text-xs text-slate-400 font-semibold tabular-nums w-4">
                      #{idx + 1}
                    </span>

                    <select
                      className="select-field text-xs py-1 px-2 bg-white"
                      value={cond.field}
                      onChange={(e) => {
                        const nextField = e.target.value as FilterCondition["field"];
                        let nextValue = "";
                        if (nextField === "atraso") nextValue = "sim";
                        else if (nextField === "etapa") nextValue = "pendente";
                        else if (nextField === "status") nextValue = "Pendente - Vencida";
                        setConditions((prev) =>
                          prev.map((c) => (c.id === cond.id ? { ...c, field: nextField, value: nextValue } : c))
                        );
                      }}
                    >
                      <option value="cidade">Empresa: Cidade</option>
                      <option value="uf">Empresa: UF</option>
                      <option value="codigo_empresa">Empresa: Código</option>
                      <option value="nome_empresa">Empresa: Nome (Razão/Fantasia)</option>
                      <option value="nome_alvara">Alvará: Nome / Tipo</option>
                      <option value="frequencia">Alvará: Frequência</option>
                      <option value="protocolo">Tarefa: Protocolo</option>
                      <option value="atraso">Tarefa: Em Atraso</option>
                      <option value="etapa">Tarefa: Etapa (Coluna)</option>
                      <option value="status">Tarefa: Status Dinâmico</option>
                    </select>

                    {cond.field === "atraso" ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold px-2">
                        é igual a
                      </span>
                    ) : (
                      <select
                        className="select-field text-xs py-1 px-2 bg-white"
                        value={cond.operator}
                        onChange={(e) => {
                          const nextOp = e.target.value as FilterCondition["operator"];
                          setConditions((prev) =>
                            prev.map((c) => (c.id === cond.id ? { ...c, operator: nextOp } : c))
                          );
                        }}
                      >
                        <option value="contains">Contém</option>
                        <option value="equals">Igual a</option>
                        <option value="starts_with">Começa com</option>
                        <option value="ends_with">Termina com</option>
                      </select>
                    )}

                    {cond.field === "atraso" ? (
                      <select
                        className="select-field text-xs py-1 px-2.5 bg-white flex-1 min-w-[120px]"
                        value={cond.value}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setConditions((prev) =>
                            prev.map((c) => (c.id === cond.id ? { ...c, value: nextVal } : c))
                          );
                        }}
                      >
                        <option value="sim">Sim (Atrasado)</option>
                        <option value="não">Não (No Prazo)</option>
                      </select>
                    ) : cond.field === "etapa" ? (
                      <select
                        className="select-field text-xs py-1 px-2.5 bg-white flex-1 min-w-[120px]"
                        value={cond.value}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setConditions((prev) =>
                            prev.map((c) => (c.id === cond.id ? { ...c, value: nextVal } : c))
                          );
                        }}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="em andamento">Em andamento</option>
                        <option value="concluído">Concluído</option>
                        <option value="impedimento">Impedimento</option>
                        <option value="canceladas">Canceladas</option>
                      </select>
                    ) : cond.field === "status" ? (
                      <select
                        className="select-field text-xs py-1 px-2.5 bg-white flex-1 min-w-[120px]"
                        value={cond.value}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setConditions((prev) =>
                            prev.map((c) => (c.id === cond.id ? { ...c, value: nextVal } : c))
                          );
                        }}
                      >
                        <option value="Pendente - Vencida">Pendente - Vencida</option>
                        <option value="Pendente - Vence em">Pendente - Vence em X dias</option>
                        <option value="Pendente - Não definida">Pendente - Não definida</option>
                        <option value="Válido até">Válido até DD/MM/AAAA</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Em Andamento - Vencido">Em Andamento - Vencido</option>
                        <option value="Com Impedimento">Com Impedimento</option>
                        <option value="Com Impedimento - Vencido">Com Impedimento - Vencido</option>
                        <option value="Concluída">Concluída</option>
                        <option value="Concluído - Vencido">Concluído - Vencido</option>
                        <option value="Cancelada">Cancelada</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="input-field text-xs py-1 px-3 flex-1 min-w-[120px]"
                        value={cond.value}
                        placeholder={
                          cond.field === "frequencia"
                            ? "Ex: anual, mensal, personalizada..."
                            : cond.field === "uf"
                              ? "Ex: SP, RJ, MG..."
                              : "Digite o valor da busca..."
                        }
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setConditions((prev) =>
                            prev.map((c) => (c.id === cond.id ? { ...c, value: nextVal } : c))
                          );
                        }}
                      />
                    )}

                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded transition hover:bg-red-50 dark:hover:bg-red-950/20"
                      title="Excluir regra"
                      onClick={() => {
                        setConditions((prev) => prev.filter((c) => c.id !== cond.id));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 border-none text-white shadow-sm"
                onClick={() => {
                  setConditions((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9),
                      field: "cidade",
                      operator: "contains",
                      value: "",
                    },
                  ]);
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar regra
              </button>

              {conditions.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1 text-xs py-1.5 px-3 text-red-600 hover:bg-red-50 border-red-200 dark:text-red-400 dark:hover:bg-red-950/10 dark:border-red-900/30"
                  onClick={() => setConditions([])}
                >
                  <Eraser className="h-4 w-4" />
                  Limpar regras
                </button>
              )}
            </div>
          </div>
        )}
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
      ) : swimlaneMode !== "nenhuma" ? (
        <div className="relative z-0 -mx-1 flex flex-col gap-6 overflow-x-auto pb-4">
          {/* Cabeçalho Fixo das Colunas (Apenas quando há raias ativas) */}
          <div className="flex min-w-[1800px] gap-5 px-1 pb-1">
            {COLUMNS.map((col) => (
              <div key={col.id} className="flex-1 min-w-[360px] px-3">
                <div className="flex items-center justify-between">
                  <h2
                    className={cn(
                      "flex items-center gap-2 text-sm font-bold uppercase tracking-wider",
                      col.id === "concluido" && "text-emerald-800 dark:text-emerald-300",
                      col.id === "andamento" && "text-amber-800 dark:text-amber-300",
                      col.id === "pendente" && "text-red-800 dark:text-red-300",
                      col.id === "impedimento" && "text-rose-800 dark:text-rose-300",
                      col.id === "cancelada" && "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    {col.icon}
                    <span>{col.label}</span>
                  </h2>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                      col.id === "concluido" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                      col.id === "andamento" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                      col.id === "pendente" && "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
                      col.id === "impedimento" && "bg-rose-100 text-rose-850 dark:bg-rose-950/50 dark:text-rose-300",
                      col.id === "cancelada" && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    )}
                  >
                    {col.id === "pendente"
                      ? swimlaneGroups.reduce((acc, g) => acc + g.tasksByColumn.pendente.length, 0)
                      : col.id === "andamento"
                        ? swimlaneGroups.reduce((acc, g) => acc + g.tasksByColumn.andamento.length, 0)
                        : col.id === "concluido"
                          ? swimlaneGroups.reduce((acc, g) => acc + g.tasksByColumn.concluido.length, 0)
                          : col.id === "impedimento"
                            ? swimlaneGroups.reduce((acc, g) => acc + g.tasksByColumn.impedimento.length, 0)
                            : swimlaneGroups.reduce((acc, g) => acc + g.tasksByColumn.cancelada.length, 0)}
                  </span>
                </div>
                <p className="mt-1 text-[0.68rem] text-slate-500 dark:text-slate-400 leading-tight">
                  {col.description}
                </p>
              </div>
            ))}
          </div>

          {/* Renderização das Raias */}
          {swimlaneGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-500">
              Nenhuma raia encontrada com estes filtros.
            </p>
          ) : (
            swimlaneGroups.map((group) => {
              const isCollapsed = !!collapsedSwimlanes[group.id];
              const totalTasksInGroup =
                group.tasksByColumn.pendente.length +
                group.tasksByColumn.andamento.length +
                group.tasksByColumn.concluido.length +
                group.tasksByColumn.impedimento.length +
                group.tasksByColumn.cancelada.length;

              return (
                <div key={group.id} className="flex min-w-[1800px] flex-col rounded-2xl border border-slate-200/60 bg-white/40 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/10 overflow-hidden">
                  {/* Cabeçalho da Raia (Swimlane Bar) */}
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedSwimlanes((prev) => ({
                        ...prev,
                        [group.id]: !prev[group.id],
                      }));
                    }}
                    className="flex w-full items-center justify-between bg-slate-50/90 dark:bg-slate-800/80 px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-100/90 dark:hover:bg-slate-800/95 transition"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={cn("h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200", isCollapsed && "-rotate-90")}
                      />
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {swimlaneMode === "empresa" ? `🏢 Empresa: ${group.label}` : `👤 Responsável: ${group.label}`}
                      </span>
                      <span className="rounded-full bg-slate-200/85 dark:bg-slate-700 px-2.5 py-0.5 text-2xs font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                        {totalTasksInGroup} {totalTasksInGroup === 1 ? "tarefa" : "tarefas"}
                      </span>
                    </div>
                  </button>

                  {/* Colunas dentro da Raia */}
                  {!isCollapsed && (
                    <div className="flex gap-5 p-3 bg-slate-50/20 dark:bg-slate-900/5 transition-all">
                      {COLUMNS.map((col) => {
                        const list =
                          col.id === "pendente"
                            ? group.tasksByColumn.pendente
                            : col.id === "andamento"
                              ? group.tasksByColumn.andamento
                              : col.id === "concluido"
                                ? group.tasksByColumn.concluido
                                : col.id === "impedimento"
                                  ? group.tasksByColumn.impedimento
                                  : group.tasksByColumn.cancelada;

                        return (
                          <div
                            key={col.id}
                            className="flex-1 min-h-[160px] min-w-[360px] flex flex-col rounded-xl border border-slate-100 bg-white/80 p-2 dark:border-slate-800/40 dark:bg-slate-800/50"
                            onDragOver={onDragOver}
                            onDrop={(e) => void onDropColumn(e, col.id)}
                          >
                            <div className="flex flex-col gap-3 min-h-[120px]">
                              {list.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-200/40 bg-white/20 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700/30 dark:bg-slate-900/10 dark:text-slate-600 select-none">
                                  Arraste para cá
                                </div>
                              ) : (
                                list.map((t) => (
                                  <article
                                    key={t.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, t.id)}
                                    onDragEnd={onDragEnd}
                                    onClick={() => onOpenTaskDetail(t.id, col.id)}
                                    className={cn(
                                      "group cursor-pointer rounded-2xl bg-white p-4 shadow-sm transition-all duration-150 hover:shadow-md dark:bg-slate-850 dark:shadow-black/20 border border-slate-100 dark:border-slate-700/80 hover:border-slate-200/90 dark:hover:border-slate-600/90",
                                      col.id === "concluido" &&
                                        "border-4 border-emerald-500/60 shadow-emerald-50 hover:shadow-emerald-100 dark:border-emerald-500/50 dark:shadow-emerald-950/30",
                                      col.id === "andamento" &&
                                        "border-2 border-amber-500/60 shadow-amber-50 hover:shadow-amber-100 dark:border-amber-500/50 dark:shadow-amber-950/20",
                                      col.id === "impedimento" &&
                                        "border-2 border-rose-500/60 shadow-rose-50 hover:shadow-rose-100 dark:border-rose-500/50 dark:shadow-rose-950/20",
                                      col.id === "cancelada" &&
                                        "border border-slate-200 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-900/30 opacity-75 hover:opacity-100",
                                      col.id === "pendente" && "shadow-sm",
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="relative z-0 -mx-1 flex flex-col gap-5 overflow-x-auto pb-4 md:flex-row md:items-start">
          {COLUMNS.map((col) => {
            const list =
              col.id === "pendente"
                ? tasksByColumn.pendente
                : col.id === "andamento"
                  ? tasksByColumn.andamento
                  : col.id === "concluido"
                    ? tasksByColumn.concluido
                    : col.id === "impedimento"
                      ? tasksByColumn.impedimento
                      : tasksByColumn.cancelada;

            return (
              <section
                key={col.id}
                className="flex min-h-[420px] min-w-[min(100%,380px)] flex-1 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3 shadow-sm dark:border-slate-700/90 dark:bg-slate-900/50 md:min-w-[360px]"
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
                        col.id === "pendente" && "text-red-800 dark:text-red-300",
                        col.id === "impedimento" && "text-rose-800 dark:text-rose-300",
                        col.id === "cancelada" && "text-slate-600 dark:text-slate-400"
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
                      col.id === "pendente" && "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
                      col.id === "impedimento" && "bg-rose-100 text-rose-850 dark:bg-rose-950/50 dark:text-rose-300",
                      col.id === "cancelada" && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
                        onClick={() => onOpenTaskDetail(t.id, col.id)}
                        className={cn(
                          "group cursor-pointer rounded-2xl bg-white p-4 shadow-sm transition-all duration-150 hover:shadow-md dark:bg-slate-800/90 dark:shadow-black/20 border border-slate-100 dark:border-slate-700/80 hover:border-slate-200/90 dark:hover:border-slate-600/90",
                          col.id === "concluido" &&
                            "border-4 border-emerald-500/60 shadow-emerald-50 hover:shadow-emerald-100 dark:border-emerald-500/50 dark:shadow-emerald-950/30",
                          col.id === "andamento" &&
                            "border-2 border-amber-500/60 shadow-amber-50 hover:shadow-amber-100 dark:border-amber-500/50 dark:shadow-amber-950/20",
                          col.id === "impedimento" &&
                            "border-2 border-rose-500/60 shadow-rose-50 hover:shadow-rose-100 dark:border-rose-500/50 dark:shadow-rose-950/20",
                          col.id === "cancelada" &&
                            "border border-slate-200 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-900/30 opacity-75 hover:opacity-100",
                          col.id === "pendente" && "shadow-sm",
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
  const venc = getTaskStatusMeta(task, hoje, uiColumn);
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
        <div 
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1 text-slate-400 dark:text-slate-500"
        >
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
