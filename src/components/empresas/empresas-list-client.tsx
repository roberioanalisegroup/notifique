"use client";

import { EmpresasMassaVincularModal } from "@/components/empresas/empresas-massa-vincular-modal";
import { NovaEmpresaModal } from "@/components/empresas/nova-empresa-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiJson } from "@/lib/api-client";
import { normalizeCnaeTokenList } from "@/lib/companies-cnae-filter";
import type { CompaniesSortKey } from "@/lib/companies-list-sort";
import {
  cn,
  formatCompanyDocumento,
  formatDate,
  onlyDigits,
} from "@/lib/utils";
import type { CompanyAlvaraSummary, CompanyFilterOptions } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Row = CompanyAlvaraSummary;

type EmpresasListVariant = "ativas" | "arquivadas";

function cnpj14ForSync(row: Row): string | null {
  const tipo = row.cadastro_tipo ?? "cnpj";
  if (tipo !== "cnpj" && tipo !== "mei") return null;
  const raw = row.cnpj ?? onlyDigits(row.numero_documento ?? "");
  const v = onlyDigits(raw);
  if (v.length !== 14) return null;
  return v;
}

function EmpresasTableLoading() {
  return (
    <div className="card-portal overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-portal min-w-[920px]">
          <thead>
            <tr>
              <th className="w-10 px-2 py-2.5 align-middle" aria-label="Selecionar" />
              {["Documento", "Código", "Razão social", "Município/UF", "Situação", "Última sync", "Alvarás", "Ações"].map(
                (h, idx) => (
                  <th
                    key={h}
                    className={
                      idx === 0
                        ? "min-w-[15rem] whitespace-nowrap px-4 py-2.5 align-middle"
                        : undefined
                    }
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="w-10 px-2 py-2.5 align-middle">
                  <Skeleton className="mx-auto h-4 w-4 rounded" />
                </td>
                <td className="min-w-[15rem] whitespace-nowrap px-4 py-2.5 align-middle">
                  <Skeleton className="h-4 w-[13.5rem] max-w-none" />
                </td>
                <td>
                  <Skeleton className="h-4 w-20" />
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

export function EmpresasListClient({ variant }: { variant: EmpresasListVariant }) {
  const arquivadas = variant === "arquivadas";
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cnaeInput, setCnaeInput] = useState("");
  const [debouncedCnaeInput, setDebouncedCnaeInput] = useState("");
  const [situacao, setSituacao] = useState("");
  const [uf, setUf] = useState("");
  const [sortKey, setSortKey] = useState<CompaniesSortKey>("razao");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<CompanyFilterOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [exportBusy, setExportBusy] = useState<null | "xlsx" | "pdf">(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, Row>>({});
  const [massaVincularOpen, setMassaVincularOpen] = useState(false);
  const [massaBusy, setMassaBusy] = useState<null | "archive" | "restore" | "sync">(null);
  const [selectAllMatchingBusy, setSelectAllMatchingBusy] = useState(false);
  const headerSelectRef = useRef<HTMLInputElement>(null);
  const limit = 20;
  const debouncedSearchRef = useRef(debouncedSearch);
  const debouncedCnaeRef = useRef(debouncedCnaeInput);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  debouncedSearchRef.current = debouncedSearch;
  debouncedCnaeRef.current = debouncedCnaeInput;
  const selectedCount = Object.keys(selectedRowsById).length;

  const citiesForUf = useMemo(() => {
    if (!uf || !filterOptions) return [];
    return filterOptions.citiesByUf[uf] ?? [];
  }, [uf, filterOptions]);

  const cnaeQueryCodes = useMemo(
    () => normalizeCnaeTokenList(debouncedCnaeInput.split(/[\s,;]+/).filter(Boolean)),
    [debouncedCnaeInput]
  );

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
    const t = setTimeout(() => {
      const next = cnaeInput.trim();
      if (next === debouncedCnaeRef.current) return;
      setPage(1);
      setDebouncedCnaeInput(next);
    }, 350);
    return () => clearTimeout(t);
  }, [cnaeInput]);

  useEffect(() => {
    (async () => {
      setOptionsLoading(true);
      try {
        const qs = arquivadas ? "?arquivadas=1" : "";
        const data = await apiJson<CompanyFilterOptions>(
          "/api/companies/filter-options" + qs
        );
        setFilterOptions(data);
      } catch {
        setFilterOptions({ ufs: [], citiesByUf: {}, situacoes: [] });
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, [arquivadas]);

  const buildCompaniesQuery = useCallback(
    (pageNum: number, pageLimit: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(pageLimit));
      if (arquivadas) params.set("arquivadas", "1");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (situacao) params.set("situacao", situacao);
      if (uf) params.set("uf", uf);
      for (const m of selectedCities) {
        params.append("municipio", m);
      }
      for (const c of cnaeQueryCodes) {
        params.append("cnae", c);
      }
      params.set("sort", sortKey);
      params.set("order", sortDir);
      return params.toString();
    },
    [arquivadas, debouncedSearch, situacao, uf, selectedCities, sortKey, sortDir, cnaeQueryCodes]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ companies: Row[]; count: number }>(
        "/api/companies?" + buildCompaniesQuery(page, limit)
      );
      setRows(data.companies);
      setCount(data.count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar");
    } finally {
      setLoading(false);
    }
  }, [page, limit, buildCompaniesQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedVisibleOnPage = useMemo(
    () => rows.reduce((n, r) => n + (selectedRowsById[r.id] ? 1 : 0), 0),
    [rows, selectedRowsById]
  );

  function onSortColumn(next: CompaniesSortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir("asc");
    }
    setPage(1);
  }

  useEffect(() => {
    const el = headerSelectRef.current;
    if (!el) return;
    const all = rows.length > 0 && rows.every((r) => !!selectedRowsById[r.id]);
    const some = rows.some((r) => !!selectedRowsById[r.id]);
    el.indeterminate = some && !all;
  }, [rows, selectedRowsById]);

  const allPageSelected = rows.length > 0 && rows.every((r) => !!selectedRowsById[r.id]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [exportMenuOpen]);

  async function exportEmpresas(format: "xlsx" | "pdf") {
    setExportMenuOpen(false);
    setExportBusy(format);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (arquivadas) params.set("arquivadas", "1");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (situacao) params.set("situacao", situacao);
      if (uf) params.set("uf", uf);
      for (const m of selectedCities) {
        params.append("municipio", m);
      }
      for (const c of cnaeQueryCodes) {
        params.append("cnae", c);
      }
      params.set("sort", sortKey);
      params.set("order", sortDir);

      const res = await apiFetch("/api/companies/export?" + params.toString());
      if (!res.ok) {
        const txt = await res.text();
        let msg = txt;
        try {
          msg = ((JSON.parse(txt) as { error?: string }).error ?? txt).trim();
        } catch {
          // ignore
        }
        throw new Error(msg || `Erro HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const starUtf = cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const ascii = cd.match(/filename="([^"]+)"/)?.[1];
      const fname = starUtf
        ? decodeURIComponent(starUtf)
        : ascii
          ? ascii
          : `empresas-alvaras.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        format === "xlsx" ? "Ficheiro XLSX transferido." : "PDF gerado."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setExportBusy(null);
    }
  }

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

  async function restaurarEmpresa(rowId: string) {
    setRestoreId(rowId);
    try {
      await apiJson(`/api/companies/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      });
      toast.success("Empresa restaurada");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setRestoreId(null);
    }
  }

  function toggleSelectRow(r: Row) {
    setSelectedRowsById((prev) => {
      if (prev[r.id]) {
        const { [r.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [r.id]: r };
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedRowsById((prev) => {
      const allOnPage = rows.length > 0 && rows.every((r) => !!prev[r.id]);
      const next = { ...prev };
      if (allOnPage) {
        for (const r of rows) delete next[r.id];
      } else {
        for (const r of rows) next[r.id] = r;
      }
      return next;
    });
  }

  async function selectAllMatchingFilters() {
    if (count === 0) {
      toast.error("Nenhuma empresa corresponde aos filtros atuais.");
      return;
    }
    const MAX = 5000;
    const toFetch = Math.min(count, MAX);
    if (count > MAX) {
      if (
        !confirm(
          `Existem ${count} empresas com estes filtros; só as primeiras ${MAX} podem ser carregadas de uma vez. Continuar?`
        )
      ) {
        return;
      }
    } else if (count > 1000) {
      if (!confirm(`Selecionar as ${count} empresas que correspondem aos filtros atuais?`)) {
        return;
      }
    }
    setSelectAllMatchingBusy(true);
    try {
      const byId: Record<string, Row> = {};
      const pageSize = 100;
      let pageNum = 1;
      while (Object.keys(byId).length < toFetch) {
        const data = await apiJson<{ companies: Row[] }>(
          "/api/companies?" + buildCompaniesQuery(pageNum, pageSize)
        );
        const batch = data.companies ?? [];
        if (batch.length === 0) break;
        for (const r of batch) {
          byId[r.id] = r;
          if (Object.keys(byId).length >= toFetch) break;
        }
        if (batch.length < pageSize) break;
        pageNum++;
      }
      setSelectedRowsById(byId);
      const n = Object.keys(byId).length;
      toast.success(
        count > MAX
          ? `${n} empresa(s) selecionada(s) (limite de ${MAX} por operação).`
          : `${n} empresa(s) selecionada(s).`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar empresas");
    } finally {
      setSelectAllMatchingBusy(false);
    }
  }

  async function massArchive() {
    const ids = Object.keys(selectedRowsById);
    if (ids.length === 0) return;
    if (!confirm(`Arquivar ${ids.length} empresa(s)?`)) return;
    setMassaBusy("archive");
    let ok = 0;
    let fail = 0;
    try {
      for (const id of ids) {
        try {
          await apiJson(`/api/companies/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ archived: true }),
          });
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(`${ok} arquivada(s)${fail ? `; ${fail} falha(s)` : ""}`);
      setSelectedRowsById({});
      void load();
    } finally {
      setMassaBusy(null);
    }
  }

  async function massRestore() {
    const ids = Object.keys(selectedRowsById);
    if (ids.length === 0) return;
    if (!confirm(`Restaurar ${ids.length} empresa(s)?`)) return;
    setMassaBusy("restore");
    let ok = 0;
    let fail = 0;
    try {
      for (const id of ids) {
        try {
          await apiJson(`/api/companies/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ archived: false }),
          });
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(`${ok} restaurada(s)${fail ? `; ${fail} falha(s)` : ""}`);
      setSelectedRowsById({});
      void load();
    } finally {
      setMassaBusy(null);
    }
  }

  async function massSync() {
    const list = Object.values(selectedRowsById);
    const eligible = list.filter((r) => cnpj14ForSync(r) != null);
    const skipped = list.length - eligible.length;
    if (eligible.length === 0) {
      toast.error(
        "Nenhuma empresa elegível: a sincronização com a Receita exige CNPJ ou MEI com 14 dígitos."
      );
      return;
    }
    if (
      !confirm(
        `Sincronizar ${eligible.length} empresa(s) com a Receita (BrasilAPI)?${
          skipped ? ` ${skipped} ignorada(s) (tipo ou documento inválido).` : ""
        }`
      )
    ) {
      return;
    }
    setMassaBusy("sync");
    let ok = 0;
    let fail = 0;
    try {
      for (const r of eligible) {
        const cnpj = cnpj14ForSync(r);
        if (!cnpj) continue;
        try {
          await apiJson("/api/companies/sync-single", {
            method: "POST",
            body: JSON.stringify({ cnpj }),
          });
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(
        `Sincronização: ${ok} concluída(s)${fail ? `; ${fail} falha(s)` : ""}${
          skipped ? `; ${skipped} ignorada(s)` : ""
        }`
      );
      setSelectedRowsById({});
      void load();
    } finally {
      setMassaBusy(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / limit));

  return (
    <div
      className={
        "space-y-6 text-slate-900 dark:text-slate-100" +
        (selectedCount > 0 ? " pb-28" : "")
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {arquivadas ? (
              <Link
                href="/portal/empresas"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                ← Empresas ativas
              </Link>
            ) : null}
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {arquivadas ? "Empresas arquivadas" : "Empresas"}
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {arquivadas
              ? "Empresas removidas da lista principal; o histórico de alvarás é mantido."
              : "Cadastro, filtros e sincronização com a Receita (BrasilAPI)."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!arquivadas ? (
            <button type="button" onClick={() => setModal(true)} className="btn-primary shrink-0">
              Nova empresa
            </button>
          ) : null}
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              disabled={!!exportBusy || loading}
              className="btn-secondary shrink-0 disabled:opacity-50"
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              title={
                arquivadas
                  ? "Exporta apenas empresas arquivadas conforme filtros (máx. 5000)"
                  : "Respeita os filtros atuais da lista principal (máx. 5000 empresas)"
              }
            >
              {exportBusy ? "A exportar…" : "Exportar"}
            </button>
            {exportMenuOpen && !exportBusy && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => void exportEmpresas("xlsx")}
                >
                  Exportar em XLSX
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => void exportEmpresas("pdf")}
                >
                  Exportar em PDF
                </button>
              </div>
            )}
          </div>
          {!arquivadas ? (
            <>
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
            </>
          ) : null}
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
              placeholder="CNPJ, código da empresa, razão social ou nome fantasia"
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
              setCnaeInput("");
              setDebouncedCnaeInput("");
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

        <div>
          <label htmlFor="empresas-cnae" className="form-label mb-1.5 block">
            CNAE (atividade principal ou secundárias)
          </label>
          <input
            id="empresas-cnae"
            type="text"
            inputMode="numeric"
            placeholder="Ex.: 6201500 4711302 ou 62.01-5-00 (vários: espaço, vírgula ou ponto e vírgula)"
            className="input-field"
            value={cnaeInput}
            onChange={(e) => setCnaeInput(e.target.value)}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Mostra empresas que tenham <span className="font-medium text-slate-600">qualquer um</span> dos
            códigos indicados na atividade principal ou nas secundárias (até 30 códigos, mínimo 4 dígitos cada).
          </p>
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
          {!arquivadas ? (
            <div className="flex flex-col items-start justify-end">
              <span className="form-label mb-1.5 block" aria-hidden>
                &#160;
              </span>
              <Link
                href="/portal/empresas/arquivadas"
                className="inline-flex h-10 w-fit max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-red-700 bg-red-700 px-3 text-sm font-medium text-white shadow-sm transition hover:border-red-800 hover:bg-red-800 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-700/50 no-underline"
              >
                Empresas arquivadas
              </Link>
            </div>
          ) : null}
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
              <table className="table-portal min-w-[920px]">
                <thead>
                  <tr>
                    <th className="w-10 px-2 py-2.5 align-middle">
                      <input
                        ref={headerSelectRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                        title="Selecionar todas nesta página"
                        aria-label="Selecionar todas as empresas desta página"
                        checked={allPageSelected}
                        onChange={() => toggleSelectAllOnPage()}
                      />
                    </th>
                    <th
                      className="min-w-[15rem] whitespace-nowrap px-4 py-2.5 align-middle"
                      aria-sort={
                        sortKey === "documento"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex max-w-full items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("documento")}
                        title="Ordenar por documento"
                      >
                        <span>Documento</span>
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            sortKey === "documento" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "documento" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "codigo"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("codigo")}
                        title="Ordenar por código da empresa"
                      >
                        <span>Código</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "codigo" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "codigo" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "razao"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("razao")}
                        title="Ordenar A–Z / Z–A por razão social"
                      >
                        <span>Razão social</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "razao" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "razao" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "municipio"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("municipio")}
                        title="Ordenar por município e UF"
                      >
                        <span>Município/UF</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "municipio" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "municipio" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "situacao"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("situacao")}
                        title="Ordenar por situação cadastral"
                      >
                        <span>Situação</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "situacao" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "situacao" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "sync"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("sync")}
                        title="Ordenar por data da última sincronização"
                      >
                        <span>Última sync</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "sync" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "sync" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th
                      className="align-middle"
                      aria-sort={
                        sortKey === "alvaras"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 rounded px-0.5 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => onSortColumn("alvaras")}
                        title="Ordenar por número de alvarás"
                      >
                        <span>Alvarás</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            sortKey === "alvaras" ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400"
                          )}
                          aria-hidden
                        >
                          {sortKey === "alvaras" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="w-10 px-2 py-2.5 align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                          checked={!!selectedRowsById[r.id]}
                          onChange={() => toggleSelectRow(r)}
                          aria-label={"Selecionar " + (r.razao_social ?? r.id)}
                        />
                      </td>
                      <td className="min-w-[15rem] whitespace-nowrap px-4 py-2.5 align-middle font-mono text-xs text-slate-800">
                        {formatCompanyDocumento(
                          r.cadastro_tipo ?? "cnpj",
                          r.numero_documento ?? r.cnpj ?? "",
                          r.cnpj
                        )}
                      </td>
                      <td className="font-mono text-xs text-slate-800">
                        {r.codigo_empresa?.trim() ? r.codigo_empresa.trim() : "—"}
                      </td>
                      <td className="font-medium text-slate-900">{r.razao_social ?? "—"}</td>
                      <td>
                        {r.municipio ?? "—"}/{r.uf ?? "—"}
                      </td>
                      <td>{r.situacao_cadastral ?? "—"}</td>
                      <td className="text-slate-600">
                        {formatDate(r.last_sync_at, { empty: "—" })}
                      </td>
                      <td>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">
                          {r.total_alvaras ?? 0}
                        </span>
                      </td>
                      <td className="space-x-3 whitespace-nowrap">
                        <Link
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          href={"/portal/empresas/" + r.id}
                        >
                          Abrir
                        </Link>
                        {arquivadas ? (
                          <button
                            type="button"
                            disabled={restoreId === r.id}
                            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                            onClick={() => void restaurarEmpresa(r.id)}
                          >
                            {restoreId === r.id ? "A restaurar…" : "Restaurar"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        {arquivadas ? "Nenhuma empresa arquivada" : "Nenhuma empresa"}
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

      {!arquivadas ? (
        <NovaEmpresaModal open={modal} onClose={() => setModal(false)} onSaved={() => void load()} />
      ) : null}

      <EmpresasMassaVincularModal
        open={massaVincularOpen}
        onClose={() => setMassaVincularOpen(false)}
        companyIds={Object.keys(selectedRowsById)}
        onCompleted={() => {
          setSelectedRowsById({});
          void load();
        }}
      />

      {selectedCount > 0 ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-700 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/80"
        >
          <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 text-sm font-medium text-slate-800">
                <span className="break-words">
                  {selectedCount} empresa(s) selecionada(s)
                  {selectedCount > selectedVisibleOnPage ? (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {selectedVisibleOnPage} nesta página; as restantes mantêm-se ao mudar de página, pesquisar ou
                      filtrar. Use «Limpar seleção» para recomeçar.
                    </span>
                  ) : null}
                </span>
              </span>
              <button
                type="button"
                className="text-sm font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900 disabled:opacity-50"
                disabled={!!massaBusy || selectAllMatchingBusy || count === 0}
                title="Inclui todas as empresas dos filtros atuais (não só esta página), até 5000."
                onClick={() => void selectAllMatchingFilters()}
              >
                {selectAllMatchingBusy ? "A carregar…" : "Selecionar todas"}
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                onClick={() => setSelectedRowsById({})}
              >
                Limpar seleção
              </button>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {!arquivadas ? (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100 disabled:opacity-50"
                  disabled={!!massaBusy || selectAllMatchingBusy}
                  onClick={() => void massArchive()}
                >
                  {massaBusy === "archive" ? "A arquivar…" : "Arquivar"}
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
                  disabled={!!massaBusy || selectAllMatchingBusy}
                  onClick={() => void massRestore()}
                >
                  {massaBusy === "restore" ? "A restaurar…" : "Restaurar"}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary py-2 text-sm disabled:opacity-50"
                disabled={!!massaBusy || selectAllMatchingBusy}
                onClick={() => setMassaVincularOpen(true)}
              >
                Vincular tarefas
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                disabled={!!massaBusy || selectAllMatchingBusy}
                onClick={() => void massSync()}
              >
                {massaBusy === "sync" ? "A sincronizar…" : "Sincronizar (Receita)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
