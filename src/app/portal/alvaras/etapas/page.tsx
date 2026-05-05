"use client";

import { apiJson } from "@/lib/api-client";
import type { Alvara, AlvaraChecklistItem, AlvaraGroup } from "@/types";
import { ChevronDown, ChevronUp, ListChecks, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AlvaraRow = Alvara & { alvara_groups: AlvaraGroup | null };

export default function AlvarasEtapasPage() {
  const [alvaras, setAlvaras] = useState<AlvaraRow[]>([]);
  const [alvaraId, setAlvaraId] = useState("");
  const [items, setItems] = useState<AlvaraChecklistItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [novaEtapa, setNovaEtapa] = useState("");
  const [savingNova, setSavingNova] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tipoBusca, setTipoBusca] = useState("");

  const filteredAlvaras = useMemo(() => {
    const q = tipoBusca.trim().toLowerCase();
    if (!q) return alvaras;
    return alvaras.filter((a) => {
      const name = (a.name ?? "").toLowerCase();
      const group = (a.alvara_groups?.name ?? "").toLowerCase();
      const desc = (a.description ?? "").toLowerCase();
      return name.includes(q) || group.includes(q) || desc.includes(q);
    });
  }, [alvaras, tipoBusca]);

  /** Mantém o tipo atual no `<select>` mesmo que o filtro o esconda. */
  const selectOptions = useMemo(() => {
    if (alvaras.length === 0) return [];
    const sel = alvaras.find((a) => a.id === alvaraId);
    if (filteredAlvaras.length === 0) {
      return sel ? [sel] : [];
    }
    if (!sel || filteredAlvaras.some((a) => a.id === alvaraId)) {
      return filteredAlvaras;
    }
    return [sel, ...filteredAlvaras];
  }, [alvaras, filteredAlvaras, alvaraId]);

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
        <div>
          <label htmlFor="etapas-tipo-busca" className="form-label mb-1.5 block">
            Buscar tipo de alvará
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="etapas-tipo-busca"
              type="search"
              className="input-field w-full pl-9"
              placeholder="Nome, grupo ou descrição…"
              value={tipoBusca}
              onChange={(e) => setTipoBusca(e.target.value)}
              disabled={loadingList || alvaras.length === 0}
              autoComplete="off"
            />
          </div>
          {tipoBusca.trim() && alvaras.length > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {filteredAlvaras.length} de {alvaras.length} tipo(s) com este filtro
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="etapas-alvara" className="form-label mb-1.5 block">
            Tipo de alvará
          </label>
          <select
            id="etapas-alvara"
            className="select-field"
            value={alvaraId}
            onChange={(e) => setAlvaraId(e.target.value)}
            disabled={loadingList || alvaras.length === 0}
          >
            {alvaras.length === 0 ? (
              <option value="">— Nenhum tipo cadastrado —</option>
            ) : (
              selectOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.alvara_groups?.name ? ` · ${a.alvara_groups.name}` : ""}
                </option>
              ))
            )}
          </select>
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
