import { getSupabaseForRequest } from "@/lib/api-auth";
import { requirePortalAdmin } from "@/lib/require-portal-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

/** Lista utilizadores ativos para atribuir como responsável (dropdowns). Qualquer utilizador autenticado autentica com a própria sessão antes da service role ler perfis/auth. */
export async function GET(_request: NextRequest) {
  const auth = await getSupabaseForRequest(_request);
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
      { error: "SUPABASE_SERVICE_ROLE_KEY em falta no servidor." },
      { status: 500 }
    );
  }

  const { data: profRows, error: pErr } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (pErr) {
    return NextResponse.json({ error: pErr.message, collaborators: [] }, { status: 500 });
  }

  const profiles = (profRows ?? []) as { id: string; display_name: string | null }[];

  const all: User[] = [];
  let page = 1;
  const per = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: per });
    if (error) {
      return NextResponse.json({ error: error.message, collaborators: [] }, { status: 500 });
    }
    if (!data?.users?.length) break;
    all.push(...data.users);
    if (data.users.length < per) break;
    page += 1;
  }

  const emailById = new Map(all.map((u) => [u.id, u.email ?? null]));

  const collaborators = profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    email: emailById.get(p.id) ?? null,
    label:
      [p.display_name?.trim(), emailById.get(p.id)].filter(Boolean).join(" · ") ||
      emailById.get(p.id) ||
      p.id,
  }));

  return NextResponse.json({ collaborators });
}
