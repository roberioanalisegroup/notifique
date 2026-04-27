"use client";

import { NovaEmpresaModal } from "@/components/empresas/nova-empresa-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson, apiFetch } from "@/lib/api-client";
import { formatCNPJ, formatDate } from "@/lib/utils";
import type { CompanyFilterOptions } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Row = {
  id: string;
  cnpj: string;
  razao_social: string | null;
  municipio: string | null;
  uf: string | null;
  situacao_cadastral: string | null;
  last_sync_at: string | null;
  sync_status: string | null;
  total_alvaras?: number;
};

function EmpresasTableLoading() {
  return (
    <div className="card-portal overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-portal min-w-[800px]">
          <thead>
            <tr>
              {["CNPJ", "Razão social", "Município/UF", "Situação", "Última sync", "Alvarás", "Ações"].map(
                (h) => (
                  <th key={h}>{h}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td>
                  <Skeleton className="h-4 w-28" />
                </td>
                <td>
                  <Skeleton className="h-4 w-full max-w-[200px]" />
                </td>
                <td>
                  <Skeleton className="h-4 w-24" />
                </td>
                <td>
                  <Skeleton className="h-4 w-16" />
                </td>
                <td>
                  <Skeleton className="h-4 w-20" />
                </td>
                <td>
                  <Skeleton className="h-5 w-8 rounded-full" />
                </td>
                <td>
                  <Skeleton className="h-4 w-12" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EmpresasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [situacao, setSituacao] = useState("");
  const [uf, setUf] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<CompanyFilterOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const limit = 20;
  const debouncedSearchRef = useRef(debouncedSearch);
  debouncedSearchRef.current = debouncedSearch;

  const citiesForUf = useMemo(() => {
    if (!uf || !filterOptions) return [];
    return filterOptions.citiesByUf[uf] ?? [];
  }, [uf, filterOptions]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next === debouncedSearchRef.current) return;
      setPage(1);
      setDebouncedSearch(next);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    (async () => {
      setOptionsLoading(true);
      try {
        const data = await apiJson<CompanyFilterOptions>("/api/companies/filter-options");
        setFilterOptions(data);
      } catch {
        setFilterOptions({ ufs: [], citiesByUf: {}, situacoes: [] });
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (situacao) params.set("situacao", situacao);
      if (uf) params.set("uf", uf);
      for (const m of selectedCities) {
        params.append("municipio", m);
      }
      const data = await apiJson<{ companies: Row[]; count: number }>(
        "/api/companies?" + params.toString()
      );
      setRows(data.companies);
      setCount(data.count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, situacao, uf, selectedCities]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncAll() {
    if (!confirm("Sincronizar todas as empresas (filtros da configuração)?")) return;
    setSyncingAll(true);
    try {
      const res = await apiFetch("/api/companies/sync-all", { method: "POST" });
      const j = (await res.json()) as {
        total?: number;
        success?: number;
        errors?: number;
        message?: string;
        error?: string;
        cap_applied?: boolean;
        total_queued?: number;
        cap?: number;
      };
      if (!res.ok) throw new Error(j.error ?? "Falha");
      let msg =
        j.message ??
        `Sincronizado: ${j.success ?? 0}/${j.total ?? 0} (erros: ${j.errors ?? 0})`;
      if (j.cap_applied && j.total_queued != null) {
        msg += ` — Processadas ${j.total} de ${j.total_queued} (máx. ${j.cap ?? "?"} por pedido).`;
      }
      toast.success(msg);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncingAll(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / limit));

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Empresas</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cadastro, filtros e sincronização com a Receita (BrasilAPI).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModal(true)} className="btn-primary shrink-0">
            Nova empresa
          </button>
          <Link href="/portal/empresas/importar" className="btn-secondary shrink-0 no-underline">
            Importar CSV
          </Link>
          <button
            type="button"
            onClick={syncAll}
            disabled={syncingAll}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
          >
            {syncingAll ? "Sincronizando…" : "Sincronizar todas"}
          </button>
        </div>
      </div>

      <div className="card-portal space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="empresas-busca" className="form-label mb-1.5 block">
              Buscar
            </label>
            <input
              id="empresas-busca"
              type="search"
              placeholder="CNPJ (com ou sem pontuação), razão social ou nome fantasia"
              className="input-field"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setDebouncedSearch("");
              setSituacao("");
              setUf("");
              setSelectedCities([]);
              setPage(1);
            }}
            className="btn-secondary h-10 shrink-0"
          >
            Limpar filtros
          </button>
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="empresas-situacao" className="form-label mb-1.5 block">
              Situação cadastral
            </label>
            <select
              id="empresas-situacao"
              className="select-field"
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPage(1);
              }}
              disabled={optionsLoading}
            >
              <option value="">Todas</option>
              {(filterOptions?.situacoes ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="empresas-uf" className="form-label mb-1.5 block">
              Estado (UF)
            </label>
            <select
              id="empresas-uf"
              className="select-field"
              value={uf}
              onChange={(e) => {
                setUf(e.target.value);
                setSelectedCities([]);
                setPage(1);
              }}
              disabled={optionsLoading}
            >
              <option value="">Todos os estados</option>
              {(filterOptions?.ufs ?? []).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {uf ? (
          <div className="border-t border-slate-100 pt-4">
            <p className="form-label mb-1">Municípios em {uf}</p>
            <p className="mb-3 text-xs text-slate-500">
              Lista baseada nas empresas já cadastradas. Nenhum município marcado ={" "}
              <span className="font-medium text-slate-600">todas as cidades deste estado</span>.
            </p>
            {citiesForUf.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum município cadastrado para este UF.</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={() => {
                      setSelectedCities([]);
                      setPage(1);
                    }}
                  >
                    Todas as cidades
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={() => {
                      setSelectedCities([...citiesForUf]);
                      setPage(1);
                    }}
                  >
                    Marcar todos
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {citiesForUf.map((city) => {
                      const checked = selectedCities.includes(city);
                      return (
                        <li key={city}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                              checked={checked}
                              onChange={() => {
                                setSelectedCities((prev) =>
                                  checked ? prev.filter((c) => c !== city) : [...prev, city]
                                );
                                setPage(1);
                              }}
                            />
                            <span className="leading-tight">{city}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {selectedCities.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-600">
                    {selectedCities.length} município(s) selecionado(s)
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <EmpresasTableLoading />
      ) : (
        <>
          <div className="card-portal overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-portal min-w-[800px]">
                <thead>
                  <tr>
                    <th>CNPJ</th>
                    <th>Razão social</th>
                    <th>Município/UF</th>
                    <th>Situação</th>
                    <th>Última sync</th>
                    <th>Alvarás</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-slate-800">{formatCNPJ(r.cnpj)}</td>
                      <td className="font-medium text-slate-900">{r.razao_social ?? "—"}</td>
                      <td>
                        {r.municipio ?? "—"}/{r.uf ?? "—"}
                      </td>
                      <td>{r.situacao_cadastral ?? "—"}</td>
                      <td className="text-slate-600">{formatDate(r.last_sync_at, { empty: "—" })}</td>
                      <td>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">
                          {r.total_alvaras ?? 0}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          href={"/portal/empresas/" + r.id}
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhuma empresa
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Página {page} de {totalPages} ({count} total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-secondary py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary py-2 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}

      <NovaEmpresaModal open={modal} onClose={() => setModal(false)} onSaved={() => void load()} />
    </div>
  );
}
