"use client";

import { apiJson } from "@/lib/api-client";
import { formatDate, getTaskStatusMeta, cn, formatCNPJ } from "@/lib/utils";
import {
  Building2,
  CheckCircle,
  RefreshCw,
  FileStack,
  AlertTriangle,
  Bell,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  MapPin,
  TrendingUp,
  Award,
  ShieldCheck,
  Briefcase,
  Layers,
  Infinity as InfinityIcon,
  ChevronDown,
  ShieldAlert,
  Maximize2,
  Search,
  Filter,
  X,
  CalendarDays,
  Sliders,
  GripVertical
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import type { AlvaraTaskChecklistRow } from "@/types";

type Throughput = {
  total: number;
  completed: number;
  rate: number;
};

type TaskStatusCounts = {
  pendente: number;
  concluida: number;
  cancelada: number;
};

type Expirations = {
  30: number;
  60: number;
  90: number;
};

type Kpis = {
  totalEmpresas: number;
  regularCompaniesCount: number;
  complianceRate: number;
  syncPendentes: number;
  totalAlvaras: number;
  alvarasVencidos: number;
  indefiniteValidityCount: number;
  documentCoverageRate: number;
  scoreRegularidade: number;
  throughput: Throughput;
  taskStatusCounts: TaskStatusCounts;
  expirations: Expirations;
};

type SyncLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  total: number;
  success: number;
  errors: number;
  skipped: number;
  triggered_by: string;
};

type CriticalCompany = {
  id: string;
  name: string;
  vencidos: number;
};

type Workload = {
  id: string;
  name: string;
  count: number;
};

type UfDistribution = {
  uf: string;
  count: number;
};

type SazonalHistory = {
  label: string;
  created: number;
  completed: number;
};

type AlvaraCategoria = {
  name: string;
  color: string;
  count: number;
};

type ActiveTask = {
  id: string;
  created_at: string;
  title: string | null;
  status: "pendente" | "concluida" | "cancelada";
  notes: string | null;
  completed_at: string | null;
  due_date: string | null;
  inicio_obrigatorio_ate: string | null;
  company_alvaras: {
    id: string;
    data_vencimento: string | null;
    companies: {
      id: string;
      cnpj: string;
      razao_social: string | null;
      nome_fantasia: string | null;
      responsible: { id: string; display_name: string | null } | null;
    } | null;
    alvaras: { id: string; name: string } | null;
  } | null;
};

type VencendoAlvara = {
  id: string;
  numero: string | null;
  data_vencimento: string | null;
  companies: { cnpj: string; razao_social: string | null } | null;
  alvaras: { name: string } | null;
};

type CompanySummaryRow = {
  id: string;
  cnpj: string | null;
  uf: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  responsible_user_id: string | null;
  alvaras_vencidos: number;
  alvaras_emitidos: number;
  alvaras_pendentes: number;
  total_alvaras: number;
  alvaras_notificados: number;
};

