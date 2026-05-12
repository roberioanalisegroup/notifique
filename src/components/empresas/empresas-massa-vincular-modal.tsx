"use client";

import { apiJson } from "@/lib/api-client";
import type { Alvara, AlvaraGroup } from "@/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  companyIds: string[];
  onCompleted: () => void;
};

export function EmpresasMassaVincularModal({
  open,
  onClose,
  companyIds,
  onCompleted,
}: Props) {
  const [groups, setGroups] = useState<AlvaraGroup[]>([]);
  const [semGrupo, setSemGrupo] = useState<Alvara[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  /** `undefined` = ainda não carregado; lista vazia = grupo sem tarefas */
  const [alvarasByGroupId, setAlvarasByGroupId] = useState<Record<string, Alvara[] | undefined>>({});
  const [selectedAlvaraIds, setSelectedAlvaraIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const groupCheckboxRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedAlvaraIds(new Set());
    setAlvarasByGroupId({});
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      try {
        const [gRes, aRes] = await Promise.all([
          apiJson<{ groups: AlvaraGroup[] }>("/api/alvara-groups"),
          apiJson<{ alvaras: Alvara[] }>("/api/alvaras?sem_grupo=1"),
        ]);
        if (cancelled) return;
        setGroups(gRes.groups ?? []);
        const list = aRes.alvaras ?? [];
        list.sort((x, y) => (x.name ?? "").localeCompare(y.name ?? "", "pt"));
        setSemGrupo(list);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar dados");
          setGroups([]);
          setSemGrupo([]);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    for (const g of groups) {
      const el = groupCheckboxRefs.current[g.id];
      if (!el) continue;
      const list = alvarasByGroupId[g.id];
      if (!list) {
        el.indeterminate = false;
        continue;
      }
      const ids = list.map((a) => a.id);
      const n = ids.filter((id) => selectedAlvaraIds.has(id)).length;
      el.indeterminate = n > 0 && n < ids.length;
    }
  }, [open, groups, alvarasByGroupId, selectedAlvaraIds]);

  if (!open) return null;

  function toggleAlvara(id: string) {
    setSelectedAlvaraIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleGroupMaster(gId: string) {
    let list = alvarasByGroupId[gId];
    if (list === undefined) {
      try {
        const res = await apiJson<{ alvaras: Alvara[] }>(
          "/api/alvaras?group_id=" + encodeURIComponent(gId)
        );
        list = res.alvaras ?? [];
        list.sort((x, y) => (x.name ?? "").localeCompare(y.name ?? "", "pt"));
        setAlvarasByGroupId((prev) => ({ ...prev, [gId]: list }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao listar tarefas do grupo");
        return;
      }
    }
    const ids = list.map((a) => a.id);
    setSelectedAlvaraIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allOn) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    const ids = Array.from(selectedAlvaraIds);
    if (ids.length === 0) {
      toast.error("Selecione pelo menos uma tarefa (por grupo ou sem grupo)");
      return;
    }

    setSubmitting(true);
    let created = 0;
    let dup = 0;
    let errs = 0;
    try {
      for (const cid of companyIds) {
        for (const aid of ids) {
          try {
            await apiJson("/api/company-alvaras", {
              method: "POST",
              body: JSON.stringify({ company_id: cid, alvara_id: aid }),
            });
            created++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (
              msg.includes("já possui") ||
              msg.includes("duplicate") ||
              msg.includes("409")
            ) {
              dup++;
            } else {
              errs++;
            }
          }
        }
      }
      toast.success(
        `Concluído: ${created} novos vínculos; ${dup} já existentes${errs ? `; ${errs} erros` : ""}`
      );
      onCompleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="empresas-massa-vincular-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal-panel max-h-[min(90vh,44rem)] w-full max-w-xl overflow-hidden p-0 shadow-xl">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-700">
          <h2 id="empresas-massa-vincular-title" className="text-lg font-semibold text-slate-900">
            Vincular tarefas em massa
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {companyIds.length} empresa(s). Marque um grupo para carregar as tarefas e escolher quais
            vincular; use o checkbox do grupo para marcar ou desmarcar todas de uma vez.
          </p>
        </div>
        <div className="max-h-[min(62vh,30rem)] overflow-y-auto px-4 py-3 sm:px-5">
          {loadingData ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">A carregar…</p>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Grupos de tarefas
              </p>
              {groups.length === 0 ? (
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Nenhum grupo cadastrado.</p>
              ) : (
                <ul className="mb-4 space-y-3">
                  {groups.map((g) => {
                    const list = alvarasByGroupId[g.id];
                    const ids = list?.map((a) => a.id) ?? [];
                    const nSel = ids.filter((id) => selectedAlvaraIds.has(id)).length;
                    const allChecked = list !== undefined && ids.length > 0 && nSel === ids.length;
                    return (
                      <li key={g.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                        <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-slate-900">
                          <input
                            ref={(el) => {
                              groupCheckboxRefs.current[g.id] = el;
                            }}
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                            checked={allChecked}
                            onChange={() => void toggleGroupMaster(g.id)}
                          />
                          <span className="leading-tight">{g.name}</span>
                        </label>
                        {list !== undefined ? (
                          list.length === 0 ? (
                            <p className="mt-2 pl-6 text-xs text-slate-500 dark:text-slate-400">
                              Este grupo não tem tarefas cadastradas.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-1.5 border-t border-slate-100/80 pt-2 pl-6 dark:border-slate-600/80">
                              {list.map((a) => (
                                <li key={a.id}>
                                  <label className="flex cursor-pointer items-start gap-2 text-sm font-normal text-slate-800 dark:text-slate-200">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                                      checked={selectedAlvaraIds.has(a.id)}
                                      onChange={() => toggleAlvara(a.id)}
                                    />
                                    <span className="leading-tight">{a.name}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )
                        ) : (
                          <p className="mt-1.5 pl-6 text-xs text-slate-500 dark:text-slate-400">
                            Marque o grupo para carregar e selecionar as tarefas.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tarefas sem grupo
              </p>
              {semGrupo.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma tarefa sem grupo.</p>
              ) : (
                <ul className="space-y-2">
                  {semGrupo.map((a) => (
                    <li key={a.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                          checked={selectedAlvaraIds.has(a.id)}
                          onChange={() => toggleAlvara(a.id)}
                        />
                        <span className="leading-tight">{a.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5 dark:border-slate-700 dark:bg-slate-900/70">
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => !submitting && onClose()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || loadingData || companyIds.length === 0}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "A aplicar…" : "Aplicar vínculos"}
          </button>
        </div>
      </div>
    </div>
  );
}
