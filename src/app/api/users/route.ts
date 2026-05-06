import { mapAuthUserToPortalUser, type ProfileRow } from "@/app/api/users/map-portal-user";
import { getSupabaseForRequest } from "@/lib/api-auth";
import { insertAuditLog } from "@/lib/audit-log";
import { countActiveAdmins } from "@/lib/portal-user-admin-guards";
import { requirePortalAdmin } from "@/lib/require-portal-admin";
import { sanitizePortalPermissions } from "@/lib/sanitize-portal-permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { syncAuthBanWithActiveFlag } from "@/lib/user-auth-ban";
import type { PortalPermissionsMap, PortalUser } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.isServiceRole || !auth.userId) {
    return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
  }
  const forbidden = await requirePortalAdmin(auth.supabase, auth.userId);
  if (forbidden) return forbidden;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Service role do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const all: User[] = [];
  let page = 1;
  const per = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: per });
    if (error) {
      return NextResponse.json({ error: error.message, users: [] as PortalUser[] }, { status: 500 });
    }
    if (!data?.users?.length) break;
    all.push(...data.users);
    if (data.users.length < per) break;
    page += 1;
  }

  if (all.length === 0) {
    return NextResponse.json({ users: [] as PortalUser[] });
  }

  const ids = all.map((u) => u.id);
  const { data: profiles, error: perr } = await admin.from("profiles").select("*").in("id", ids);

  if (perr) {
    return NextResponse.json({ error: perr.message, users: [] as PortalUser[] }, { status: 500 });
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as ProfileRow]));

  const users: PortalUser[] = all.map((u) => mapAuthUserToPortalUser(u, byId.get(u.id)));
  users.sort(
    (a, b) => new Date(b.last_sign_in_at ?? b.created_at).getTime() - new Date(a.last_sign_in_at ?? a.created_at).getTime()
  );

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.isServiceRole || !auth.userId) {
    return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
  }
  const forbidden = await requirePortalAdmin(auth.supabase, auth.userId);
  if (forbidden) return forbidden;

  let body: {
    email?: string;
    password?: string;
    display_name?: string | null;
    phone?: string | null;
    role?: string;
    is_active?: boolean;
    portal_permissions?: unknown | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter ao menos 6 caracteres" }, { status: 400 });
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

  const wantedRole =
    typeof body.role === "string" && body.role.trim().toLowerCase() === "admin" ? "admin" : "user";
  const is_active =
    typeof body.is_active === "boolean" ? body.is_active : true;

  if (wantedRole === "admin" && !is_active) {
    return NextResponse.json(
      { error: "Um administrador não pode ser criado já como inativo. Crie como ativo e inative depois se necessário." },
      { status: 400 }
    );
  }

  if (!is_active) {
    const n = await countActiveAdmins(admin);
    if (n < 1) {
      return NextResponse.json(
        { error: "É necessário existir pelo menos um administrador ativo no portal antes de criar utilizadores inativos." },
        { status: 400 }
      );
    }
  }

  const display_name = (body.display_name ?? "").trim() || null;
  const phone = (body.phone ?? "").trim() || null;

  const portal_permissions: PortalPermissionsMap | null =
    wantedRole === "admin"
      ? null
      : body.portal_permissions === undefined || body.portal_permissions === null
        ? null
        : (() => {
            const cleaned = sanitizePortalPermissions(body.portal_permissions);
            return Object.keys(cleaned).length === 0 ? {} : cleaned;
          })();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: display_name ? { display_name } : undefined,
  });

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 400 });
  }

  const u = created.user;
  if (!u) {
    return NextResponse.json({ error: "Não foi possível criar o utilizador" }, { status: 500 });
  }

  void insertAuditLog(admin, {
    event_type: "users_created",
    actor_user_id: auth.userId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: request.headers.get("user-agent"),
    metadata: {
      created_user_id: u.id,
      created_email: email,
      role: wantedRole,
      is_active,
    },
  });

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: u.id,
      display_name,
      phone,
      role: wantedRole,
      is_active,
      portal_permissions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  if (!is_active) {
    const sync = await syncAuthBanWithActiveFlag(admin, u.id, false);
    if (sync.error) {
      return NextResponse.json(
        {
          error: `Perfil criado, mas falhou ao aplicar inativação no Auth: ${sync.error}. Corrija no painel Supabase se necessário.`,
        },
        { status: 500 }
      );
    }
  }

  const { data: freshAuth } = await admin.auth.admin.getUserById(u.id);
  const freshUser = freshAuth?.user ?? u;
  const { data: prof } = await admin.from("profiles").select("*").eq("id", u.id).single();
  return NextResponse.json({ user: mapAuthUserToPortalUser(freshUser, (prof ?? undefined) as ProfileRow | undefined) });
}
