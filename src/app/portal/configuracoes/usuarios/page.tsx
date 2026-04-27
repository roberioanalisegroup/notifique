"use client";

import { apiJson } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalUser } from "@/types";
import { formatDate } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function UsuariosSkeleton() {
  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-10 w-44 shrink-0" />
      </div>
      <div className="card-portal overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-portal min-w-[700px]">
            <thead>
              <tr>
                {["E-mail", "Nome", "Telefone", "Último acesso", "Ações"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-14" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [rows, setRows] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [formCreate, setFormCreate] = useState({
    email: "",
    password: "",
    display_name: "",
    phone: "",
  });
  const [formEdit, setFormEdit] = useState({
    email: "",
    password: "",
    display_name: "",
    phone: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson<{ users: PortalUser[] }>("/api/users");
      setRows(d.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(r: PortalUser) {
    setEdit(r);
    setFormEdit({
      email: r.email ?? "",
      password: "",
      display_name: r.display_name ?? "",
      phone: r.phone ?? "",
    });
  }

  async function saveCreate() {
    setSaving(true);
    try {
      await apiJson("/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: formCreate.email,
          password: formCreate.password,
          display_name: formCreate.display_name || null,
          phone: formCreate.phone || null,
        }),
      });
      toast.success("Utilizador criado");
      setCreateOpen(false);
      setFormCreate({ email: "", password: "", display_name: "", phone: "" });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        email: formEdit.email,
        display_name: formEdit.display_name || null,
        phone: formEdit.phone || null,
      };
      if (formEdit.password.length > 0) {
        body.password = formEdit.password;
      }
      await apiJson("/api/users/" + edit.id, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Guardado no Supabase (Auth + perfil)");
      setEdit(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <UsuariosSkeleton />;
  }

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuários</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            E-mail e autenticação vêm do{" "}
            <span className="font-medium text-slate-700">Supabase Auth</span>; nome e telefone em{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
              public.profiles
            </code>{" "}
            (a API usa service role).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormCreate({ email: "", password: "", display_name: "", phone: "" });
            setCreateOpen(true);
          }}
          className="btn-primary shrink-0"
        >
          Novo utilizador
        </button>
      </div>

      <div className="card-portal overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-portal min-w-[700px]">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-900">{r.email ?? "—"}</td>
                  <td>{r.display_name ?? "—"}</td>
                  <td>{r.phone ?? "—"}</td>
                  <td className="text-slate-600">
                    {r.last_sign_in_at ? formatDate(r.last_sign_in_at) : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      onClick={() => openEdit(r)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Nenhum utilizador. Crie o primeiro com &quot;Novo utilizador&quot; ou /auth/register.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
        >
          <div className="modal-panel">
            <h3 className="text-lg font-semibold text-slate-900">Novo utilizador</h3>
            <p className="mt-1 text-sm text-slate-500">
              Cria conta no Auth e a linha em <code className="text-xs">public.profiles</code>.
            </p>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <label className="form-label" htmlFor="create-email">
                  E-mail *
                </label>
                <input
                  id="create-email"
                  className="input-field mt-1.5"
                  type="email"
                  value={formCreate.email}
                  onChange={(e) => setFormCreate({ ...formCreate, email: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="create-pass">
                  Senha (mín. 6) *
                </label>
                <input
                  id="create-pass"
                  className="input-field mt-1.5"
                  type="password"
                  autoComplete="new-password"
                  value={formCreate.password}
                  onChange={(e) => setFormCreate({ ...formCreate, password: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="create-name">
                  Nome a apresentar
                </label>
                <input
                  id="create-name"
                  className="input-field mt-1.5"
                  value={formCreate.display_name}
                  onChange={(e) => setFormCreate({ ...formCreate, display_name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="create-phone">
                  Telefone
                </label>
                <input
                  id="create-phone"
                  className="input-field mt-1.5"
                  value={formCreate.phone}
                  onChange={(e) => setFormCreate({ ...formCreate, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary disabled:opacity-50"
                disabled={saving}
                onClick={() => void saveCreate()}
              >
                {saving ? "A guardar…" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
        >
          <div className="modal-panel">
            <h3 className="text-lg font-semibold text-slate-900">Editar utilizador</h3>
            <p className="mt-1 text-sm text-slate-500">Campos com * são obrigatórios quando aplicável.</p>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <label className="form-label" htmlFor="edit-email">
                  E-mail
                </label>
                <input
                  id="edit-email"
                  className="input-field mt-1.5"
                  type="email"
                  value={formEdit.email}
                  onChange={(e) => setFormEdit({ ...formEdit, email: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="edit-pass">
                  Nova senha (vazio = não alterar)
                </label>
                <input
                  id="edit-pass"
                  className="input-field mt-1.5"
                  type="password"
                  autoComplete="new-password"
                  value={formEdit.password}
                  onChange={(e) => setFormEdit({ ...formEdit, password: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="edit-name">
                  Nome a apresentar
                </label>
                <input
                  id="edit-name"
                  className="input-field mt-1.5"
                  value={formEdit.display_name}
                  onChange={(e) => setFormEdit({ ...formEdit, display_name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="edit-phone">
                  Telefone
                </label>
                <input
                  id="edit-phone"
                  className="input-field mt-1.5"
                  value={formEdit.phone}
                  onChange={(e) => setFormEdit({ ...formEdit, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primary disabled:opacity-50"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
