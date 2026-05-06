import { getSupabaseForRequest } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.isServiceRole || !auth.userId) {
    return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
  }
  const { supabase, userId } = auth;

  const { data: meProf } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const isAdmin = meProf?.role === "admin";

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY em falta no servidor." },
      { status: 500 }
    );
  }

  let body: { assignments?: { company_id: unknown; responsible_user_id: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = body.assignments;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "Envie assignments: [...] não vazio" }, { status: 400 });
  }
  if (raw.length > 200) {
    return NextResponse.json({ error: "Máximo 200 atualizações por pedido." }, { status: 400 });
  }

  const assignments: { company_id: string; responsible_user_id: string | null }[] = [];
  for (const row of raw) {
    const cid =
      typeof row.company_id === "string" ? row.company_id.trim() : String(row.company_id ?? "");
    if (!UUID_RE.test(cid)) {
      return NextResponse.json({ error: "company_id inválido na lista." }, { status: 400 });
    }
    const ridRaw = row.responsible_user_id;
    let rid: string | null = null;
    if (ridRaw !== null && ridRaw !== undefined && `${ridRaw}`.trim() !== "") {
      const s = typeof ridRaw === "string" ? ridRaw.trim() : String(ridRaw);
      if (!UUID_RE.test(s)) {
        return NextResponse.json({ error: "responsible_user_id inválido." }, { status: 400 });
      }
      rid = s;
    }
    assignments.push({ company_id: cid, responsible_user_id: rid });
  }

  const companyIds = Array.from(new Set(assignments.map((a) => a.company_id)));
  const { data: cos, error: cErr } = await supabase.from("companies").select("id, user_id").in("id", companyIds);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const found = cos ?? [];
  if (found.length !== companyIds.length) {
    return NextResponse.json({ error: "Uma ou mais empresas não existem ou não tem acesso." }, { status: 403 });
  }
  for (const c of found) {
    if (!isAdmin && c.user_id !== userId) {
      return NextResponse.json({ error: "Sem permissão para alterar uma ou mais empresas." }, { status: 403 });
    }
  }

  const responsibleIds = Array.from(
    new Set(assignments.map((a) => a.responsible_user_id).filter((x): x is string => x != null))
  );
  if (responsibleIds.length > 0) {
    const { data: rp, error: rErr } = await admin
      .from("profiles")
      .select("id")
      .in("id", responsibleIds)
      .eq("is_active", true);
    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }
    const okIds = new Set((rp ?? []).map((r) => r.id as string));
    for (const r of responsibleIds) {
      if (!okIds.has(r)) {
        return NextResponse.json({ error: "Responsável inválido ou inativo." }, { status: 400 });
      }
    }
  }

  let updated = 0;
  for (const { company_id, responsible_user_id } of assignments) {
    const { error: uErr } = await supabase
      .from("companies")
      .update({ responsible_user_id, updated_at: new Date().toISOString() })
      .eq("id", company_id);
    if (uErr) {
      return NextResponse.json({ error: uErr.message, updated }, { status: 500 });
    }
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
