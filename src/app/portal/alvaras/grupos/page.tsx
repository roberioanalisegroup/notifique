"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import type { AlvaraGroup } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Grupos de alvará</h1>
          <p className="mt-0.5 text-sm text-slate-500">Categorize os tipos de alvará.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setModal({ name: "", description: "", color: SWATCH[0] })
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
                className="rounded-lg border border-slate-200/90 bg-slate-50/40 p-4 transition-colors hover:bg-slate-50/80"
                style={{ borderLeftWidth: 4, borderLeftColor: g.color }}
              >
                <h2 className="font-semibold text-slate-900">{g.name}</h2>
                <p className="text-sm text-slate-500">{g.description || "—"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Tipos de alvará no grupo:{" "}
                  <span className="font-medium tabular-nums text-slate-900">{counts[g.id] ?? 0}</span>
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
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
        >
          <div className="modal-panel">
            <h3 className="text-lg font-semibold text-slate-900">{modal.id ? "Editar" : "Novo"} grupo</h3>
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
          </div>
        </div>
      )}
    </div>
  );
}
