"use client";

import { PORTAL_SCREEN_DEFS } from "@/config/portal-screens";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api-client";
import { sanitizePortalPermissions } from "@/lib/sanitize-portal-permissions";
import { createClient } from "@/lib/supabase/client";
import type { PortalPermissionsMap, PortalUser } from "@/types";
import { formatDate } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const CONFIGURABLE_SCREENS = PORTAL_SCREEN_DEFS.filter((s) => !s.adminOnly);

type PermLevel = "none" | "read" | "edit";

function fullEditSelections(): Record<string, PermLevel> {
  return Object.fromEntries(CONFIGURABLE_SCREENS.map((s) => [s.key, "edit" as const])) as Record<
    string,
    PermLevel
  >;
}

function selectionsFromStored(
  p: PortalPermissionsMap | null | undefined,
  role: PortalUser["role"]
): Record<string, PermLevel> {
  return Object.fromEntries(
    CONFIGURABLE_SCREENS.map((s) => {
      const v = role === "user" && p != null ? p[s.key] : undefined;
      return [s.key, v === "read" || v === "edit" ? v : ("none" as PermLevel)];
    })
  ) as Record<string, PermLevel>;
}

function shouldRestrictStored(p: PortalPermissionsMap | null | undefined, role: PortalUser["role"]): boolean {
  return role === "user" && p != null;
}

/** Converte níveis UI → mapa gravado (`none` omitido); passa sanitize. */
function serializePermSelections(sel: Record<string, PermLevel>): PortalPermissionsMap {
  const out: PortalPermissionsMap = {};
  for (const s of CONFIGURABLE_SCREENS) {
    const v = sel[s.key];
    if (v === "read" || v === "edit") out[s.key] = v;
  }
  return sanitizePortalPermissions(out);
}

