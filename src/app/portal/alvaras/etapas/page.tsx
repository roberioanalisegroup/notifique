"use client";

import { ChecklistTemplatesPanel } from "@/components/alvaras/checklist-templates-panel";
import { apiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Alvara, AlvaraChecklistItem, AlvaraGroup } from "@/types";
import {
  ChevronDown,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type AlvaraRow = Alvara & { alvara_groups: AlvaraGroup | null };

function labelTipo(a: AlvaraRow): string {
  const g = a.alvara_groups?.name?.trim();
  return g ? `${a.name} · ${g}` : a.name;
}

/* ── Confirm Dialog ── */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200"
        role="alertdialog"
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            {confirmLabel ?? "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton ── */
function EtapasSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3"
        >
          <div className="h-4 w-4 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 flex-1 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-4 w-16 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-100/60">
        <Layers className="h-7 w-7 text-blue-400" />
      </div>
      <p className="text-sm font-medium text-slate-700">Nenhuma etapa cadastrada</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
        Adicione etapas abaixo para definir o passo a passo deste tipo de alvará. Cada tarefa criada herdará estas etapas automaticamente.
      </p>
    </div>
  );
}

/* ── Etapa Row ── */
function EtapaRow({
  item,
  idx,
  total,
  busy,
  onRemove,
  onEdit,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
}: {
  item: AlvaraChecklistItem;
  idx: number;
  total: number;
  busy: boolean;
  onRemove: () => void;
  onEdit: (newLabel: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  isDragOver: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function saveEdit() {
    const v = editValue.trim();
    if (v && v !== item.label) onEdit(v);
    else setEditValue(item.label);
    setEditing(false);
  }

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e);
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "group flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm shadow-sm transition-all duration-200",
        isDragOver
          ? "border-blue-300 bg-blue-50/50 shadow-blue-100/60"
          : "border-slate-200/80 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/40",
        busy && "pointer-events-none opacity-50"
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab text-slate-300 transition-colors group-hover:text-slate-400 active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Order badge */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[0.65rem] font-bold text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-500">
        {idx + 1}
      </span>

      {/* Label / Edit */}
      {editing ? (
        <input
          ref={inputRef}
          className="input-field min-w-0 flex-1 !py-1 !text-sm"
          value={editValue}
          maxLength={500}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") {
              setEditValue(item.label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className="min-w-0 flex-1 cursor-text text-slate-700 transition-colors group-hover:text-slate-900"
          onDoubleClick={() => setEditing(true)}
          title="Duplo-clique para editar"
        >
          {item.label}
        </span>
      )}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Editar nome"
          disabled={busy}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Remover"
          disabled={busy}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/* ──────────────────── MAIN PAGE ──────────────────── */
export default function AlvarasEtapasPage() {
  const searchParams = useSearchParams();
  const [alvaras, setAlvaras] = useState<AlvaraRow[]>([]);
  const [alvaraId, setAlvaraId] = useState("");
  const [items, setItems] = useState<AlvaraChecklistItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [novaEtapa, setNovaEtapa] = useState("");
  const [savingNova, setSavingNova] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tipoComboAberto, setTipoComboAberto] = useState(false);
  const [tipoListaBusca, setTipoListaBusca] = useState("");
  const comboRef = useRef<HTMLDivElement>(null);
  const listaBuscaInputRef = useRef<HTMLInputElement>(null);
  const novaEtapaRef = useRef<HTMLInputElement>(null);

  /* Confirm dialog state */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /* Drag state */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const tiposFiltradosNaLista = useMemo(() => {
    const q = tipoListaBusca.trim().toLowerCase();
    if (!q) return alvaras;
    return alvaras.filter((a) => {
      const name = (a.name ?? "").toLowerCase();
      const group = (a.alvara_groups?.name ?? "").toLowerCase();
      const desc = (a.description ?? "").toLowerCase();
      return name.includes(q) || group.includes(q) || desc.includes(q);
    });
  }, [alvaras, tipoListaBusca]);

  useEffect(() => {
    if (!tipoComboAberto) return;
    const t = window.setTimeout(() => listaBuscaInputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [tipoComboAberto]);

  useEffect(() => {
    if (!tipoComboAberto) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = comboRef.current;
      if (el && !el.contains(e.target as Node)) setTipoComboAberto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTipoComboAberto(false);
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [tipoComboAberto]);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const d = await apiJson<{ alvaras: AlvaraRow[] }>("/api/alvaras");
        const list = d.alvaras ?? [];
        setAlvaras(list);
        const fromUrl = searchParams.get("alvara")?.trim();
        setAlvaraId((cur) => {
          if (fromUrl && list.some((a) => a.id === fromUrl)) return fromUrl;
          if (cur && list.some((a) => a.id === cur)) return cur;
          return list[0]?.id ?? "";
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar tipos");
        setAlvaras([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [searchParams]);

  const selected = useMemo(() => alvaras.find((a) => a.id === alvaraId) ?? null, [alvaras, alvaraId]);

  const loadItems = useCallback(async () => {
    if (!alvaraId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const d = await apiJson<{ items: AlvaraChecklistItem[] }>("/api/alvaras/" + alvaraId + "/checklist");
      setItems(d.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar etapas");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [alvaraId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function adicionarEtapa() {
    const label = novaEtapa.trim();
    if (!label || !alvaraId) return;
    setSavingNova(true);
    try {
      await apiJson("/api/alvaras/" + alvaraId + "/checklist", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setNovaEtapa("");
      toast.success("Etapa criada");
      void loadItems();
      setTimeout(() => novaEtapaRef.current?.focus(), 100);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSavingNova(false);
    }
  }

  function askRemove(id: string) {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  }

  async function confirmedRemove() {
    const id = pendingDeleteId;
    setConfirmOpen(false);
    setPendingDeleteId(null);
    if (!id || !alvaraId) return;
    setBusyId(id);
    try {
      await apiJson("/api/alvaras/" + alvaraId + "/checklist/" + id, { method: "DELETE" });
      toast.success("Etapa removida");
      void loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setBusyId(null);
    }
  }

  async function editLabel(id: string, newLabel: string) {
    if (!alvaraId) return;
    setBusyId(id);
    try {
      await apiJson("/api/alvaras/" + alvaraId + "/checklist/" + id, {
        method: "PATCH",
        body: JSON.stringify({ label: newLabel }),
      });
      toast.success("Etapa atualizada");
      void loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao editar");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDrop(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || !alvaraId) return;
    const a = items[fromIdx];
    const b = items[toIdx];
    if (!a || !b) return;
    setBusyId(a.id);
    try {
      await Promise.all([
        apiJson("/api/alvaras/" + alvaraId + "/checklist/" + a.id, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: b.sort_order }),
        }),
        apiJson("/api/alvaras/" + alvaraId + "/checklist/" + b.id, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: a.sort_order }),
        }),
      ]);
      void loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar");
    } finally {
      setBusyId(null);
      setDragIdx(null);
      setDragOverIdx(null);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="Remover etapa"
        message="Tem certeza? O progresso já marcado nas tarefas existentes deixará de contar esta linha."
        onConfirm={() => void confirmedRemove()}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingDeleteId(null);
        }}
      />

      <div className="mx-auto max-w-3xl space-y-6 text-slate-900 dark:text-slate-100">
        {/* Breadcrumb */}
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/portal/alvaras" className="font-medium text-blue-600 hover:text-blue-700 transition-colors">
              ← Tipos de alvará
            </Link>
          </div>
        </div>

        {/* Hero header */}
        <div className="card-portal overflow-hidden">
          <div className="relative flex items-center gap-4 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-5 py-5 sm:px-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
              <ListChecks className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Etapas do Checklist
              </h1>
              <p className="mt-0.5 text-sm leading-relaxed text-blue-100/90">
                Defina o passo a passo de cada tipo de alvará
              </p>
            </div>
            {items.length > 0 && (
              <div className="hidden shrink-0 flex-col items-center rounded-xl bg-white/15 px-4 py-2 backdrop-blur-sm ring-1 ring-white/20 sm:flex">
                <span className="text-2xl font-bold text-white">{items.length}</span>
                <span className="text-[0.65rem] font-medium uppercase tracking-wider text-blue-100/80">
                  {items.length === 1 ? "etapa" : "etapas"}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {/* Tipo de Alvará selector */}
            <div ref={comboRef} className="relative">
              <span id="etapas-alvara-label" className="form-label mb-1.5 block">
                Tipo de alvará
              </span>
              <button
                type="button"
                id="etapas-alvara-trigger"
                aria-haspopup="listbox"
                aria-expanded={tipoComboAberto}
                aria-labelledby="etapas-alvara-label etapas-alvara-trigger"
                disabled={loadingList || alvaras.length === 0}
                onClick={() => {
                  if (alvaras.length === 0) return;
                  setTipoComboAberto((v) => {
                    const next = !v;
                    if (next) setTipoListaBusca("");
                    return next;
                  });
                }}
                className={cn(
                  "select-field flex w-full items-center justify-between gap-2 text-left font-normal",
                  tipoComboAberto && "border-blue-500 ring-2 ring-blue-500/20"
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {loadingList
                    ? "A carregar…"
                    : alvaras.length === 0
                      ? "— Nenhum tipo cadastrado —"
                      : selected
                        ? labelTipo(selected)
                        : "Selecione um tipo"}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200", tipoComboAberto && "rotate-180")}
                  aria-hidden
                />
              </button>

              {tipoComboAberto && alvaras.length > 0 ? (
                <div
                  role="listbox"
                  aria-labelledby="etapas-alvara-label"
                  className="absolute left-0 right-0 z-50 mt-1.5 flex max-h-[min(70vh,22rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <div className="shrink-0 border-b border-slate-100 bg-slate-50/90 p-2.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={listaBuscaInputRef}
                        type="search"
                        className="input-field w-full py-2 pl-8 pr-2 text-sm"
                        placeholder="Buscar na lista…"
                        value={tipoListaBusca}
                        onChange={(e) => setTipoListaBusca(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        autoComplete="off"
                        aria-label="Filtrar tipos de alvará"
                      />
                    </div>
                    {tipoListaBusca.trim() ? (
                      <p className="mt-1.5 px-0.5 text-[0.7rem] text-slate-500">
                        {tiposFiltradosNaLista.length} de {alvaras.length} tipo(s)
                      </p>
                    ) : null}
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                    {tiposFiltradosNaLista.length === 0 ? (
                      <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhum tipo corresponde à busca.</li>
                    ) : (
                      tiposFiltradosNaLista.map((a) => (
                        <li key={a.id} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={a.id === alvaraId}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                              a.id === alvaraId
                                ? "bg-blue-50 font-medium text-blue-800"
                                : "text-slate-700 hover:bg-slate-50"
                            )}
                            onClick={() => {
                              setAlvaraId(a.id);
                              setTipoComboAberto(false);
                            }}
                          >
                            {a.id === alvaraId && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
                            )}
                            <span className="min-w-0 flex-1 leading-snug">{labelTipo(a)}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>

            {selected ? (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-500">Grupo:</span>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80">
                  {selected.alvara_groups?.name ?? "Sem grupo"}
                </span>
              </div>
            ) : null}

            {/* Etapas list */}
            <div className="border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="form-label flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Etapas deste tipo
                </p>
                {items.length > 0 && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[0.65rem] font-semibold text-blue-600">
                    {items.length} {items.length === 1 ? "etapa" : "etapas"}
                  </span>
                )}
              </div>

              {loadingItems ? (
                <EtapasSkeleton />
              ) : items.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  {/* Progress bar */}
                  <div className="mb-4 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min(items.length * 10, 100)}%` }}
                    />
                  </div>

                  <ul className="space-y-2">
                    {items.map((it, idx) => (
                      <EtapaRow
                        key={it.id}
                        item={it}
                        idx={idx}
                        total={items.length}
                        busy={busyId === it.id}
                        onRemove={() => askRemove(it.id)}
                        onEdit={(newLabel) => void editLabel(it.id, newLabel)}
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={() => setDragOverIdx(idx)}
                        onDragEnd={() => {
                          setDragIdx(null);
                          setDragOverIdx(null);
                        }}
                        onDrop={() => {
                          if (dragIdx !== null) void handleDrop(dragIdx, idx);
                        }}
                        isDragOver={dragOverIdx === idx && dragIdx !== idx}
                      />
                    ))}
                  </ul>

                  <p className="mt-2.5 text-[0.65rem] text-slate-400">
                    Arraste para reordenar · Duplo-clique para editar
                  </p>
                </>
              )}
            </div>

            {/* Add new */}
            <div className="border-t border-slate-100 pt-5">
              <label htmlFor="etapas-nova" className="form-label mb-2 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Nova etapa
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <input
                  ref={novaEtapaRef}
                  id="etapas-nova"
                  type="text"
                  className="input-field min-w-0 flex-1"
                  placeholder="Ex.: Recolha de documentos, envio ao órgão…"
                  value={novaEtapa}
                  maxLength={500}
                  onChange={(e) => setNovaEtapa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void adicionarEtapa();
                    }
                  }}
                  disabled={!alvaraId || savingNova}
                />
                <button
                  type="button"
                  className="btn-primary shrink-0 gap-2"
                  disabled={!alvaraId || savingNova || !novaEtapa.trim()}
                  onClick={() => void adicionarEtapa()}
                >
                  <Plus className="h-4 w-4" />
                  {savingNova ? "A guardar…" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <ChecklistTemplatesPanel
          alvaraId={alvaraId}
          alvaraLabel={selected ? labelTipo(selected) : ""}
          currentItemCount={items.length}
          onApplied={() => void loadItems()}
        />
      </div>
    </>
  );
}
