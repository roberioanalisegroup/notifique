import { getSupabaseForRequest } from "@/lib/api-auth";
import { requirePortalAdmin } from "@/lib/require-portal-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { PortalUser } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

function mapUser(
  u: User,
  profile: { display_name: string | null; phone: string | null; created_at: string; updated_at: string } | undefined
): PortalUser {
  return {
    id: u.id,
    email: u.email ?? null,
    display_name: profile?.display_name ?? (u.user_metadata?.display_name as string | undefined) ?? null,
    phone: profile?.phone ?? (u.user_metadata?.phone as string | undefined) ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
  };
}

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

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as { id: string; display_name: string | null; phone: string | null; created_at: string; updated_at: string }])
  );

  const users: PortalUser[] = all.map((u) => mapUser(u, byId.get(u.id)));
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

  let body: { email?: string; password?: string; display_name?: string | null; phone?: string | null };
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

  const display_name = (body.display_name ?? "").trim() || null;
  const phone = (body.phone ?? "").trim() || null;

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

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: u.id,
      display_name,
      phone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: prof } = await admin.from("profiles").select("*").eq("id", u.id).single();
  return NextResponse.json({ user: mapUser(u, prof ?? undefined) });
}
