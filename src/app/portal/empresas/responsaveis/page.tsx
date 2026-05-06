"use client";

import { apiJson } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompanyAlvaraSummary } from "@/types";
import { formatCompanyDocumento } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Users } from "lucide-react";

type Collaborator = {
  id: string;
  display_name: string | null;
  email: string | null;
  label: string;
};

type CompanyRow = CompanyAlvaraSummary;

function empresaNome(r: CompanyRow) {
  return (r.razao_social ?? r.nome_fantasia ?? "—").trim() || "—";
}

export default function EmpresasResponsaveisPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const limit = 20;
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string | null>>({});
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkChoice, setBulkChoice] = useState<string>("");
  const bulkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (bulkTimer.current) clearTimeout(bulkTimer.current);
    bulkTimer.current = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => {
      if (bulkTimer.current) clearTimeout(bulkTimer.current);
    };
  }, [searchInput]);

  useEffect(() => {
    // sempre que o filtro muda, volta para a página 1
    setPage(1);
  }, [searchDebounced]);

  const loadCollaborators = useCallback(async () => {
    try {
      const d = await apiJson<{ collaborators: Collaborator[] }>("/api/collaborators");
      setCollaborators(d.collaborators);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar colaboradores");
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: String(limit),
        page: String(page),
      });
      if (searchDebounced) qs.set("search", searchDebounced);
      const d = await apiJson<{ companies: CompanyRow[]; count?: number; page?: number; limit?: number }>(
        "/api/companies?" + qs.toString()
      );
      const list = d.companies;
      setRows(list);
      setCount(typeof d.count === "number" ? d.count : list.length);
      const nextBase: Record<string, string | null> = {};
      const nextDraft: Record<string, string | null> = {};
      for (const r of list) {
        const v = r.responsible_user_id ?? null;
        nextBase[r.id] = v;
        nextDraft[r.id] = v;
      }
      setBaseline(nextBase);
      setDraft(nextDraft);
      setSelected(new Set());
      setAllMatchingSelected(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar empresas");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, page]);

  useEffect(() => {
    void loadCollaborators();
  }, [loadCollaborators]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const dirtyIds = useMemo(() => {
    return rows.map((r) => r.id).filter((id) => (baseline[id] ?? null) !== (draft[id] ?? null));
  }, [rows, baseline, draft]);

  const collabLabel = useMemo(() => {
    const m = new Map(collaborators.map((c) => [c.id, c.label]));
    return (id: string | null | undefined) => {
      if (!id) return "—";
      return m.get(id) ?? id;
    };
  }, [collaborators]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllShown() {
    if (rows.length === 0) return;
    setSelected(new Set(rows.map((r) => r.id)));
    setAllMatchingSelected(false);
  }

  function selectAllMatching() {
    if (count === 0) return;
    setSelected(new Set());
    setAllMatchingSelected(true);
    toast.success(`Selecionadas todas as ${count} empresas desta pesquisa.`, {
      description: "Ao aplicar em massa, a alteração será feita para todas (todas as páginas).",
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkChoice("");
    setAllMatchingSelected(false);
  }

  async function aplicarBulk() {
    const rid = bulkChoice === "" ? null : bulkChoice;
    if (!allMatchingSelected && selected.size === 0) {
      toast.error("Selecione pelo menos uma empresa.");
      return;
    }

    if (allMatchingSelected) {
      setSaving(true);
      try {
        await apiJson("/api/companies/responsible-batch", {
          method: "PATCH",
          body: JSON.stringify({
            apply_all: true,
            responsible_user_id: rid,
            search: searchDebounced || "",
          }),
        });
        toast.success("Responsável aplicado a todas as empresas da pesquisa.");
        await loadCompanies();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao aplicar em massa");
      } finally {
        setSaving(false);
      }
      return;
    }

    setDraft((prev) => {
      const n = { ...prev };
      for (const id of Array.from(selected)) {
        n[id] = rid;
      }
      return n;
    });
    toast.success("Alterações aplicadas na página. Use «Guardar alterações» para persistir.");
  }

  async function save() {
    if (dirtyIds.length === 0) {
      toast.message("Nada para guardar.");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/companies/responsible-batch", {
        method: "PATCH",
        body: JSON.stringify({
          assignments: dirtyIds.map((company_id) => ({
            company_id,
            responsible_user_id: draft[company_id],
          })),
        }),
      });
      toast.success("Responsáveis atualizados");
      await loadCompanies();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }

  const tableSkeleton = (
    <div className="card-portal overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-portal min-w-[900px]">
          <thead>
            <tr>
              {["", "Empresa", "Documento", "Município", "Responsável"].map((h, i) => (
                <th key={i}>{h || <span className="sr-only">Selecionar</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td>
                  <Skeleton className="h-4 w-4" />
                </td>
                <td>
                  <Skeleton className="h-4 w-56" />
                </td>
                <td>
                  <Skeleton className="h-4 w-36" />
                </td>
                <td>
                  <Skeleton className="h-4 w-28" />
                </td>
                <td>
                  <Skeleton className="h-9 w-full max-w-[220px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Responsáveis por empresa</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Defina quem é o colaborador responsável por cada cadastro. O nome aparece no{" "}
            <Link href="/portal/acompanhamento" className="font-medium text-blue-600 hover:underline">
              acompanhamento
            </Link>{" "}
            nas linhas das tarefas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={dirtyIds.length === 0 || saving}
            onClick={() => void save()}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "A guardar…" : `Guardar alterações (${dirtyIds.length})`}
          </button>
          <Link href="/portal/empresas" className="btn-secondary inline-flex items-center justify-center">
            Voltar às empresas
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input-field w-full pl-9"
            placeholder="Buscar por razão social, fantasia, CNPJ ou código…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar empresa"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Users className="h-4 w-4 shrink-0" />
          <span>{collaborators.length} colaboradores ativos</span>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm font-medium text-violet-950">
            {selected.size} empresa(s) selecionadas
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input-field min-w-[12rem]"
              value={bulkChoice}
              onChange={(e) => setBulkChoice(e.target.value)}
              aria-label="Responsável para atribuir em massa"
            >
              <option value="">Sem responsável</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-primary bg-violet-700 hover:bg-violet-600" onClick={aplicarBulk}>
              Aplicar à seleção
            </button>
            <button type="button" className="btn-secondary" onClick={clearSelection}>
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {allMatchingSelected && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm font-medium text-violet-950">
            Todas as {count} empresas desta pesquisa estão selecionadas
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input-field min-w-[12rem]"
              value={bulkChoice}
              onChange={(e) => setBulkChoice(e.target.value)}
              aria-label="Responsável para atribuir em massa"
              disabled={saving}
            >
              <option value="">Sem responsável</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary bg-violet-700 hover:bg-violet-600 disabled:opacity-50"
              onClick={() => void aplicarBulk()}
              disabled={saving}
            >
              {saving ? "Aplicando…" : "Aplicar a todas"}
            </button>
            <button type="button" className="btn-secondary" onClick={clearSelection} disabled={saving}>
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {loading ? (
        tableSkeleton
      ) : (
        <div className="card-portal overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
            <span>
              Mostrando {(page - 1) * limit + 1}-{Math.min(page * limit, count)} de {count} empresas
              {searchDebounced ? ` · filtro «${searchDebounced}»` : ""}.
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="font-medium text-blue-600 hover:underline" onClick={selectAllShown}>
                Selecionar todas desta página
              </button>
              <button type="button" className="font-medium text-blue-600 hover:underline" onClick={selectAllMatching}>
                Selecionar todas as empresas
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-portal min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-10">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  <th>Empresa</th>
                  <th>Documento</th>
                  <th>Município</th>
                  <th className="min-w-[240px]">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={"Selecionar " + empresaNome(r)}
                      />
                    </td>
                    <td className="font-medium text-slate-900">{empresaNome(r)}</td>
                    <td className="tabular-nums text-slate-700">
                      {formatCompanyDocumento(r.cadastro_tipo, r.numero_documento, r.cnpj)}
                    </td>
                    <td className="text-slate-600">{r.municipio ?? "—"}</td>
                    <td>
                      <select
                        className="input-field w-full max-w-[280px] text-sm"
                        value={draft[r.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : e.target.value;
                          setDraft((prev) => ({ ...prev, [r.id]: v }));
                        }}
                        aria-label={"Responsável por " + empresaNome(r)}
                      >
                        <option value="">Sem responsável</option>
                        {collaborators.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      {(baseline[r.id] ?? null) !== (draft[r.id] ?? null) && (
                        <span className="mt-1 block text-[0.65rem] text-amber-700">
                        Antes: {collabLabel(baseline[r.id])}
                      </span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-14 text-center text-sm text-slate-500">
                      Nenhuma empresa nesta pesquisa. Ajuste o filtro ou crie cadastros em{" "}
                      <Link href="/portal/empresas" className="font-medium text-blue-600 hover:underline">
                        Empresas
                      </Link>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-slate-600">
              Página {page} de {Math.max(1, Math.ceil(count / limit))}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(count / limit)), p + 1))}
                disabled={page >= Math.max(1, Math.ceil(count / limit)) || loading}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
