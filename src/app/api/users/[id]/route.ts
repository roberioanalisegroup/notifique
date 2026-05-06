import { mapAuthUserToPortalUser, type ProfileRow } from "@/app/api/users/map-portal-user";
import { getSupabaseForRequest } from "@/lib/api-auth";
import { insertAuditLog } from "@/lib/audit-log";
import { countActiveAdmins } from "@/lib/portal-user-admin-guards";
import { requirePortalAdmin } from "@/lib/require-portal-admin";
import {
  parsePortalPermissionsFromDb,
  sanitizePortalPermissions,
} from "@/lib/sanitize-portal-permissions";
import type { PortalPermissionsMap } from "@/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { syncAuthBanWithActiveFlag } from "@/lib/user-auth-ban";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.isServiceRole || !auth.userId) {
    return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
  }
  const forbidden = await requirePortalAdmin(auth.supabase, auth.userId);
  if (forbidden) return forbidden;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: {
    email?: string | null;
    password?: string | null;
    display_name?: string | null;
    phone?: string | null;
    role?: string | null;
    is_active?: boolean;
    portal_permissions?: unknown | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.role != null && body.role !== "admin" && body.role !== "user") {
    return NextResponse.json({ error: 'role deve ser "admin" ou "user"' }, { status: 400 });
  }
  if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active deve ser booleano" }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Service role do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { data: existing, error: gErr } = await admin.auth.admin.getUserById(id);
  if (gErr || !existing?.user) {
    return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 });
  }
  const u = existing.user;

  const { data: currentProf } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  const pr = currentProf as ProfileRow | null;
  const currRole = pr?.role === "admin" ? "admin" : "user";
  const currActive = pr?.is_active ?? true;

  const nextRole = body.role != null ? (body.role === "admin" ? "admin" : "user") : currRole;
  const nextActive = body.is_active !== undefined ? body.is_active : currActive;

  void insertAuditLog(admin, {
    event_type: "users_updated",
    actor_user_id: auth.userId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: request.headers.get("user-agent"),
    metadata: {
      target_user_id: id,
      changes: {
        email: body.email !== undefined ? true : undefined,
        password: body.password !== undefined ? true : undefined,
        display_name: body.display_name !== undefined ? true : undefined,
        phone: body.phone !== undefined ? true : undefined,
        role: body.role !== undefined ? { from: currRole, to: nextRole } : undefined,
        is_active:
          body.is_active !== undefined ? { from: currActive, to: nextActive } : undefined,
        portal_permissions: body.portal_permissions !== undefined ? true : undefined,
      },
    },
  });

  if (nextRole === "admin" && !nextActive) {
    return NextResponse.json(
      { error: "Administrador tem de permanecer ativo. Inative primeiro como utilizador ou use outro administrador." },
      { status: 400 }
    );
  }

  if (id === auth.userId) {
    if (!nextActive) {
      return NextResponse.json({ error: "Não pode inativar a própria conta." }, { status: 400 });
    }
    if (currRole === "admin" && nextRole === "user") {
      return NextResponse.json({ error: "Não pode remover o próprio perfil de administrador." }, { status: 400 });
    }
  }

  const wasEligibleAdmin = currRole === "admin" && currActive;
  const willBeEligibleAdmin = nextRole === "admin" && nextActive;
  if (wasEligibleAdmin && !willBeEligibleAdmin) {
    const n = await countActiveAdmins(admin);
    if (n < 2) {
      return NextResponse.json(
        {
          error:
            "Tem de existir pelo menos dois administradores ativos para remover ou inativar um deles.",
        },
        { status: 400 }
      );
    }
  }

  const email = body.email != null ? String(body.email).trim().toLowerCase() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (body.password != null && body.password.length > 0 && body.password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter ao menos 6 caracteres" }, { status: 400 });
  }

  if (email && email !== u.email) {
    const { error: eErr } = await admin.auth.admin.updateUserById(id, { email });
    if (eErr) {
      return NextResponse.json({ error: eErr.message }, { status: 400 });
    }
  }

  if (body.password != null && body.password.length > 0) {
    const { error: pErr } = await admin.auth.admin.updateUserById(id, { password: body.password });
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
  }

  const display_name =
    body.display_name !== undefined ? (String(body.display_name).trim() || null) : undefined;
  const phone = body.phone !== undefined ? (String(body.phone).trim() || null) : undefined;

  const nextDisplay = display_name !== undefined ? display_name : (pr?.display_name ?? null);
  const nextPhone = phone !== undefined ? phone : (pr?.phone ?? null);

  let nextPortalPerms: PortalPermissionsMap | null;
  if (nextRole === "admin") {
    nextPortalPerms = null;
  } else if (body.portal_permissions !== undefined) {
    nextPortalPerms =
      body.portal_permissions === null
        ? null
        : (() => {
            const cleaned = sanitizePortalPermissions(body.portal_permissions);
            return Object.keys(cleaned).length === 0 ? {} : cleaned;
          })();
  } else {
    nextPortalPerms = parsePortalPermissionsFromDb(pr?.portal_permissions);
  }

  if (currActive !== nextActive) {
    const sync = await syncAuthBanWithActiveFlag(admin, id, nextActive);
    if (sync.error) {
      return NextResponse.json({ error: `Auth: ${sync.error}` }, { status: 500 });
    }
  }

  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id,
      display_name: nextDisplay,
      phone: nextPhone,
      role: nextRole,
      is_active: nextActive,
      portal_permissions: nextPortalPerms,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (upErr) {
    try {
      if (currActive !== nextActive) {
        await syncAuthBanWithActiveFlag(admin, id, currActive);
      }
    } catch {
      /* best effort revert */
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (display_name !== undefined) {
    const { data: uAfterProf } = await admin.auth.admin.getUserById(id);
    const uu = uAfterProf?.user ?? u;
    const meta = { ...(uu.user_metadata ?? {}), display_name: nextDisplay };
    const { error: mErr } = await admin.auth.admin.updateUserById(id, { user_metadata: meta });
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
  }

  const { data: fresh, error: fErr } = await admin.auth.admin.getUserById(id);
  if (fErr || !fresh?.user) {
    return NextResponse.json({ error: fErr?.message ?? "Erro ao recarregar" }, { status: 500 });
  }
  const { data: prof } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();

  const out = mapAuthUserToPortalUser(fresh.user, (prof ?? undefined) as ProfileRow | undefined);
  return NextResponse.json({ user: out });
}
