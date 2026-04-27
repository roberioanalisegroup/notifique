"use client";

import { apiJson } from "@/lib/api-client";
import { janelaAPartirDe } from "@/lib/alvara-task-generation";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { cn, formatCNPJ, formatDate } from "@/lib/utils";
import type { Alvara, AlvaraGroup, AlvaraTask, Company, CompanyAlvara } from "@/types";
import { format } from "date-fns";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Eraser,
  FileSignature,
  GripVertical,
  ListTodo,
  Loader2,
  Paperclip,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  UserCircle,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type TaskRow = AlvaraTask & {
  company_alvaras:
    | (CompanyAlvara & {
        companies: Company | null;
        alvaras: (Alvara & { alvara_groups: AlvaraGroup | null }) | null;
      })
    | null;
};

type UiLane = "pendente" | "andamento";

const LANES_STORAGE_KEY = "notifique-acompanhamento-lanes";

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
    description: "Coluna local — arraste para organizar o fluxo",
  },
  {
    id: "concluido",
    label: "Concluído",
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: "Tarefas concluídas",
  },
];

function readLaneMap(): Record<string, UiLane> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(LANES_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, UiLane> = {};
    for (const [k, v] of Object.entries(p)) {
      if (v === "andamento") out[k] = "andamento";
      else out[k] = "pendente";
    }
    return out;
  } catch {
    return {};
  }
}

function writeLaneMap(map: Record<string, UiLane>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LANES_STORAGE_KEY, JSON.stringify(map));
}

