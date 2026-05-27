"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import type { AlvaraGroup } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { AlvaraGruposGridSkeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const SWATCH = ["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#6366f1", "#14b8a6", "#64748b", "#111827"];

export default function AlvaraGruposPage() {
  const [groups, setGroups] = useState<AlvaraGroup[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    id?: string;
    name: string;
    description: string;
    color: string;
    is_active: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, al] = await Promise.all([
        apiJson<{ groups: AlvaraGroup[] }>("/api/alvara-groups"),
        apiJson<{ alvaras: { group_id: string | null }[] }>("/api/alvaras"),
      ]);
      setGroups(g.groups);
      const c: Record<string, number> = Object.fromEntries(g.groups.map((gr) => [gr.id, 0]));
      for (const a of al.alvaras) {
        if (a.group_id == null) continue;
        c[a.group_id] = (c[a.group_id] ?? 0) + 1;
      }
      setCounts(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!modal?.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      if (modal.id) {
        await apiJson("/api/alvara-groups/" + modal.id, {
          method: "PATCH",
          body: JSON.stringify({
            name: modal.name,
            description: modal.description || null,
            color: modal.color,
            is_active: modal.is_active,
          }),
        });
        toast.success("Grupo atualizado");
      } else {
        await apiJson("/api/alvara-groups", {
          method: "POST",
          body: JSON.stringify({
            name: modal.name,
            description: modal.description || null,
            color: modal.color,
            is_active: modal.is_active,
          }),
        });
        toast.success("Grupo criado");
      }
      setModal(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove(g: AlvaraGroup) {
    if (!confirm("Excluir o grupo?")) return;
    try {
      const res = await apiFetch("/api/alvara-groups/" + g.id, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      toast.success("Excluído");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (loading) return <AlvaraGruposGridSkeleton />;

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Grupos de alvará</h1>
          <p className="mt-0.5 text-sm text-slate-500">Categorize os tipos de alvará.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setModal({ name: "", description: "", color: SWATCH[0], is_active: true })
          }
          className="btn-primary shrink-0"
        >
          Novo grupo
        </button>
      </div>
      <div className="card-portal overflow-hidden">
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Nenhum grupo cadastrado</div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {groups.map((g) => (
              <div
                key={g.id}
                className={
                  "rounded-lg border p-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/30 " +
                  (!g.is_active
                    ? "border-slate-200/60 bg-slate-50/10 text-slate-500"
                    : "border-slate-200/90 bg-slate-50/40")
                }
                style={{ borderLeftWidth: 4, borderLeftColor: g.color }}
              >
                <div className="flex items-center justify-between">
                  <h2 className={`font-semibold ${!g.is_active ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"}`}>{g.name}</h2>
                  <span
                    className={
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium " +
                      (g.is_active
                        ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
                        : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20")
                    }
                  >
                    {g.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{g.description || "—"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Tipos de alvará no grupo:{" "}
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{counts[g.id] ?? 0}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        id: g.id,
                        name: g.name,
                        description: g.description ?? "",
                        color: g.color,
                        is_active: g.is_active,
                      })
                    }
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Editar
                  </button>
                  <Link
                    href={"/portal/alvaras?group_id=" + g.id}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Ver alvarás
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(g)}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {modal ? (
        <AccessibleModal
          open
          onClose={() => setModal(null)}
          labelledBy="grupo-modal-title"
          panelClassName="modal-panel"
        >
            <h3 id="grupo-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {modal.id ? "Editar" : "Novo"} grupo
            </h3>
            <p className="mt-1 text-sm text-slate-500">Campos com * são obrigatórios.</p>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <label className="form-label" htmlFor="grp-nome">
                  Nome *
                </label>
                <input
                  id="grp-nome"
                  className="input-field mt-1.5"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="grp-desc">
                  Descrição
                </label>
                <textarea
                  id="grp-desc"
                  className="textarea-field mt-1.5"
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="grp-active"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800"
                  checked={modal.is_active}
                  onChange={(e) => setModal({ ...modal, is_active: e.target.checked })}
                />
                <label className="form-label cursor-pointer select-none font-medium text-slate-700 dark:text-slate-300" htmlFor="grp-active">
                  Grupo ativo
                </label>
              </div>
              <div>
                <span className="form-label">Cor</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SWATCH.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModal({ ...modal, color: c })}
                      className={
                        "h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 " +
                        (modal.color === c ? "border-slate-900 ring-2 ring-slate-300" : "border-white shadow-sm")
                      }
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
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
