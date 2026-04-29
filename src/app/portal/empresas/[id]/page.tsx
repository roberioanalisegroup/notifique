"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import {
  cadastroTipoLabel,
  cn,
  formatCompanyDocumento,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type {
  Alvara,
  AlvaraGroup,
  Company,
  CompanyAlvara,
  CompanyHistoryEvent,
  CompanyHistoryEventType,
} from "@/types";
import { differenceInCalendarDays } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function formatHistoryDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COMPANY_HISTORY_EVENT_LABEL: Record<CompanyHistoryEventType, string> = {
  cadastro_sync: "Cadastro (Receita)",
  arquivamento: "Arquivamento",
  restauracao: "Restauração",
  tarefa_vinculada: "Tarefa vinculada",
  tarefa_desvinculada: "Tarefa desvinculada",
  tarefa_atualizada: "Vínculo atualizado",
  codigo_empresa_atualizado: "Código da empresa",
};

function companyHistoryEventBadgeClass(t: CompanyHistoryEventType): string {
  const m: Record<CompanyHistoryEventType, string> = {
    cadastro_sync: "bg-sky-100 text-sky-900",
    arquivamento: "bg-amber-100 text-amber-950",
    restauracao: "bg-emerald-100 text-emerald-900",
    tarefa_vinculada: "bg-violet-100 text-violet-900",
    tarefa_desvinculada: "bg-red-100 text-red-900",
    tarefa_atualizada: "bg-slate-200 text-slate-800",
    codigo_empresa_atualizado: "bg-teal-100 text-teal-900",
  };
  return m[t] ?? "bg-slate-100 text-slate-800";
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
  const [tab, setTab] = useState<"dados" | "alvaras" | "historico">("dados");
  const [historyRows, setHistoryRows] = useState<CompanyHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  /** Intervalo de datas (`YYYY-MM-DD`); vazio = sem limite nesse extremo. */
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [codigoEmpresaDraft, setCodigoEmpresaDraft] = useState("");
  const [codigoEmpresaSaving, setCodigoEmpresaSaving] = useState(false);
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
  /** Seleção na tabela de vínculos (aba Alvarás) — mesmo padrão da lista de empresas. */
  const [selectedLinkIds, setSelectedLinkIds] = useState<Record<string, true>>({});
  const [bulkUnlinking, setBulkUnlinking] = useState(false);
  const [bulkBarLeftPx, setBulkBarLeftPx] = useState<number | undefined>(undefined);
  const linkHeaderSelectRef = useRef<HTMLInputElement>(null);
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
    setSelectedLinkIds({});
    setHistorySearch("");
    setHistoryDateFrom("");
    setHistoryDateTo("");
  }, [id]);

  useEffect(() => {
    if (tab !== "alvaras") setSelectedLinkIds({});
  }, [tab]);

  useEffect(() => {
    setSelectedLinkIds((prev) => {
      const next: Record<string, true> = {};
      for (const lid of Object.keys(prev)) {
        if (links.some((l) => l.id === lid)) next[lid] = true;
      }
      return next;
    });
  }, [links]);

  useEffect(() => {
    const el = linkHeaderSelectRef.current;
    if (!el) return;
    const all = links.length > 0 && links.every((l) => !!selectedLinkIds[l.id]);
    const some = links.some((l) => !!selectedLinkIds[l.id]);
    el.indeterminate = some && !all;
  }, [links, selectedLinkIds]);

  useEffect(() => {
    const aside = document.getElementById("portal-sidebar");
    if (!aside || typeof ResizeObserver === "undefined") {
      setBulkBarLeftPx(undefined);
      return;
    }
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      if (!mq.matches) {
        setBulkBarLeftPx(undefined);
        return;
      }
      setBulkBarLeftPx(Math.round(aside.getBoundingClientRect().width));
    };
    const ro = new ResizeObserver(apply);
    ro.observe(aside);
    mq.addEventListener("change", apply);
    apply();
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (company) setCodigoEmpresaDraft((company.codigo_empresa ?? "").trim());
  }, [company?.id, company?.codigo_empresa]);

  useEffect(() => {
    if (tab !== "historico" || !id) return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const d = await apiJson<{ events: CompanyHistoryEvent[] }>(
          "/api/companies/" + id + "/historico"
        );
        if (!cancelled) setHistoryRows(d.events ?? []);
      } catch {
        if (!cancelled) {
          setHistoryRows([]);
          toast.error("Não foi possível carregar o histórico.");
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  const historyFiltered = useMemo(() => {
    const q = historySearch.trim().toLowerCase();

    let fromDay = historyDateFrom.trim();
    let toDay = historyDateTo.trim();
    if (fromDay && toDay && fromDay > toDay) {
      [fromDay, toDay] = [toDay, fromDay];
    }

    let fromMs: number | null = null;
    let toMs: number | null = null;
    if (fromDay) {
      const [y, m, d] = fromDay.split("-").map(Number);
      if (y && m && d) {
        fromMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      }
    }
    if (toDay) {
      const [y, m, d] = toDay.split("-").map(Number);
      if (y && m && d) {
        toMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      }
    }

    return historyRows.filter((ev) => {
      const t = new Date(ev.created_at).getTime();
      if (fromMs != null && !Number.isNaN(t) && t < fromMs) return false;
      if (toMs != null && !Number.isNaN(t) && t > toMs) return false;

      if (!q) return true;
      const meta =
        ev.metadata && typeof ev.metadata === "object"
          ? JSON.stringify(ev.metadata as Record<string, unknown>)
          : "";
      const haystack = [
        ev.summary,
        COMPANY_HISTORY_EVENT_LABEL[ev.event_type],
        ev.actor_display_name ?? "",
        formatHistoryDt(ev.created_at),
        ev.created_at,
        meta,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [historyRows, historySearch, historyDateFrom, historyDateTo]);

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
    if (!company || company.archived_at) return;
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

  async function archiveCompany() {
    if (!id) return;
    if (
      !confirm(
        "Arquivar esta empresa? Ela sai da lista principal; o histórico de vínculos e alvarás é mantido."
      )
    )
      return;
    try {
      await apiJson("/api/companies/" + id, {
        method: "PATCH",
        body: JSON.stringify({ archived: true }),
      });
      toast.success("Empresa arquivada");
      router.push("/portal/empresas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function restoreCompany() {
    if (!id) return;
    try {
      await apiJson("/api/companies/" + id, {
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      });
      toast.success("Empresa restaurada à lista principal");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function saveCodigoEmpresa() {
    if (!id || !company || company.archived_at) return;
    const next = codigoEmpresaDraft.trim().slice(0, 80);
    const cur = (company.codigo_empresa ?? "").trim();
    if (next === cur) return;
    setCodigoEmpresaSaving(true);
    try {
      await apiJson("/api/companies/" + id, {
        method: "PATCH",
        body: JSON.stringify({ codigo_empresa: next || null }),
      });
      toast.success("Código da empresa atualizado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setCodigoEmpresaSaving(false);
    }
  }

  async function saveVinc() {
    if (!id || company?.archived_at) {
      if (company?.archived_at) toast.error("Restaure a empresa para alterar vínculos.");
      return;
    }
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
    if (company?.archived_at) {
      toast.error("Restaure a empresa para alterar vínculos.");
      return;
    }
    if (!confirm("Desvincular este alvará?")) return;
    try {
      await apiFetch("/api/company-alvaras/" + row.id, { method: "DELETE" });
      toast.success("Desvinculado");
      setSelectedLinkIds((p) => {
        const n = { ...p };
        delete n[row.id];
        return n;
      });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  const linkSelectCount = Object.keys(selectedLinkIds).length;
  const allLinksSelected = links.length > 0 && links.every((l) => !!selectedLinkIds[l.id]);

  function toggleLinkRowSelect(linkId: string) {
    setSelectedLinkIds((p) => {
      const n = { ...p };
      if (n[linkId]) delete n[linkId];
      else n[linkId] = true;
      return n;
    });
  }

  function toggleSelectAllLinksOnPage() {
    if (allLinksSelected) {
      setSelectedLinkIds({});
      return;
    }
    setSelectedLinkIds(
      Object.fromEntries(links.map((l) => [l.id, true])) as Record<string, true>
    );
  }

  async function bulkUnlinkSelected() {
    if (company?.archived_at) {
      toast.error("Restaure a empresa para alterar vínculos.");
      return;
    }
    const ids = Object.keys(selectedLinkIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        ids.length === 1
          ? "Desvincular o alvará selecionado?"
          : `Desvincular ${ids.length} alvarás selecionados?`
      )
    ) {
      return;
    }
    setBulkUnlinking(true);
    let ok = 0;
    let fail = 0;
    let firstErr = "";
    try {
      for (const linkId of ids) {
        try {
          await apiFetch("/api/company-alvaras/" + linkId, { method: "DELETE" });
          ok++;
        } catch (e) {
          fail++;
          if (!firstErr) {
            firstErr = e instanceof Error ? e.message : "Erro";
          }
        }
      }
      if (firstErr) toast.error(firstErr);
      if (ok > 0) {
        toast.success(
          (ok === 1 ? "Desvinculado." : `${ok} vínculos removidos.`) +
            (fail > 0 ? ` ${fail} falha(s).` : "")
        );
      }
      setSelectedLinkIds({});
      void load();
    } finally {
      setBulkUnlinking(false);
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
    <div
      className={cn(
        "space-y-6 text-slate-900 [color-scheme:light]",
        tab === "alvaras" && linkSelectCount > 0 && "pb-28"
      )}
    >
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
          {company.archived_at ? (
            <button type="button" onClick={() => void restoreCompany()} className="btn-primary">
              Restaurar empresa
            </button>
          ) : (
            <>
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
                onClick={() => void archiveCompany()}
                className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-100"
              >
                Arquivar
              </button>
            </>
          )}
        </div>
      </div>
      {company.archived_at ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Empresa arquivada.</p>
          <p className="mt-1 text-amber-900/85">
            Não aparece na lista principal. O histórico de alvarás é mantido.{" "}
            <Link href="/portal/empresas/arquivadas" className="font-medium text-amber-900 underline">
              Lista de arquivadas
            </Link>
          </p>
        </div>
      ) : null}
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
        <button
          type="button"
          onClick={() => setTab("historico")}
          className={
            "border-b-2 px-3 py-2.5 text-sm transition-colors " +
            (tab === "historico"
              ? "border-blue-600 font-medium text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          Histórico
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
            <InfoRow label="Código da empresa (interno)">
              {company.archived_at ? (
                <span className="font-mono text-slate-900">
                  {company.codigo_empresa?.trim() ? company.codigo_empresa.trim() : "—"}
                </span>
              ) : (
                <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    className="input-field min-w-0 flex-1 font-mono"
                    value={codigoEmpresaDraft}
                    onChange={(e) => setCodigoEmpresaDraft(e.target.value.slice(0, 80))}
                    placeholder="Opcional — referência interna"
                    maxLength={80}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    disabled={codigoEmpresaSaving}
                    onClick={() => void saveCodigoEmpresa()}
                  >
                    {codigoEmpresaSaving ? "A guardar…" : "Guardar código"}
                  </button>
                </div>
              )}
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
              if (company.archived_at) {
                toast.error("Restaure a empresa para vincular alvarás.");
                return;
              }
              setEditing(null);
              resetVincModalFields();
              setVinc({
                open: true,
                groupIds: [],
                alvarasSemGrupoIds: [],
                observacoes: "",
              });
            }}
            className="btn-primary disabled:opacity-50"
            disabled={!!company.archived_at}
          >
            Vincular alvará
          </button>
          <div className="card-portal overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-portal min-w-[800px]">
                <thead>
                  <tr>
                    <th className="w-10 px-2 py-2.5 align-middle" aria-label="Selecionar">
                      <input
                        ref={linkHeaderSelectRef}
                        type="checkbox"
                        className="mx-auto block h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 disabled:opacity-40"
                        checked={allLinksSelected && links.length > 0}
                        disabled={!!company.archived_at || links.length === 0}
                        onChange={toggleSelectAllLinksOnPage}
                        title="Selecionar todos na lista"
                      />
                    </th>
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
                        <td className="w-10 px-2 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            className="mx-auto block h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 disabled:opacity-40"
                            checked={!!selectedLinkIds[row.id]}
                            disabled={!!company.archived_at}
                            onChange={() => toggleLinkRowSelect(row.id)}
                            aria-label={"Selecionar " + row.alvaras.name}
                          />
                        </td>
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
                            className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
                            disabled={!!company.archived_at}
                          onClick={() => {
                              if (company.archived_at) {
                                toast.error("Restaure a empresa para editar vínculos.");
                                return;
                              }
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
                            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                            disabled={!!company.archived_at}
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
                      <td colSpan={8} className="py-10 text-center text-slate-500">
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
      {tab === "historico" && (
        <div className="card-portal p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Registo de alterações
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Sincronização do cadastro com a Receita, arquivamento, restauração e alterações aos
            vínculos de tarefas (incluir, editar ou remover).
          </p>
          {!historyLoading && historyRows.length > 0 ? (
            <div className="mt-4 space-y-4">
              <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="historico-search" className="form-label mb-1.5 block">
                    Texto
                  </label>
                  <input
                    id="historico-search"
                    type="search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Resumo, tipo de evento, utilizador, CNPJ em metadados…"
                    className="input-field w-full"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="historico-de" className="form-label mb-1.5 block">
                    Data inicial
                  </label>
                  <input
                    id="historico-de"
                    type="date"
                    value={historyDateFrom}
                    max={historyDateTo || undefined}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="input-field w-full font-mono text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="historico-ate" className="form-label mb-1.5 block">
                    Data final
                  </label>
                  <input
                    id="historico-ate"
                    type="date"
                    value={historyDateTo}
                    min={historyDateFrom || undefined}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    className="input-field w-full font-mono text-sm"
                  />
                </div>
              </div>
              <div className="flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs text-slate-500">
                  {(() => {
                    const hasF =
                      historySearch.trim() !== "" ||
                      historyDateFrom.trim() !== "" ||
                      historyDateTo.trim() !== "";
                    if (!hasF) {
                      return `${historyRows.length} evento(s).`;
                    }
                    if (historyFiltered.length === historyRows.length) {
                      return `${historyRows.length} evento(s) correspondem aos filtros.`;
                    }
                    return `${historyFiltered.length} de ${historyRows.length} evento(s) com os filtros atuais.`;
                  })()}
                </p>
                {(historySearch.trim() !== "" ||
                  historyDateFrom.trim() !== "" ||
                  historyDateTo.trim() !== "") && (
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-600 underline decoration-blue-200 underline-offset-2 hover:text-blue-800"
                    onClick={() => {
                      setHistorySearch("");
                      setHistoryDateFrom("");
                      setHistoryDateTo("");
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
              {historyDateFrom.trim() !== "" &&
              historyDateTo.trim() !== "" &&
              historyDateFrom.trim() > historyDateTo.trim() ? (
                <p className="max-w-3xl text-xs text-amber-800">
                  A data inicial é posterior à final: o intervalo foi invertido automaticamente na
                  filtragem.
                </p>
              ) : null}
            </div>
          ) : null}
          {historyLoading ? (
            <p className="mt-6 text-sm text-slate-500">A carregar…</p>
          ) : historyRows.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Nenhum evento registado ainda.</p>
          ) : historyFiltered.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              Nenhum evento corresponde aos filtros
              {historySearch.trim() !== "" ? (
                <>
                  {" "}
                  (texto «{historySearch.trim()}»
                  {historyDateFrom.trim() !== "" || historyDateTo.trim() !== ""
                    ? "; datas aplicadas"
                    : ""}
                  )
                </>
              ) : historyDateFrom.trim() !== "" || historyDateTo.trim() !== "" ? (
                <> (intervalo de datas)</>
              ) : null}
              .{" "}
              <button
                type="button"
                className="font-medium text-blue-600 hover:text-blue-700"
                onClick={() => {
                  setHistorySearch("");
                  setHistoryDateFrom("");
                  setHistoryDateTo("");
                }}
              >
                Limpar filtros
              </button>
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-slate-100">
              {historyFiltered.map((ev) => (
                <li key={ev.id} className="py-4 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2 gap-y-1">
                    <span
                      className={
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium " +
                        companyHistoryEventBadgeClass(ev.event_type)
                      }
                    >
                      {COMPANY_HISTORY_EVENT_LABEL[ev.event_type]}
                    </span>
                    <time
                      className="text-xs tabular-nums text-slate-500"
                      dateTime={ev.created_at}
                    >
                      {formatHistoryDt(ev.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">{ev.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ev.actor_user_id ? (
                      <>
                        Alterado por:{" "}
                        <span className="font-medium text-slate-700">
                          {ev.actor_display_name &&
                          ev.actor_display_name.trim() &&
                          ev.actor_display_name !== "—"
                            ? ev.actor_display_name
                            : "Nome indisponível"}
                        </span>
                      </>
                    ) : (
                      <>
                        Alterado por:{" "}
                        <span className="font-medium text-slate-600">
                          sistema ou conta de serviço (sem utilizador associado)
                        </span>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
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

      {tab === "alvaras" && linkSelectCount > 0 ? (
        <div
          className={cn(
            "fixed bottom-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur supports-[backdrop-filter]:bg-white/80",
            bulkBarLeftPx === undefined && "left-0"
          )}
          style={bulkBarLeftPx != null ? { left: bulkBarLeftPx } : undefined}
        >
          <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 text-sm font-medium text-slate-800">
                <span className="break-words">
                  {linkSelectCount}{" "}
                  {linkSelectCount === 1 ? "vínculo selecionado" : "vínculos selecionados"}
                </span>
              </span>
              <button
                type="button"
                className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                disabled={bulkUnlinking}
                onClick={() => setSelectedLinkIds({})}
              >
                Limpar seleção
              </button>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100 disabled:opacity-50"
                disabled={bulkUnlinking || !!company.archived_at}
                onClick={() => void bulkUnlinkSelected()}
              >
                {bulkUnlinking ? "A desvincular…" : "Desvincular selecionados"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