function TelasAcessoUsuario({
  enabled,
  restrict,
  setRestrict,
  perm,
  setPerm,
}: {
  enabled: boolean;
  restrict: boolean;
  setRestrict: (v: boolean) => void;
  perm: Record<string, PermLevel>;
  setPerm: Dispatch<SetStateAction<Record<string, PermLevel>>>;
}) {
  if (!enabled) {
    return (
      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Administradores têm acesso total a todas as áreas configuráveis. A gestão de utilizadores continua reservada a
        administradores.
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
      <label className="flex cursor-pointer items-start gap-2 text-slate-800">
        <input
          type="checkbox"
          className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={restrict}
          onChange={(e) => {
            const on = e.target.checked;
            setRestrict(on);
            if (on) setPerm(fullEditSelections());
          }}
        />
        <span>
          <span className="font-medium">Restringir telas do portal</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-600">
            Desligado: igual ao comportamento anterior (todas as telas configuráveis, com edição). Ligado: só entram no
            mapa as telas que definir; &quot;Sem acesso&quot; bloqueia a rota ao guardar.
          </span>
        </span>
      </label>
      {restrict && (
        <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-200/80 pt-3">
          {CONFIGURABLE_SCREENS.map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 flex-1 text-xs text-slate-700">{s.label}</span>
              <select
                className="input-field h-9 max-w-full flex-none text-xs sm:w-44"
                value={perm[s.key] ?? "none"}
                onChange={(e) => {
                  const v = e.target.value as PermLevel;
                  setPerm((prev) => ({ ...prev, [s.key]: v }));
                }}
              >
                <option value="none">Sem acesso</option>
                <option value="read">Só visualização</option>
                <option value="edit">Edição</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsuariosSkeleton() {
  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-10 w-44 shrink-0" />
      </div>
      <ResponsiveTableShell label="Lista de utilizadores">
          <table className="table-portal table-portal-stack md:min-w-[700px]">
            <thead>
              <tr>
                {["E-mail", "Nome", "Telefone", "Cargo", "Estado", "Último acesso", "Ações"].map((h) => (
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
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-16" />
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
      </ResponsiveTableShell>
    </div>
  );
}

function roleLabel(r: PortalUser["role"]) {
  return r === "admin" ? "Administrador" : "Utilizador";
}

export default function UsuariosPage() {
  const [rows, setRows] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [formCreate, setFormCreate] = useState({
    email: "",
    password: "",
    display_name: "",
    phone: "",
    role: "user" as PortalUser["role"],
    is_active: true,
  });
  const [portalRestrictCreate, setPortalRestrictCreate] = useState(false);
  const [permCreate, setPermCreate] = useState<Record<string, PermLevel>>(() => fullEditSelections());
  const [formEdit, setFormEdit] = useState({
    email: "",
    password: "",
    display_name: "",
    phone: "",
    role: "user" as PortalUser["role"],
    is_active: true,
  });
  const [portalRestrictEdit, setPortalRestrictEdit] = useState(false);
  const [permEdit, setPermEdit] = useState<Record<string, PermLevel>>(() => fullEditSelections());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setMeId(data.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      role: r.role,
      is_active: r.is_active,
    });
    const restrict = shouldRestrictStored(r.portal_permissions, r.role);
    setPortalRestrictEdit(restrict);
    setPermEdit(selectionsFromStored(r.portal_permissions, r.role));
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
          role: formCreate.role,
          is_active: formCreate.is_active,
          ...(formCreate.role === "admin"
            ? {}
            : {
                portal_permissions: portalRestrictCreate ? serializePermSelections(permCreate) : null,
              }),
        }),
      });
      toast.success("Utilizador criado");
      setCreateOpen(false);
      setFormCreate({
        email: "",
        password: "",
        display_name: "",
        phone: "",
        role: "user",
        is_active: true,
      });
      setPortalRestrictCreate(false);
      setPermCreate(fullEditSelections());
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
      const body: Record<string, string | null | boolean | PortalPermissionsMap | null> = {
        email: formEdit.email,
        display_name: formEdit.display_name || null,
        phone: formEdit.phone || null,
        role: formEdit.role,
        is_active: formEdit.is_active,
        portal_permissions:
          formEdit.role === "admin"
            ? null
            : portalRestrictEdit
              ? serializePermSelections(permEdit)
              : null,
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
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuários</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cargo e estado ficam em{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">profiles</code>
            ; inativos ficam também bloqueados no Auth (login impossível).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormCreate({
              email: "",
              password: "",
              display_name: "",
              phone: "",
              role: "user",
              is_active: true,
            });
            setPortalRestrictCreate(false);
            setPermCreate(fullEditSelections());
            setCreateOpen(true);
          }}
          className="btn-primary shrink-0"
        >
          Novo utilizador
        </button>
      </div>

      <ResponsiveTableShell label="Lista de utilizadores">
          <table className="table-portal table-portal-stack md:min-w-[700px]">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Cargo</th>
                <th>Estado</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    !r.is_active ? "bg-slate-50 text-slate-500 dark:bg-slate-900/40 dark:text-slate-400" : ""
                  }
                >
                  <td className="font-medium text-slate-900">{r.email ?? "—"}</td>
                  <td>{r.display_name ?? "—"}</td>
                  <td>{r.phone ?? "—"}</td>
                  <td>
                    <span
                      className={
                        r.role === "admin"
                          ? "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                      }
                    >
                      {roleLabel(r.role)}
                    </span>
                  </td>
                  <td>
                    {r.is_active ? (
                      <span className="text-emerald-700">Ativo</span>
                    ) : (
                      <span className="text-rose-700">Inativo</span>
                    )}
                  </td>
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
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Nenhum utilizador. Crie o primeiro com &quot;Novo utilizador&quot; ou /auth/register.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </ResponsiveTableShell>

      <AccessibleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        closeOnBackdrop={!saving}
        closeOnEscape={!saving}
        labelledBy="usuario-create-title"
        panelClassName="modal-panel"
      >
            <h3 id="usuario-create-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Novo utilizador
            </h3>
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
              <div>
                <label className="form-label" htmlFor="create-role">
                  Cargo
                </label>
                <select
                  id="create-role"
                  className="input-field mt-1.5"
                  value={formCreate.role}
                  onChange={(e) => {
                    const role = e.target.value === "admin" ? "admin" : "user";
                    setFormCreate((f) => ({
                      ...f,
                      role,
                      is_active: role === "admin" ? true : f.is_active,
                    }));
                    if (role === "admin") setPortalRestrictCreate(false);
                  }}
                >
                  <option value="user">Utilizador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={formCreate.is_active}
                  disabled={formCreate.role === "admin"}
                  onChange={(e) => setFormCreate({ ...formCreate, is_active: e.target.checked })}
                />
                Conta ativa (pode iniciar sessão)
              </label>
              {formCreate.role === "admin" && (
                <p className="text-xs text-slate-500">Administradores são sempre criados ativos.</p>
              )}
              <div>
                <p className="form-label mb-2">Telas do portal</p>
                <TelasAcessoUsuario
                  enabled={formCreate.role === "user"}
                  restrict={portalRestrictCreate}
                  setRestrict={setPortalRestrictCreate}
                  perm={permCreate}
                  setPerm={setPermCreate}
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
      </AccessibleModal>

      <AccessibleModal
        open={!!edit}
        onClose={() => setEdit(null)}
        closeOnBackdrop={!saving}
        closeOnEscape={!saving}
        labelledBy="usuario-edit-title"
        panelClassName="modal-panel"
      >
            <h3 id="usuario-edit-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Editar utilizador
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Campos com * são obrigatórios quando aplicável. Não pode inativar-se nem remover o seu próprio
              administrador.
            </p>
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
              <div>
                <label className="form-label" htmlFor="edit-role">
                  Cargo
                </label>
                <select
                  id="edit-role"
                  className="input-field mt-1.5"
                  value={formEdit.role}
                  disabled={edit?.id === meId && edit?.role === "admin"}
                  onChange={(e) => {
                    const role = e.target.value === "admin" ? "admin" : "user";
                    setFormEdit({
                      ...formEdit,
                      role,
                      is_active: role === "admin" ? true : formEdit.is_active,
                    });
                    if (role === "admin") {
                      setPortalRestrictEdit(false);
                    } else if (role === "user" && edit) {
                      setPortalRestrictEdit(shouldRestrictStored(edit.portal_permissions, "user"));
                      setPermEdit(selectionsFromStored(edit.portal_permissions, "user"));
                    }
                  }}
                >
                  <option value="user">Utilizador</option>
                  <option value="admin">Administrador</option>
                </select>
                {edit?.id === meId && edit.role === "admin" && (
                  <p className="mt-1 text-xs text-amber-700">Para mudar cargo de administrador na sua conta peça outro administrador ou use SQL no Supabase.</p>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={formEdit.is_active}
                  disabled={edit?.id === meId || formEdit.role === "admin"}
                  onChange={(e) => setFormEdit({ ...formEdit, is_active: e.target.checked })}
                />
                Conta ativa
              </label>
              {formEdit.role === "admin" && (
                <p className="text-xs text-slate-500">Administradores têm de estar ativos.</p>
              )}
              {edit && !edit.is_active && edit.banned_until && (
                <p className="text-xs text-slate-500">
                  Banimento Auth até {formatDate(edit.banned_until)} (informação sincronizada com inativo).
                </p>
              )}
              <div>
                <p className="form-label mb-2">Telas do portal</p>
                <TelasAcessoUsuario
                  enabled={formEdit.role === "user"}
                  restrict={portalRestrictEdit}
                  setRestrict={setPortalRestrictEdit}
                  perm={permEdit}
                  setPerm={setPermEdit}
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
      </AccessibleModal>
    </div>
  );
}
