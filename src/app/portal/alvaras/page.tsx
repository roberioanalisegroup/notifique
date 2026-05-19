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
import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { AlvarasTableSkeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Row = Alvara & { alvara_groups: AlvaraGroup | null; vinculados: number };

const FILTER_SEM_GRUPO = "__sem_grupo__";

type ModalState = {
  id?: string;
  name: string;
  group_id: string;
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
};

function defaultModal(): ModalState {
  return {
    name: "",
    group_id: "",
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
  };
}

function rowToModal(r: Row): ModalState {
  return {
    id: r.id,
    name: r.name,
    group_id: r.group_id ?? "",
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
    const legal = toLegalPayload(modal);
    const legalErr = validateLegalForFrequencia(modal.frequencia, legal);
    if (legalErr) {
      toast.error(legalErr);
      return;
    }
    try {
      const body = {
        name: modal.name,
        group_id: modal.group_id.trim() ? modal.group_id.trim() : null,
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
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
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
      <div className="flex flex-wrap items-center gap-2">
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
      <ResponsiveTableShell label="Lista de alvarás">
          <table className="table-portal table-portal-stack md:min-w-[1040px]">
            <thead>
              <tr>
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-900">{r.name}</td>
                  <td>
                    {r.alvara_groups ? (
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: (r.alvara_groups.color ?? "#94a3b8") + "26",
                          color: "#0f172a",
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
                    })}
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
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
                  Grupo
                </label>
                <div>
                  <select
                    id="alvara-grupo"
                    className="select-field"
                    value={modal.group_id}
                    onChange={(e) => setModal({ ...modal, group_id: e.target.value })}
                  >
                    <option value="">Sem grupo (atribuir depois)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Opcional na criação; pode escolher o grupo ao editar.
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
