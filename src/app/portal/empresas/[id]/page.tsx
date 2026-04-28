"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import {
  cadastroTipoLabel,
  cn,
  formatCompanyDocumento,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type { Alvara, AlvaraGroup, Company, CompanyAlvara } from "@/types";
import { differenceInCalendarDays } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type LinkRow = CompanyAlvara & {
  alvaras: Alvara & { alvara_groups: AlvaraGroup };
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    emitido: "bg-green-100 text-green-900",
    pendente: "bg-amber-100 text-amber-900",
    vencido: "bg-red-100 text-red-800",
    renovando: "bg-blue-100 text-blue-900",
    cancelado: "bg-slate-200 text-slate-800",
  };
  return map[s] ?? "bg-slate-100 text-slate-800";
}

function formatCEP(cep: string | null | undefined): string {
  if (cep == null || cep === "") return "—";
  const d = String(cep).replace(/\D/g, "");
  if (d.length === 8) return d.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return String(cep);
}

function formatSecundariasList(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((x) => {
      if (x && typeof x === "object" && "codigo" in x && "descricao" in x) {
        const o = x as { codigo: unknown; descricao: unknown };
        return `${String(o.codigo)} — ${String(o.descricao)}`;
      }
      return String(x);
    });
  }
  return [String(val)];
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  return "—";
}

function InfoCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-portal flex flex-col p-4 sm:p-5", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 break-words font-medium text-slate-900">{children}</div>
    </div>
  );
}