// --- CLIENT-SIDE EXPORT HELPERS ---
function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(";"),
    ...rows.map(row => row.map(val => {
      const cell = val === null || val === undefined ? "" : String(val);
      if (cell.includes(";") || cell.includes('"') || cell.includes("\n")) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(";"))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadSVG(svgId: string, filename: string) {
  const svgEl = document.getElementById(svgId);
  if (!svgEl) {
    toast.error("Gráfico não encontrado para exportação.");
    return;
  }
  const svgCopy = svgEl.cloneNode(true) as SVGElement;
  svgCopy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  
  // Apply standard layout styles in copy for beautiful viewing standalone
  svgCopy.setAttribute("style", "background-color: #0c152b; font-family: ui-sans-serif, system-ui, sans-serif; color: #ffffff; padding: 10px; border-radius: 12px;");
  
  const svgString = new XMLSerializer().serializeToString(svgCopy);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.svg`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [topCritical, setTopCritical] = useState<CriticalCompany[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [ufDist, setUfDist] = useState<UfDistribution[]>([]);
  const [history, setHistory] = useState<SazonalHistory[]>([]);
  const [vencendo, setVencendo] = useState<VencendoAlvara[]>([]);
  
  // New States
  const [alvarasPorCategoria, setAlvarasPorCategoria] = useState<AlvaraCategoria[]>([]);
  const [impededTasks, setImpededTasks] = useState<ActiveTask[]>([]);
  
  // States for detailed status modal
  const [allTasks, setAllTasks] = useState<ActiveTask[]>([]);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [checklistByTaskId, setChecklistByTaskId] = useState<Record<string, AlvaraTaskChecklistRow[]>>({});
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // States for detailed compliance modal
  const [companiesSummary, setCompaniesSummary] = useState<CompanySummaryRow[]>([]);
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
  const [complianceSearchTerm, setComplianceSearchTerm] = useState("");
  const [complianceStatusFilter, setComplianceStatusFilter] = useState("all");
  const [complianceUfFilter, setComplianceUfFilter] = useState("all");

  // Filters inside status modal
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalStatusFilters, setModalStatusFilters] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [modalResponsibleFilter, setModalResponsibleFilter] = useState("all");
  const [modalDateFilter, setModalDateFilter] = useState("all");
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalEndDate, setModalEndDate] = useState("");

  // Layout Customization States
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const defaultWidgetOrder = [
    "compliance",
    "critical",
    "projection",
    "backlog",
    "workload",
    "status",
    "impediments",
    "audit",
    "flow",
    "geography"
  ];
  const [widgetOrder, setWidgetOrder] = useState<string[]>(defaultWidgetOrder);
  const [visibleWidgets, setVisibleWidgets] = useState<Record<string, boolean>>({
    compliance: true,
    critical: true,
    projection: true,
    backlog: true,
    workload: true,
    status: true,
    impediments: true,
    audit: true,
    flow: true,
    geography: true
  });
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [backupOrder, setBackupOrder] = useState<string[]>([]);
  const [backupVisibility, setBackupVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedOrder = localStorage.getItem("notifique-dashboard-widget-order");
        if (savedOrder) {
          setWidgetOrder(JSON.parse(savedOrder));
        }
        const savedVisibility = localStorage.getItem("notifique-dashboard-visible-widgets");
        if (savedVisibility) {
          setVisibleWidgets(JSON.parse(savedVisibility));
        }
      } catch (e) {
        console.error("Erro ao carregar layout do dashboard:", e);
      }
    }
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const fetchModalChecklists = async (tasksList: ActiveTask[]) => {
    if (tasksList.length === 0) return;
    setLoadingChecklist(true);
    try {
      const taskIds = tasksList.map(t => t.id);
      const d = await apiJson<{ by_task: Record<string, AlvaraTaskChecklistRow[]> }>(
        "/api/alvara-tasks/checklist-batch",
        { method: "POST", body: JSON.stringify({ task_ids: taskIds }) }
      );
      setChecklistByTaskId(d.by_task ?? {});
    } catch (e) {
      console.error("Erro ao carregar checklists do modal:", e);
    } finally {
      setLoadingChecklist(false);
    }
  };

  const handleOpenStatusModal = () => {
    setIsStatusModalOpen(true);
    void fetchModalChecklists(allTasks);
  };
  
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [statsData, logsData] = await Promise.all([
          apiJson<{
            kpis: Kpis;
            topCriticalCompanies: CriticalCompany[];
            workloadByResponsible: Workload[];
            ufDistribution: UfDistribution[];
            sazonalHistory: SazonalHistory[];
            alvarasPorCategoria: AlvaraCategoria[];
            activeTasks: ActiveTask[];
            vencendoProx30Dias: VencendoAlvara[];
            companiesSummary: CompanySummaryRow[];
          }>("/api/stats"),
          apiJson<{ logs: SyncLog[] }>("/api/sync-logs?limit=5"),
        ]);
        if (!active) return;
        setKpis(statsData.kpis);
        setTopCritical(statsData.topCriticalCompanies);
        setWorkload(statsData.workloadByResponsible);
        setUfDist(statsData.ufDistribution);
        setHistory(statsData.sazonalHistory);
        setCompaniesSummary(statsData.companiesSummary || []);
        
        // Filter tasks in 'impedimento' lane on client-side and compute phase distribution
        let localLanes: Record<string, string> = {};
        try {
          const saved = localStorage.getItem("notifique-acompanhamento-lanes");
          if (saved) localLanes = JSON.parse(saved);
        } catch {
          // ignore
        }

        const hojeStr = new Date().toISOString().slice(0, 10);
        const isTaskOculta = (t: ActiveTask): boolean => {
          if (t.status !== "pendente") return false;
          if (!t.due_date || String(t.due_date).trim() === "") return false;
          const diffTime = new Date(t.due_date).getTime() - new Date(hojeStr).getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays > 90;
        };

        const rawTasks = statsData.activeTasks || [];
        const allTasks = rawTasks.filter(t => !isTaskOculta(t));
        setAllTasks(allTasks);
        const blocked = allTasks.filter(t => localLanes[t.id] === "impedimento");
        setImpededTasks(blocked);

        // Compute status distribution: Pendente, Em Andamento, Com Impedimento, Concluído
        let countPendente = 0;
        let countAndamento = 0;
        let countImpedimento = 0;
        let countConcluido = 0;

        allTasks.forEach(t => {
          if (t.status === "concluida") {
            countConcluido++;
          } else {
            const lane = localLanes[t.id] || "pendente";
            if (lane === "andamento") {
              countAndamento++;
            } else if (lane === "impedimento") {
              countImpedimento++;
            } else {
              countPendente++;
            }
          }
        });

        setAlvarasPorCategoria([
          { name: "Pendente", color: "#6366f1", count: countPendente },
          { name: "Em Andamento", color: "#3b82f6", count: countAndamento },
          { name: "Com Impedimento", color: "#f43f5e", count: countImpedimento },
          { name: "Concluído", color: "#10b981", count: countConcluido }
        ]);

        setVencendo(statsData.vencendoProx30Dias);
        setLogs(logsData.logs);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar o dashboard");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadData();

    const handleClickOutside = (event: MouseEvent) => {
      if (activeMenu) {
        const ref = menuRefs.current[activeMenu];
        if (ref && !ref.contains(event.target as Node)) {
          setActiveMenu(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      active = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeMenu]);

  // --- COMPLIANCE DETAILS MODAL LOGIC (Hooks called unconditionally before early return) ---
  const filteredCompanies = useMemo(() => {
    return companiesSummary.filter(c => {
      // Search term
      if (complianceSearchTerm.trim() !== "") {
        const term = complianceSearchTerm.toLowerCase();
        const nameMatch = (c.nome_fantasia || "").toLowerCase().includes(term) ||
                          (c.razao_social || "").toLowerCase().includes(term) ||
                          (c.cnpj || "").includes(term) ||
                          (c.id || "").includes(term);
        if (!nameMatch) return false;
      }

      // Status filter
      if (complianceStatusFilter !== "all") {
        const isRegular = c.total_alvaras > 0 && c.alvaras_vencidos === 0;
        const isCritical = c.alvaras_vencidos > 0;
        const isUnmonitored = c.total_alvaras === 0;

        if (complianceStatusFilter === "regular" && !isRegular) return false;
        if (complianceStatusFilter === "critical" && !isCritical) return false;
        if (complianceStatusFilter === "unmonitored" && !isUnmonitored) return false;
      }

      // UF filter
      if (complianceUfFilter !== "all") {
        if (c.uf !== complianceUfFilter) return false;
      }

      return true;
    });
  }, [companiesSummary, complianceSearchTerm, complianceStatusFilter, complianceUfFilter]);

  const uniqueUfs = useMemo(() => {
    const ufs = companiesSummary
      .map(c => c.uf)
      .filter((uf): uf is string => uf !== null && uf !== undefined && uf.trim() !== "");
    return Array.from(new Set(ufs)).sort();
  }, [companiesSummary]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-500 dark:text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-500" />
          <span className="text-sm font-medium tracking-wide">Carregando painel de indicadores...</span>
        </div>
      </div>
    );
  }

  // --- STATS EXPORT HANDLERS ---
  const handleExportCSV = (id: string) => {
    setActiveMenu(null);
    if (!kpis) return;

    if (id === "compliance") {
      const headers = ["Empresa Regular", "Total Empresas", "Indice de Conformidade (%)"];
      const rows = [[kpis.regularCompaniesCount, kpis.totalEmpresas, kpis.complianceRate.toFixed(2)]];
      downloadCSV("indice-de-conformidade-geral", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "top-critical") {
      const headers = ["Nome da Empresa", "Alvaras Vencidos"];
      const rows = topCritical.map(c => [c.name, c.vencidos]);
      downloadCSV("empresas-criticas", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "alerts") {
      const headers = ["Periodo", "Alvaras a Vencer"];
      const rows = [
        ["A vencer em 30 dias", kpis.expirations[30]],
        ["A vencer em 60 dias", kpis.expirations[60]],
        ["A vencer em 90 dias", kpis.expirations[90]]
      ];
      downloadCSV("alvaras-a-vencer-projecao", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "tasks") {
      const headers = ["Status da Tarefa", "Quantidade"];
      const rows = [
        ["Pendentes", kpis.taskStatusCounts.pendente],
        ["Concluidas", kpis.taskStatusCounts.concluida],
        ["Canceladas", kpis.taskStatusCounts.cancelada]
      ];
      downloadCSV("distribuicao-backlog-tarefas", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "workload") {
      const headers = ["Responsavel", "Empresas Vinculadas"];
      const rows = workload.map(w => [w.name, w.count]);
      downloadCSV("carga-de-trabalho-por-responsavel", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "categories") {
      const headers = ["Status (Fase)", "Total de Alvaras"];
      const rows = alvarasPorCategoria.map(c => [c.name, c.count]);
      downloadCSV("alvaras-por-status", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "impeded") {
      const headers = ["ID Tarefa", "Titulo", "Empresa", "Alvara"];
      const rows = impededTasks.map(t => [
        t.id,
        t.title || "Sem titulo",
        t.company_alvaras?.companies?.nome_fantasia || t.company_alvaras?.companies?.razao_social || "Sem empresa",
        t.company_alvaras?.alvaras?.name || "Sem alvara"
      ]);
      downloadCSV("alvaras-com-impedimentos", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "geographic") {
      const headers = ["Estado (UF)", "Total de Alvaras"];
      const rows = ufDist.map(u => [u.uf, u.count]);
      downloadCSV("concentracao-geografica-uf", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "sazonal") {
      const headers = ["Mes/Ano", "Novos Processos (Criados)", "Processos Concluidos"];
      const rows = history.map(h => [h.label, h.created, h.completed]);
      downloadCSV("historico-entrada-saida-mensal", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "indefinite") {
      const headers = ["KPI", "Quantidade"];
      const rows = [["Alvaras com Validade Indeterminada", kpis.indefiniteValidityCount]];
      downloadCSV("alvaras-validade-indeterminada", headers, rows);
      toast.success("Dados exportados!");
    } else if (id === "document-coverage") {
      const headers = ["KPI", "Taxa de Cobertura Documental (%)"];
      const rows = [["Taxa de Uploads PDF", kpis.documentCoverageRate.toFixed(2)]];
      downloadCSV("cobertura-documental-uploads", headers, rows);
      toast.success("Dados exportados!");
    }
  };

  const handleExportSVG = (id: string, filename: string) => {
    setActiveMenu(null);
    downloadSVG(id, filename);
    toast.success("Gráfico exportado!");
  };

  // Layout drag & drop handlers and customization actions
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData("text/plain", key);
    setDraggedKey(key);
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (draggedKey && draggedKey !== targetKey) {
      setWidgetOrder((prev) => {
        const fromIndex = prev.indexOf(draggedKey);
        const toIndex = prev.indexOf(targetKey);
        const next = [...prev];
        next.splice(fromIndex, 1);
        next.splice(toIndex, 0, draggedKey);
        return next;
      });
    }
  };

  const handleDragEnd = () => {
    setDraggedKey(null);
  };

  const toggleWidgetVisibility = (key: string) => {
    setVisibleWidgets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const startEditingLayout = () => {
    setBackupOrder([...widgetOrder]);
    setBackupVisibility({ ...visibleWidgets });
    setIsEditingLayout(true);
    toast.info("Modo de edição do painel ativado! Arraste os cards para ordenar ou use as chaves no topo para exibir/ocultar.");
  };

  const saveLayout = () => {
    try {
      localStorage.setItem("notifique-dashboard-widget-order", JSON.stringify(widgetOrder));
      localStorage.setItem("notifique-dashboard-visible-widgets", JSON.stringify(visibleWidgets));
      setIsEditingLayout(false);
      toast.success("Layout do painel salvo com sucesso!");
    } catch (e) {
      toast.error("Falha ao salvar layout.");
    }
  };

  const cancelLayoutEdit = () => {
    setWidgetOrder(backupOrder);
    setVisibleWidgets(backupVisibility);
    setIsEditingLayout(false);
    toast.info("Alterações de layout canceladas.");
  };

  const resetLayoutToDefault = () => {
    const defaultVisibility = {
      compliance: true,
      critical: true,
      projection: true,
      backlog: true,
      workload: true,
      status: true,
      impediments: true,
      audit: true,
      flow: true,
      geography: true
    };
    setWidgetOrder(defaultWidgetOrder);
    setVisibleWidgets(defaultVisibility);
    try {
      localStorage.removeItem("notifique-dashboard-widget-order");
      localStorage.removeItem("notifique-dashboard-visible-widgets");
      setIsEditingLayout(false);
      toast.success("Layout do painel restaurado para o padrão original!");
    } catch (e) {
      toast.error("Falha ao restaurar layout padrão.");
    }
  };

  // Lane logic (from localStorage):
  let localLanes: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("notifique-acompanhamento-lanes");
      if (saved) localLanes = JSON.parse(saved);
    } catch {
      // ignore
    }
  }

  const getTaskStatusLabel = (t: ActiveTask) => {
    const lane = localLanes[t.id] || "pendente";
    const hoje = new Date().toISOString().slice(0, 10);
    const adaptedTask = {
      ...t,
      company_alvaras: t.company_alvaras ? {
        ...t.company_alvaras,
        alvaras: t.company_alvaras.alvaras ? {
          ...t.company_alvaras.alvaras,
          alvara_groups: null
        } : null
      } : null
    } as any;
    const meta = getTaskStatusMeta(adaptedTask, hoje, lane);
    return meta ? meta.text : "Pendente - Não definida";
  };

  const filteredTasks = allTasks.filter(t => {
    const company = t.company_alvaras?.companies;
    const alvara = t.company_alvaras?.alvaras;
    const statusLabel = getTaskStatusLabel(t);

    const matchesSearch =
      modalSearchTerm.trim() === "" ||
      (company?.nome_fantasia || "").toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
      (company?.razao_social || "").toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
      (company?.cnpj || "").includes(modalSearchTerm) ||
      (alvara?.name || "").toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
      (t.title || "").toLowerCase().includes(modalSearchTerm.toLowerCase());

    const matchesStatus =
      modalStatusFilters.length === 0 ||
      modalStatusFilters.includes("all") ||
      modalStatusFilters.some(filter => {
        if (filter === "Pendente - Vence em") {
          return statusLabel.startsWith("Pendente - Vence em");
        }
        if (filter === "Pendente - Não definida") {
          return statusLabel.startsWith("Pendente - Não definida");
        }
        if (filter === "Válido até") {
          return statusLabel.startsWith("Válido até");
        }
        return statusLabel === filter;
      });

    const matchesResponsible =
      modalResponsibleFilter === "all" ||
      (modalResponsibleFilter === "unassigned" && !company?.responsible) ||
      (company?.responsible?.display_name === modalResponsibleFilter);

    let matchesDate = true;
    if (modalDateFilter !== "all" && statusLabel === "Concluído" && t.completed_at) {
      const completedDate = new Date(t.completed_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (modalDateFilter === "today") {
        const compare = new Date(t.completed_at);
        compare.setHours(0, 0, 0, 0);
        matchesDate = compare.getTime() === today.getTime();
      } else if (modalDateFilter === "7days") {
        const past7 = new Date();
        past7.setDate(past7.getDate() - 7);
        past7.setHours(0, 0, 0, 0);
        matchesDate = completedDate >= past7;
      } else if (modalDateFilter === "30days") {
        const past30 = new Date();
        past30.setDate(past30.getDate() - 30);
        past30.setHours(0, 0, 0, 0);
        matchesDate = completedDate >= past30;
      } else if (modalDateFilter === "thisMonth") {
        matchesDate =
          completedDate.getMonth() === today.getMonth() &&
          completedDate.getFullYear() === today.getFullYear();
      } else if (modalDateFilter === "custom") {
        if (modalStartDate) {
          const start = new Date(modalStartDate + "T00:00:00");
          matchesDate = matchesDate && completedDate >= start;
        }
        if (modalEndDate) {
          const end = new Date(modalEndDate + "T23:59:59");
          matchesDate = matchesDate && completedDate <= end;
        }
      }
    } else if (modalDateFilter !== "all" && (statusLabel !== "Concluído" || !t.completed_at)) {
      matchesDate = false;
    }

    return matchesSearch && matchesStatus && matchesResponsible && matchesDate;
  });

  const uniqueResponsibles = Array.from(
    new Set(
      allTasks
        .map(t => t.company_alvaras?.companies?.responsible?.display_name)
        .filter((name): name is string => typeof name === "string")
    )
  ).sort();

  const handleExportDetailedCSV = () => {
    const headers = [
      "Empresa",
      "CNPJ",
      "Alvará",
      "Status (Fase)",
      "Responsável",
      "Checklist (Progresso)",
      "Etapas Completas",
      "Observações / Notas"
    ];

    const rows = filteredTasks.map(t => {
      const company = t.company_alvaras?.companies;
      const alvara = t.company_alvaras?.alvaras;
      const statusLabel = getTaskStatusLabel(t);
      const responsibleName = company?.responsible?.display_name || "Sem Responsável";
      const notes = t.notes || "Sem observações";

      const checklistRows = checklistByTaskId[t.id] || [];
      const total = checklistRows.length;
      const completed = checklistRows.filter(r => r.completed).length;
      const checklistProgressText = total > 0 ? `${completed}/${total}` : "0/0";

      const checklistDoneNames = checklistRows
        .filter(r => r.completed)
        .map(r => r.label)
        .join(", ") || "Nenhuma";

      return [
        company?.nome_fantasia || company?.razao_social || "Sem empresa",
        company?.cnpj || "",
        alvara?.name || "",
        statusLabel,
        responsibleName,
        checklistProgressText,
        checklistDoneNames,
        notes
      ];
    });

    downloadCSV("detalhamento-alvaras-por-status", headers, rows);
    toast.success("Tabela detalhada exportada!");
  };

  // Note: Compliance details modal hooks (filteredCompanies, uniqueUfs) moved before early loading return

  const handleExportComplianceCSV = () => {
    const headers = [
      "CNPJ/ID",
      "Razão Social",
      "Nome Fantasia",
      "Estado (UF)",
      "Total Alvarás",
      "Alvarás Emitidos",
      "Alvarás Pendentes",
      "Alvarás Vencidos",
      "Situação"
    ];
    const rows = filteredCompanies.map((c: CompanySummaryRow) => {
      let situacao = "Sem Alvarás (Não Monitorada)";
      if (c.total_alvaras > 0) {
        situacao = c.alvaras_vencidos === 0 ? "Em Conformidade (Regular)" : "Crítica (Com Pendência)";
      }
      return [
        c.cnpj ? formatCNPJ(c.cnpj) : c.id,
        c.razao_social || "—",
        c.nome_fantasia || "—",
        c.uf || "—",
        c.total_alvaras,
        c.alvaras_emitidos,
        c.alvaras_pendentes,
        c.alvaras_vencidos,
        situacao
      ];
    });
    downloadCSV("detalhamento-conformidade-geral", headers, rows);
    toast.success("Dados de conformidade exportados!");
  };

  const score = kpis?.scoreRegularidade ?? 100;
  const isHigh = score >= 90;
  const isMedium = score >= 70;

  const scoreColor = isHigh
    ? "from-emerald-500/10 to-emerald-500/0 border-emerald-500/10"
    : isMedium
      ? "from-amber-500/10 to-amber-500/0 border-amber-500/10"
      : "from-rose-500/10 to-rose-500/0 border-rose-500/10";

  const scoreIconColor = isHigh
    ? "text-emerald-500"
    : isMedium
      ? "text-amber-500"
      : "text-rose-500";

  // Base cards mapping
  const baselineCards = [
    {
      label: "Total de Empresas",
      value: kpis?.totalEmpresas ?? 0,
      icon: <Building2 className="h-5 w-5 text-blue-500" />,
      color: "from-blue-500/10 to-blue-500/0 border-blue-500/10"
    },
    {
      label: "Score de Regularidade",
      value: `${kpis?.scoreRegularidade !== undefined ? kpis.scoreRegularidade.toFixed(1) : "100.0"}%`,
      icon: <Award className={`h-5 w-5 ${scoreIconColor}`} />,
      color: scoreColor
    },
    {
      label: "Alvarás Vencidos",
      value: kpis?.alvarasVencidos ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
      color: "from-orange-500/10 to-orange-500/0 border-orange-500/10"
    },
    {
      label: "Sync Pendentes",
      value: kpis?.syncPendentes ?? 0,
      icon: <RefreshCw className="h-5 w-5 text-rose-500" />,
      color: "from-rose-500/10 to-rose-500/0 border-rose-500/10"
    }
  ];

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      {/* 1. Header do Painel */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-200 bg-clip-text text-transparent">
            Painel de Indicadores
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Acompanhamento em tempo real de conformidade, prazos e produtividade corporativa.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={isEditingLayout ? cancelLayoutEdit : startEditingLayout}
            className={`btn-secondary text-xs py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              isEditingLayout 
                ? "bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20" 
                : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:bg-indigo-500/20"
            }`}
          >
            {isEditingLayout ? (
              <>
                <X className="h-4 w-4" /> Cancelar Edição
              </>
            ) : (
              <>
                <Sliders className="h-4 w-4" /> Personalizar Painel
              </>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Dados Atualizados
            </span>
          </div>
        </div>
      </div>

      {/* PANEL DE CUSTOMIZAÇÃO PREMIUM */}
      {isEditingLayout && (
        <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-dashed border-indigo-500/30 dark:border-indigo-400/20 space-y-4 animate-in slide-in-from-top duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Sliders className="h-4.5 w-4.5 text-indigo-500" />
                Painel de Personalização de Rótulos e Ordem
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Escolha quais indicadores deseja exibir ou ocultar. Para reordená-los, clique e arraste os cards diretamente na grade abaixo!
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={saveLayout}
                className="btn-primary text-xs py-1.5 px-3.5 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Salvar Layout
              </button>
              <button
                onClick={resetLayoutToDefault}
                className="btn-secondary text-xs py-1.5 px-3.5 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-sm border-slate-200 hover:bg-slate-100 text-slate-700 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-white/5"
              >
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Restaurar Padrão
              </button>
              <button
                onClick={cancelLayoutEdit}
                className="btn-secondary text-xs py-1.5 px-3.5 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-sm text-rose-600 border-rose-500/20 hover:bg-rose-500/10 dark:text-rose-400 dark:border-rose-950"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
            </div>
          </div>
          
          <div className="border-t border-slate-200 dark:border-white/5 pt-4">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2.5">
              Selecione os Indicadores para Exibir:
            </span>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 text-xs">
              {[
                { key: "compliance", label: "Conformidade Geral" },
                { key: "critical", label: "Empresas Críticas" },
                { key: "projection", label: "Projeção a Vencer" },
                { key: "backlog", label: "Backlog de Tarefas" },
                { key: "workload", label: "Carga por Responsável" },
                { key: "status", label: "Alvarás por Status" },
                { key: "impediments", label: "Alvarás c/ Impedimento" },
                { key: "audit", label: "Auditoria de Dados" },
                { key: "flow", label: "Fluxo Mensal (Histórico)" },
                { key: "geography", label: "Alvarás por Estado" }
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer select-none font-semibold ${
                    visibleWidgets[item.key]
                      ? "bg-indigo-50/5 border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                      : "bg-slate-100/50 border-slate-200 dark:bg-white/2 dark:border-slate-800 text-slate-400 dark:text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visibleWidgets[item.key] || false}
                    onChange={() => toggleWidgetVisibility(item.key)}
                    className="rounded border-slate-350 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Grid de Baselines */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {baselineCards.map((c) => (
          <div
            key={c.label}
            className={`card-portal relative overflow-hidden bg-gradient-to-b ${c.color} border p-5 transition-transform hover:-translate-y-0.5 hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {c.label}
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-900 dark:text-slate-50">
                  {c.value}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/50 shadow-sm border border-slate-100 dark:bg-white/5 dark:border-white/10">
                {c.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Grade de Indicadores Analíticos Customizável */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* INDICADOR 1: Índice de Conformidade */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "compliance")}
          onDragOver={(e) => handleDragOver(e, "compliance")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("compliance") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["compliance"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("compliance")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              {/* Header Card */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Conformidade Geral
                  </h2>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsComplianceModalOpen(true)}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold transition-colors"
                  title="Expandir visualização"
                >
                  <Maximize2 className="h-3.5 w-3.5" /> Detalhar
                </button>
              </div>

              {/* Gráfico de Progresso Circular SVG */}
              <div className="flex-1 flex flex-col items-center justify-center py-2">
                <svg id="compliance-chart" width="180" height="180" className="rotate-[-90deg]">
                  {/* Track background */}
                  <circle
                    cx="90"
                    cy="90"
                    r="70"
                    strokeWidth="12"
                    stroke="rgba(16, 185, 129, 0.1)"
                    fill="none"
                  />
                  {/* Progress */}
                  <circle
                    cx="90"
                    cy="90"
                    r="70"
                    strokeWidth="12"
                    stroke="#10b981"
                    fill="none"
                    strokeDasharray="440"
                    strokeDashoffset={440 - (440 * (kpis?.complianceRate ?? 0)) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center mt-[-10px]">
                  <span className="text-3xl font-black tabular-nums tracking-tight">
                    {kpis?.complianceRate.toFixed(1) ?? "0"}%
                  </span>
                  <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                    Empresas Regulares
                  </span>
                </div>
              </div>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
                {kpis?.regularCompaniesCount ?? 0} de {kpis?.totalEmpresas ?? 0} empresas operam com todos os alvarás ativos e sem pendências vencidas.
              </p>
            </div>
          </div>
        </div>

        {/* INDICADOR 2: Empresas Críticas */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "critical")}
          onDragOver={(e) => handleDragOver(e, "critical")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("critical") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["critical"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("critical")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Empresas mais Críticas
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["top-critical"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "top-critical" ? null : "top-critical")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "top-critical" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("top-critical")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                      <button
                        onClick={() => handleExportSVG("top-critical-chart", "empresas-mais-criticas")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> Gráfico (SVG)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {topCritical.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-400 dark:text-slate-500">Zero alvarás vencidos no momento.</p>
                    <p className="text-2xs text-emerald-500 uppercase tracking-widest font-semibold mt-1">Conformidade total</p>
                  </div>
                ) : (
                  <svg id="top-critical-chart" width="100%" height="160" viewBox="0 0 320 160" className="overflow-visible">
                    {topCritical.map((comp, idx) => {
                      const y = idx * 30 + 15;
                      const maxV = Math.max(...topCritical.map(c => c.vencidos), 1);
                      const barWidth = (comp.vencidos / maxV) * 160;
                      return (
                        <g key={comp.id} className="group">
                          {/* Company Name Label */}
                          <text
                            x="0"
                            y={y + 5}
                            fontSize="10"
                            fontWeight="semibold"
                            fill="currentColor"
                            className="text-slate-600 dark:text-slate-300"
                          >
                            {comp.name.length > 18 ? comp.name.slice(0, 16) + "..." : comp.name}
                          </text>
                          {/* Bar Track */}
                          <rect
                            x="110"
                            y={y - 6}
                            width="160"
                            height="8"
                            rx="4"
                            fill="rgba(249, 115, 22, 0.08)"
                          />
                          {/* Bar Fill */}
                          <rect
                            x="110"
                            y={y - 6}
                            width={barWidth}
                            height="8"
                            rx="4"
                            fill="url(#critical-orange-gradient)"
                          />
                          {/* Count value */}
                          <text
                            x={115 + barWidth}
                            y={y + 2}
                            fontSize="10"
                            fontWeight="bold"
                            fill="#f97316"
                            className="tabular-nums"
                          >
                            {comp.vencidos}
                          </text>
                        </g>
                      );
                    })}
                    <defs>
                      <linearGradient id="critical-orange-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ea580c" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
              </div>
              <p className="text-2xs text-slate-400 text-center mt-2 uppercase tracking-wide">
                Ranking baseado em alvarás expirados pendentes
              </p>
            </div>
          </div>
        </div>

        {/* INDICADOR 3: Projeção de Alertas Críticos */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "projection")}
          onDragOver={(e) => handleDragOver(e, "projection")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("projection") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["projection"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("projection")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Alvarás a Vencer (Projeção)
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["alerts"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "alerts" ? null : "alerts")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "alerts" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("alerts")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-around gap-4 py-2">
                {/* 30 dias */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                      Próximos 30 dias
                    </span>
                    <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {kpis?.expirations[30] ?? 0} alvarás
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500 transition-all duration-1000"
                      style={{ width: `${Math.min(((kpis?.expirations[30] ?? 0) / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 60 dias */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-orange-500 uppercase tracking-wide">
                      De 31 a 60 dias
                    </span>
                    <span className="font-bold tabular-nums text-orange-500">
                      {kpis?.expirations[60] ?? 0} alvarás
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-orange-400 transition-all duration-1000"
                      style={{ width: `${Math.min(((kpis?.expirations[60] ?? 0) / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 90 dias */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-500 uppercase tracking-wide">
                      De 61 a 90 dias
                    </span>
                    <span className="font-bold tabular-nums text-amber-500">
                      {kpis?.expirations[90] ?? 0} alvarás
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-1000"
                      style={{ width: `${Math.min(((kpis?.expirations[90] ?? 0) / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* INDICADOR 4: Backlog de Tarefas */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "backlog")}
          onDragOver={(e) => handleDragOver(e, "backlog")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("backlog") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["backlog"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("backlog")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Backlog de Tarefas
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["tasks"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "tasks" ? null : "tasks")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "tasks" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("tasks")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                      <button
                        onClick={() => handleExportSVG("tasks-donut-chart", "distribuicao-backlog")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> Gráfico (SVG)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center items-center py-2">
                {kpis && (kpis.taskStatusCounts.pendente + kpis.taskStatusCounts.concluida) === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 py-10">Nenhuma tarefa ativa registrada.</p>
                ) : (
                  <div className="relative flex justify-center items-center">
                    <svg id="tasks-donut-chart" width="150" height="150" className="rotate-[-90deg]">
                      {(() => {
                        const pendente = kpis?.taskStatusCounts.pendente ?? 0;
                        const concluida = kpis?.taskStatusCounts.concluida ?? 0;
                        const total = pendente + concluida;
                        return (
                          <>
                            <circle
                              cx="75"
                              cy="75"
                              r="55"
                              strokeWidth="14"
                              stroke="#ef4444"
                              fill="none"
                            />
                            <circle
                              cx="75"
                              cy="75"
                              r="55"
                              strokeWidth="14"
                              stroke="#2F6BFF"
                              fill="none"
                              strokeDasharray="345"
                              strokeDashoffset={345 - (345 * concluida) / (total || 1)}
                              strokeLinecap="round"
                            />
                          </>
                        );
                      })()}
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
                        {(kpis?.taskStatusCounts.pendente ?? 0) + (kpis?.taskStatusCounts.concluida ?? 0)}
                      </span>
                      <span className="text-3xs uppercase tracking-wider text-slate-400 mt-1 font-semibold">
                        Tarefas
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-4 text-xs font-semibold mt-4">
                  <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-[#4DA3FF]">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    Concluídas ({kpis?.taskStatusCounts.concluida ?? 0})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-rose-500">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Pendentes ({kpis?.taskStatusCounts.pendente ?? 0})
                  </span>
                </div>
              </div>
              
              <div className="border-t border-slate-100 dark:border-white/5 pt-3.5 mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Conclusão no Mês:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {kpis?.throughput.rate.toFixed(0)}% Eficiência (Throughput)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* INDICADOR 5: Carga de Trabalho por Responsável */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "workload")}
          onDragOver={(e) => handleDragOver(e, "workload")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("workload") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["workload"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("workload")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Carga por Responsável
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["workload"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "workload" ? null : "workload")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "workload" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("workload")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                      <button
                        onClick={() => handleExportSVG("workload-chart", "carga-de-trabalho")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> Gráfico (SVG)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {workload.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-6">Nenhum responsável atribuído a empresas.</p>
                ) : (
                  <svg id="workload-chart" width="100%" height="160" viewBox="0 0 320 160" className="overflow-visible">
                    {workload.slice(0, 5).map((w, idx) => {
                      const y = idx * 30 + 15;
                      const maxCount = Math.max(...workload.map(x => x.count), 1);
                      const barWidth = (w.count / maxCount) * 160;
                      return (
                        <g key={w.id || idx}>
                          <text
                            x="0"
                            y={y + 5}
                            fontSize="9"
                            fontWeight="semibold"
                            fill="currentColor"
                            className="text-slate-500 dark:text-slate-300"
                          >
                            {w.name.length > 15 ? w.name.slice(0, 13) + "..." : w.name}
                          </text>
                          <rect
                            x="100"
                            y={y - 6}
                            width="160"
                            height="8"
                            rx="4"
                            fill="rgba(47, 107, 255, 0.08)"
                          />
                          <rect
                            x="100"
                            y={y - 6}
                            width={barWidth}
                            height="8"
                            rx="4"
                            fill="url(#blue-workload-gradient)"
                          />
                          <text
                            x={105 + barWidth}
                            y={y + 2}
                            fontSize="10"
                            fontWeight="bold"
                            fill="#2F6BFF"
                            className="tabular-nums"
                          >
                            {w.count}
                          </text>
                        </g>
                      );
                    })}
                    <defs>
                      <linearGradient id="blue-workload-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
              </div>
              <p className="text-2xs text-slate-400 text-center mt-2 uppercase tracking-wide">
                Carga de empresas sob responsabilidade de cada analista
              </p>
            </div>
          </div>
        </div>

        {/* INDICADOR 6: Alvarás por Status (Fase) */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "status")}
          onDragOver={(e) => handleDragOver(e, "status")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("status") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["status"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("status")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileStack className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Alvarás por Status (Fase)
                  </h2>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenStatusModal}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold transition-colors"
                    title="Expandir visualização"
                  >
                    <Maximize2 className="h-3.5 w-3.5" /> Detalhar
                  </button>

                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 justify-center flex flex-col">
                {alvarasPorCategoria.length === 0 ? (
                  <p className="text-center text-xs text-slate-400">Nenhum status encontrado.</p>
                ) : (
                  alvarasPorCategoria.map((cat, idx) => {
                    const maxCount = Math.max(...alvarasPorCategoria.map(x => x.count), 1);
                    const percentage = (cat.count / maxCount) * 100;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-slate-700 dark:text-slate-300 truncate">{cat.name}</span>
                          </span>
                          <span className="tabular-nums text-slate-950 dark:text-white font-bold shrink-0">{cat.count}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        {/* INDICADOR 7: Alvarás com Impedimentos (Kanban) */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "impediments")}
          onDragOver={(e) => handleDragOver(e, "impediments")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("impediments") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["impediments"] && "hidden",
            "lg:col-span-2 md:col-span-2"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("impediments")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Alvarás com Impedimentos (Kanban)
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["impeded"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "impeded" ? null : "impeded")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "impeded" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("impeded")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {impededTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 mb-3 border border-emerald-100 dark:border-emerald-900/35">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nenhum impedimento ativo</p>
                    <p className="text-xs text-slate-400 mt-0.5">Todas as tarefas operam em ritmo regular no Kanban.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 overflow-y-auto max-h-[170px] pr-1">
                    {impededTasks.map((t) => (
                      <div key={t.id} className="flex items-start justify-between p-3.5 rounded-xl border border-rose-100 bg-rose-500/5 dark:border-rose-950/50 dark:bg-rose-950/10">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {t.title || "Tarefa sem título"}
                          </p>
                          <p className="text-3xs text-slate-500 truncate mt-0.5">
                            Empresa: {t.company_alvaras?.companies?.nome_fantasia || t.company_alvaras?.companies?.razao_social || "—"}
                          </p>
                          <p className="text-3xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide mt-1 truncate">
                            Tipo: {t.company_alvaras?.alvaras?.name || "—"}
                          </p>
                        </div>
                        <span className="shrink-0 ml-2 inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-3xs font-extrabold text-rose-700 uppercase dark:bg-rose-500/10 dark:text-rose-400">
                          Travado
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-2xs text-slate-400 text-center mt-2 uppercase tracking-wide">
                Processos movidos para a coluna de Impedimento no Quadro Kanban
              </p>
            </div>
          </div>
        </div>

        {/* INDICADOR 8: Auditoria de Dados */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "audit")}
          onDragOver={(e) => handleDragOver(e, "audit")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("audit") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["audit"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("audit")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Auditoria de Dados
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["audit"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "audit" ? null : "audit")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "audit" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("document-coverage")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-around gap-6">
                {/* Indicador 9: Cobertura Documental */}
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-white/5 border border-indigo-100 dark:border-white/10">
                    <FileStack className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center text-xs font-semibold mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Cobertura Documental (PDFs)</span>
                      <span className="text-slate-900 dark:text-white font-bold">{kpis?.documentCoverageRate.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all duration-1000"
                        style={{ width: `${kpis?.documentCoverageRate ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Indicador 10: Validade Indeterminada */}
                <div className="flex items-center gap-4 border-t border-slate-100 dark:border-white/5 pt-4">
                  <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-teal-50 dark:bg-white/5 border border-teal-100 dark:border-white/10">
                    <InfinityIcon className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                      Validade Legal Indeterminada
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {kpis?.indefiniteValidityCount ?? 0} alvarás
                    </div>
                    <div className="text-3xs text-teal-600 dark:text-teal-400 uppercase tracking-widest font-semibold mt-0.5">
                      Documentos permanentes sem expiração
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* INDICADOR 9: Fluxo Mensal de Processos */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "flow")}
          onDragOver={(e) => handleDragOver(e, "flow")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("flow") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["flow"] && "hidden",
            "lg:col-span-2 md:col-span-2"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("flow")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Fluxo Mensal de Processos (Criados vs. Concluídos)
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["sazonal"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "sazonal" ? null : "sazonal")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "sazonal" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("sazonal")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                      <button
                        onClick={() => handleExportSVG("history-line-chart", "historico-mensal-entrada-saida")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> Gráfico (SVG)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {history.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-10">Histórico sazonal indisponível.</p>
                ) : (
                  <div className="w-full">
                    <svg id="history-line-chart" width="100%" height="220" viewBox="0 0 600 220" className="overflow-visible w-full">
                      {/* Grid Lines */}
                      <line x1="50" y1="20" x2="550" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="50" y1="70" x2="550" y2="70" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="50" y1="120" x2="550" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="50" y1="170" x2="550" y2="170" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="50" y1="170" x2="550" y2="170" stroke="rgba(0,0,0,0.1)" dark-stroke="rgba(255,255,255,0.2)" />
     
                      {(() => {
                        const maxVal = Math.max(...history.flatMap(h => [h.created, h.completed]), 5);
                        const scaleY = (val: number) => 170 - (val / maxVal) * 130;
                        const pointsCreated = history.map((h, i) => `${50 + i * 100},${scaleY(h.created)}`).join(" ");
                        const pointsCompleted = history.map((h, i) => `${50 + i * 100},${scaleY(h.completed)}`).join(" ");
     
                        return (
                          <>
                            {/* Line Created (Red) */}
                            <polyline
                              fill="none"
                              stroke="#f43f5e"
                              strokeWidth="3.5"
                              points={pointsCreated}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {/* Line Completed (Blue) */}
                            <polyline
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="3.5"
                              points={pointsCompleted}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
     
                            {/* Data Nodes & Month Labels */}
                            {history.map((h, i) => {
                              const cx = 50 + i * 100;
                              const cyCreated = scaleY(h.created);
                              const cyCompleted = scaleY(h.completed);
                              return (
                                <g key={i} className="group/node">
                                  {/* Labels X axis */}
                                  <text
                                    x={cx}
                                    y="195"
                                    textAnchor="middle"
                                    fontSize="10"
                                    fontWeight="bold"
                                    fill="currentColor"
                                    className="text-slate-500 dark:text-slate-400"
                                  >
                                    {h.label}
                                  </text>
                                  {/* Created Nodes */}
                                  <circle cx={cx} cy={cyCreated} r="4.5" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />
                                  <text x={cx} y={cyCreated - 8} textAnchor="middle" fontSize="9" fontWeight="extrabold" fill="#f43f5e" className="tabular-nums">
                                    {h.created}
                                  </text>
                                  {/* Completed Nodes */}
                                  <circle cx={cx} cy={cyCompleted} r="4.5" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
                                  <text x={cx} y={cyCompleted + 12} textAnchor="middle" fontSize="9" fontWeight="extrabold" fill="#3b82f6" className="tabular-nums">
                                    {h.completed}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                )}
                
                {/* Color key legend */}
                <div className="flex justify-center gap-6 text-xs font-semibold mt-4">
                  <span className="inline-flex items-center gap-1.5 text-rose-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    Novas Demandas (Abertas)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    Entregas Concluídas (Emitidas)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
 
        {/* INDICADOR 10: Alvarás por Estado (UF) */}
        <div
          draggable={isEditingLayout}
          onDragStart={(e) => handleDragStart(e, "geography")}
          onDragOver={(e) => handleDragOver(e, "geography")}
          onDragEnd={handleDragEnd}
          style={{ order: widgetOrder.indexOf("geography") }}
          className={cn(
            "transition-all duration-300 relative h-full flex flex-col",
            isEditingLayout && "border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-400/30 rounded-2xl cursor-move p-1 active:scale-[0.98] active:rotate-1 shadow-inner",
            !visibleWidgets["geography"] && "hidden",
            "col-span-1"
          )}
        >
          {isEditingLayout && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-3xs font-extrabold uppercase tracking-widest border border-indigo-500/20 cursor-grab animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0" />
                Mover Indicador
              </span>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility("geography")}
                className="hover:underline text-rose-500 font-bold uppercase transition shrink-0"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className={cn(isEditingLayout ? "pt-10 pointer-events-none opacity-80 h-full flex flex-col" : "h-full flex flex-col")}>
            <div className="card-portal relative flex flex-col p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Alvarás por Estado (UF)
                  </h2>
                </div>
                
                <div className="relative" ref={el => { menuRefs.current["geographic"] = el; }}>
                  <button
                    onClick={() => setActiveMenu(activeMenu === "geographic" ? null : "geographic")}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar <ChevronDown className="h-3 w-3" />
                  </button>
                  {activeMenu === "geographic" && (
                    <div className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#0c152b]">
                      <button
                        onClick={() => handleExportCSV("geographic")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Planilha (CSV)
                      </button>
                    </div>
                  )}
                </div>
              </div>
     
              <div className="flex-1 overflow-y-auto pr-1">
                {ufDist.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-10">Sem alvarás geolocalizados.</p>
                ) : (
                  <div className="space-y-4">
                    {ufDist.slice(0, 5).map((u) => {
                      const maxVal = Math.max(...ufDist.map(x => x.count), 1);
                      const percentage = (u.count / maxVal) * 100;
                      return (
                        <div key={u.uf} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-slate-100 text-3xs font-extrabold text-slate-700 uppercase dark:bg-white/5 dark:text-slate-300">
                                {u.uf}
                              </span>
                            </span>
                            <span className="tabular-nums text-slate-900 dark:text-white font-bold">{u.count} alvarás</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              <p className="text-3xs text-slate-400 text-center mt-4 uppercase tracking-wide">
                Representação das 5 principais regiões com maior densidade
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Listas Auxiliares do Rodapé */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Histórico Recente de Sync */}
        <section className="card-portal overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Últimas sincronizações
            </h2>
          </div>
          <div className="p-5">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                Nenhuma sincronização executada ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-800 dark:text-slate-200">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Início
                      </th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Total
                      </th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        OK
                      </th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Erros
                      </th>
                      <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Disparo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-700/80"
                      >
                        <td className="py-2.5 pr-3">{formatDate(row.started_at)}</td>
                        <td className="py-2.5 pr-3">{row.total}</td>
                        <td className="py-2.5 pr-3 text-green-600 dark:text-green-400">{row.success}</td>
                        <td className="py-2.5 pr-3 text-red-600 dark:text-red-400">{row.errors}</td>
                        <td className="py-2.5 text-slate-700 dark:text-slate-300">{row.triggered_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Alvarás Vencendo no Curto Prazo */}
        <section className="card-portal overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Alvarás vencendo nos próximos 30 dias
            </h2>
          </div>
          <div className="p-5">
            {vencendo.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                Nenhum alvará vence nos próximos 30 dias.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-800 dark:text-slate-200">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Empresa
                      </th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Alvará
                      </th>
                      <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Vencimento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencendo.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-700/80"
                      >
                        <td className="py-2.5 pr-3">{row.companies?.razao_social ?? row.companies?.cnpj ?? "—"}</td>
                        <td className="py-2.5 pr-3">{row.alvaras?.name ?? "—"}</td>
                        <td className="py-2.5">{formatDate(row.data_vencimento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* MODAL DETALHADO: ALVARÁS POR STATUS (FASE) */}
      <AccessibleModal
        open={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        labelledBy="modal-detalhe-status-title"
        overlayClassName="z-[999]"
        panelClassName="modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-0 bg-white dark:bg-[#0c152b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-white/5 px-6 py-5">
          <div>
            <h2 id="modal-detalhe-status-title" className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <FileStack className="h-5 w-5 text-indigo-500" />
              Detalhamento de Alvarás por Status (Fase)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Visualize, filtre e exporte os dados detalhados dos alvarás ativos no sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsStatusModalOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-6 space-y-5">
          {/* Barra de Filtros */}
          <div className="grid gap-4 sm:grid-cols-4 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5">
            {/* Input de Busca */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                className="input-field pl-9 w-full text-xs"
                placeholder="Buscar por empresa, CNPJ..."
                value={modalSearchTerm}
                onChange={(e) => setModalSearchTerm(e.target.value)}
              />
            </div>

            {/* Dropdown de Status (Multi-Select) */}
            <div className="relative" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="input-field pl-9 w-full text-xs text-left flex items-center justify-between bg-white dark:bg-[#0c152b] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 h-10 px-3 hover:bg-slate-50 dark:hover:bg-white/5 transition"
              >
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-400" />
                </span>
                <span className="truncate">
                  {modalStatusFilters.length === 0 || modalStatusFilters.includes("all")
                    ? "Todas as Fases / Status"
                    : `${modalStatusFilters.length} selecionado(s)`}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {statusDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-[#0c152b] text-xs">
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                    <button
                      type="button"
                      className="rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-2 py-1 text-2xs font-semibold text-slate-700 dark:text-slate-200"
                      onClick={() => setModalStatusFilters(["all"])}
                    >
                      Selecionar Todos
                    </button>
                    <button
                      type="button"
                      className="rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-2 py-1 text-2xs font-semibold text-slate-700 dark:text-slate-200"
                      onClick={() => setModalStatusFilters([])}
                    >
                      Limpar
                    </button>
                  </div>
                  
                  <div className="space-y-1">
                    {[
                      { value: "Pendente - Vencida", label: "🚨 Pendente - Vencida" },
                      { value: "Pendente - Vence em", label: "⚠️ Pendente - Vence em X dias" },
                      { value: "Pendente - Não definida", label: "⏳ Pendente - Não definida" },
                      { value: "Válido até", label: "🛡️ Válido até DD/MM/AAAA" },
                      { value: "Em Andamento", label: "🔵 Em Andamento" },
                      { value: "Em Andamento - Vencido", label: "🟠 Em Andamento - Vencido" },
                      { value: "Com Impedimento", label: "🛑 Com Impedimento" },
                      { value: "Com Impedimento - Vencido", label: "💀 Com Impedimento - Vencido" },
                      { value: "Concluída", label: "🟢 Concluída" },
                      { value: "Concluído - Vencido", label: "🟡 Concluído - Vencido" },
                      { value: "Cancelada", label: "🔘 Cancelada" }
                    ].map((opt) => {
                      const checked = modalStatusFilters.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="rounded border-slate-350 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            onChange={(e) => {
                              setModalStatusFilters((prev) => {
                                const cleanPrev = prev.filter(x => x !== "all");
                                if (e.target.checked) {
                                  return [...cleanPrev, opt.value];
                                } else {
                                  return cleanPrev.filter(x => x !== opt.value);
                                }
                              });
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown de Responsável */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Briefcase className="h-4 w-4 text-slate-400" />
              </span>
              <select
                className="input-field pl-9 w-full text-xs appearance-none"
                value={modalResponsibleFilter}
                onChange={(e) => setModalResponsibleFilter(e.target.value)}
              >
                <option value="all">Todos os Responsáveis</option>
                <option value="unassigned">Sem Responsável</option>
                {uniqueResponsibles.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Dropdown de Data de Conclusão */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarDays className="h-4 w-4 text-slate-400" />
              </span>
              <select
                className="input-field pl-9 w-full text-xs appearance-none"
                value={modalDateFilter}
                onChange={(e) => {
                  setModalDateFilter(e.target.value);
                  if (e.target.value !== "custom") {
                    setModalStartDate("");
                    setModalEndDate("");
                  }
                }}
              >
                <option value="all">Todas as Datas de Conclusão</option>
                <option value="today">Hoje</option>
                <option value="7days">Últimos 7 dias</option>
                <option value="30days">Últimos 30 dias</option>
                <option value="thisMonth">Este mês</option>
                <option value="custom">Período Personalizado</option>
              </select>
            </div>
          </div>

          {/* Inputs de Data para Período Personalizado */}
          {modalDateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5 text-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">De:</span>
                <input
                  type="date"
                  className="input-field py-1.5 px-3 text-xs w-36 dark:bg-[#0c152b] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                  value={modalStartDate}
                  onChange={(e) => setModalStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Até:</span>
                <input
                  type="date"
                  className="input-field py-1.5 px-3 text-xs w-36 dark:bg-[#0c152b] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                  value={modalEndDate}
                  onChange={(e) => setModalEndDate(e.target.value)}
                />
              </div>
              {(modalStartDate || modalEndDate) && (
                <button
                  onClick={() => {
                    setModalStartDate("");
                    setModalEndDate("");
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline ml-auto font-bold"
                >
                  Limpar Período
                </button>
              )}
            </div>
          )}

          {/* Tabela de Dados */}
          <div className="flex-1 min-h-0 overflow-y-auto border border-slate-100 dark:border-white/5 rounded-xl">
            {loadingChecklist ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <span className="text-xs text-slate-500">Buscando etapas de checklist...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-sm text-slate-400">Nenhum registro encontrado para os filtros aplicados.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-[#0c152b] border-b border-slate-100 dark:border-white/5 z-10">
                  <tr>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Empresa</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Alvará</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status / Fase</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Responsável</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Checklist</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredTasks.map((t) => {
                    const company = t.company_alvaras?.companies;
                    const alvara = t.company_alvaras?.alvaras;
                    const statusLabel = getTaskStatusLabel(t);
                    const responsibleName = company?.responsible?.display_name || "Sem Responsável";
                    
                    // Checklist logic
                    const checklistRows = checklistByTaskId[t.id] || [];
                    const totalCheck = checklistRows.length;
                    const completedCheck = checklistRows.filter(r => r.completed).length;

                    // Badges coloring
                    let statusBadgeClass = "bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border border-slate-200 dark:border-slate-800";
                    if (statusLabel === "Concluída" || statusLabel === "Concluído") {
                      statusBadgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
                    } else if (statusLabel === "Concluído - Vencido") {
                      statusBadgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
                    } else if (statusLabel === "Em Andamento - Vencido" || statusLabel === "Com Impedimento - Vencido" || statusLabel === "Pendente - Vencida") {
                      statusBadgeClass = "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
                    } else if (statusLabel.startsWith("Pendente - Vence em")) {
                      statusBadgeClass = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20";
                    } else if (statusLabel.startsWith("Pendente - Não definida")) {
                      statusBadgeClass = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20";
                    } else if (statusLabel.startsWith("Válido até")) {
                      statusBadgeClass = "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20";
                    } else if (statusLabel === "Em Andamento") {
                      statusBadgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
                    } else if (statusLabel === "Com Impedimento") {
                      statusBadgeClass = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
                    } else if (statusLabel === "Cancelada") {
                      statusBadgeClass = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20";
                    }

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="p-3.5 font-medium text-slate-900 dark:text-slate-100">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {company?.nome_fantasia || company?.razao_social || "Sem empresa"}
                            </p>
                            <p className="text-3xs text-slate-400 font-mono mt-0.5">{company?.cnpj || ""}</p>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-700 dark:text-slate-300">
                          {alvara?.name || "—"}
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-extrabold uppercase ${statusBadgeClass}`}>
                            {statusLabel}
                          </span>
                          {statusLabel.startsWith("Concluído") && t.completed_at && (
                            <p className="text-3xs text-slate-400 font-mono mt-1">
                              Concluído em: {formatDate(t.completed_at)}
                            </p>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-700 dark:text-slate-300">
                          {responsibleName}
                        </td>
                        <td className="p-3.5">
                          {totalCheck > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                                {completedCheck}/{totalCheck}
                              </span>
                              <span className="text-3xs text-slate-400 uppercase tracking-wide">
                                ({((completedCheck / totalCheck) * 100).toFixed(0)}%)
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-3xs">Sem etapas</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-500 max-w-[200px] truncate" title={t.notes || ""}>
                          {t.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-100 dark:border-white/5 px-6 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <strong className="text-slate-900 dark:text-white font-bold">{filteredTasks.length}</strong> de <strong className="text-slate-900 dark:text-white font-bold">{allTasks.length}</strong> registros.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportDetailedCSV}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/15 py-2 px-3.5 rounded-xl font-bold"
              disabled={filteredTasks.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Tabela (CSV)
            </button>
            <button
              onClick={() => setIsStatusModalOpen(false)}
              className="btn-primary py-2 px-4 rounded-xl"
            >
              Fechar
            </button>
          </div>
        </div>
      </AccessibleModal>

      {/* MODAL DETALHADO: CONFORMIDADE GERAL */}
      <AccessibleModal
        open={isComplianceModalOpen}
        onClose={() => setIsComplianceModalOpen(false)}
        labelledBy="modal-detalhe-compliance-title"
        overlayClassName="z-[999]"
        panelClassName="modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-0 bg-white dark:bg-[#0c152b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-white/5 px-6 py-5">
          <div>
            <h2 id="modal-detalhe-compliance-title" className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Detalhamento do Índice de Conformidade Geral
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Monitore a regularidade de cada empresa de forma individualizada com base em seus alvarás válidos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsComplianceModalOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-6 space-y-5">
          {/* Barra de Filtros */}
          <div className="grid gap-4 sm:grid-cols-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5">
            {/* Input de Busca */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                className="input-field pl-9 w-full text-xs"
                placeholder="Buscar por empresa, CNPJ..."
                value={complianceSearchTerm}
                onChange={(e) => setComplianceSearchTerm(e.target.value)}
              />
            </div>

            {/* Dropdown de Situação de Regularidade */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-4 w-4 text-slate-400" />
              </span>
              <select
                className="input-field pl-9 w-full text-xs appearance-none"
                value={complianceStatusFilter}
                onChange={(e) => setComplianceStatusFilter(e.target.value)}
              >
                <option value="all">Todas as Situações</option>
                <option value="regular">🟢 Em Conformidade (Regular)</option>
                <option value="critical">🔴 Crítica (Com Pendência)</option>
                <option value="unmonitored">⚪ Não Monitorada (Sem Alvarás)</option>
              </select>
            </div>

            {/* Dropdown de Estado (UF) */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-4 w-4 text-slate-400" />
              </span>
              <select
                className="input-field pl-9 w-full text-xs appearance-none"
                value={complianceUfFilter}
                onChange={(e) => setComplianceUfFilter(e.target.value)}
              >
                <option value="all">Todos os Estados (UF)</option>
                {uniqueUfs.map((uf: string) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabela de Dados */}
          <div className="flex-1 min-h-0 overflow-y-auto border border-slate-100 dark:border-white/5 rounded-xl">
            {filteredCompanies.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-sm text-slate-400">Nenhuma empresa encontrada para os filtros aplicados.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-[#0c152b] border-b border-slate-100 dark:border-white/5 z-10">
                  <tr>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Empresa / CNPJ</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Estado (UF)</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Alvarás Ativos</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Alvarás Vencidos</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Total Monitorados</th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Situação de Regularidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredCompanies.map((c: CompanySummaryRow) => {
                    const isRegular = c.total_alvaras > 0 && c.alvaras_vencidos === 0;
                    const isCritical = c.alvaras_vencidos > 0;
                    const isUnmonitored = c.total_alvaras === 0;

                    let statusBadgeClass = "bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border border-slate-200 dark:border-slate-800";
                    let statusLabel = "Sem Alvarás";

                    if (isRegular) {
                      statusBadgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
                      statusLabel = "Em Conformidade";
                    } else if (isCritical) {
                      statusBadgeClass = "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
                      statusLabel = `Crítica (${c.alvaras_vencidos} vencido${c.alvaras_vencidos > 1 ? "s" : ""})`;
                    } else if (isUnmonitored) {
                      statusBadgeClass = "bg-slate-500/10 text-slate-500 border border-slate-500/20";
                      statusLabel = "Não Monitorada";
                    }

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="p-3.5 font-medium text-slate-900 dark:text-slate-100">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {c.nome_fantasia || c.razao_social || "Sem nome cadastrado"}
                            </p>
                            <p className="text-3xs text-slate-400 font-mono mt-0.5">
                              {c.cnpj ? formatCNPJ(c.cnpj) : "Sem CNPJ"}
                            </p>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-slate-100 text-3xs font-extrabold text-slate-700 uppercase dark:bg-white/5 dark:text-slate-300">
                            {c.uf || "—"}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                          {c.alvaras_emitidos}
                        </td>
                        <td className={`p-3.5 text-center font-semibold font-mono ${c.alvaras_vencidos > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-600"}`}>
                          {c.alvaras_vencidos}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300 font-mono">
                          {c.total_alvaras}
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-extrabold uppercase ${statusBadgeClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-100 dark:border-white/5 px-6 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <strong className="text-slate-900 dark:text-white font-bold">{filteredCompanies.length}</strong> de <strong className="text-slate-900 dark:text-white font-bold">{companiesSummary.length}</strong> empresas.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportComplianceCSV}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/15 py-2 px-3.5 rounded-xl font-bold"
              disabled={filteredCompanies.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Tabela (CSV)
            </button>
            <button
              onClick={() => setIsComplianceModalOpen(false)}
              className="btn-primary py-2 px-4 rounded-xl"
            >
              Fechar
            </button>
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
}
