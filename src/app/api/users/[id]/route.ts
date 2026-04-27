import { getSupabaseForRequest } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { PortalUser } from "@/types";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: {
    email?: string | null;
    password?: string | null;
    display_name?: string | null;
    phone?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
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

  const { data: existing, error: gErr } = await admin.auth.admin.getUserById(params.id);
  if (gErr || !existing?.user) {
    return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 });
  }
  const u = existing.user;

  const email = body.email != null ? String(body.email).trim().toLowerCase() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (body.password != null && body.password.length > 0 && body.password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter ao menos 6 caracteres" }, { status: 400 });
  }

  if (email && email !== u.email) {
    const { error: eErr } = await admin.auth.admin.updateUserById(params.id, { email });
    if (eErr) {
      return NextResponse.json({ error: eErr.message }, { status: 400 });
    }
  }

  if (body.password != null && body.password.length > 0) {
    const { error: pErr } = await admin.auth.admin.updateUserById(params.id, { password: body.password });
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
  }

  const display_name = body.display_name !== undefined ? (String(body.display_name).trim() || null) : undefined;
  const phone = body.phone !== undefined ? (String(body.phone).trim() || null) : undefined;

  if (display_name !== undefined || phone !== undefined) {
    const { data: currentProf } = await admin.from("profiles").select("*").eq("id", params.id).maybeSingle();
    const nextDisplay = display_name !== undefined ? display_name : (currentProf?.display_name as string | null) ?? null;
    const nextPhone = phone !== undefined ? phone : (currentProf?.phone as string | null) ?? null;

    const { error: upErr } = await admin.from("profiles").upsert(
      {
        id: params.id,
        display_name: nextDisplay,
        phone: nextPhone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    if (display_name !== undefined) {
      const meta = { ...(u.user_metadata ?? {}), display_name: nextDisplay };
      const { error: mErr } = await admin.auth.admin.updateUserById(params.id, { user_metadata: meta });
      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 400 });
      }
    }
  }

  const { data: fresh, error: fErr } = await admin.auth.admin.getUserById(params.id);
  if (fErr || !fresh?.user) {
    return NextResponse.json({ error: fErr?.message ?? "Erro ao recarregar" }, { status: 500 });
  }
  const { data: prof } = await admin.from("profiles").select("*").eq("id", params.id).maybeSingle();

  const out: PortalUser = {
    id: fresh.user.id,
    email: fresh.user.email ?? null,
    display_name: (prof?.display_name as string | null) ?? (fresh.user.user_metadata?.display_name as string | undefined) ?? null,
    phone: (prof?.phone as string | null) ?? null,
    last_sign_in_at: fresh.user.last_sign_in_at ?? null,
    created_at: fresh.user.created_at,
  };
  return NextResponse.json({ user: out });
}
