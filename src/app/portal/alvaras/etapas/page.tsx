"use client";

import { apiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Alvara, AlvaraChecklistItem, AlvaraGroup } from "@/types";
import { ChevronDown, ChevronUp, ListChecks, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type AlvaraRow = Alvara & { alvara_groups: AlvaraGroup | null };

function labelTipo(a: AlvaraRow): string {
  const g = a.alvara_groups?.name?.trim();
  return g ? `${a.name} · ${g}` : a.name;
}

export default function AlvarasEtapasPage() {
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
        setAlvaraId((cur) => {
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
  }, []);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSavingNova(false);
    }
  }

  async function removerEtapa(id: string) {
    if (!confirm("Remover esta etapa? O progresso nas tarefas deixa de contar esta linha.")) return;
    if (!alvaraId) return;
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

  async function mover(id: string, dir: -1 | 1) {
    const idx = items.findIndex((x) => x.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= items.length || !alvaraId) return;
    const a = items[idx];
    const b = items[j];
    setBusyId(id);
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
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-slate-900 [color-scheme:light]">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/portal/alvaras" className="font-medium text-blue-600 hover:text-blue-700">
            ← Tipos de alvará
          </Link>
        </div>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecks className="h-7 w-7 text-blue-600" />
          Etapas (checklist)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Defina etapas por tipo de alvará. No acompanhamento, cada cartão de tarefa desse tipo mostra estas caixas para
          ir marcando o que já foi feito.
        </p>
      </div>

      <div className="card-portal space-y-4 p-4 sm:p-5">
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
              className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", tipoComboAberto && "rotate-180")}
              aria-hidden
            />
          </button>

          {tipoComboAberto && alvaras.length > 0 ? (
            <div
              role="listbox"
              aria-labelledby="etapas-alvara-label"
              className="absolute left-0 right-0 z-50 mt-1 flex max-h-[min(70vh,22rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/60"
            >
              <div className="shrink-0 border-b border-slate-100 bg-slate-50/90 p-2">
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
                          "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50",
                          a.id === alvaraId && "bg-blue-50 font-medium text-blue-900"
                        )}
                        onClick={() => {
                          setAlvaraId(a.id);
                          setTipoComboAberto(false);
                        }}
                      >
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
          <p className="text-xs text-slate-500">
            Grupo: <span className="font-medium text-slate-600">{selected.alvara_groups?.name ?? "Sem grupo"}</span>
          </p>
        ) : null}

        <div className="border-t border-slate-100 pt-4">
          <p className="form-label mb-2">Etapas deste tipo</p>
          {loadingItems ? (
            <p className="text-sm text-slate-500">A carregar…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há etapas. Adicione a primeira abaixo.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it, idx) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <span className="min-w-0 flex-1 text-slate-800">{it.label}</span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title="Subir"
                      disabled={busyId === it.id || idx === 0}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                      onClick={() => void mover(it.id, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Descer"
                      disabled={busyId === it.id || idx >= items.length - 1}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                      onClick={() => void mover(it.id, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Remover"
                      disabled={busyId === it.id}
                      className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                      onClick={() => void removerEtapa(it.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label htmlFor="etapas-nova" className="form-label mb-1.5 block">
            Nova etapa
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
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
              className="btn-primary shrink-0"
              disabled={!alvaraId || savingNova || !novaEtapa.trim()}
              onClick={() => void adicionarEtapa()}
            >
              {savingNova ? "A guardar…" : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