function yearFromIso(d: string | null | undefined): number | null {
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : null;
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

function companyLabel(c: Company | null | undefined): string {
  if (!c) return "—";
  return (c.razao_social ?? c.nome_fantasia ?? "—").trim() || "—";
}

export default function AcompanhamentoPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>(() => String(new Date().getFullYear()));
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [laneMap, setLaneMap] = useState<Record<string, UiLane>>({});
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const companyMenuRef = useRef<HTMLDivElement>(null);

  const { inicio, fim } = useMemo(() => janelaAPartirDe(new Date(), 30), []);
  const hoje = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  useEffect(() => {
    setLaneMap(readLaneMap());
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!companyMenuRef.current?.contains(e.target as Node)) setCompanyMenuOpen(false);
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
    if (yearFilter === "todos") {
      const y = new Date().getFullYear();
      sp.set("from", `${y - 1}-01-01`);
      sp.set("to", `${y + 2}-12-31`);
    } else {
      sp.set("from", `${yearFilter}-01-01`);
      sp.set("to", `${yearFilter}-12-31`);
    }
    return sp.toString();
  }, [yearFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson<{ tasks: TaskRow[] }>("/api/alvara-tasks?" + buildQuery());
      setTasks(d.tasks.filter((t) => t.status !== "cancelada"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    tasks.forEach((t) => {
      const y = yearFromIso(t.due_date);
      if (y != null) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [tasks]);

  const uniqueCompanies = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((t) => {
      const label = companyLabel(t.company_alvaras?.companies);
      if (label !== "—") names.add(label);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks]);

  const filteredCompaniesList = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return uniqueCompanies;
    return uniqueCompanies.filter((c) => c.toLowerCase().includes(q));
  }, [uniqueCompanies, companyQuery]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedCompanies.length === 0) return true;
      const label = companyLabel(t.company_alvaras?.companies);
      return selectedCompanies.includes(label);
    });
  }, [tasks, selectedCompanies]);

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
          : `Nenhuma tarefa nova; ${r.ignoradosDuplicata} já existiam.`
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar tarefas");
    } finally {
      setGenerating(false);
    }
  }

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
      const next = { ...laneMap };
      delete next[t.id];
      persistLanes(next);
      toast.success("Tarefa concluída");
      void load();
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
      void load();
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
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function salvarNotas(t: TaskRow) {
    const n = window.prompt("Notas da tarefa:", t.notes ?? "");
    if (n === null) return;
    try {
      await apiJson("/api/alvara-tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ notes: n || null }),
      });
      toast.success("Notas atualizadas");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function clearFilters() {
    setYearFilter("todos");
    setSelectedCompanies([]);
    setCompanyQuery("");
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

  async function onDropColumn(e: React.DragEvent, target: ColumnId) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const task = tasks.find((x) => x.id === id);
    if (!task) return;

    if (target === "concluido") {
      if (task.status === "concluida") return;
      await soConcluir(task);
      return;
    }

    if (task.status === "concluida") {
      await reabrir(task);
      const lane: UiLane = target === "andamento" ? "andamento" : "pendente";
      const next: Record<string, UiLane> = { ...laneMap, [id]: lane };
      persistLanes(next);
      return;
    }

    const lane: UiLane = target === "andamento" ? "andamento" : "pendente";
    const next: Record<string, UiLane> = { ...laneMap, [id]: lane };
    persistLanes(next);
    toast.message(target === "andamento" ? "Movido para Em andamento" : "Movido para Pendente");
  }

  const selectedCompaniesLabel =
    selectedCompanies.length === 0
      ? "Todas empresas"
      : selectedCompanies.length === 1
        ? selectedCompanies[0]
        : `${selectedCompanies.length} empresas selecionadas`;

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      {/* Cabeçalho — alinhado ao portal + tom verde do modelo */}
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-emerald-950">
          <FileSignature className="h-7 w-7 text-emerald-800" aria-hidden />
          Gestão de alvarás
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Controle por validade e empresa. Filtre por ano (data de vencimento da tarefa) e empresas.
          Arraste os cartões entre colunas; &quot;Em andamento&quot; é organização local (navegador). Tarefas
          na janela padrão do gerador:{" "}
          <span className="font-medium text-slate-800">
            {inicio} — {fim}
          </span>{" "}
          (30 dias).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={gerarTarefas} disabled={generating} className="btn-primary inline-flex items-center gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {generating ? "A gerar…" : "Gerar / atualizar tarefas (30 dias)"}
        </button>
        <Link href="/portal/configuracoes/periodicidade" className="btn-secondary inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Periodicidade dos tipos
        </Link>
        <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading}>
          {loading ? "A atualizar…" : "Atualizar quadro"}
        </button>
      </div>

      {/* Barra de filtros — estilo cartão do modelo */}
      <div className="card-portal flex flex-wrap items-end gap-6 p-5">
        <div className="flex min-w-[200px] flex-1 flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ano (vencimento da tarefa)
          </label>
          <select
            className="select-field max-w-xs"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="todos">Todos os anos</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div ref={companyMenuRef} className="relative min-w-[240px] flex-1">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Empresas
          </label>
          <button
            type="button"
            className="input-field flex h-10 w-full items-center justify-between text-left"
            onClick={() => setCompanyMenuOpen((o) => !o)}
            aria-expanded={companyMenuOpen}
          >
            <span className="truncate">{selectedCompaniesLabel}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", companyMenuOpen && "rotate-180")} />
          </button>
          {companyMenuOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 p-2">
                <input
                  type="search"
                  className="input-field h-9 text-sm"
                  placeholder="Buscar empresa…"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <ul className="max-h-56 overflow-y-auto p-1">
                {filteredCompaniesList.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">Nenhuma empresa encontrada</li>
                ) : (
                  filteredCompaniesList.map((name) => {
                    const checked = selectedCompanies.includes(name);
                    return (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedCompanies((prev) =>
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

      {/* Kanban */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-500">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm">A carregar quadro…</span>
          </div>
        </div>
      ) : (
        <div className="-mx-1 flex flex-col gap-5 overflow-x-auto pb-4 md:flex-row md:items-start">
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
                className="flex min-h-[420px] min-w-[min(100%,320px)] flex-1 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3 shadow-sm md:min-w-[300px]"
                onDragOver={onDragOver}
                onDrop={(e) => void onDropColumn(e, col.id)}
              >
                <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      {col.icon}
                      {col.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">{col.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                    {list.length}
                  </span>
                </header>

                <div className="flex min-h-[360px] flex-col gap-3">
                  {list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-8 text-center text-sm text-slate-400">
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
                          "group cursor-grab rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition active:cursor-grabbing",
                          dragTaskId === t.id && "opacity-60"
                        )}
                      >
                        <TaskCard
                          task={t}
                          hoje={hoje}
                          onBaixa={() => void darBaixaNoVinculo(t)}
                          onConcluir={() => void soConcluir(t)}
                          onReabrir={() => void reabrir(t)}
                          onCancelar={() => void cancelarTarefa(t)}
                          onEditNotas={() => void salvarNotas(t)}
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
        <p className="text-center text-sm text-slate-500">
          Nenhuma tarefa no período. Use &quot;Gerar / atualizar tarefas&quot; para criar entradas com base na
          periodicidade e nos vínculos.
        </p>
      ) : null}

      <p className="text-center text-xs text-slate-400">
        <ClipboardList className="mb-0.5 inline h-3.5 w-3.5 align-text-bottom" /> Arrastar para{" "}
        <strong>Concluído</strong> conclui a tarefa (igual a &quot;Só concluir&quot;). Canceladas ficam ocultas.
      </p>
    </div>
  );
}

function TaskCard({
  task,
  hoje,
  onBaixa,
  onConcluir,
  onReabrir,
  onCancelar,
  onEditNotas,
}: {
  task: TaskRow;
  hoje: string;
  onBaixa: () => void;
  onConcluir: () => void;
  onReabrir: () => void;
  onCancelar: () => void;
  onEditNotas: () => void;
}) {
  const ca = task.company_alvaras;
  const c = ca?.companies;
  const a = ca?.alvaras;
  const g = a?.alvara_groups;
  const freq = a ? (FREQUENCIA_LABELS[a.frequencia] ?? a.frequencia) : "—";
  const venc = validityMeta(ca?.data_vencimento);
  const atrasada = task.status === "pendente" && task.due_date < hoje;
  const hasFile = Boolean(ca?.arquivo_url);
  const empresaHref = c ? "/portal/empresas/" + c.id : null;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
            venc.className || "bg-slate-100 text-slate-700"
          )}
        >
          {venc.text}
        </span>
        <div className="flex shrink-0 items-center gap-1 text-slate-400">
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 hover:text-slate-700"
            title="Editar notas"
            onClick={(e) => {
              e.stopPropagation();
              onEditNotas();
            }}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 hover:text-red-600"
            title="Cancelar tarefa"
            onClick={(e) => {
              e.stopPropagation();
              onCancelar();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-400" aria-hidden />
        </div>
      </div>

      <h3 className="mt-2 text-sm font-bold leading-snug text-slate-900">
        {a?.name ?? "Tarefa de alvará"}
      </h3>

      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-800">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        {empresaHref ? (
          <Link href={empresaHref} className="truncate hover:underline" onClick={(e) => e.stopPropagation()}>
            {companyLabel(c)}
          </Link>
        ) : (
          <span className="truncate">{companyLabel(c)}</span>
        )}
      </p>

      <div className="mt-2 rounded-xl bg-slate-50 px-2.5 py-1.5 font-mono text-[0.7rem] text-slate-700">
        {ca?.numero ? `📄 ${ca.numero}` : `Tipo · ${g?.name ?? "Sem grupo"}`}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-violet-50/60 px-2 py-2 text-[0.7rem] text-slate-700 sm:grid-cols-2">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3 shrink-0 text-slate-500" />
          Emissão: {formatDate(ca?.data_emissao ?? null, { empty: "—" })}
        </span>
        <span className={cn("flex items-center gap-1", atrasada && "font-semibold text-amber-800")}>
          <CalendarDays className="h-3 w-3 shrink-0 text-slate-500" />
          Venc. vínculo: {formatDate(ca?.data_vencimento ?? null, { empty: "—" })}
        </span>
      </div>

      <p className="mt-2 text-[0.7rem] text-slate-600">
        <span className="font-medium text-slate-500">Vence (tarefa):</span>{" "}
        {formatDate(task.due_date, { empty: "—" })}
        {atrasada ? " · atrasada" : ""}
      </p>

      <p className="mt-1 text-[0.7rem] text-slate-600">Periodicidade: {freq}</p>

      <div className="mt-2 flex items-center gap-1 text-[0.75rem] text-slate-600">
        <UserCircle className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate">{task.notes?.slice(0, 80) || "Sem responsável / notas"}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[0.72rem]">
        <span className={cn("flex items-center gap-1", hasFile ? "text-emerald-700" : "text-slate-500")}>
          <Paperclip className="h-3.5 w-3.5" />
          {hasFile ? "Comprovante no vínculo" : "Sem anexo no vínculo"}
        </span>
        {empresaHref ? (
          <Link
            href={empresaHref}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[0.65rem] font-medium text-slate-600 hover:bg-slate-50"
            onClick={(e) => e.stopPropagation()}
          >
            <Upload className="h-3 w-3" />
            Abrir empresa
          </Link>
        ) : null}
      </div>

      {task.status === "pendente" ? (
        <>
          <button
            type="button"
            className="mt-3 w-full rounded-full bg-emerald-100 py-2 text-[0.75rem] font-semibold text-emerald-900 transition hover:bg-emerald-200"
            onClick={(e) => {
              e.stopPropagation();
              onConcluir();
            }}
          >
            Concluir tarefa
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-full border border-slate-200 py-2 text-[0.72rem] font-medium text-slate-700 hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onBaixa();
            }}
          >
            Dar baixa no vínculo
          </button>
        </>
      ) : (
        <button
          type="button"
          className="mt-3 w-full rounded-full border border-slate-200 py-2 text-[0.72rem] font-medium text-slate-600 hover:bg-slate-50"
          onClick={(e) => {
            e.stopPropagation();
            onReabrir();
          }}
        >
          <span className="inline-flex items-center justify-center gap-1">
            <XCircle className="h-3.5 w-3.5" />
            Reabrir tarefa
          </span>
        </button>
      )}
    </>
  );
}