export default function EmpresaPerfilPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<"dados" | "alvaras">("dados");
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [vinc, setVinc] = useState({
    open: false,
    groupIds: [] as string[],
    alvarasSemGrupoIds: [] as string[],
    observacoes: "",
  });
  const [groups, setGroups] = useState<AlvaraGroup[]>([]);
  const [alvarasSemGrupo, setAlvarasSemGrupo] = useState<
    (Alvara & { alvara_groups: AlvaraGroup })[]
  >([]);
  /** Inclui `undefined` = carregando alvarás do grupo */
  const [groupAlvaraLists, setGroupAlvaraLists] = useState<
    Record<string, (Alvara & { alvara_groups: AlvaraGroup })[] | undefined>
  >({});
  const [groupAlvaraSelected, setGroupAlvaraSelected] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const groupIdsRef = useRef(vinc.groupIds);
  groupIdsRef.current = vinc.groupIds;

  const resetVincModalFields = useCallback(() => {
    setGroupAlvaraLists({});
    setGroupAlvaraSelected({});
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await apiJson<{ company: Company; company_alvaras: LinkRow[] }>(
        "/api/companies/" + id
      );
      setCompany(d.company);
      setLinks(d.company_alvaras);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const g = await apiJson<{ groups: AlvaraGroup[] }>("/api/alvara-groups");
        setGroups(g.groups);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!vinc.open || editing) {
      return;
    }
    (async () => {
      try {
        const { alvaras } = await apiJson<{
          alvaras: (Alvara & { alvara_groups: AlvaraGroup })[];
        }>("/api/alvaras?sem_grupo=1");
        const sorted = [...alvaras].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        setAlvarasSemGrupo(sorted);
        setVinc((p) => {
          if (!p.open) return p;
          const valid = p.alvarasSemGrupoIds.filter((id) => sorted.some((a) => a.id === id));
          if (valid.length === p.alvarasSemGrupoIds.length) return p;
          return { ...p, alvarasSemGrupoIds: valid };
        });
      } catch {
        setAlvarasSemGrupo([]);
      }
    })();
  }, [vinc.open, editing]);

  async function refreshSync() {
    if (!company) return;
    const cnpj14 =
      company.cnpj ??
      (company.numero_documento?.length === 14 ? company.numero_documento : null);
    const okSync =
      ((company.cadastro_tipo ?? "cnpj") === "cnpj" ||
        (company.cadastro_tipo ?? "cnpj") === "mei") &&
      cnpj14 != null &&
      cnpj14.length === 14;
    if (!okSync) {
      toast.error("Consulta à Receita só está disponível para cadastros CNPJ ou MEI com 14 dígitos.");
      return;
    }
    setSyncing(true);
    try {
      await apiJson("/api/companies/sync-single", {
        method: "POST",
        body: JSON.stringify({ cnpj: cnpj14 }),
      });
      toast.success("Dados atualizados");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  async function removeCompany() {
    if (!id) return;
    if (!confirm("Excluir esta empresa? Os vínculos de alvarás serão removidos.")) return;
    try {
      await apiFetch("/api/companies/" + id, { method: "DELETE" });
      toast.success("Empresa removida");
      router.push("/portal/empresas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function saveVinc() {
    if (!id) return;
    const obs = vinc.observacoes.trim() || null;
    try {
      if (editing) {
        await apiJson("/api/company-alvaras/" + editing.id, {
          method: "PATCH",
          body: JSON.stringify({ observacoes: obs }),
        });
        toast.success("Vínculo atualizado");
        setVinc({
          open: false,
          groupIds: [],
          alvarasSemGrupoIds: [],
          observacoes: "",
        });
        setEditing(null);
        resetVincModalFields();
        void load();
        return;
      }

      for (const gid of vinc.groupIds) {
        if (groupAlvaraLists[gid] === undefined) {
          toast.error("Aguarde o carregamento dos alvarás de todos os grupos selecionados");
          return;
        }
      }

      const fromGroups = new Set<string>();
      for (const gid of vinc.groupIds) {
        for (const aid of groupAlvaraSelected[gid] ?? []) {
          fromGroups.add(aid);
        }
      }
      for (const aid of vinc.alvarasSemGrupoIds) {
        fromGroups.add(aid);
      }
      if (fromGroups.size === 0) {
        toast.error("Selecione ao menos um alvará (em um grupo) ou alvará sem grupo");
        return;
      }

      let created = 0;
      let skipped = 0;
      let failed = 0;
      let firstErr = "";
      for (const alvara_id of Array.from(fromGroups)) {
        try {
          await apiJson("/api/company-alvaras", {
            method: "POST",
            body: JSON.stringify({ company_id: id, alvara_id, observacoes: obs }),
          });
          created++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("já possui") || msg.toLowerCase().includes("duplicate")) {
            skipped++;
          } else {
            failed++;
            if (!firstErr) {
              firstErr = msg || "Erro ao vincular";
            }
          }
        }
      }
      if (firstErr) {
        toast.error(firstErr);
      }
      if (created > 0) {
        if (skipped > 0) {
          toast.success(`${created} vinculado(s); ${skipped} já estavam associados.`);
        } else {
          toast.success(created === 1 ? "Alvará vinculado" : `${created} alvarás vinculados`);
        }
      } else if (failed === 0 && skipped > 0) {
        toast.success("Nenhum vínculo novo: todos os selecionados já estavam associados.");
      }
      setVinc({
        open: false,
        groupIds: [],
        alvarasSemGrupoIds: [],
        observacoes: "",
      });
      setEditing(null);
      resetVincModalFields();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function toggleVincGroup(g: AlvaraGroup) {
    const on = vinc.groupIds.includes(g.id);
    if (on) {
      setVinc((p) => ({ ...p, groupIds: p.groupIds.filter((x) => x !== g.id) }));
      setGroupAlvaraLists((prev) => {
        const n = { ...prev };
        delete n[g.id];
        return n;
      });
      setGroupAlvaraSelected((prev) => {
        const n = { ...prev };
        delete n[g.id];
        return n;
      });
      return;
    }
    setVinc((p) => ({ ...p, groupIds: [...p.groupIds, g.id] }));
    (async () => {
      try {
        const { alvaras: raw } = await apiJson<{
          alvaras: (Alvara & { alvara_groups: AlvaraGroup })[];
        }>("/api/alvaras?group_id=" + encodeURIComponent(g.id));
        if (!groupIdsRef.current.includes(g.id)) {
          return;
        }
        const sorted = [...raw].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        setGroupAlvaraLists((prev) => ({ ...prev, [g.id]: sorted }));
        setGroupAlvaraSelected((prev) => ({
          ...prev,
          [g.id]: sorted.map((a) => a.id),
        }));
      } catch (e) {
        if (!groupIdsRef.current.includes(g.id)) {
          return;
        }
        toast.error(e instanceof Error ? e.message : "Erro ao carregar alvarás do grupo");
        setGroupAlvaraLists((prev) => ({ ...prev, [g.id]: [] }));
        setGroupAlvaraSelected((prev) => ({ ...prev, [g.id]: [] }));
      }
    })();
  }

  function markAllInGroup(gid: string) {
    const list = groupAlvaraLists[gid];
    if (!list?.length) {
      return;
    }
    setGroupAlvaraSelected((prev) => ({ ...prev, [gid]: list.map((a) => a.id) }));
  }

  function deselectAllInGroup(gid: string) {
    setGroupAlvaraSelected((prev) => ({ ...prev, [gid]: [] }));
  }

  function toggleAlvaraInGroup(gid: string, alvaraId: string) {
    const list = groupAlvaraLists[gid];
    if (!list) {
      return;
    }
    setGroupAlvaraSelected((prev) => {
      const cur = prev[gid] !== undefined ? prev[gid] : list.map((a) => a.id);
      const on = cur.includes(alvaraId);
      const next = on ? cur.filter((x) => x !== alvaraId) : [...cur, alvaraId];
      return { ...prev, [gid]: next };
    });
  }

  async function unlink(row: LinkRow) {
    if (!confirm("Desvincular este alvará?")) return;
    try {
      await apiFetch("/api/company-alvaras/" + row.id, { method: "DELETE" });
      toast.success("Desvinculado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (loading || !company) {
    return (
      <div className="space-y-6 text-slate-900 [color-scheme:light]">
        <div className="card-portal py-16 text-center text-sm text-slate-500">Carregando…</div>
      </div>
    );
  }

  const tipoCad = company.cadastro_tipo ?? "cnpj";
  const podeSincronizarReceita =
    (tipoCad === "cnpj" || tipoCad === "mei") &&
    (company.cnpj?.length === 14 || company.numero_documento?.length === 14);

  const sit = (company.situacao_cadastral ?? "").toUpperCase();
  const sitClass =
    sit === "ATIVA"
      ? "bg-green-100 text-green-900"
      : sit === "BAIXADA"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";

  const now = new Date();

  const groupAlvarasStillLoading =
    vinc.open &&
    !editing &&
    vinc.groupIds.some((gid) => groupAlvaraLists[gid] === undefined);

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/portal/empresas" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            ← Empresas
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {company.razao_social ?? "Empresa"}
          </h1>
          <p className="mt-0.5 font-mono text-sm text-slate-500">
            {formatCompanyDocumento(
              tipoCad,
              company.numero_documento ?? company.cnpj ?? "",
              company.cnpj
            )}
          </p>
          <p className="text-xs text-slate-500">{cadastroTipoLabel(tipoCad)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshSync}
            disabled={syncing || !podeSincronizarReceita}
            className="btn-secondary disabled:opacity-50"
            title={
              !podeSincronizarReceita
                ? "Disponível apenas para CNPJ ou MEI com 14 dígitos"
                : undefined
            }
          >
            {syncing ? "Atualizando…" : "Atualizar dados (Receita)"}
          </button>
          <button
            type="button"
            onClick={removeCompany}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-100"
          >
            Excluir
          </button>
        </div>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("dados")}
          className={
            "border-b-2 px-3 py-2.5 text-sm transition-colors " +
            (tab === "dados"
              ? "border-blue-600 font-medium text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          Dados cadastrais
        </button>
        <button
          type="button"
          onClick={() => setTab("alvaras")}
          className={
            "border-b-2 px-3 py-2.5 text-sm transition-colors " +
            (tab === "alvaras"
              ? "border-blue-600 font-medium text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          Alvarás
        </button>
      </div>
      {tab === "dados" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard title="Identificação" className="sm:col-span-2 lg:col-span-1">
            <InfoRow label="Tipo de cadastro">{cadastroTipoLabel(tipoCad)}</InfoRow>
            <InfoRow label="Documento">
              <span className="font-mono">
                {formatCompanyDocumento(
                  tipoCad,
                  company.numero_documento ?? company.cnpj ?? "",
                  company.cnpj
                )}
              </span>
            </InfoRow>
            <InfoRow label="Razão social">{company.razao_social ?? "—"}</InfoRow>
            <InfoRow label="Nome fantasia">{company.nome_fantasia ?? "—"}</InfoRow>
          </InfoCard>
          <InfoCard title="Situação cadastral">
            <InfoRow label="Situação">
              <span className={"inline-flex rounded-md px-2 py-0.5 text-xs font-medium " + sitClass}>
                {company.situacao_cadastral ?? "—"}
              </span>
            </InfoRow>
            <InfoRow label="Data da situação">
              {formatDate(company.data_situacao, { empty: "—" })}
            </InfoRow>
          </InfoCard>
          <InfoCard title="Regime e porte">
            <InfoRow label="Natureza jurídica">{company.natureza_juridica ?? "—"}</InfoRow>
            <InfoRow label="Porte">{company.porte ?? "—"}</InfoRow>
            <InfoRow label="Capital social">{formatCurrency(company.capital_social)}</InfoRow>
            <InfoRow label="Data de abertura">
              {formatDate(company.data_abertura, { empty: "—" })}
            </InfoRow>
            <InfoRow label="Optante pelo Simples">{boolLabel(company.opcao_simples)}</InfoRow>
            <InfoRow label="MEI">{boolLabel(company.opcao_mei)}</InfoRow>
          </InfoCard>
          <InfoCard title="Atividade principal" className="sm:col-span-2">
            <p className="text-slate-800">{company.atividade_principal ?? "—"}</p>
          </InfoCard>
          <InfoCard title="Atividades secundárias" className="sm:col-span-2 lg:col-span-1">
            {(() => {
              const list = formatSecundariasList(company.atividades_secundarias);
              if (list.length === 0) {
                return <p className="text-slate-500">—</p>;
              }
              return (
                <ul className="list-inside list-disc space-y-1.5 text-slate-800">
                  {list.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              );
            })()}
          </InfoCard>
          <InfoCard title="Endereço" className="sm:col-span-2">
            <InfoRow label="Logradouro">
              {[company.logradouro, company.numero, company.complemento].filter(Boolean).join(", ") ||
                "—"}
            </InfoRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Bairro">{company.bairro ?? "—"}</InfoRow>
              <InfoRow label="Município / UF">
                {company.municipio || company.uf
                  ? [company.municipio, company.uf].filter(Boolean).join(" / ")
                  : "—"}
              </InfoRow>
              <InfoRow label="CEP">{formatCEP(company.cep)}</InfoRow>
            </div>
          </InfoCard>
          <InfoCard title="Contato">
            <InfoRow label="Telefone">
              {company.telefone ? (
                <a href={"tel:" + company.telefone.replace(/\D/g, "")} className="text-blue-600 hover:underline">
                  {company.telefone}
                </a>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="E-mail">
              {company.email ? (
                <a href={"mailto:" + company.email} className="break-all text-blue-600 hover:underline">
                  {company.email}
                </a>
              ) : (
                "—"
              )}
            </InfoRow>
          </InfoCard>
          <InfoCard title="Sincronização com a Receita" className="sm:col-span-2 lg:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="Última atualização">
                {formatDate(company.last_sync_at, { empty: "—" })}
              </InfoRow>
              <InfoRow label="Status da sync">{company.sync_status ?? "—"}</InfoRow>
              {company.sync_error ? (
                <InfoRow label="Último erro">
                  <span className="font-normal text-red-800">{company.sync_error}</span>
                </InfoRow>
              ) : null}
            </div>
          </InfoCard>
        </div>
      )}
      {tab === "alvaras" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              resetVincModalFields();
              setVinc({
                open: true,
                groupIds: [],
                alvarasSemGrupoIds: [],
                observacoes: "",
              });
            }}
            className="btn-primary"
          >
            Vincular alvará
          </button>
          <div className="card-portal overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-portal min-w-[800px]">
                <thead>
                  <tr>
                    <th>Alvará / Grupo</th>
                    <th>Nº</th>
                    <th>Emissão</th>
                    <th>Prazo / validade</th>
                    <th>Notif.</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((row) => {
                    const v = row.data_vencimento ? new Date(row.data_vencimento) : null;
                    const days = v ? differenceInCalendarDays(v, now) : null;
                    const warn =
                      v && days != null && days >= 0 && days <= 30
                        ? " border-l-4 border-amber-500"
                        : v && v < now
                          ? " border-l-4 border-red-500"
                          : "";
                    return (
                      <tr key={row.id} className={warn || undefined}>
                        <td className="font-medium text-slate-900">
                          {row.alvaras.name}
                          <br />
                          <span className="text-xs font-normal text-slate-500">
                            {row.alvaras.alvara_groups?.name}
                          </span>
                        </td>
                        <td>{row.numero ?? "—"}</td>
                        <td>{formatDate(row.data_emissao, { empty: "—" })}</td>
                        <td>{formatDate(row.data_vencimento, { empty: "—" })}</td>
                        <td>{formatDate(row.data_notificacao, { empty: "—" })}</td>
                        <td>
                          <span className={"rounded-md px-2 py-0.5 text-xs font-medium " + statusBadge(row.status)}>
                            {row.status}
                          </span>
                        </td>
                        <td className="space-x-2">
                          <button
                            type="button"
                            className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          onClick={() => {
                            setEditing(row);
                            setVinc({
                              open: true,
                              groupIds: [],
                              alvarasSemGrupoIds: [],
                              observacoes: row.observacoes ?? "",
                            });
                          }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-sm font-medium text-red-600 hover:text-red-700"
                            onClick={() => void unlink(row)}
                          >
                            Desvincular
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {links.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhum alvará vinculado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {vinc.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-portal-md">
            <h3 className="text-lg font-semibold text-slate-900">
              {editing ? "Editar vínculo" : "Vincular alvará"}
            </h3>
            {editing ? (
              <p className="mt-1 text-sm text-slate-500">
                Ajuste as observações deste vínculo. Demais dados de acompanhamento ficam na tabela
                abaixo.
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Marque um <strong className="font-medium">grupo</strong> para carregar os tipos de
                alvará: por padrão <strong className="font-medium">todos vêm selecionados</strong>;
                desmarque os que não quiser ou use &quot;Desmarcar todos&quot; / &quot;Marcar
                todos&quot;. Abaixo, marque também os <strong className="font-medium">alvarás sem
                grupo</strong> desejados. Emissão e prazos ficam no acompanhamento depois.
              </p>
            )}
            <div className="mt-5 space-y-4 text-sm">
              {editing ? (
                <div>
                  <p className="text-xs text-slate-500">
                    {editing.alvaras.name} · {editing.alvaras.alvara_groups?.name ?? "Sem grupo"}
                  </p>
                </div>
              ) : (
                <>
                  <fieldset className="space-y-3">
                    <legend className="form-label mb-0">Grupos</legend>
                    <p className="text-xs text-slate-500">
                      Marque o grupo desejado; em seguida escolha quais alvarás desse grupo vincular
                      (inicialmente todos vêm marcados).
                    </p>
                    {groups.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum grupo cadastrado.</p>
                    ) : (
                      <div className="space-y-3">
                        {groups.map((g) => {
                          const included = vinc.groupIds.includes(g.id);
                          const list = groupAlvaraLists[g.id];
                          const loadingList = included && list === undefined;
                          const selected = groupAlvaraSelected[g.id] ?? [];
                          return (
                            <div
                              key={g.id}
                              className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                            >
                              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-900">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                                  checked={included}
                                  onChange={() => toggleVincGroup(g)}
                                />
                                <span>{g.name}</span>
                              </label>
                              {included && (
                                <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3 pl-1 sm:pl-6">
                                  {loadingList ? (
                                    <p className="text-xs text-slate-500">Carregando alvarás…</p>
                                  ) : !list?.length ? (
                                    <p className="text-xs text-slate-500">Nenhum alvará neste grupo.</p>
                                  ) : (
                                    <>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                          onClick={() => markAllInGroup(g.id)}
                                        >
                                          Marcar todos
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                          onClick={() => deselectAllInGroup(g.id)}
                                        >
                                          Desmarcar todos
                                        </button>
                                      </div>
                                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                                        {list.map((a) => (
                                          <label
                                            key={a.id}
                                            className="flex cursor-pointer items-start gap-2.5 text-slate-800"
                                          >
                                            <input
                                              type="checkbox"
                                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                                              checked={selected.includes(a.id)}
                                              onChange={() => toggleAlvaraInGroup(g.id, a.id)}
                                            />
                                            <span className="leading-snug">{a.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="form-label mb-0">Alvarás sem grupo</legend>
                    <p className="text-xs text-slate-500">
                      Marque os tipos que deseja vincular (além dos que entram pelos grupos acima).
                    </p>
                    <div className="mt-1.5 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      {alvarasSemGrupo.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhum alvará sem grupo cadastrado.</p>
                      ) : (
                        alvarasSemGrupo.map((a) => (
                          <label
                            key={a.id}
                            className="flex cursor-pointer items-start gap-2.5 text-slate-800"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                              checked={vinc.alvarasSemGrupoIds.includes(a.id)}
                              onChange={() => {
                                setVinc((p) => {
                                  const on = p.alvarasSemGrupoIds.includes(a.id);
                                  const alvarasSemGrupoIds = on
                                    ? p.alvarasSemGrupoIds.filter((x) => x !== a.id)
                                    : [...p.alvarasSemGrupoIds, a.id];
                                  return { ...p, alvarasSemGrupoIds };
                                });
                              }}
                            />
                            <span className="leading-snug">{a.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </fieldset>
                </>
              )}
              <div>
                <label className="form-label" htmlFor="vinc-obs">
                  Observações
                </label>
                <textarea
                  id="vinc-obs"
                  className="textarea-field mt-1.5"
                  value={vinc.observacoes}
                  onChange={(e) => setVinc((p) => ({ ...p, observacoes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setVinc((p) => ({ ...p, open: false }));
                  setEditing(null);
                  resetVincModalFields();
                }}
                className="btn-secondary"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={saveVinc}
                disabled={!editing && groupAlvarasStillLoading}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
