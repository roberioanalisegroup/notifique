"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import {
  ALVARA_FREQUENCIAS,
  DIAS_SEMANA_OPCOES,
  FREQUENCIA_LABELS,
  formatLegalSummary,
  WEEKEND_ADJUST_LABELS,
  WEEKEND_ADJUSTS,
  validateLegalForFrequencia,
  type AlvaraFrequencia,
  type AlvaraLegalDates,
  type WeekendAdjust,
} from "@/lib/alvara-frequency";
import type { Alvara, AlvaraGroup } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { AlvarasTableSkeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Row = Alvara & { alvara_groups: AlvaraGroup | null; groups?: AlvaraGroup[]; group_ids?: string[]; vinculados: number };

const FILTER_SEM_GRUPO = "__sem_grupo__";

type ModalState = {
  id?: string;
  name: string;
  group_id: string;
  group_ids?: string[];
  groups?: AlvaraGroup[];
  description: string;
  orgao_emissor: string;
  frequencia: AlvaraFrequencia;
  weekend_adjust: WeekendAdjust;
  legal_dia: number;
  legal_mes: number;
  legal_dia_semana: number;
  legal_dias_uteis: number;
  prazo_inicio_dias: number;
  anexo_obrigatorio: boolean;
  dias_frequencia_personalizada?: number | null;
  is_active: boolean;
};

function defaultModal(): ModalState {
  return {
    name: "",
    group_id: "",
    group_ids: [],
    description: "",
    orgao_emissor: "",
    frequencia: "mensal",
    weekend_adjust: "none",
    legal_dia: 1,
    legal_mes: 1,
    legal_dia_semana: 1,
    legal_dias_uteis: 5,
    prazo_inicio_dias: 30,
    anexo_obrigatorio: false,
    dias_frequencia_personalizada: null,
    is_active: true,
  };
}

function rowToModal(r: Row): ModalState {
  return {
    id: r.id,
    name: r.name,
    group_id: r.group_id ?? "",
    group_ids: r.group_ids ?? (r.groups ? r.groups.map((g) => g.id) : r.group_id ? [r.group_id] : []),
    description: r.description ?? "",
    orgao_emissor: r.orgao_emissor ?? "",
    frequencia: r.frequencia,
    weekend_adjust: r.weekend_adjust,
    legal_dia: r.legal_dia ?? 1,
    legal_mes: r.legal_mes ?? 1,
    legal_dia_semana: r.legal_dia_semana ?? 1,
    legal_dias_uteis: r.legal_dias_uteis ?? 5,
    prazo_inicio_dias: r.prazo_inicio_dias ?? 30,
    anexo_obrigatorio: r.anexo_obrigatorio === true,
    dias_frequencia_personalizada: r.dias_frequencia_personalizada ?? null,
    is_active: r.is_active,
  };
}

function toLegalPayload(m: ModalState): AlvaraLegalDates {
  const f = m.frequencia;
  if (
    f === "mensal" ||
    f === "bimestral" ||
    f === "trimestral" ||
    f === "semestral" ||
    f === "anual" ||
    f === "decendial"
  ) {
    return {
      legal_dia: null,
      legal_mes: null,
      legal_dia_semana: null,
      legal_dias_uteis: null,
    };
  }
  if (f === "diaria") {
    return {
      legal_dia: null,
      legal_mes: null,
      legal_dia_semana: null,
      legal_dias_uteis: null,
    };
  }
  if (f === "semanal") {
    return {
      legal_dia: null,
      legal_mes: null,
      legal_dia_semana: m.legal_dia_semana,
      legal_dias_uteis: null,
    };
  }
  return {
    legal_dia: null,
    legal_mes: null,
    legal_dia_semana: null,
    legal_dias_uteis: null,
  };
}

function LegalFieldsEditor({
  modal,
  setModal,
}: {
  modal: ModalState;
  setModal: (m: ModalState | null) => void;
}) {
  const f = modal.frequencia;

  if (
    f === "mensal" ||
    f === "bimestral" ||
    f === "trimestral" ||
    f === "semestral" ||
    f === "anual" ||
    f === "decendial"
  ) {
    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
        <span className="pt-2.5 text-sm font-semibold text-slate-800">Periodicidade</span>
        <p className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm text-slate-700">
          O vencimento segue só o intervalo de <strong>{FREQUENCIA_LABELS[f]}</strong>, somado à{" "}
          <strong>última data de emissão</strong> do vínculo (ou ao vencimento anterior no ciclo). Não é
          necessário definir dia ou mês fixos no tipo de alvará.
        </p>
      </div>
    );
  }

  if (f === "diaria") {
    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
        <span className="pt-2.5 text-sm font-semibold text-slate-800">
          Data legal <span className="text-red-600">*</span>
        </span>
        <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
          Não aplicável à frequência diária.
        </p>
      </div>
    );
  }

  if (f === "semanal") {
    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-center">
        <label className="text-sm font-semibold text-slate-800" htmlFor="legal-semana">
          Data legal <span className="text-red-600">*</span>
        </label>
        <select
          id="legal-semana"
          className="select-field"
          value={modal.legal_dia_semana}
          onChange={(e) =>
            setModal({ ...modal, legal_dia_semana: parseInt(e.target.value, 10) })
          }
        >
          {DIAS_SEMANA_OPCOES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (f === "personalizada") {
    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-center">
        <label className="text-sm font-semibold text-slate-800" htmlFor="dias-personalizados">
          Frequência (dias) <span className="text-red-600">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="dias-personalizados"
            type="number"
            min={1}
            max={3650}
            className="input-field max-w-[10rem]"
            value={modal.dias_frequencia_personalizada ?? ""}
            onChange={(e) =>
              setModal({
                ...modal,
                dias_frequencia_personalizada: Number(e.target.value) || null,
              })
            }
            placeholder="Ex: 7 ou 700"
          />
          <span className="text-xs text-slate-500">dias</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
      <span className="pt-2.5 text-sm font-semibold text-slate-800">Data legal</span>
      <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
        —
      </p>
    </div>
  );
}

function AlvarasContent() {
  const sp = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<AlvaraGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>(() => {
    if (sp.get("sem_grupo") === "1") return FILTER_SEM_GRUPO;
    return sp.get("group_id") ?? "";
  });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, Row>>({});
  const [massBusy, setMassBusy] = useState(false);
  const headerSelectRef = useRef<HTMLInputElement>(null);

  const filteredRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(query) ||
        (r.orgao_emissor ?? "").toLowerCase().includes(query) ||
        (r.description ?? "").toLowerCase().includes(query) ||
        (r.alvara_groups?.name ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, searchQuery]);

  const selectedCount = Object.keys(selectedRowsById).length;
  const allPageSelected = filteredRows.length > 0 && filteredRows.every((r) => !!selectedRowsById[r.id]);

  useEffect(() => {
    const el = headerSelectRef.current;
    if (!el) return;
    const all = filteredRows.length > 0 && filteredRows.every((r) => !!selectedRowsById[r.id]);
    const some = filteredRows.some((r) => !!selectedRowsById[r.id]);
    el.indeterminate = some && !all;
  }, [filteredRows, selectedRowsById]);

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
      const allOnPage = filteredRows.length > 0 && filteredRows.every((r) => !!prev[r.id]);
      const next = { ...prev };
      if (allOnPage) {
        for (const r of filteredRows) delete next[r.id];
      } else {
        for (const r of filteredRows) next[r.id] = r;
      }
      return next;
    });
  }

  async function massDelete() {
    const ids = Object.keys(selectedRowsById);
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} alvará(s)?\nA exclusão irá apagar os vínculos desses alvarás em todas as empresas. Esta ação não pode ser desfeita.`)) return;
    
    setMassBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const id of ids) {
        try {
          const res = await apiFetch(`/api/alvaras/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Erro HTTP " + res.status);
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(`${ok} excluído(s)${fail ? `; ${fail} falha(s)` : ""}`);
      setSelectedRowsById({});
      void load();
    } finally {
      setMassBusy(false);
    }
  }

  useEffect(() => {
    if (sp.get("sem_grupo") === "1") setGroupFilter(FILTER_SEM_GRUPO);
    else setGroupFilter(sp.get("group_id") ?? "");
  }, [sp]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let alvarasUrl = "/api/alvaras";
      if (groupFilter === FILTER_SEM_GRUPO) alvarasUrl += "?sem_grupo=1";
      else if (groupFilter) alvarasUrl += "?group_id=" + encodeURIComponent(groupFilter);

      const [a, g] = await Promise.all([
        apiJson<{ alvaras: Row[] }>(alvarasUrl),
        apiJson<{ groups: AlvaraGroup[] }>("/api/alvara-groups"),
      ]);
      setRows(a.alvaras);
      setGroups(g.groups);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [groupFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!modal?.name.trim()) {
      toast.error("Preencha o nome");
      return;
    }
    if (modal.frequencia === "personalizada" && (modal.dias_frequencia_personalizada == null || modal.dias_frequencia_personalizada <= 0)) {
      toast.error("Para frequência personalizada, defina a quantidade de dias.");
      return;
    }
    const legal = toLegalPayload(modal);
    const legalErr = validateLegalForFrequencia(modal.frequencia, legal);
    if (legalErr) {
      toast.error(legalErr);
      return;
    }
    try {
      const body = {
        name: modal.name,
        group_id: modal.group_ids && modal.group_ids.length > 0 ? modal.group_ids[0] : null,
        group_ids: modal.group_ids || [],
        description: modal.description || null,
        orgao_emissor: modal.orgao_emissor || null,
        frequencia: modal.frequencia,
        weekend_adjust: modal.weekend_adjust,
        legal_dia: legal.legal_dia,
        legal_mes: legal.legal_mes,
        legal_dia_semana: legal.legal_dia_semana,
        legal_dias_uteis: legal.legal_dias_uteis,
        prazo_inicio_dias: modal.prazo_inicio_dias,
        anexo_obrigatorio: modal.anexo_obrigatorio,
        is_active: modal.is_active,
        dias_frequencia_personalizada: modal.frequencia === "personalizada" ? modal.dias_frequencia_personalizada : null,
      };
      if (modal.id) {
        await apiJson("/api/alvaras/" + modal.id, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Alvará atualizado");
      } else {
        await apiJson("/api/alvaras", { method: "POST", body: JSON.stringify(body) });
        toast.success("Alvará criado");
      }
      setModal(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove(r: Row) {
    if (!confirm("Excluir este alvará?")) return;
    try {
      const res = await apiFetch("/api/alvaras/" + r.id, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      toast.success("Removido");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (loading) return <AlvarasTableSkeleton />;

  return (
    <div className={`space-y-6 text-slate-900 dark:text-slate-100 ${selectedCount > 0 ? "pb-24" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tipos de alvará</h1>
          <p className="mt-0.5 text-sm text-slate-500">Cadastre e organize os tipos de alvará por grupo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/alvaras/importar" className="btn-secondary shrink-0 no-underline">
            Importar CSV
          </Link>
          <button
            type="button"
            onClick={() => setModal(defaultModal())}
            className="btn-primary shrink-0"
          >
            Novo alvará
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="form-label">Filtrar por grupo</span>
          <select
            className="select-field max-w-xs"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value={FILTER_SEM_GRUPO}>Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <span className="form-label shrink-0">Buscar</span>
          <input
            type="search"
            placeholder="Buscar por nome, órgão, grupo..."
            className="input-field"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <ResponsiveTableShell label="Lista de alvarás">
          <table className="table-portal table-portal-stack md:min-w-[1040px]">
            <thead>
              <tr>
                <th className="w-10 px-2 py-2.5 align-middle" aria-label="Selecionar">
                  <input
                    type="checkbox"
                    ref={headerSelectRef}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    checked={allPageSelected}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
                <th>Nome</th>
                <th>Grupo</th>
                <th>Órgão</th>
                <th>Frequência</th>
                <th>Data legal</th>
                <th>Fim de semana</th>
                <th className="tabular-nums">Prazo início</th>
                <th>Anexo</th>
                <th className="tabular-nums">Vinculados</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td className="w-10 px-2 py-2.5 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={!!selectedRowsById[r.id]}
                      onChange={() => toggleSelectRow(r)}
                    />
                  </td>
                  <td className="font-medium">
                    <span className={!r.is_active ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"}>
                      {r.name}
                    </span>
                    {!r.is_active && (
                      <span className="ml-2 inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td>
                    {r.groups && r.groups.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.groups.map(g => (
                          <span
                            key={g.id}
                            className="inline-block rounded-md px-2 py-0.5 text-xs font-medium dark:text-slate-100"
                            style={{
                              background: (g.color ?? "#94a3b8") + "26",
                              color: g.color || "#475569",
                            }}
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    ) : r.alvara_groups ? (
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-xs font-medium dark:text-slate-100"
                        style={{
                          background: (r.alvara_groups.color ?? "#94a3b8") + "26",
                          color: r.alvara_groups.color || "#475569",
                        }}
                      >
                        {r.alvara_groups.name}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">Sem grupo</span>
                    )}
                  </td>
                  <td>{r.orgao_emissor ?? "—"}</td>
                  <td className="text-slate-800">
                    {FREQUENCIA_LABELS[r.frequencia] ?? r.frequencia}
                  </td>
                  <td className="max-w-[12rem] text-xs text-slate-700">
                    {formatLegalSummary(r.frequencia, {
                      legal_dia: r.legal_dia ?? null,
                      legal_mes: r.legal_mes ?? null,
                      legal_dia_semana: r.legal_dia_semana ?? null,
                      legal_dias_uteis: r.legal_dias_uteis ?? null,
                    }, r.dias_frequencia_personalizada)}
                  </td>
                  <td className="max-w-[12rem] text-xs text-slate-600">
                    {WEEKEND_ADJUST_LABELS[r.weekend_adjust] ?? r.weekend_adjust}
                  </td>
                  <td className="tabular-nums text-slate-700">{r.prazo_inicio_dias ?? 30} d</td>
                  <td className="text-xs text-slate-700">
                    {r.anexo_obrigatorio === true ? (
                      <span className="font-medium text-amber-900">Obrigatório</span>
                    ) : (
                      <span className="text-slate-600">Opcional</span>
                    )}
                  </td>
                  <td className="tabular-nums text-slate-600">{r.vinculados}</td>
                  <td className="space-x-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      onClick={() => setModal(rowToModal(r))}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                      onClick={() => void remove(r)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    Nenhum alvará
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </ResponsiveTableShell>
      {modal ? (
        <AccessibleModal
          open
          onClose={() => setModal(null)}
          labelledBy="alvara-modal-title"
          panelClassName="modal-panel max-h-[90vh] w-full max-w-xl overflow-y-auto p-6"
        >
            <h3 id="alvara-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {modal.id ? "Editar" : "Novo"} alvará
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Campos com <span className="text-red-600">*</span> são obrigatórios.
            </p>
            <div className="mt-5 space-y-5 text-sm">
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <label className="pt-2.5 text-sm font-semibold text-slate-800" htmlFor="alvara-grupo">
                  Grupo(s)
                </label>
                <div>
                  <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {groups.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 py-1">Nenhum grupo cadastrado</p>
                    ) : (
                      groups.map((g) => {
                        const checked = (modal.group_ids || []).includes(g.id);
                        return (
                          <label key={g.id} className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                            <input
                              type="checkbox"
                              className="checkbox-field rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={checked}
                              onChange={(e) => {
                                const nextIds = e.target.checked
                                  ? [...(modal.group_ids || []), g.id]
                                  : (modal.group_ids || []).filter((id: string) => id !== g.id);
                                setModal({ ...modal, group_ids: nextIds });
                              }}
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-200">{g.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Selecione um ou mais grupos para este alvará.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-center">
                <label className="text-sm font-semibold text-slate-800" htmlFor="alvara-nome">
                  Nome <span className="text-red-600">*</span>
                </label>
                <input
                  id="alvara-nome"
                  className="input-field"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <label className="pt-2.5 text-sm font-semibold text-slate-800" htmlFor="alvara-desc">
                  Descrição
                </label>
                <textarea
                  id="alvara-desc"
                  className="textarea-field"
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-center">
                <label className="text-sm font-semibold text-slate-800" htmlFor="alvara-orgao">
                  Órgão emissor
                </label>
                <input
                  id="alvara-orgao"
                  className="input-field"
                  value={modal.orgao_emissor}
                  onChange={(e) => setModal({ ...modal, orgao_emissor: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-center">
                <label className="text-sm font-semibold text-slate-800" htmlFor="alvara-freq">
                  Frequência <span className="text-red-600">*</span>
                </label>
                <select
                  id="alvara-freq"
                  className="select-field"
                  value={modal.frequencia}
                  onChange={(e) =>
                    setModal({ ...modal, frequencia: e.target.value as AlvaraFrequencia })
                  }
                >
                  {ALVARA_FREQUENCIAS.map((freq) => (
                    <option key={freq} value={freq}>
                      {FREQUENCIA_LABELS[freq]}
                    </option>
                  ))}
                </select>
              </div>

              <LegalFieldsEditor modal={modal} setModal={setModal} />

              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <label
                  className="pt-2.5 text-sm font-semibold text-slate-800"
                  htmlFor="alvara-weekend"
                >
                  Fim de semana
                </label>
                <div>
                  <select
                    id="alvara-weekend"
                    className="select-field"
                    value={modal.weekend_adjust}
                    onChange={(e) =>
                      setModal({ ...modal, weekend_adjust: e.target.value as WeekendAdjust })
                    }
                  >
                    {WEEKEND_ADJUSTS.map((w) => (
                      <option key={w} value={w}>
                        {WEEKEND_ADJUST_LABELS[w]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Se o vencimento calculado cair em sábado ou domingo, aplica-se este ajuste.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <label
                  className="pt-2.5 text-sm font-semibold text-slate-800"
                  htmlFor="alvara-prazo-inicio"
                >
                  Início obrigatório
                </label>
                <div>
                  <input
                    id="alvara-prazo-inicio"
                    type="number"
                    min={1}
                    max={3650}
                    className="input-field max-w-[10rem]"
                    value={modal.prazo_inicio_dias}
                    onChange={(e) =>
                      setModal({ ...modal, prazo_inicio_dias: Number(e.target.value) || 30 })
                    }
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Dias corridos após criar a tarefa (1.º ciclo) para mover o card de Pendente para Em andamento.
                    Nos ciclos seguintes usa-se só o vencimento da tarefa.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <span className="pt-2.5 text-sm font-semibold text-slate-800">Documento no vínculo</span>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="anexo-obrigatorio"
                        className="h-4 w-4 accent-blue-600"
                        checked={!modal.anexo_obrigatorio}
                        onChange={() => setModal({ ...modal, anexo_obrigatorio: false })}
                      />
                      Opcional ao concluir
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="anexo-obrigatorio"
                        className="h-4 w-4 accent-blue-600"
                        checked={modal.anexo_obrigatorio}
                        onChange={() => setModal({ ...modal, anexo_obrigatorio: true })}
                      />
                      Obrigatório para concluir a tarefa
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Se for obrigatório, o utilizador só pode concluir a tarefa com um ficheiro associado ao vínculo
                    empresa–alvará.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(7rem,9.5rem)_1fr] sm:items-start">
                <span className="pt-2.5 text-sm font-semibold text-slate-800">Status</span>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 mt-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800"
                      checked={modal.is_active}
                      onChange={(e) => setModal({ ...modal, is_active: e.target.checked })}
                    />
                    Alvará ativo
                  </label>
                  <p className="text-xs text-slate-500">
                    Alvarás inativos não geram novas tarefas no quadro de acompanhamento e não podem ser vinculados a novas empresas.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">
                Fechar
              </button>
              <button type="button" onClick={save} className="btn-primary">
                Salvar
              </button>
            </div>
        </AccessibleModal>
      ) : null}

      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] sm:px-6 md:left-[16rem] dark:border-slate-800 dark:bg-slate-900">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {selectedCount} selecionado(s)
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setSelectedRowsById({})}
              disabled={massBusy}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={massDelete}
              disabled={massBusy}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-700 bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:border-red-800 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-1 disabled:opacity-50"
            >
              {massBusy ? "Excluindo…" : "Excluir em massa"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlvarasPage() {
  return (
    <Suspense fallback={<AlvarasTableSkeleton />}>
      <AlvarasContent />
    </Suspense>
  );
}
